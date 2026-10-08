import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { describeSecond, healthFrames, secondCaption } from './frames';
import lesson from './index';
import { HORIZON, PODS, SCENARIOS, scenarioById, simulate, STARTUP_DEFAULT, totalsAt, type Config, type ProbeConfig, type Scenario } from './model';
import { inRotation, lightAt, podStatus, restartsSoFar, timelineBars, timelineLanes } from './view';

const probe = (check: ProbeConfig['check'], period: number, threshold: number, enabled = true): ProbeConfig => ({ enabled, check, period, threshold });

describe('captions: every scenario, with its mistake and with its fix', () => {
  const fixes: Record<string, (c: Config) => void> = {
    'slow-boot': (c) => {
      c.startup = STARTUP_DEFAULT;
    },
    'db-outage': (c) => {
      c.liveness = probe('handler', 5, 3);
      c.readiness = probe('db', 5, 2);
    },
    deadlock: (c) => {
      c.liveness = probe('handler', 5, 3);
      c.readiness = probe('handler', 5, 2);
    },
    'early-ready': (c) => {
      c.readiness = probe('cache', 5, 2);
    },
    flapping: (c) => {
      c.readiness = probe('db', 1, 3);
    },
  };

  it('every frame reads cleanly and says exactly what happened that second', () => {
    for (const s of SCENARIOS) {
      for (const fixed of [false, true]) {
        const config = JSON.parse(JSON.stringify(s.initial)) as Config;
        if (fixed) fixes[s.id](config);
        const run = simulate(config, s);
        const frames = healthFrames(run);
        expect(frames).toHaveLength(HORIZON + 1);
        frames.forEach((f, i) => {
          const text = expectCaption(f.say);
          if (i === 0) return;
          const t = i - 1;
          const e = describeSecond(run, t);
          expect(text.includes('restarted')).toBe(e.restarts.length > 0);
          expect(text.includes('left rotation')).toBe(e.becameUnready.length > 0);
          expect(text.includes('Ready: in rotation')).toBe(e.becameReady.length > 0);
          expect(text.includes('startup probe passed')).toBe(e.startupPassed.length > 0);
          expect(text.includes('Nothing changed')).toBe(
            e.restarts.length + e.becameReady.length + e.becameUnready.length + e.startupPassed.length === 0 && !e.dbWentDown && !e.dbCameBack && e.hungNow === null,
          );
          // A pod that restarted this second is never also described as having left rotation by readiness.
          for (const r of e.restarts) expect(e.becameUnready).not.toContain(r.pod);
        });
      }
    }
  });

  it('the restart caption names the probe, its check and its threshold', () => {
    const s = scenarioById('db-outage');
    const run = simulate(s.initial, s);
    const t = run.seconds.findIndex((x) => x.pods.some((p) => p.restarted));
    expect(expectCaption(secondCaption(run, t))).toBe('pods 1, 2, 3, 4 restarted: the liveness probe (DB reachable) failed 3 times in a row.');
  });

  it('readiness failing is reported as leaving rotation, with the container kept', () => {
    const s = scenarioById('db-outage');
    const config = JSON.parse(JSON.stringify(s.initial)) as Config;
    fixes['db-outage'](config);
    const run = simulate(config, s);
    const t = run.seconds.findIndex((x, k) => k > 0 && x.pods.some((p, i) => run.seconds[k - 1].pods[i].ready && !p.ready));
    expect(expectCaption(secondCaption(run, t))).toContain('pods 1, 2, 3, 4 left rotation: readiness (DB reachable) failed 2 times in a row. The container keeps running.');
  });
});

describe('view', () => {
  it('lights show the latest result in the current container, and go dim after a restart', () => {
    const s = scenarioById('slow-boot');
    const run = simulate(s.initial, s);
    expect(lightAt(run, 0, 'liveness', 0)).toBe('idle');
    expect(lightAt(run, 0, 'liveness', 1)).toBe('fail');
    const restartAt = run.seconds.findIndex((x) => x.pods[0].restarted);
    // The failure that caused the restart is still the light's reading; while the container is down it is dim; the new container's first run (age 0) fails again.
    expect(lightAt(run, 0, 'liveness', restartAt + 1)).toBe('fail');
    expect(lightAt(run, 0, 'liveness', restartAt + 2)).toBe('idle');
    expect(lightAt(run, 0, 'liveness', restartAt + 3)).toBe('fail');
    expect(podStatus(run, 0, restartAt + 2)).toBe('restarting');
    expect(restartsSoFar(run, 0, restartAt + 1)).toBe(1);
    expect(restartsSoFar(run, 0, restartAt)).toBe(0);
  });

  it('a startup light stays dim while liveness has not started, and rotation counts follow readiness', () => {
    const s = scenarioById('slow-boot');
    const config = JSON.parse(JSON.stringify(s.initial)) as Config;
    config.startup = STARTUP_DEFAULT;
    const run = simulate(config, s);
    expect(lightAt(run, 1, 'liveness', 10)).toBe('idle');
    expect(lightAt(run, 1, 'startup', 10)).toBe('fail');
    expect(lightAt(run, 1, 'startup', 31)).toBe('pass');
    expect(inRotation(run, 29)).toBe(0);
    expect(inRotation(run, 31)).toBe(PODS);
  });

  it('the timeline has a row per pod plus one per enabled probe, and bars stop at what has been shown', () => {
    const s = scenarioById('db-outage');
    const run = simulate(s.initial, s);
    expect(timelineLanes(s.initial, PODS)).toHaveLength(PODS * 3);
    expect(timelineLanes({ ...s.initial, startup: STARTUP_DEFAULT }, PODS)).toHaveLength(PODS * 4);
    for (const shown of [0, 7, 21, HORIZON]) {
      const bars = timelineBars(run, shown);
      expect(bars.every((b) => b.end <= shown + 1e-9 && b.end > b.start)).toBe(true);
    }
    const bars = timelineBars(run, HORIZON);
    // A restart is an orange tick; the probe rows hold one tick per run.
    const restartTicks = bars.filter((b) => b.tone === 'orange');
    expect(restartTicks).toHaveLength(totalsAt(run, HORIZON).restarts);
    const liveness = bars.filter((b) => b.lane === 'p0-liveness');
    expect(liveness.length).toBe(run.seconds.filter((x) => x.pods[0].results.liveness !== 'idle').length);
    expect(liveness.filter((b) => b.tone === 'bad').length).toBe(run.seconds.filter((x) => x.pods[0].results.liveness === 'fail').length);
  });

  it('in-rotation bars cover exactly the ready seconds', () => {
    const s = scenarioById('deadlock');
    const run = simulate(s.initial, s);
    const bars = timelineBars(run, HORIZON).filter((b) => b.lane === 'p0-rotation' && b.tone === 'info');
    const covered = bars.reduce((n, b) => n + (b.end - b.start), 0);
    expect(covered).toBe(run.seconds.filter((x) => x.pods[0].ready).length);
  });
});

describe('the try-this prompts, from the default state', () => {
  const run = (s: Scenario, patch: (c: Config) => void = () => {}) => {
    const c = JSON.parse(JSON.stringify(s.initial)) as Config;
    patch(c);
    return simulate(c, s);
  };

  it('slow boot: restarts without a startup probe, none with it, and Ready at 30 s', () => {
    const s = scenarioById('slow-boot');
    const bad = run(s);
    expect(totalsAt(bad, HORIZON).restarts).toBeGreaterThan(PODS);
    expect(bad.seconds.every((x) => x.pods.every((p) => !p.ready))).toBe(true);
    const good = run(s, (c) => {
      c.startup = { ...STARTUP_DEFAULT };
    });
    expect(totalsAt(good, HORIZON).restarts).toBe(0);
    expect(good.seconds.findIndex((x) => x.pods.every((p) => p.ready))).toBe(30);
  });

  it('flapping: the rotation changes at every blip with 1 failure and holds with 3', () => {
    const s = scenarioById('flapping');
    expect(totalsAt(run(s), HORIZON).rotationChanges).toBeGreaterThan(40);
    expect(totalsAt(run(s, (c) => (c.readiness.threshold = 3)), HORIZON).rotationChanges).toBe(PODS);
  });

  it('quiz 4: a hang is acted on 10 to 15 seconds later with a 5 s period and 3 failures', () => {
    const delays: number[] = [];
    for (let hang = 15; hang < 20; hang++) {
      const s: Scenario = { id: 'deadlock', label: 'c', bootS: 0, cacheS: 0, dbDown: [], deadlock: { pod: 0, at: hang }, initial: scenarioById('deadlock').initial };
      const r = simulate({ startup: probe('handler', 5, 12, false), liveness: probe('handler', 5, 3), readiness: probe('handler', 5, 2, false) }, s);
      delays.push(r.seconds.findIndex((x) => x.pods[0].restarted) - hang);
    }
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...delays)).toBeLessThan(15);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toBe('10 to 15 seconds');
  });

  it('quiz 5 and 1: a TCP check misses a hung process, and the DB check on liveness restarts every pod', () => {
    const deadlock = scenarioById('deadlock');
    const s = { ...deadlock, initial: { ...deadlock.initial, liveness: probe('tcp', 5, 3) } };
    expect(simulate(s.initial, s).restarts).toEqual([0, 0, 0, 0]);
    const outage = scenarioById('db-outage');
    expect(simulate(outage.initial, outage).restarts.every((n) => n > 0)).toBe(true);
  });
});
