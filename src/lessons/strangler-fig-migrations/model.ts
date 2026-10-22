/**
 * Strangler-fig migration: a monolith behind a routing facade with eight routes. Every figure is INVENTED (named
 * constants below); the rules are stated on screen. Pure and seeded: no React, no clock.
 */
import { choose, enumeratePaths, redMeters, startWalk, type Meter, type Scenario, type Values } from '../../core/scenario';
import { createTickSim, type TickSim } from '../../core/simTick';

export const REQ_PER_MIN = 10_000;
/** The simulation runs one tick per minute for this long. */
export const SIM_MINUTES = 60;
export const DEFAULT_SEED = 7;
/** Invented rule: a new route answers differently from the monolith on 0.5% of requests, plus 1% per shared table. */
export const BASE_DEFECT_PERMILLE = 5;
export const DEFECT_PER_TABLE_PERMILLE = 10;
export const MINUTES = { min: 0, max: 120, step: 5 } as const;

export type RouteId = 'login' | 'search' | 'catalog' | 'cart' | 'checkout' | 'orders' | 'reports' | 'admin';
export interface Route {
  id: RouteId;
  label: string;
  /** Percent of all requests. */
  traffic: number;
  /** Shared tables (invented). */
  coupling: number;
  /** Writes a minute that exist only in the new store once the route is served from it; 0 for a route that owns no data. */
  writesPerMin: number;
  note: string;
}

export const ROUTES: readonly Route[] = [
  { id: 'login', label: 'login', traffic: 18, coupling: 1, writesPerMin: 0, note: 'sessions' },
  { id: 'search', label: 'search', traffic: 22, coupling: 0, writesPerMin: 0, note: 'read-only' },
  { id: 'catalog', label: 'catalog', traffic: 25, coupling: 2, writesPerMin: 0, note: 'read-mostly' },
  { id: 'cart', label: 'cart', traffic: 10, coupling: 3, writesPerMin: 30, note: 'owns data' },
  { id: 'checkout', label: 'checkout', traffic: 6, coupling: 6, writesPerMin: 12, note: 'owns data, most revenue' },
  { id: 'orders', label: 'orders', traffic: 8, coupling: 4, writesPerMin: 20, note: 'owns data' },
  { id: 'reports', label: 'reports', traffic: 6, coupling: 5, writesPerMin: 0, note: 'read-only batch' },
  { id: 'admin', label: 'admin', traffic: 5, coupling: 2, writesPerMin: 0, note: 'internal' },
];

export const routeOf = (id: RouteId): Route => ROUTES.find((r) => r.id === id)!;
export const ownsData = (r: Route): boolean => r.writesPerMin > 0;
/** Defect rate in thousandths: 0.5% + 1% x shared tables. */
export const defectPermille = (r: Route): number => BASE_DEFECT_PERMILLE + DEFECT_PER_TABLE_PERMILLE * r.coupling;
/** Requests a minute on a route. */
export const requestsPerMin = (r: Route): number => (REQ_PER_MIN * r.traffic) / 100;

export type Mode = 'off' | 'shadow' | 'serve';
export const MODES: readonly { id: Mode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'serve', label: 'Serve' },
];
export const SHARES = [10, 25, 50, 100] as const;
export type Share = (typeof SHARES)[number];

export interface RouteSetting {
  mode: Mode;
  /** Percent of the route's requests answered by the new stack: used in Serve only. */
  share: Share;
  dualWrite: boolean;
}
export interface Notice {
  route: RouteId;
  lost: number;
}
export interface Facade {
  settings: Readonly<Record<RouteId, RouteSetting>>;
  minutes: number;
  seed: number;
  /** What the last Roll back cost; cleared by the next action. */
  notice: Notice | null;
}

export const initialFacade = (): Facade => ({
  settings: Object.fromEntries(ROUTES.map((r) => [r.id, { mode: 'off', share: 100, dualWrite: false }])) as Record<RouteId, RouteSetting>,
  minutes: 0,
  seed: DEFAULT_SEED,
  notice: null,
});

const patch = (f: Facade, id: RouteId, change: Partial<RouteSetting>): Facade => ({
  ...f, notice: null, settings: { ...f.settings, [id]: { ...f.settings[id], ...change } },
});

export const setMode = (f: Facade, id: RouteId, mode: Mode): Facade => patch(f, id, { mode });
export const setShare = (f: Facade, id: RouteId, share: Share): Facade => patch(f, id, { share });
export const setDualWrite = (f: Facade, id: RouteId, dualWrite: boolean): Facade => patch(f, id, { dualWrite });
export const setSeed = (f: Facade, seed: number): Facade => ({ ...f, seed, notice: null });
export const setMinutes = (f: Facade, minutes: number): Facade => ({
  ...f, notice: null, minutes: Math.min(MINUTES.max, Math.max(MINUTES.min, Math.round(minutes))),
});

/** Writes that exist only in the new store: routed share x writes a minute x minutes since cutover, for a served data-owning route without dual-write. */
export function writesLost(r: Route, s: RouteSetting, minutes: number): number {
  if (s.mode !== 'serve' || !ownsData(r) || s.dualWrite) return 0;
  return Math.round((s.share * r.writesPerMin * minutes) / 100);
}

/** Roll a route back to the monolith: it goes Off, and the notice says what that left behind. */
export function rollBack(f: Facade, id: RouteId): Facade {
  const lost = writesLost(routeOf(id), f.settings[id], f.minutes);
  return { ...patch(f, id, { mode: 'off' }), notice: { route: id, lost } };
}

export interface Readout {
  /** Expected share of all requests the user sees wrong. */
  errorRate: number;
  /** Shadow requests a minute, mismatches a minute, and the mismatch share of the mirrored requests (null when nothing is mirrored). */
  mirroredPerMin: number;
  mismatchPerMin: number;
  mismatchRate: number | null;
  /** Shares of all requests. */
  servedShare: number;
  mirroredShare: number;
  lost: { route: RouteId; lost: number }[];
  lostTotal: number;
}

/** Every closed-form figure of the facade, from the settings alone. */
export function readout(f: Facade): Readout {
  let wrongPerMin = 0;
  let mirrored = 0;
  let mismatch = 0;
  let served = 0;
  const lost: Readout['lost'] = [];
  for (const r of ROUTES) {
    const s = f.settings[r.id];
    const perMin = requestsPerMin(r);
    const defect = defectPermille(r) / 1000;
    if (s.mode === 'serve') {
      wrongPerMin += perMin * (s.share / 100) * defect;
      served += perMin * (s.share / 100);
    }
    if (s.mode === 'shadow') {
      mirrored += perMin;
      mismatch += perMin * defect;
    }
    const l = writesLost(r, s, f.minutes);
    if (l > 0) lost.push({ route: r.id, lost: l });
  }
  return {
    errorRate: wrongPerMin / REQ_PER_MIN,
    mirroredPerMin: mirrored,
    mismatchPerMin: mismatch,
    mismatchRate: mirrored > 0 ? mismatch / mirrored : null,
    servedShare: served / REQ_PER_MIN,
    mirroredShare: mirrored / REQ_PER_MIN,
    lost,
    lostTotal: lost.reduce((n, l) => n + l.lost, 0),
  };
}

// ── The seeded tick simulation: one tick is one minute ───────────────────────

export interface SimState {
  served: number;
  wrong: number;
  mirrored: number;
  mismatched: number;
}
const ZERO: SimState = { served: 0, wrong: 0, mirrored: 0, mismatched: 0 };

/** The routing part of the settings: all a simulation depends on (dual-write and minutes feed only the rollback figure). */
export const simKey = (f: Facade): string => `${f.seed}|${ROUTES.map((r) => `${f.settings[r.id].mode}:${f.settings[r.id].share}`).join(',')}`;

export function makeFacadeSim(f: Facade): TickSim<SimState> {
  return createTickSim<SimState>({
    seed: f.seed,
    init: () => ZERO,
    step: (state, rnd) => {
      let { served, wrong, mirrored, mismatched } = state;
      for (const r of ROUTES) {
        const s = f.settings[r.id];
        if (s.mode === 'off') continue;
        const defect = defectPermille(r) / 1000;
        const n = s.mode === 'serve' ? (requestsPerMin(r) * s.share) / 100 : requestsPerMin(r);
        let bad = 0;
        for (let i = 0; i < n; i += 1) if (rnd() < defect) bad += 1;
        if (s.mode === 'serve') {
          served += n;
          wrong += bad;
        } else {
          mirrored += n;
          mismatched += bad;
        }
      }
      return { served, wrong, mirrored, mismatched };
    },
  });
}

export interface Observed {
  minutes: number;
  wrong: number;
  errorRate: number;
  mismatchPerMin: number;
  mismatchRate: number | null;
}

export function observe(f: Facade, minutes = SIM_MINUTES): Observed {
  const sim = makeFacadeSim(f);
  sim.run(minutes);
  const s = sim.state;
  return {
    minutes,
    wrong: s.wrong,
    errorRate: s.wrong / (REQ_PER_MIN * minutes),
    mismatchPerMin: s.mismatched / minutes,
    mismatchRate: s.mirrored > 0 ? s.mismatched / s.mirrored : null,
  };
}

const observedByRun = new Map<string, Observed>();
/** `observe` for the default run length, remembered per routing setting and seed: moving the minutes slider never re-runs it. */
export function observeCached(f: Facade): Observed {
  const key = simKey(f);
  const hit = observedByRun.get(key);
  if (hit) return hit;
  const fresh = observe(f);
  observedByRun.set(key, fresh);
  return fresh;
}

// ── The ledger over the scenario's paths ────────────────────────────────────

export interface PathRow {
  key: string;
  choices: string[];
  endingId: string;
  meters: Values;
  /** Meters that are in the red after some step of the path. */
  everRed: string[];
  /** Meters whose final value is worse than the start (in each meter's own good direction). */
  worseThanStart: string[];
}

const higherIsBetter = (m: Meter): boolean => 'below' in m.bad;
/** How much better `a` is than `b` on a meter. */
const better = (m: Meter, a: number, b: number): number => (higherIsBetter(m) ? a - b : b - a);

/** Every path of a scenario with where it goes red and what it leaves worse than the start. */
export function pathRows(s: Scenario): PathRow[] {
  const begin = startWalk(s).meters;
  return enumeratePaths(s).map((p) => {
    const red = new Set<string>();
    let walk = startWalk(s);
    for (const id of p.choices) {
      walk = choose(s, walk, id);
      for (const m of redMeters(s, walk.meters)) red.add(m.id);
    }
    return {
      key: p.choices.join('-'),
      choices: p.choices,
      endingId: p.endingId,
      meters: p.meters,
      everRed: s.meters.filter((m) => red.has(m.id)).map((m) => m.id),
      worseThanStart: s.meters.filter((m) => better(m, p.meters[m.id], begin[m.id]) < 0).map((m) => m.id),
    };
  });
}

/** Paths whose meters are never in the red, at any step. */
export const neverRedPaths = (rows: readonly PathRow[]): PathRow[] => rows.filter((r) => r.everRed.length === 0);

/** For each meter, the keys of the paths that end best on it. */
export function bestPathSets(s: Scenario, rows: readonly PathRow[]): Record<string, string[]> {
  return Object.fromEntries(s.meters.map((m) => {
    const best = rows.reduce((b, r) => (better(m, r.meters[m.id], b) > 0 ? r.meters[m.id] : b), rows[0].meters[m.id]);
    return [m.id, rows.filter((r) => r.meters[m.id] === best).map((r) => r.key)];
  }));
}

/** The paths that are best on every meter at once (an empty list says no path is). */
export function bestOnEvery(s: Scenario, rows: readonly PathRow[]): string[] {
  const sets = Object.values(bestPathSets(s, rows));
  return sets.reduce((common, set) => common.filter((k) => set.includes(k)), sets[0]);
}
