import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { KINDS, PRICE_PER_TB, PROPERTIES, capabilityTable } from './capabilities';
import { CONTENTION_TICKS, COST_PER_TICK, DEFAULT_CONTENTION_SEED, WAIT_TO_SHOW, createContention, runContention } from './contention';
import { COUNTRIES, CORRECTED_PRICES, INGESTED, PURGED_IDS, SOURCE_NOW, matchesAsIngested, revenue, run } from './pipeline';
import { DAYS, QUESTIONS, RECENT_DAYS, answerFlat, buildStar, flatTable, joinCount, runStar, sameAnswer, type Star } from './star';
import {
  FILE_ROWS, append, cleanOrphans, crashWriter, currentFiles, deleteRows, directoryRows, emptyLake, initialLake, interleavings, orphanFiles, race, readAfterCrash,
  readSnapshot, readTable, readerVsWriter, type Lake,
} from './tableformat';
import { MIX, PLACEMENTS, bestPlacement, mixCost, opCost, samePlacement, type Op } from './workload';

const SEEDS = 200;
const seeds = Array.from({ length: SEEDS }, (_, i) => i);

describe('scene 1: the cost of a mix of operations', () => {
  it('hand-worked: a point operation costs 6 values + 8 for one place on a row store, 6 + 8 x 6 on a column store; a two-column scan 6,008 against 2,016', () => {
    const [place, , , revenueScan] = MIX;
    expect(opCost(place, 'row')).toEqual({ values: 6, places: 1, cost: 14 });
    expect(opCost(place, 'column')).toEqual({ values: 6, places: 6, cost: 54 });
    expect(opCost(revenueScan, 'row')).toEqual({ values: 6000, places: 1, cost: 6008 });
    expect(opCost(revenueScan, 'column')).toEqual({ values: 2000, places: 2, cost: 2016 });
  });

  it('hand-worked totals for the five-operation mix under all four placements (three point operations, two scans)', () => {
    expect(mixCost(MIX, { points: 'row', scans: 'row' }).cost).toBe(3 * 14 + 2 * 6008);
    expect(mixCost(MIX, { points: 'row', scans: 'column' }).cost).toBe(3 * 14 + 2 * 2016);
    expect(mixCost(MIX, { points: 'column', scans: 'row' }).cost).toBe(3 * 54 + 2 * 6008);
    expect(mixCost(MIX, { points: 'column', scans: 'column' }).cost).toBe(3 * 54 + 2 * 2016);
    expect(mixCost(MIX, { points: 'row', scans: 'row' }).values).toBe(3 * 6 + 2 * 6000);
    expect(samePlacement(bestPlacement(MIX), { points: 'row', scans: 'column' })).toBe(true);
  });

  it('the two placements give equal totals on a one-column table, and the best placement for any mix is the one with the lowest total', () => {
    for (const rows of [1, 7, 1000]) {
      for (const op of MIX) expect(opCost(op, 'row', rows, 1).cost).toBe(opCost(op, 'column', rows, 1).cost);
    }
    const rnd = mulberry32(5);
    for (const seed of seeds) {
      const mix: Op[] = Array.from({ length: 1 + randInt(0, 6, rnd) }, (_, i) => {
        const base = MIX[randInt(0, MIX.length - 1, rnd)];
        return { ...base, id: `${base.id}${i}`, columns: base.kind === 'scan' ? randInt(1, 6, rnd) : base.columns };
      });
      const rows = randInt(1, 2000, mulberry32(seed));
      const best = bestPlacement(mix, rows);
      const lowest = Math.min(...PLACEMENTS.map((p) => mixCost(mix, p, rows).cost));
      expect(mixCost(mix, best, rows).cost).toBe(lowest);
    }
  });
});

describe('scene 1: scans and point operations on one store', () => {
  it('the same seed gives the same queue, and the conservation check holds on every tick for 200 seeds and every placement', () => {
    for (const p of PLACEMENTS) {
      for (const seed of seeds) {
        const sim = createContention(p, seed);
        sim.run(CONTENTION_TICKS);
        expect(sim.violation, `${p.points}/${p.scans} seed ${seed}`).toBeNull();
      }
    }
    const a = runContention({ points: 'row', scans: 'row' }, 9);
    const b = runContention({ points: 'row', scans: 'row' }, 9);
    expect(a).toEqual(b);
  });

  it('with separate stores a point operation never waits (it takes one tick and arrivals are at most one a tick), for 200 seeds', () => {
    for (const seed of seeds) {
      const r = runContention({ points: 'row', scans: 'column' }, seed);
      expect(r.maxPointWait, `seed ${seed}`).toBe(0);
    }
  });

  it('with one shared store a scan holds it, so point operations queue behind it: some seed waits at least about as long as one scan', () => {
    const scanTicks = Math.ceil(opCost(MIX.find((o) => o.kind === 'scan')!, 'row').cost / COST_PER_TICK);
    let longest = 0;
    for (const seed of seeds) {
      const r = runContention({ points: 'row', scans: 'row' }, seed);
      longest = Math.max(longest, r.maxPointWait);
    }
    expect(longest).toBeGreaterThanOrEqual(scanTicks - 1);
  });

  it('the point wait counts operations still queued at the end at their wait so far, not only those that started', () => {
    const p = { points: 'row', scans: 'row' } as const;
    const sim = createContention(p, DEFAULT_CONTENTION_SEED);
    sim.run(CONTENTION_TICKS);
    const queued = sim.state.queues.row.filter((j) => !j.scan);
    expect(queued.length).toBeGreaterThan(0);
    const r = runContention(p, DEFAULT_CONTENTION_SEED);
    expect(r.pointsQueued).toBe(queued.length);
    expect(r.maxPointWait).toBeGreaterThanOrEqual(Math.max(...queued.map((j) => CONTENTION_TICKS - j.arrivedAt)));
    expect(r.maxPointWait).toBeGreaterThanOrEqual(Math.max(...sim.state.served.filter((j) => !j.scan).map((j) => j.wait)));
    const all = [...sim.state.served.filter((j) => !j.scan).map((j) => j.wait), ...queued.map((j) => CONTENTION_TICKS - j.arrivedAt)];
    expect(r.meanPointWait).toBeCloseTo(all.reduce((a, b) => a + b, 0) / all.length, 9);
  });

  it('the default seed is the lowest whose shared store makes a point operation wait at least WAIT_TO_SHOW ticks, while separate stores never wait', () => {
    const waits = (seed: number) => runContention({ points: 'row', scans: 'row' }, seed).maxPointWait;
    expect(seeds.find((s) => waits(s) >= WAIT_TO_SHOW)).toBe(DEFAULT_CONTENTION_SEED);
    expect(runContention({ points: 'row', scans: 'column' }, DEFAULT_CONTENTION_SEED).maxPointWait).toBe(0);
  });
});

describe('scene 2: ETL and ELT when a rule changes', () => {
  it('hand-worked: under the changed rule the as-ingested view is DE 40, FR 105, NL 100; the source now holds different prices and fewer rows', () => {
    expect([...revenue(INGESTED, 'v2')].sort()).toEqual([['DE', 40], ['FR', 105], ['NL', 100]]);
    expect([...revenue(INGESTED, 'v1')].sort()).toEqual([['DE', 110], ['FR', 105], ['NL', 145]]);
    expect([...revenue(SOURCE_NOW, 'v2')].sort()).toEqual([['FR', 115], ['NL', 83]]);
  });

  it('ELT replays the retained raw rows and gets the as-ingested view; ETL reads the source again and differs from it in every country, losing DE entirely', () => {
    const elt = run('elt', 'v2');
    const etl = run('etl', 'v2');
    expect(matchesAsIngested(elt)).toBe(true);
    expect(elt.differs).toEqual([]);
    expect(elt.lost).toEqual([]);
    expect(elt.source).toBe('raw files');
    expect(elt.extracts).toBe(1);
    expect(matchesAsIngested(etl)).toBe(false);
    expect(etl.differs).toEqual([...COUNTRIES]);
    expect(etl.lost).toEqual(['DE']);
    expect(etl.extracts).toBe(2);
    expect(etl.rawKept).toBe(0);
    expect(elt.rawKept).toBe(INGESTED.length);
  });

  it('the ETL error is exactly the purged rows plus the price corrections, computed row by row', () => {
    const etl = run('etl', 'v2');
    for (const c of COUNTRIES) {
      const purged = INGESTED.filter((r) => r.country === c && r.status === 'paid' && PURGED_IDS.includes(r.id)).reduce((n, r) => n + r.qty * r.price, 0);
      const corrected = INGESTED.filter((r) => r.country === c && r.status === 'paid' && !PURGED_IDS.includes(r.id) && r.id in CORRECTED_PRICES).reduce((n, r) => n + r.qty * (CORRECTED_PRICES[r.id] - r.price), 0);
      expect((etl.curated.get(c) ?? 0) - (etl.asIngested.get(c) ?? 0), c).toBe(corrected - purged);
    }
  });

  it('the first run under v1 is the same for ETL and ELT; only what is kept differs', () => {
    expect([...run('etl', 'v1').curated]).toEqual([...run('elt', 'v1').curated]);
    expect(run('etl', 'v1').rawKept).toBe(0);
    expect(run('elt', 'v1').rawKept).toBeGreaterThan(0);
  });
});

describe('scene 3: the star schema', () => {
  it('hand-worked on a five-fact star: region by month, top products, segment orders', () => {
    const star: Star = {
      customers: [{ id: 1, name: 'c1', segment: 'consumer', region: 'North' }, { id: 2, name: 'c2', segment: 'business', region: 'South' }],
      products: [{ id: 1, name: 'pen', category: 'office' }, { id: 2, name: 'cup', category: 'home' }],
      dates: Array.from({ length: DAYS }, (_, i) => ({ id: i, date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), month: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 7) })),
      facts: [
        { id: 1, customer: 1, product: 1, date: 0, qty: 2, amount: 10 },
        { id: 2, customer: 1, product: 2, date: 31, qty: 1, amount: 20 },
        { id: 3, customer: 2, product: 1, date: 59, qty: 4, amount: 30 },
        { id: 4, customer: 2, product: 2, date: 59, qty: 1, amount: 5 },
        { id: 5, customer: 1, product: 1, date: 40, qty: 3, amount: 7 },
      ],
    };
    expect(runStar(star, 'region-month').answer).toEqual([['North 2026-01', 10], ['North 2026-02', 27], ['South 2026-03', 35]]);
    // day 59 is 2026-03-01; the last 30 days are days 30 to 59, so the first fact (day 0) is out
    expect(runStar(star, 'top-products').answer).toEqual([['pen', 7], ['cup', 2]]);
    expect(runStar(star, 'segment-orders').answer).toEqual([['business', 2], ['consumer', 3]]);
  });

  it('every question equals the flat pre-joined computation on 200 seeded fact tables, with and without the snowflake', () => {
    for (const seed of seeds) {
      const star = buildStar(seed, 40 + (seed % 120));
      const flat = flatTable(star);
      const last = star.dates.at(-1)!.date;
      for (const q of QUESTIONS) {
        const expected = answerFlat(flat, last, q.id);
        expect(sameAnswer(runStar(star, q.id).answer, expected), `${q.id} seed ${seed}`).toBe(true);
        expect(sameAnswer(runStar(star, q.id, true).answer, expected), `${q.id} snowflake seed ${seed}`).toBe(true);
      }
    }
  });

  it('a snowflake costs one more join for the region question and none for the others, counted from the joins the run lists', () => {
    const star = buildStar(1);
    for (const q of QUESTIONS) {
      expect(runStar(star, q.id).joins).toHaveLength(joinCount(q.id, false));
      expect(runStar(star, q.id, true).joins).toHaveLength(joinCount(q.id, true));
      expect(joinCount(q.id, true) - joinCount(q.id, false)).toBe(q.id === 'region-month' ? 1 : 0);
    }
  });

  it('the recent-days window is 30 days up to the last date, by calendar arithmetic', () => {
    expect(RECENT_DAYS).toBe(30);
    const star = buildStar(2);
    const flat = flatTable(star);
    const inWindow = flat.filter((r) => r.date >= star.dates[DAYS - RECENT_DAYS].date).length;
    expect(inWindow).toBe(flat.filter((r) => star.dates.find((d) => d.date === r.date)!.id >= DAYS - RECENT_DAYS).length);
  });
});

/** The rows a sequence of operations leaves, worked out with a plain set. */
function replay(ops: ('append' | number[])[], start = 1): number[] {
  const live = new Set<number>();
  let next = start;
  for (const op of ops) {
    if (op === 'append') for (let i = 0; i < FILE_ROWS; i++) live.add(next++);
    else for (const r of op) live.delete(r);
  }
  return [...live].sort((a, b) => a - b);
}

describe('scene 4: a table format over files', () => {
  it('the starting lake has three snapshots and six rows; appending and deleting each add one snapshot', () => {
    const lake = initialLake();
    expect(lake.snapshots).toHaveLength(3);
    expect(readTable(lake)).toEqual([1, 2, 3, 4, 5, 6]);
    const more = append(lake);
    expect(more.snapshots).toHaveLength(4);
    expect(readTable(more)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const fewer = deleteRows(more, [1, 2, 3]);
    expect(fewer.snapshots).toHaveLength(5);
    expect(readTable(fewer)).toEqual([4, 5, 6, 7, 8]);
  });

  it('time travel: reading snapshot s equals replaying the first s commits from an empty table, for 200 seeded commit sequences', () => {
    for (const seed of seeds) {
      const rnd = mulberry32(seed);
      let lake = emptyLake();
      const ops: ('append' | number[])[] = [];
      const n = 3 + randInt(0, 8, rnd);
      for (let i = 0; i < n; i++) {
        const live = readTable(lake);
        if (live.length >= 2 && rnd() < 0.4) {
          const k = randInt(1, Math.min(3, live.length), rnd);
          const gone = live.slice(0, k);
          ops.push(gone);
          lake = deleteRows(lake, gone);
        } else {
          ops.push('append');
          lake = append(lake);
        }
      }
      for (let s = 1; s <= n; s++) expect(readSnapshot(lake, s), `seed ${seed} snapshot ${s}`).toEqual(replay(ops.slice(0, s)));
    }
  });

  it('files are immutable: a delete never changes an existing file, and the old snapshot still reads as it did', () => {
    const lake = initialLake();
    const frozen = JSON.parse(JSON.stringify(lake.files)) as Record<string, number[]>;
    const after = deleteRows(lake, [3]);
    for (const [name, rows] of Object.entries(frozen)) expect(after.files[name]).toEqual(rows);
    expect(readSnapshot(after, 3)).toEqual(readSnapshot(lake, 3));
    expect(Object.keys(after.files).length).toBeGreaterThan(Object.keys(lake.files).length);
  });

  it('a writer that crashes after writing files leaves orphans: invisible through the pointer, visible in a directory listing, gone after a cleanup', () => {
    const lake = initialLake();
    const half = crashWriter(lake, 1);
    const both = crashWriter(lake, 2);
    expect(orphanFiles(half)).toHaveLength(1);
    expect(orphanFiles(both)).toHaveLength(2);
    expect(readTable(half)).toEqual(readTable(lake));
    expect(readAfterCrash(half, true)).toMatchObject({ kind: 'committed' });
    expect(readAfterCrash(half, false).kind).toBe('uncommitted rows visible');
    expect(directoryRows(half)).toEqual([...readTable(lake), 7, 8]);
    expect(directoryRows(both)).toEqual([...readTable(lake), 7, 8, 9, 10]);
    expect(orphanFiles(cleanOrphans(both))).toEqual([]);
    expect(readAfterCrash(cleanOrphans(both), false).kind).toBe('committed');
    expect(currentFiles(half)).toEqual(currentFiles(lake));
  });

  it('interleavings(a, b) lists all C(a + b, a) merges once each, each keeping both orders (checked against every binary string)', () => {
    const choose = (n: number, k: number): number => (k === 0 || k === n ? 1 : choose(n - 1, k - 1) + choose(n - 1, k));
    for (const [a, b] of [[0, 3], [2, 0], [2, 2], [4, 2], [4, 4], [3, 5]] as const) {
      const all = interleavings(a, b);
      expect(all).toHaveLength(choose(a + b, a));
      expect(new Set(all.map((s) => s.join(''))).size).toBe(all.length);
      let brute = 0;
      for (let m = 0; m < 2 ** (a + b); m++) if (m.toString(2).split('1').length - 1 === a) brute++;
      expect(brute).toBe(all.length);
      for (const s of all) expect([s.filter((t) => t === 'A').length, s.filter((t) => t === 'B').length]).toEqual([a, b]);
    }
  });

  it('exhaustive: with the table format a reader only ever sees the table before the commit or after it, in all 15 interleavings', () => {
    const r = readerVsWriter(initialLake(), true);
    expect(r.total).toBe(15);
    expect(r.torn).toBe(0);
    expect(r.old + r.new).toBe(15);
    expect([r.old, r.new]).toEqual([14, 1]);
    for (const o of r.outcomes) expect([r.before, r.after].some((t) => JSON.stringify(t) === JSON.stringify(o.rows)), o.order.join(' > ')).toBe(true);
  });

  it('exhaustive: without it some interleavings tear, 4 of 15 by hand (the reader lists the directory after exactly one file is written); the first one is named', () => {
    const r = readerVsWriter(initialLake(), false);
    expect(r.total).toBe(15);
    expect(r.torn).toBe(4);
    expect([r.old, r.new]).toEqual([5, 6]);
    expect(r.firstTorn).not.toBeNull();
    expect(r.firstTorn!.order.slice(0, 2)).toEqual(['writer: write file A', 'reader: list the directory']);
    expect(r.firstTorn!.rows).toEqual([...r.before, 7, 8]);
    for (const o of r.outcomes.filter((x) => x.kind === 'torn')) {
      const listIndex = o.order.findIndex((s) => s === 'reader: list the directory');
      expect(o.order.slice(0, listIndex).filter((s) => s.startsWith('writer')).length).toBe(1);
    }
  });

  it('two writers from the same snapshot: of 70 interleavings none loses an update, and the loser of a failed swap retries on top of the winner', () => {
    const lake = initialLake();
    const r = race(lake);
    expect(r.total).toBe(70);
    expect(r.lostUpdates).toBe(0);
    for (const o of r.outcomes) {
      expect(o.rows).toEqual(r.expected);
      expect(o.commits).toBe(2);
      expect(o.conflicts).toBeLessThanOrEqual(1);
    }
    // by hand: there is a conflict exactly when the later swapper read the pointer before the earlier swapper's swap
    let handConflicts = 0;
    for (const turns of interleavings(4, 4)) {
      const when = (w: 'A' | 'B', step: number) => {
        let seen = 0;
        for (let i = 0; i < turns.length; i++) if (turns[i] === w && seen++ === step) return i;
        return -1;
      };
      const swap = { A: when('A', 3), B: when('B', 3) };
      const first = swap.A < swap.B ? 'A' : 'B';
      const second = first === 'A' ? 'B' : 'A';
      if (when(second, 0) < swap[first]) handConflicts++;
    }
    expect(r.withConflict).toBe(handConflicts);
    expect(r.withConflict + r.withoutConflict).toBe(70);
    expect(r.withoutConflict).toBeGreaterThan(0);
    expect(r.bothReadFirst.conflicts).toBe(1);
    expect(r.bothReadFirst.order.some((s) => s.includes('the swap fails'))).toBe(true);
  });

  it('broken variant: a blind pointer swap with no compare loses updates in some interleavings', () => {
    const r = race(initialLake(), false);
    expect(r.lostUpdates).toBeGreaterThan(0);
    expect(r.total).toBe(70);
    const lost = r.outcomes.find((o) => JSON.stringify(o.rows) !== JSON.stringify(r.expected))!;
    expect(lost.rows.length).toBeLessThan(r.expected.length);
  });

  it('the race analysis does not depend on how long the lake already is', () => {
    let lake: Lake = initialLake();
    for (let i = 0; i < 4; i++) lake = append(lake);
    const r = race(lake);
    expect(r.lostUpdates).toBe(0);
    expect(r.total).toBe(70);
    expect(r.expected).toHaveLength(readTable(lake).length + 2 * FILE_ROWS);
  });
});

describe('scene 5: the comparison is computed', () => {
  it('each cell follows the model: transactions from the interleavings, scan cost from the workload model, price from the constants', () => {
    const table = capabilityTable();
    const row = (id: string) => table.find((r) => r.id === id)!;
    expect(row('transactions').cells.lake).toEqual({ verdict: 'bad', text: '4 of 15 reader and writer interleavings tear' });
    expect(row('transactions').cells.lakehouse.verdict).toBe('good');
    expect(row('transactions').cells.warehouse.verdict).toBe('good');
    expect(row('cost').cells.lake.verdict).toBe('good');
    expect(row('cost').cells.warehouse.verdict).toBe('bad');
    expect(PRICE_PER_TB.owned).toBeGreaterThan(PRICE_PER_TB.object);
    expect(row('bi').cells.lake.verdict).toBe('bad');
    expect(row('bi').cells.warehouse.verdict).toBe('good');
    expect(row('bi').cells.lakehouse.verdict).toBe('good');
    expect(row('schema').cells.lake.verdict).toBe('bad');
    expect(row('open').cells.warehouse.verdict).toBe('bad');
    expect(row('open').cells.lakehouse.verdict).toBe('good');
  });

  it('a cell changes when the property behind it changes (the table is not typed in): flipping the lake\'s metadata layer fixes its schema and transactions', () => {
    const before = PROPERTIES.lake.metadataLayer;
    expect(KINDS).toEqual(['warehouse', 'lake', 'lakehouse']);
    PROPERTIES.lake.metadataLayer = true;
    try {
      const row = (id: string) => capabilityTable().find((r) => r.id === id)!;
      expect(row('schema').cells.lake.verdict).toBe('good');
      expect(row('transactions').cells.lake.verdict).toBe('good');
    } finally {
      PROPERTIES.lake.metadataLayer = before;
    }
  });
});
