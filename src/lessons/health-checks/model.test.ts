import { describe, expect, it } from 'vitest';
import { mulberry32, pick } from '../../core/random';
import {
  CHECKS, checkPasses, dbUp, HORIZON, PODS, POOL_ATTEMPTS, probeOutcome, RESTART_DELAY_S, SCENARIOS, scenarioById, simulate, STARTUP_DEFAULT, totalsAt,
  type CheckKind, type Config, type Facts, type ProbeConfig, type ProbeKind, type Run, type Scenario, type ScenarioId,
} from './model';

const probe = (check: CheckKind, period: number, threshold: number, enabled = true): ProbeConfig => ({ enabled, check, period, threshold });
const off = probe('handler', 5, 12, false);
const clone = (c: Config): Config => JSON.parse(JSON.stringify(c)) as Config;

/** Runs of consecutive ready seconds for one pod, as [from, to) second indices. */
function readyIntervals(run: Run, pod: number): [number, number][] {
  const out: [number, number][] = [];
  let from: number | null = null;
  run.seconds.forEach((s, t) => {
    if (s.pods[pod].ready && from === null) from = t;
    if (!s.pods[pod].ready && from !== null) {
      out.push([from, t]);
      from = null;
    }
  });
  if (from !== null) out.push([from, run.seconds.length]);
  return out;
}

const firstReady = (run: Run) => {
  const t = run.seconds.findIndex((s) => s.pods.some((p) => p.ready));
  return t < 0 ? null : t;
};

describe('probeOutcome and checkPasses', () => {
  const scenario = { bootS: 4, cacheS: 6, dbDown: [[20, 25]] as [number, number][] };
  const facts = (age: number, t: number, hung = false): Facts => ({ age, t, hung, scenario });

  it('each check, over every combination of age, outage and hang, matches its plain-words definition', () => {
    for (let age = 0; age <= 14; age++) {
      for (const t of [10, 20, 24, 25, 30]) {
        for (const hung of [false, true]) {
          const f = facts(age, t, hung);
          const handler = age >= 4 && !hung;
          expect(checkPasses('tcp', f)).toBe(age >= 1);
          expect(checkPasses('handler', f)).toBe(handler);
          expect(checkPasses('db', f)).toBe(handler && !(t >= 20 && t < 25));
          expect(checkPasses('cache', f)).toBe(handler && age >= 10);
        }
      }
    }
  });

  it('a hung process still passes a TCP check but fails every check that needs the handler', () => {
    const f = facts(30, 40, true);
    expect(CHECKS.filter((c) => checkPasses(c, f))).toEqual(['tcp']);
  });

  it('deeper checks never pass when a shallower one fails', () => {
    for (let age = 0; age <= 20; age++) {
      for (const t of [0, 22, 40]) {
        const f = facts(age, t);
        if (!checkPasses('handler', f)) {
          expect(checkPasses('db', f)).toBe(false);
          expect(checkPasses('cache', f)).toBe(false);
        }
      }
    }
  });

  it('runs only when enabled, due, and (for liveness and readiness) after the startup probe succeeded', () => {
    const cfg = probe('tcp', 5, 3);
    for (const kind of ['startup', 'liveness', 'readiness'] as ProbeKind[]) {
      expect(probeOutcome(kind, { ...cfg, enabled: false }, true, facts(10, 0))).toBe('idle');
      expect(probeOutcome(kind, cfg, kind === 'startup' ? false : true, facts(7, 0))).toBe('idle');
    }
    // Not due, due and passing, due and failing (age 0: nothing is listening yet).
    expect(probeOutcome('liveness', cfg, true, facts(10, 0))).toBe('pass');
    expect(probeOutcome('liveness', cfg, true, facts(0, 0))).toBe('fail');
    // Liveness and readiness are held back while startup has not succeeded; startup stops once it has.
    expect(probeOutcome('liveness', cfg, false, facts(10, 0))).toBe('idle');
    expect(probeOutcome('readiness', cfg, false, facts(10, 0))).toBe('idle');
    expect(probeOutcome('startup', cfg, false, facts(10, 0))).toBe('pass');
    expect(probeOutcome('startup', cfg, true, facts(10, 0))).toBe('idle');
  });

  it('the database windows are half-open', () => {
    expect(dbUp({ dbDown: [[10, 12]] }, 9)).toBe(true);
    expect(dbUp({ dbDown: [[10, 12]] }, 10)).toBe(false);
    expect(dbUp({ dbDown: [[10, 12]] }, 11)).toBe(false);
    expect(dbUp({ dbDown: [[10, 12]] }, 12)).toBe(true);
  });
});

describe('the decision table: every check on every probe in every scenario', () => {
  const baseline = (id: ScenarioId): Config => ({
    startup: id === 'slow-boot' ? STARTUP_DEFAULT : off,
    liveness: probe('handler', 5, 3),
    readiness: probe('handler', 5, 2),
  });
  const withProbe = (id: ScenarioId, kind: ProbeKind, cfg: ProbeConfig): Config => {
    const c = baseline(id);
    c[kind] = cfg;
    if (id === 'deadlock' && kind === 'readiness') c.liveness = probe('tcp', 5, 3);
    return c;
  };
  const four = (n: number) => Array.from({ length: PODS }, () => n);
  const IDS: ScenarioId[] = ['slow-boot', 'db-outage', 'deadlock', 'early-ready'];

  // Worked by hand from the scenario facts: probes run at ages 0, 5, 10 ...; the handler answers from the boot time on.
  const LIVENESS_RESTARTS: Record<ScenarioId, Record<CheckKind, number[]>> = {
    'slow-boot': { tcp: four(0), handler: four(0), db: four(0), cache: four(0) },
    'db-outage': { tcp: four(0), handler: four(0), db: four(2), cache: four(0) },
    deadlock: { tcp: four(0), handler: [0, 0, 1, 0], db: [0, 0, 1, 0], cache: [0, 0, 1, 0] },
    'early-ready': { tcp: four(0), handler: four(0), db: four(0), cache: four(6) },
    flapping: { tcp: four(0), handler: four(0), db: four(0), cache: four(0) },
  };

  it.each(IDS.flatMap((id) => CHECKS.map((check) => [id, check] as const)))('liveness check on %s: %s', (id, check) => {
    const run = simulate(withProbe(id, 'liveness', probe(check, 5, 3)), scenarioById(id));
    expect(run.restarts).toEqual(LIVENESS_RESTARTS[id][check]);
  });

  const ALWAYS = (from: number): [number, number][] => [[from, HORIZON]];
  /** Ready intervals per pod for a readiness check. */
  const READY: Record<ScenarioId, (check: CheckKind, pod: number) => [number, number][]> = {
    'slow-boot': () => ALWAYS(30),
    'db-outage': (check) => (check === 'db' ? [[5, 15], [34 + 1, HORIZON]] : ALWAYS(5)),
    deadlock: (check, pod) => (pod === 2 && check !== 'tcp' ? [[5, 20]] : ALWAYS(5)),
    'early-ready': (check) => (check === 'cache' ? ALWAYS(20) : ALWAYS(5)),
    flapping: () => [],
  };

  it.each(IDS.flatMap((id) => CHECKS.map((check) => [id, check] as const)))('readiness check on %s: %s', (id, check) => {
    const run = simulate(withProbe(id, 'readiness', probe(check, 5, 2)), scenarioById(id));
    for (let pod = 0; pod < PODS; pod++) expect(readyIntervals(run, pod)).toEqual(READY[id](check, pod));
    // A readiness probe never restarts anything: the only restarts are the liveness probe's, on the deadlocked pod.
    expect(run.restarts).toEqual(id === 'deadlock' ? four(0) : four(0));
  });

  it('readiness failing means no restart, and the slow requests of "ready too early" go away only with the cache check', () => {
    for (const check of CHECKS) {
      const run = simulate(withProbe('early-ready', 'readiness', probe(check, 5, 2)), scenarioById('early-ready'));
      expect(totalsAt(run, HORIZON).slow > 0).toBe(check !== 'cache');
    }
  });

  const STARTUP: Record<ScenarioId, Record<CheckKind, { restarts: number[] | 'loop'; ready: number | null }>> = {
    'slow-boot': {
      tcp: { restarts: 'loop', ready: null },
      handler: { restarts: four(0), ready: 30 },
      db: { restarts: four(0), ready: 30 },
      cache: { restarts: four(0), ready: 30 },
    },
    'db-outage': { tcp: { restarts: four(0), ready: 5 }, handler: { restarts: four(0), ready: 5 }, db: { restarts: four(0), ready: 5 }, cache: { restarts: four(0), ready: 5 } },
    deadlock: {
      tcp: { restarts: [0, 0, 1, 0], ready: 5 },
      handler: { restarts: [0, 0, 1, 0], ready: 5 },
      db: { restarts: [0, 0, 1, 0], ready: 5 },
      cache: { restarts: [0, 0, 1, 0], ready: 5 },
    },
    'early-ready': {
      tcp: { restarts: four(0), ready: 5 },
      handler: { restarts: four(0), ready: 5 },
      db: { restarts: four(0), ready: 5 },
      cache: { restarts: four(0), ready: 20 },
    },
    flapping: { tcp: { restarts: four(0), ready: 5 }, handler: { restarts: four(0), ready: 5 }, db: { restarts: four(0), ready: 5 }, cache: { restarts: four(0), ready: 5 } },
  };

  it.each(IDS.flatMap((id) => CHECKS.map((check) => [id, check] as const)))('startup check on %s: %s', (id, check) => {
    const cfg = baseline(id);
    cfg.startup = probe(check, 5, 12);
    const run = simulate(cfg, scenarioById(id));
    const want = STARTUP[id][check];
    if (want.restarts === 'loop') {
      expect(run.restarts.every((n) => n >= 3)).toBe(true);
      expect(firstReady(run)).toBeNull();
    } else {
      expect(run.restarts).toEqual(want.restarts);
      expect(firstReady(run)).toBe(want.ready);
    }
  });
});

describe('the four scenarios as written', () => {
  const fixes: Record<ScenarioId, (c: Config) => void> = {
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
  const fixed = (s: Scenario) => {
    const c = clone(s.initial);
    fixes[s.id](c);
    return c;
  };

  it('slow boot: without a startup probe liveness kills the pod in a loop and it is never ready; with one, liveness waits', () => {
    const s = scenarioById('slow-boot');
    const bad = simulate(s.initial, s);
    expect(firstReady(bad)).toBeNull();
    expect(bad.restarts.every((n) => n >= 5)).toBe(true);
    const good = simulate(fixed(s), s);
    expect(good.restarts).toEqual([0, 0, 0, 0]);
    expect(firstReady(good)).toBe(30);
  });

  it('db outage: with the DB check on liveness every pod restarts, all at the same moments; moved to readiness, nobody restarts', () => {
    const s = scenarioById('db-outage');
    const bad = simulate(s.initial, s);
    expect(bad.restarts.every((n) => n >= 1)).toBe(true);
    const restartSeconds = (pod: number) => bad.seconds.filter((x) => x.pods[pod].restarted).map((x) => x.t);
    for (let pod = 1; pod < PODS; pod++) expect(restartSeconds(pod)).toEqual(restartSeconds(0));
    expect(restartSeconds(0)).toEqual([20, 32]);
    const good = simulate(fixed(s), s);
    expect(good.restarts).toEqual([0, 0, 0, 0]);
    // The restarts reconnect: each wave opens POOL_ATTEMPTS connections per pod at once, and the last wave lands the second the DB returns.
    const wave = bad.seconds[34];
    expect(wave.dbUp).toBe(true);
    expect(wave.dbAttempts).toBeGreaterThanOrEqual(PODS * POOL_ATTEMPTS);
    expect(totalsAt(bad, HORIZON).restarts).toBe(PODS * 2);
    expect(totalsAt(bad, HORIZON).dbAttempts).toBeGreaterThan(totalsAt(good, HORIZON).dbAttempts - 64);
  });

  it('deadlock: only a handler check catches it, and only the hung pod restarts', () => {
    const s = scenarioById('deadlock');
    const bad = simulate(s.initial, s);
    expect(bad.restarts).toEqual([0, 0, 0, 0]);
    expect(bad.seconds[70].pods[2].ready).toBe(true);
    expect(bad.seconds[70].pods[2].hung).toBe(true);
    const good = simulate(fixed(s), s);
    expect(good.restarts).toEqual([0, 0, 1, 0]);
    expect(good.seconds[79].pods[2].hung).toBe(false);
    expect(totalsAt(good, HORIZON).errors).toBeLessThan(totalsAt(bad, HORIZON).errors);
  });

  it('ready too early: slow requests until the cache is warm; the cache check trades them for time out of rotation', () => {
    const s = scenarioById('early-ready');
    const bad = simulate(s.initial, s);
    const good = simulate(fixed(s), s);
    expect(totalsAt(bad, HORIZON).slow).toBeGreaterThan(0);
    expect(totalsAt(good, HORIZON).slow).toBe(0);
    expect(firstReady(bad)).toBe(5);
    expect(firstReady(good)).toBe(20);
  });

  it('flapping: a readiness threshold at or under the length of a blip flips the rotation every time; above it, never', () => {
    const s = scenarioById('flapping');
    const blip = s.dbDown[0][1] - s.dbDown[0][0];
    for (let th = 1; th <= 5; th++) {
      const cfg = clone(s.initial);
      cfg.readiness = probe('db', 1, th);
      const changes = totalsAt(simulate(cfg, s), HORIZON).rotationChanges;
      if (th <= blip) expect(changes).toBe(PODS + s.dbDown.length * 2 * PODS);
      else expect(changes).toBe(PODS);
    }
  });
});

describe('thresholds and periods: the arithmetic', () => {
  const custom = (bootS: number, deadlockAt: number | null): Scenario => ({
    id: 'slow-boot', label: 'custom', bootS, cacheS: 0, dbDown: [], deadlock: deadlockAt === null ? null : { pod: 0, at: deadlockAt }, initial: scenarioById('slow-boot').initial,
  });

  it('a startup probe survives a boot exactly when the failures before the first passing probe stay under the threshold', () => {
    for (const boot of [3, 7, 10, 30]) {
      for (let period = 1; period <= 10; period++) {
        for (let th = 1; th <= 20; th++) {
          const cfg: Config = { startup: probe('handler', period, th), liveness: probe('handler', 1, 1, false), readiness: probe('handler', 1, 1, false) };
          const run = simulate(cfg, custom(boot, null));
          // Probes run at ages 0, p, 2p, ...; the handler answers from age `boot`, so ceil(boot / p) probes fail first.
          const failuresFirst = Math.ceil(boot / period);
          expect(run.restarts[0] === 0).toBe(failuresFirst < th);
          if (failuresFirst >= th) {
            const first = run.seconds.findIndex((s) => s.pods[0].restarted);
            expect(first).toBe((th - 1) * period);
          }
        }
      }
    }
  });

  it('liveness restarts a hung pod at the threshold-th failing probe: ceil(hang / period) * period + (threshold - 1) * period', () => {
    const hang = 15;
    for (let period = 1; period <= 10; period++) {
      for (let th = 1; th <= 6; th++) {
        const cfg: Config = { startup: off, liveness: probe('handler', period, th), readiness: probe('handler', 1, 1, false) };
        const run = simulate(cfg, custom(0, hang));
        const expected = Math.ceil(hang / period) * period + (th - 1) * period;
        const first = run.seconds.findIndex((s) => s.pods[0].restarted);
        if (expected < HORIZON) expect(first).toBe(expected);
        else expect(first).toBe(-1);
      }
    }
  });

  it('a restarted container waits RESTART_DELAY_S, comes back with its age reset, and must pass startup again', () => {
    const cfg: Config = { startup: probe('handler', 5, 12), liveness: probe('handler', 5, 3), readiness: probe('handler', 5, 2) };
    const run = simulate(cfg, custom(3, 15));
    const at = run.seconds.findIndex((s) => s.pods[0].restarted);
    expect(run.seconds[at + 1].pods[0].up).toBe(false);
    expect(run.seconds[at + RESTART_DELAY_S].pods[0]).toMatchObject({ up: true, started: true, age: 0, ready: false });
    // After the restart the startup probe runs again, and liveness and readiness are idle until it passes.
    const after = run.seconds.slice(at + RESTART_DELAY_S);
    const passed = after.findIndex((s) => s.pods[0].results.startup === 'pass');
    expect(passed).toBeGreaterThan(0);
    for (const s of after.slice(0, passed)) expect([s.pods[0].results.liveness, s.pods[0].results.readiness]).toEqual(['idle', 'idle']);
  });
});

describe('invariants over random configurations', () => {
  const randomConfig = (rnd: () => number): Config => ({
    startup: probe(pick(CHECKS, rnd), 1 + Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 15), rnd() < 0.5),
    liveness: probe(pick(CHECKS, rnd), 1 + Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 6)),
    readiness: probe(pick(CHECKS, rnd), 1 + Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 6)),
  });

  it('every restart follows threshold failures in a row; readiness never restarts; probes wait for startup; routing follows readiness; DB attempts add up', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = mulberry32(seed * 7);
      const scenario = pick(SCENARIOS, rnd);
      const cfg = randomConfig(rnd);
      const run = simulate(cfg, scenario);
      let attempts = 0;
      for (let pod = 0; pod < PODS; pod++) {
        const streak: Record<ProbeKind, number> = { startup: 0, liveness: 0, readiness: 0 };
        let startupDone = !cfg.startup.enabled;
        let readyBefore = false;
        run.seconds.forEach((s) => {
          const p = s.pods[pod];
          if (p.started) {
            streak.startup = streak.liveness = streak.readiness = 0;
            startupDone = !cfg.startup.enabled;
            readyBefore = false;
          }
          if (!p.up) return;
          for (const kind of ['startup', 'liveness', 'readiness'] as ProbeKind[]) {
            const r = p.results[kind];
            if (r === 'idle') continue;
            if (r === 'pass') streak[kind] = 0;
            else streak[kind] += 1;
            // While startup has not succeeded, neither of the other probes runs.
            if (kind !== 'startup') expect(startupDone).toBe(true);
            if (kind === 'startup' && r === 'pass') startupDone = true;
          }
          if (p.restarted) {
            // Only startup or liveness restarts, and only on the threshold-th failure in a row.
            expect(p.restartCause === 'startup' || p.restartCause === 'liveness').toBe(true);
            expect(streak[p.restartCause!]).toBe(cfg[p.restartCause!].threshold);
          } else {
            for (const kind of ['startup', 'liveness'] as ProbeKind[]) expect(streak[kind]).toBeLessThan(cfg[kind].threshold);
          }
          // Readiness: ready after a pass; not ready after threshold failures in a row (and only then, once it has been ready).
          if (p.results.readiness === 'pass') expect(p.ready).toBe(true);
          if (p.results.readiness === 'fail' && streak.readiness >= cfg.readiness.threshold) expect(p.ready).toBe(false);
          if (p.ready && !readyBefore) expect(p.results.readiness).toBe('pass');
          readyBefore = p.ready;
          if (p.restarted) expect(p.ready).toBe(false);
        });
      }
      run.seconds.forEach((s) => {
        const ready = s.pods.filter((p) => p.ready).length;
        const r = s.requests;
        expect(r.ok + r.slow + r.error).toBe(4);
        if (ready === 0) expect(r.unrouted).toBe(4);
        else expect(r.unrouted).toBe(0);
        const starts = s.pods.filter((p) => p.started).length;
        const dbRuns = s.pods.reduce((n, p) => n + (['startup', 'liveness', 'readiness'] as ProbeKind[]).filter((k) => p.results[k] !== 'idle' && cfg[k].check === 'db').length, 0);
        expect(s.dbAttempts).toBe(starts * POOL_ATTEMPTS + dbRuns);
        attempts += s.dbAttempts;
      });
      expect(totalsAt(run, HORIZON).dbAttempts).toBe(attempts);
      expect(totalsAt(run, HORIZON).restarts).toBe(run.restarts.reduce((a, b) => a + b, 0));
    }
  });

  it('is deterministic', () => {
    const s = scenarioById('db-outage');
    expect(JSON.stringify(simulate(s.initial, s))).toBe(JSON.stringify(simulate(s.initial, s)));
  });
});
