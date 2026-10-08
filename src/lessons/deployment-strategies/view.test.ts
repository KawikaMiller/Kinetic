import { describe, expect, it } from 'vitest';
import { DEFAULTS, HORIZON, REPLICAS, STRATEGIES, podsRunning, simulate, type Config } from './model';
import { GRID_COLS, compareAll, compareBars, compareSummary, extraCells, failedCount, requestCell, share, slotCell, slotsAt } from './view';

const cfg = (patch: Partial<Config> = {}): Config => ({ ...DEFAULTS, ...patch });
const count = (kinds: string[], k: string) => kinds.filter((x) => x === k).length;

describe('the server grids', () => {
  it('show every running server exactly once, in whole rows, for every strategy and minute', () => {
    for (const strategy of STRATEGIES) {
      for (const bugRate of [0, 0.05]) {
        const run = simulate(cfg({ strategy, bugRate }));
        expect(extraCells(run) % GRID_COLS).toBe(0);
        for (const tick of run.ticks) {
          const { primary, extra } = slotsAt(run, tick);
          const all = [...primary, ...extra];
          expect(primary).toHaveLength(REPLICAS);
          expect(count(all, 'v1'), `${strategy} v1 at ${tick.t}`).toBe(tick.v1);
          expect(count(all, 'v2'), `${strategy} v2 at ${tick.t}`).toBe(tick.v2);
          expect(count(all, 'starting')).toBe(tick.startingV1 + tick.startingV2);
          expect(count(all, 'standby')).toBe(tick.standby);
          expect(all.length - count(all, 'none') - count(all, 'down'), `${strategy} servers drawn at ${tick.t}`).toBe(podsRunning(tick));
        }
      }
    }
  });

  it('give blue-green two fleets of 20 and the other strategies extra cells only for the surge they use', () => {
    expect(extraCells(simulate(cfg({ strategy: 'bluegreen' })))).toBe(20);
    expect(extraCells(simulate(cfg({ strategy: 'recreate' })))).toBe(0);
    expect(extraCells(simulate(cfg({ strategy: 'rolling', surgePct: 0, unavailablePct: 25, bugRate: 0 })))).toBe(0);
    expect(extraCells(simulate(cfg({ strategy: 'rolling', bugRate: 0 })))).toBe(5);
  });

  it('draw blue and green apart: blue serving, green starting, then green serving with blue idle', () => {
    const run = simulate(cfg({ strategy: 'bluegreen' }));
    const at = (t: number) => slotsAt(run, run.ticks[t]);
    expect(new Set(at(0).primary)).toEqual(new Set(['v1']));
    expect(new Set(at(0).extra)).toEqual(new Set(['none']));
    expect(new Set(at(1).extra)).toEqual(new Set(['starting']));
    expect(new Set(at(3).primary)).toEqual(new Set(['standby']));
    expect(new Set(at(3).extra)).toEqual(new Set(['v2']));
    const back = at(run.rolledBackAt!);
    expect(new Set(back.primary)).toEqual(new Set(['v1']));
    expect(new Set(back.extra)).toEqual(new Set(['standby']));
  });

  it('mark servers that are gone as off, and every other state with its own tone', () => {
    const run = simulate(cfg({ strategy: 'rolling', bugRate: 0, surgePct: 0, unavailablePct: 25 }));
    // no surge: the five servers the controller may take down go first, and their replacements only start next minute
    expect(count(slotsAt(run, run.ticks[1]).primary, 'down')).toBe(5);
    expect(count(slotsAt(run, run.ticks[2]).primary, 'down')).toBe(0);
    expect(slotCell('v1').tone).toBe('info');
    expect(slotCell('v2').tone).toBe('violet');
    expect(slotCell('starting').tone).toBe('hi');
    expect(slotCell('standby').tone).toBe('dim');
    expect(slotCell('none').fill).toBe('none');
  });
});

describe('request cells and shares', () => {
  it('are ok when served and bad otherwise', () => {
    expect(requestCell({ by: 'v1', outcome: 'ok' }).tone).toBe('ok');
    for (const outcome of ['bug', 'natural', 'schema'] as const) expect(requestCell({ by: 'v2', outcome }).tone).toBe('bad');
    expect(requestCell({ by: 'none', outcome: 'outage' }).tone).toBe('bad');
    expect(requestCell(undefined).fill).toBe('none');
    expect(failedCount([{ by: 'v1', outcome: 'ok' }, { by: 'v2', outcome: 'bug' }])).toBe(1);
  });

  it('write a share without rounding a real one down to nothing', () => {
    expect(share(0)).toBe('0%');
    expect(share(0.004)).toBe('<1%');
    expect(share(0.01)).toBe('1%');
    expect(share(1 / 3)).toBe('33%');
    expect(share(1)).toBe('100%');
  });
});

describe('the comparison', () => {
  it('runs all four on the same bug, schema, drain setting and seed', () => {
    const rows = compareAll(cfg({ bugRate: 0.07, schema: 'breaking', drain: false, seed: 3 }));
    expect(rows.map((r) => r.strategy)).toEqual(STRATEGIES);
    for (const { strategy, run } of rows) expect(run.cfg).toMatchObject({ strategy, bugRate: 0.07, schema: 'breaking', drain: false, seed: 3 });
  });

  it('names the strategies that hit the fewest and the most users, keeping ties together', () => {
    const rows = compareAll(cfg());
    const s = compareSummary(rows);
    const hits = rows.map((r) => Math.round(r.run.expectedHit));
    expect(s.fewestHit).toBe(Math.min(...hits));
    expect(s.mostHit).toBe(Math.max(...hits));
    expect(s.most).toEqual(['recreate']);
    expect(compareSummary(compareAll(cfg({ bugRate: 0, strategy: 'rolling' }))).fewest.sort()).toEqual(['bluegreen', 'canary', 'rolling']);
  });

  it('draw bars inside the window, one lane per strategy, and an undo bar only when one happened', () => {
    for (const row of compareAll(cfg())) {
      const bars = compareBars(row);
      for (const b of bars) {
        expect(b.lane).toBe(row.strategy);
        expect(b.start).toBeGreaterThanOrEqual(0);
        expect(b.end).toBeLessThanOrEqual(HORIZON);
        expect(b.end).toBeGreaterThan(b.start);
      }
      expect(bars.some((b) => b.tone === 'orange')).toBe(row.run.rolledBackAt !== null);
    }
    const blocked = compareAll(cfg({ schema: 'breaking' }));
    for (const row of blocked) expect(compareBars(row).some((b) => b.tone === 'orange')).toBe(false);
  });
});
