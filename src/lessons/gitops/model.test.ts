import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { DESIRED_START, IMAGE_TAGS, REPLICAS_MAX, apply, diffLines, hasDrift, reconcile, type Spec, type State } from './reconcile';
import { runScript, verdict, DOWN_UNTIL, SCRIPT_END } from './script';
import { INTERVAL_MAX, TRAP_INTERVAL, commit, failingShare, initWorld, manual, secondsToRun, setPaused, tick, toNextRun } from './world';

const KEYS = ['web', 'api', 'worker', 'cron', 'web-svc', 'api-svc'];

function randomSpec(rnd: () => number): Spec {
  if (rnd() < 0.3) return { kind: 'service', port: [80, 443, 8080][randInt(0, 2, rnd)] };
  return { kind: 'deployment', image: `app:${IMAGE_TAGS[randInt(0, IMAGE_TAGS.length - 1, rnd)]}`, replicas: randInt(0, REPLICAS_MAX, rnd) };
}
function randomState(rnd: () => number): State {
  const out: Record<string, Spec> = {};
  for (const k of KEYS) if (rnd() < 0.6) out[k] = randomSpec(rnd);
  return out;
}

/** The independent checker: sets of keys and a field-by-field comparison, not the controller's own equality. */
const fields = (s: Spec | undefined) => (s ? `${s.kind}/${s.image ?? '-'}/${s.replicas ?? '-'}/${s.port ?? '-'}` : 'absent');
const agreesOnDesired = (desired: State, live: State) => Object.keys(desired).every((k) => fields(desired[k]) === fields(live[k]));
const extras = (desired: State, live: State) => Object.keys(live).filter((k) => !Object.keys(desired).includes(k)).sort();

describe('reconcile over 500 seeded random (desired, live) pairs', () => {
  const rnd = mulberry32(12);
  const pairs = Array.from({ length: 500 }, () => ({ desired: randomState(rnd), live: randomState(rnd) }));

  it('applying its actions makes live equal desired on every desired key, and a second pass has nothing to do (idempotent)', () => {
    for (const prune of [true, false]) {
      for (const { desired, live } of pairs) {
        const once = reconcile(desired, live, { prune }).actions.reduce(apply, live);
        expect(agreesOnDesired(desired, once)).toBe(true);
        expect(reconcile(desired, once, { prune }).actions).toEqual([]);
      }
    }
  });

  it('with prune on no extra key remains; with prune off the extras survive and are reported as orphans', () => {
    for (const { desired, live } of pairs) {
      const pruned = reconcile(desired, live, { prune: true }).actions.reduce(apply, live);
      expect(extras(desired, pruned)).toEqual([]);
      const plan = reconcile(desired, live, { prune: false });
      const kept = plan.actions.reduce(apply, live);
      expect(extras(desired, kept)).toEqual(extras(desired, live));
      expect([...plan.orphans].sort()).toEqual(extras(desired, live));
    }
  });

  it('converges one action at a time, in no more steps than there are actions', () => {
    for (const { desired, live } of pairs.slice(0, 100)) {
      const n = reconcile(desired, live, { prune: true }).actions.length;
      let now = live;
      let steps = 0;
      while (reconcile(desired, now, { prune: true }).actions.length) {
        now = apply(now, reconcile(desired, now, { prune: true }).actions[0]);
        steps++;
      }
      expect(steps).toBe(n);
      expect(agreesOnDesired(desired, now)).toBe(true);
    }
  });

  it('does nothing when live already matches, and notices a single changed replica count', () => {
    expect(reconcile(DESIRED_START, DESIRED_START, { prune: true })).toEqual({ actions: [], orphans: [] });
    const drifted = { ...DESIRED_START, web: { ...DESIRED_START.web, replicas: 9 } };
    expect(reconcile(DESIRED_START, drifted, { prune: true }).actions).toEqual([{ type: 'update', key: 'web', spec: DESIRED_START.web }]);
    expect(diffLines(DESIRED_START, drifted, true).map((l) => l.text)).toEqual(['- web: web:v1, 9 replicas', '+ web: web:v1, 3 replicas']);
  });
});

describe('the interactive world', () => {
  it('runs the controller every interval seconds and applies one action per run (scene 1: every second)', () => {
    let w = manual(manual(initWorld(), 'web', { ...DESIRED_START.web, replicas: 9 }, 'scale web to 9'), 'api', null, 'delete api');
    w = tick(w);
    expect(hasDrift(w.desired, w.live, true)).toBe(true);
    w = tick(w);
    expect(hasDrift(w.desired, w.live, true)).toBe(false);
    expect(w.log.filter((e) => e.text.startsWith('controller:'))).toHaveLength(2);
  });

  it('with a long interval the drift lasts until the next run, and the controller waits', () => {
    let w = manual(initWorld({ interval: INTERVAL_MAX }), 'web', { ...DESIRED_START.web, replicas: 9 }, 'scale web to 9');
    w = toNextRun(w);
    expect([w.t, hasDrift(w.desired, w.live, true), w.driftSeconds]).toEqual([INTERVAL_MAX, false, INTERVAL_MAX - 1]);
    expect(secondsToRun(w)).toBe(INTERVAL_MAX);
  });

  it('with auto-sync off it only reports out of sync, once, and the drift stays', () => {
    let w = manual(initWorld({ autoSync: false }), 'web', null, 'delete web');
    for (let i = 0; i < 5; i++) w = tick(w);
    expect(hasDrift(w.desired, w.live, true)).toBe(true);
    expect(w.log.filter((e) => e.text.startsWith('out of sync'))).toHaveLength(1);
    expect(w.driftSeconds).toBe(5);
  });

  it('commits a draft to git as the new desired state, and the controller then makes live match it', () => {
    let w = commit(initWorld(), { ...DESIRED_START, web: { ...DESIRED_START.web, replicas: 10 } });
    w = tick(tick(w));
    expect(w.live.web.replicas).toBe(10);
  });

  it('scene 3: scaling to 10 by hand during a spike is reverted to 3 by the controller and the users suffer; committing 10 keeps them served', () => {
    const base = () => initWorld({ interval: TRAP_INTERVAL });
    let w = manual(base(), 'web', { ...DESIRED_START.web, replicas: 10 }, 'scale web to 10');
    expect(failingShare(w.live, true)).toBe(0);
    for (let i = 0; i < TRAP_INTERVAL; i++) w = tick(w);
    expect(w.live.web.replicas).toBe(3);
    expect(failingShare(w.live, true)).toBeCloseTo(1 - 300 / 900, 10);
    const committed = tick(commit(manual(base(), 'web', { ...DESIRED_START.web, replicas: 10 }, 'x'), { ...DESIRED_START, web: { ...DESIRED_START.web, replicas: 10 } }));
    expect(committed.live.web.replicas).toBe(10);
    expect(failingShare(committed.live, true)).toBe(0);
  });

  it('a paused sync leaves the hand-made change in place, counts the drift as unnoticed, and reverts it as soon as sync resumes', () => {
    let w = setPaused(manual(initWorld({ interval: TRAP_INTERVAL }), 'web', { ...DESIRED_START.web, replicas: 10 }, 'scale web to 10'), true);
    for (let i = 0; i < 10; i++) w = tick(w);
    expect([w.live.web.replicas, w.unnoticedSeconds]).toEqual([10, 10]);
    w = setPaused(w, false);
    for (let i = 0; i < TRAP_INTERVAL; i++) w = tick(w);
    expect(w.live.web.replicas).toBe(3);
  });

  it('keeps the share of failing requests at 0 whenever capacity covers the load', () => {
    expect(failingShare(DESIRED_START, false)).toBe(0);
    expect(failingShare({ ...DESIRED_START, web: { ...DESIRED_START.web, replicas: 0 } }, false)).toBe(1);
  });
});

describe('level-triggered against edge-triggered on the same event sequence', () => {
  const last = (o: Parameters<typeof runScript>[0]) => runScript(o)[SCRIPT_END];

  it('when the controller restarts and misses events, the edge-triggered handler ends wrong and the level-triggered one ends right', () => {
    const edge = last({ handler: 'edge', restart: true, prune: true });
    const level = last({ handler: 'level', restart: true, prune: true });
    expect(verdict(edge.desired, edge.live)).toEqual({ matches: false, wrong: ['api', 'web-svc'], orphans: [] });
    expect(verdict(level.desired, level.live)).toEqual({ matches: true, wrong: [], orphans: [] });
  });

  it('when the controller never misses an event, both end right', () => {
    for (const handler of ['edge', 'level'] as const) {
      const f = last({ handler, restart: false, prune: true });
      expect(verdict(f.desired, f.live).matches, handler).toBe(true);
    }
  });

  it('a resource removed from git is deleted only with pruning on; otherwise it is an orphan, for both handlers', () => {
    for (const handler of ['edge', 'level'] as const) {
      const on = last({ handler, restart: false, prune: true });
      const off = last({ handler, restart: false, prune: false });
      expect(verdict(on.desired, on.live).orphans, handler).toEqual([]);
      expect(verdict(off.desired, off.live).orphans, handler).toEqual(['worker']);
    }
  });

  it('the controller is down for exactly the seconds named, and the level-triggered one finishes converging after it is back', () => {
    const frames = runScript({ handler: 'level', restart: true, prune: true });
    expect(frames.filter((f) => f.down).map((f) => f.t)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(frames[DOWN_UNTIL - 1].live['web-svc']).toBeUndefined();
    expect(verdict(frames[SCRIPT_END].desired, frames[SCRIPT_END].live).matches).toBe(true);
  });
});
