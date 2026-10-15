import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { fleetCaption, healthCaption, insightCaption, introCaption, SLOWDOWN, spikeCaption, strategyCaption, toggleCaption } from './captions';
import lesson from './index';
import {
  advance, createWorld, HEALTH_DELAY, PRESETS, QUEUE_CAP, QUEUE_WARN, snapshot, spike, SPIKE, toggleServer, type StrategyId, type World,
} from './sim';
import { STRATEGIES } from './strategies';

const DT = 0.05;
const run = (w: World, seconds: number, onStep?: () => void) => {
  const end = w.now + seconds;
  while (w.now < end - 1e-9) {
    advance(w, DT);
    onStep?.();
  }
};
const maxQueueOf = (w: World, id: StrategyId, server: number, seconds: number) => {
  let max = 0;
  run(w, seconds, () => (max = Math.max(max, w.sims[id].servers[server].queue.length)));
  return max;
};

describe('try-this, from the lesson as it loads (round robin shown, one slow server, 11 requests a second)', () => {
  it('try-this 1: round robin fills api-5\'s queue and drops requests; least connections keeps it short', () => {
    const w = createWorld('rr', 11);
    expect(w.sims.rr.servers.map((s) => s.speed)).toEqual(PRESETS.slow.speeds);
    expect(maxQueueOf(w, 'rr', 4, 60)).toBe(QUEUE_CAP);
    expect(w.sims.rr.dropped).toBeGreaterThan(0);
    const same = createWorld('rr', 11);
    expect(maxQueueOf(same, 'least', 4, 60)).toBeLessThan(QUEUE_WARN);
    expect(same.sims.least.dropped).toBe(0);
  });

  it('try-this 2: killing a server gives red failures until the health check pulls it, then they stop', () => {
    const w = createWorld('rr', 11);
    run(w, 5);
    const before = w.sims.rr.failed;
    toggleServer(w, 2);
    run(w, HEALTH_DELAY - 0.1);
    const duringDelay = w.sims.rr.failed - before;
    expect(duringDelay).toBeGreaterThan(0);
    expect(w.sims.rr.servers[2].healthy).toBe(true);
    run(w, 1);
    expect(w.sims.rr.servers[2].healthy).toBe(false);
    const settled = w.sims.rr.failed;
    run(w, 10);
    expect(w.sims.rr.failed).toBe(settled);
  });

  it('try-this 3: after about ten seconds on Least conn, whichever server is killed gets more than its fair share until the health check catches up', () => {
    const fairShare = 1 / 5;
    for (const killed of [0, 1, 2, 3, 4]) {
      const w = createWorld('rr', 11);
      run(w, 10);
      const killedAt = w.now;
      toggleServer(w, killed);
      const sent = new Map<StrategyId, number[]>([['least', []], ['rr', []]]);
      const seen = new Set<string>();
      run(w, HEALTH_DELAY, () => {
        for (const id of ['least', 'rr'] as const) {
          for (const r of w.sims[id].reqs) {
            if (r.tLB >= killedAt && !seen.has(`${id}${r.id}`)) {
              seen.add(`${id}${r.id}`);
              sent.get(id)!.push(r.server);
            }
          }
        }
      });
      const share = (id: StrategyId) => sent.get(id)!.filter((s) => s === killed).length / sent.get(id)!.length;
      expect(share('least'), `api-${killed + 1}`).toBeGreaterThan(fairShare);
      expect(share('least'), `api-${killed + 1}`).toBeGreaterThanOrEqual(share('rr') - 0.02);
    }
  });

  it('try-this 4: ten seconds in, a traffic spike leaves round robin and random with the highest p99 lines in the chart', () => {
    const w = createWorld('rr', 11);
    run(w, 10);
    spike(w);
    run(w, SPIKE.seconds + 6);
    const { history } = snapshot(w);
    expect(Object.keys(history).sort()).toEqual(STRATEGIES.map((s) => s.id).sort());
    const last = (id: StrategyId) => history[id][history[id].length - 1];
    expect(Math.min(last('rr'), last('random'))).toBeGreaterThan(Math.max(last('least'), last('p2c'), last('wrr')));
  });
});

describe('captions', () => {
  it('have no glued sentences and name the numbers the model uses', () => {
    expectCaption(introCaption());
    for (const s of STRATEGIES) expectCaption(strategyCaption(s.id));
    for (const id of ['slow', 'mixed', 'equal'] as const) expectCaption(fleetCaption(id));
    expect(captionText(fleetCaption('slow'))).toContain(`${SLOWDOWN}× slower`);
    expect(SLOWDOWN).toBe(4);
    expect(captionText(toggleCaption(1, false), { strict: true })).toContain(`takes ${HEALTH_DELAY} s`);
    expect(captionText(toggleCaption(1, true), { strict: true })).toContain('api-2 is back up');
    expect(captionText(spikeCaption(), { strict: true })).toContain(`${SPIKE.factor}× the load for ${SPIKE.seconds} seconds`);
    expect(captionText(healthCaption({ server: 4, healthy: false }), { strict: true })).toContain('api-5 pulled from rotation');
    expect(captionText(healthCaption({ server: 4, healthy: true }), { strict: true })).toContain('api-5 passed its health check');
    expect(captionText(insightCaption({ kind: 'choking', server: 4 }, 'rr'), { strict: true })).toContain("api-5's queue is nearly full, and round robin");
  });

  it('describe the strategy they are about (a caption per strategy, mentioning its name)', () => {
    const names: Record<StrategyId, string> = { rr: 'Round robin', random: 'Random', least: 'Least connections', p2c: 'Power of two choices', wrr: 'Weighted round robin' };
    for (const s of STRATEGIES) expect(captionText(strategyCaption(s.id))).toContain(names[s.id]);
  });
});

describe('the lesson text', () => {
  it('has a try-this for each behaviour tested above', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz[0].q).toContain(`${SLOWDOWN}×`);
  });
});
