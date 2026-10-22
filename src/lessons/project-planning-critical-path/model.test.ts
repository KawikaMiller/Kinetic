import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { BROOKS_DEFAULT, MAX_PEOPLE, completionDays, readBrooks } from './brooks';
import {
  MAX_TASKS, PRESET, addEdge, addTask, calendarDay, cpm, endHours, parseDays, setDays, startHours, topoOrder, totalWork, type Plan,
} from './cpm';
import { BRUTE_FORCE_LIMIT, listSchedule, lowerBounds, optimalMakespan } from './schedule';
import { MERGE_DEMO, UNCERTAINTY_DEFAULT, criticalChainMean, expectedMaxClosedForm, gapSplit, maxOfTwoPaths, simulateProject } from './uncertainty';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

/** A random acyclic plan: tasks in order, an edge from an earlier to a later task with some probability. */
function randomPlan(seed: number, maxTasks: number): Plan {
  const rnd = mulberry32(seed);
  const n = 3 + Math.floor(rnd() * (maxTasks - 2));
  const tasks = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, label: `T${i}`, days: 1 + Math.floor(rnd() * 6) }));
  const edges: [string, string][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < 0.35) edges.push([`t${i}`, `t${j}`]);
  return { tasks, edges };
}

/** Independent oracle: every source-to-sink path, by depth-first enumeration. */
function allPaths(plan: Plan): string[][] {
  const hasPred = new Set(plan.edges.map(([, b]) => b));
  const out: string[][] = [];
  const walk = (id: string, path: string[]) => {
    const next = plan.edges.filter(([a]) => a === id).map(([, b]) => b);
    if (next.length === 0) out.push([...path]);
    for (const n of next) walk(n, [...path, n]);
  };
  for (const t of plan.tasks) if (!hasPred.has(t.id)) walk(t.id, [t.id]);
  return out;
}

const pathLength = (plan: Plan, path: string[]) => path.reduce((s, id) => s + plan.tasks.find((t) => t.id === id)!.days, 0);

describe('the critical path method', () => {
  it('on the preset: 16 days, critical design-api-integrate-tests-release, slack 3 on schema and 2 on ui and polish (hand-worked)', () => {
    const s = cpm(PRESET);
    expect(s.length).toBe(16);
    expect(s.critical).toEqual(['design', 'api', 'integrate', 'tests', 'release']);
    expect([s.slack.schema, s.slack.ui, s.slack.polish]).toEqual([3, 2, 2]);
    expect([s.es.integrate, s.ef.integrate, s.es.tests, s.ls.schema, s.lf.polish]).toEqual([8, 11, 11, 6, 11]);
  });

  it('matches enumeration of all source-to-sink paths on 200 random DAGs: length is the longest path, slack is length minus the longest path through the task', () => {
    for (const seed of SEEDS) {
      const plan = randomPlan(seed, 9);
      const s = cpm(plan);
      const paths = allPaths(plan);
      const longest = Math.max(...paths.map((p) => pathLength(plan, p)));
      expect(s.length, `seed ${seed}`).toBe(longest);
      for (const t of plan.tasks) {
        const through = Math.max(...paths.filter((p) => p.includes(t.id)).map((p) => pathLength(plan, p)));
        expect(s.slack[t.id], `seed ${seed} ${t.id}`).toBe(longest - through);
      }
      expect(s.critical.sort()).toEqual(plan.tasks.filter((t) => s.slack[t.id] === 0).map((t) => t.id).sort());
    }
  });

  it('shared float: the slack two sequential tasks share is the path\'s float, not the sum (hand case and 200 random DAGs)', () => {
    // UI then Polish: 2 days of float between them. Spending it on UI leaves none for Polish.
    expect(cpm(setDays(PRESET, 'ui', 6)).slack.polish).toBe(0);
    expect(cpm(setDays(PRESET, 'ui', 6)).length).toBe(16);
    expect(cpm(setDays(PRESET, 'ui', 7)).length).toBe(17);
    // When the longest path through the first task also runs through the second and both have the same slack F, F is shared:
    // spending x on the first leaves F - x for the second, and F + 1 in total raises the end.
    let checked = 0;
    for (const seed of SEEDS) {
      const plan = randomPlan(seed, 9);
      const s = cpm(plan);
      for (const [a, b] of plan.edges) {
        const F = s.slack[a];
        if (F < 1 || s.slack[b] !== F) continue;
        const through = Math.max(...allPaths(plan).filter((p) => p.join().includes(`${a},${b}`)).map((p) => pathLength(plan, p)));
        if (s.length - through !== F) continue;
        checked++;
        const days = (id: string) => plan.tasks.find((t) => t.id === id)!.days;
        for (let x = 0; x <= F; x++) {
          const after = cpm(setDays(plan, a, days(a) + x));
          expect(after.length, `seed ${seed} ${a}->${b} spend ${x}`).toBe(s.length);
          expect(after.slack[b]).toBe(F - x);
        }
        expect(cpm(setDays(plan, a, days(a) + F + 1)).length).toBe(s.length + 1);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('shortening an off-path task never moves the end; shortening a critical task moves it until a second path takes over', () => {
    expect(cpm(setDays(PRESET, 'schema', 1)).length).toBe(16);
    expect(cpm(setDays(PRESET, 'ui', 1)).length).toBe(16);
    expect(cpm(setDays(PRESET, 'api', 4)).length).toBe(15);
    // API 5 -> 2 would save 3, but UI-polish-tests (14 days) becomes the longest at 14, so only 2 days are saved.
    expect(cpm(setDays(PRESET, 'api', 2)).length).toBe(14);
    expect(cpm(setDays(PRESET, 'api', 2)).critical).toContain('ui');
  });
});

describe('editing refusals', () => {
  it('a cycle is refused with its loop named, and so are self-edges and duplicates', () => {
    const r = addEdge(PRESET, 'release', 'design');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Design to API to Integrate to Tests to Release to Design');
    expect(addEdge(PRESET, 'api', 'api').ok).toBe(false);
    expect(addEdge(PRESET, 'design', 'api').ok).toBe(false);
    const ok = addEdge(PRESET, 'schema', 'ui');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(topoOrder(ok.value)).not.toBeNull();
  });

  it('every accepted edge on random plans keeps the graph acyclic, and every refused one would have closed a loop', () => {
    for (const seed of SEEDS) {
      const plan = randomPlan(seed, 8);
      const rnd = mulberry32(seed);
      const [a, b] = [plan.tasks[Math.floor(rnd() * plan.tasks.length)].id, plan.tasks[Math.floor(rnd() * plan.tasks.length)].id];
      const r = addEdge(plan, a, b);
      const acyclic = topoOrder({ ...plan, edges: [...plan.edges, [a, b]] }) !== null;
      const duplicate = plan.edges.some(([x, y]) => x === a && y === b);
      expect(r.ok).toBe(acyclic && !duplicate && a !== b);
    }
  });

  it('a task needs a duration from 1 to 40, and the graph stops at 14 tasks', () => {
    for (const bad of ['', '0', '41', 'abc', '2.5']) expect(addTask(PRESET, 'X', bad).ok, bad).toBe(false);
    const added = addTask(PRESET, 'Extra', '40');
    expect(added.ok).toBe(true);
    let plan: Plan = PRESET;
    while (plan.tasks.length < MAX_TASKS) {
      const r = addTask(plan, '', '1');
      expect(r.ok).toBe(true);
      if (r.ok) plan = r.value;
    }
    const full = addTask(plan, '', '1');
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toContain('14');
    expect(new Set(plan.tasks.map((t) => t.id)).size).toBe(MAX_TASKS);
    expect(parseDays('7')).toEqual({ ok: true, value: 7 });
  });
});

describe('the calendar mapping', () => {
  it('skips weekends: working day 5 is the next Monday, and a task ending on day 5 ends Friday night', () => {
    expect([0, 4, 5, 9, 10].map(calendarDay)).toEqual([0, 4, 7, 11, 14]);
    expect(startHours(5)).toBe(7 * 24);
    expect(endHours(5)).toBe(5 * 24);
    expect(endHours(6)).toBe(8 * 24);
  });
});

/** Independent optimum: at each moment start any subset of the ready tasks (up to the free engineers), then advance to the next finish. */
function exhaustiveOptimum(plan: Plan, engineers: number): number {
  const n = plan.tasks.length;
  let best = Infinity;
  const preds = (id: string) => plan.edges.filter(([, b]) => b === id).map(([a]) => a);
  const go = (t: number, done: Set<string>, running: { id: string; end: number }[], started: Set<string>) => {
    if (t >= best) return;
    if (done.size === n) {
      best = t;
      return;
    }
    const ready = plan.tasks.filter((task) => !started.has(task.id) && preds(task.id).every((p) => done.has(p)));
    const free = engineers - running.length;
    const subsets = (i: number, chosen: string[]): string[][] => {
      if (i === ready.length) return [chosen];
      const skip = subsets(i + 1, chosen);
      return chosen.length < free ? [...skip, ...subsets(i + 1, [...chosen, ready[i].id])] : skip;
    };
    for (const pick of subsets(0, [])) {
      const nextRunning = [...running, ...pick.map((id) => ({ id, end: t + plan.tasks.find((x) => x.id === id)!.days }))];
      if (nextRunning.length === 0) continue;
      const next = Math.min(...nextRunning.map((r) => r.end));
      const finished = nextRunning.filter((r) => r.end === next);
      const nextDone = new Set(done);
      finished.forEach((r) => nextDone.add(r.id));
      go(next, nextDone, nextRunning.filter((r) => r.end !== next), new Set([...started, ...pick]));
    }
  };
  go(0, new Set(), [], new Set());
  return best;
}

describe('scheduling on n engineers', () => {
  it('the brute-force optimum equals an independent exhaustive search on 100 small random DAGs', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const plan = randomPlan(seed, 6);
      const engineers = 1 + (seed % 3);
      expect(optimalMakespan(plan, engineers), `seed ${seed}`).toBe(exhaustiveOptimum(plan, engineers));
    }
  });

  it('list schedule >= optimum >= max(critical path, ceil(work / n)), and Graham\'s (2 - 1/n) bound holds, on 200 random DAGs of up to 8 tasks', () => {
    for (const seed of SEEDS) {
      const plan = randomPlan(seed, BRUTE_FORCE_LIMIT);
      for (const n of [1, 2, 3, 4]) {
        const list = listSchedule(plan, n).makespan;
        const opt = optimalMakespan(plan, n)!;
        expect(list, `seed ${seed} n ${n}`).toBeGreaterThanOrEqual(opt);
        expect(opt).toBeGreaterThanOrEqual(lowerBounds(plan, n).best);
        expect(list).toBeLessThanOrEqual((2 - 1 / n) * opt + 1e-9);
      }
    }
  });

  it('a list schedule is valid: dependencies respected, nobody double-booked, every task exactly once', () => {
    for (const seed of SEEDS) {
      const plan = randomPlan(seed, 9);
      const placed = listSchedule(plan, 3);
      expect(placed.slots.map((s) => s.id).sort()).toEqual(plan.tasks.map((t) => t.id).sort());
      for (const [a, b] of plan.edges) expect(placed.slots.find((s) => s.id === b)!.start).toBeGreaterThanOrEqual(placed.slots.find((s) => s.id === a)!.end);
      for (const x of placed.slots) for (const y of placed.slots) if (x !== y && x.engineer === y.engineer) expect(x.end <= y.start || y.end <= x.start).toBe(true);
    }
  });

  it('hand cases on the preset: one engineer takes the total work (24 days), and enough engineers reach the 16-day critical path', () => {
    expect(totalWork(PRESET)).toBe(24);
    expect(listSchedule(PRESET, 1).makespan).toBe(24);
    expect(listSchedule(PRESET, 6).makespan).toBe(16);
    expect(lowerBounds(PRESET, 2)).toEqual({ criticalPath: 16, workShare: 12, best: 16 });
    expect(optimalMakespan(PRESET, 2)).toBe(16);
  });
});

describe('adding people to a late task (the invented Brooks toy)', () => {
  it('matches the hand-worked table at the defaults: 20, 13.25, 12.75, 14, 16.1 days for 1 to 5 people', () => {
    const t = (n: number) => completionDays(BROOKS_DEFAULT, n);
    [20, 13.25, 12.75, 14, 16.1].forEach((expected, i) => expect(t(i + 1)).toBeCloseTo(expected, 9));
    const r = readBrooks(BROOKS_DEFAULT);
    expect(r.best).toBe(3);
    expect(r.stillHelps).toBe(6);
    expect(r.laterAt).toBe(7);
  });

  it('without pair costs the minimum sits at the formula sqrt(work (1 - serial) / ramp) (here 3), and its neighbours are worse', () => {
    const p = { ...BROOKS_DEFAULT, pairCost: 0 };
    const nStar = Math.sqrt((p.work * (1 - p.serial)) / p.ramp);
    expect(nStar).toBe(3);
    expect(readBrooks(p).best).toBe(Math.round(nStar));
    expect(completionDays(p, 2)).toBeGreaterThan(completionDays(p, 3));
    expect(completionDays(p, 4)).toBeGreaterThan(completionDays(p, 3));
  });

  it('with a serial fraction of 1 adding people never helps, whatever the other parameters', () => {
    for (const ramp of [0, 1, 3]) {
      for (const pairCost of [0, 0.5]) {
        const p = { work: 20, serial: 1, ramp, pairCost };
        const days = readBrooks(p).days;
        expect(days.every((d) => d >= days[0])).toBe(true);
        expect(days).toHaveLength(MAX_PEOPLE);
      }
    }
  });
});

describe('uncertainty on the path', () => {
  it('merge bias: the later of two independent N(10, 2^2) paths averages 10 + 2/sqrt(pi) = 11.13 within 3 standard errors', () => {
    const expected = expectedMaxClosedForm(MERGE_DEMO.mean, MERGE_DEMO.sd);
    expect(expected).toBeCloseTo(11.128, 3);
    const standardError = (MERGE_DEMO.sd * Math.sqrt(1 - 1 / Math.PI)) / Math.sqrt(10_000);
    for (const seed of [1, 2, 3, 4, 5]) expect(Math.abs(maxOfTwoPaths(MERGE_DEMO.mean, MERGE_DEMO.sd, seed) - expected)).toBeLessThan(4 * standardError);
  });

  it('on the preset the merge into Integrate finishes later on average than either path into it, and the project runs longer than its plan', () => {
    const u = simulateProject(PRESET, UNCERTAINTY_DEFAULT.sigma, UNCERTAINTY_DEFAULT.seed);
    expect(u.meanEs.integrate).toBeGreaterThan(Math.max(u.meanEf.api, u.meanEf.schema));
    expect(u.meanLength).toBeGreaterThan(cpm(PRESET).length);
  });

  it('the gap between plan and average is mostly skew: the critical chain alone averages 16 x e^0.08 = 17.33 (hand), checked by simulating that chain on its own', () => {
    const u = simulateProject(PRESET, 0.4, UNCERTAINTY_DEFAULT.seed);
    expect(criticalChainMean(PRESET, 0.4)).toBeCloseTo(16 * Math.exp(0.08), 10);
    expect(criticalChainMean(PRESET, 0.4)).toBeCloseTo(17.333, 3);
    // independent check: the critical tasks in a line, simulated on their own (standard deviation of a sum of 4 log-normals is well under 8, so 4 standard errors < 0.35)
    const critical = new Set(cpm(PRESET).critical);
    const tasks = PRESET.tasks.filter((t) => critical.has(t.id));
    const line: Plan = { tasks, edges: tasks.slice(1).map((t, k) => [tasks[k].id, t.id] as const) };
    expect(simulateProject(line, 0.4, 5).meanLength).toBeGreaterThan(criticalChainMean(PRESET, 0.4) - 0.35);
    expect(simulateProject(line, 0.4, 5).meanLength).toBeLessThan(criticalChainMean(PRESET, 0.4) + 0.35);
    const split = gapSplit(PRESET, 16, u.meanLength, 0.4);
    expect(split.skew).toBeCloseTo(1.333, 3);
    expect(split.merge).toBeGreaterThan(0.2);
    expect(split.merge).toBeLessThan(split.skew);
    expect(split.skew + split.merge).toBeCloseTo(u.meanLength - 16, 9);
    // at a tiny spread the whole gap is skew
    expect(gapSplit(PRESET, 16, simulateProject(PRESET, 0.1, 2).meanLength, 0.1).skew).toBeCloseTo(16 * (Math.exp(0.005) - 1), 10);
  });

  it('criticality: at least one task is critical in every run, a single chain scores 1 each, and the sum is at least 1', () => {
    const u = simulateProject(PRESET, UNCERTAINTY_DEFAULT.sigma, UNCERTAINTY_DEFAULT.seed, 2000);
    expect(u.criticalPerRun.min).toBeGreaterThanOrEqual(1);
    expect(Object.values(u.criticality).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
    const chain: Plan = { tasks: PRESET.tasks.slice(0, 3), edges: [['design', 'api'], ['api', 'schema']] };
    const c = simulateProject(chain, 0.5, 3, 500);
    expect(Object.values(c.criticality)).toEqual([1, 1, 1]);
    const tiny = simulateProject(PRESET, 0.1, 2, 2000);
    expect(tiny.criticality.api).toBeGreaterThan(0.99);
    expect(tiny.criticality.schema).toBeLessThan(0.05);
  });
});
