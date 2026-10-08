import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { groupFrames, rankCaption, showValue, windowFrames } from './frames';
import { AGGS, FILTERS, FRAMES, GROUP_COLS, SALES, runGroup, runWindow, type GroupQuery } from './model';

const PHASES = ['rows', 'where', 'group', 'having', 'select'];
const ALL: GroupQuery[] = GROUP_COLS.flatMap((by) => AGGS.flatMap((a) => FILTERS.flatMap((f) => (['where', 'having'] as const).flatMap((place) =>
  [false, true].map((withRep) => ({ by, agg: a.id, filter: f.id, place, withRep }))))));

describe('GROUP BY captions, every combination', () => {
  it(`all ${ALL.length} combinations tell the truth about their own run`, () => {
    for (const q of ALL) {
      const run = runGroup(q);
      const frames = groupFrames(q, run);
      const label = JSON.stringify(q);
      if (run.error) {
        expect(frames.length, label).toBe(1);
        expect(text(frames[0].say), label).toMatch(/^Error/);
        expect(text(frames[0].say), label).toMatch(run.error.sqliteAccepts ? /SQLite \(and MySQL/ : /SQLite refuses it too/);
        continue;
      }
      const k = run.result.length;
      expect(text(frames.at(-1)!.say), label).toContain(`Result: ${k} ${k === 1 ? 'row' : 'rows'}`);
      const where = frames.find((f) => f.phase === 'where');
      const f = FILTERS.find((x) => x.id === q.filter)!;
      expect(!!where, label).toBe(q.place === 'where' && f.id !== 'none');
      if (where) expect(text(where.say)).toContain(`${run.whereKept.filter(Boolean).length} kept`);
      const having = frames.find((x) => x.phase === 'having');
      if (having) for (const g of run.groups.filter((x) => !x.kept)) expect(text(having.say)).toContain(g.key || 'the one group');
      const select = text(frames.find((x) => x.phase === 'select')!.say);
      const skipped = run.groups.filter((g) => g.kept).reduce((s, g) => s + g.rows.filter((i) => SALES[i].amount === null).length, 0);
      if (skipped && q.agg !== 'count-star') expect(select, label).toContain(`skips the ${skipped} NULL`);
      if (!skipped) expect(select, label).toContain('No NULL amounts');
      // The clauses run in SQL's order, and the result only comes after HAVING.
      const order = frames.map((x) => PHASES.indexOf(x.phase));
      expect(order, label).toEqual([...order].sort((a, b) => a - b));
      const hi = frames.findIndex((x) => x.phase === 'having');
      if (hi >= 0) expect(hi, label).toBeLessThan(frames.findIndex((x) => x.phase === 'select'));
      expect(text(frames.at(-1)!.say), label).toContain('Result:');
      // A NULL explanation appears only on the filter that actually produces it.
      if (where) expect(text(where.say).includes('NULL amount'), label).toBe(f.id === 'amount-100');
    }
  });

  it('region <> West in WHERE drops 6 rows for their region, and says nothing about NULL amounts (review repro)', () => {
    const q: GroupQuery = { by: 'region', agg: 'sum', filter: 'not-west', place: 'where', withRep: false };
    const say = text(groupFrames(q).find((f) => f.phase === 'where')!.say);
    expect(say).toContain('10 kept, 6 dropped');
    expect(say).not.toMatch(/NULL/);
  });

  it('amount >= 100 in WHERE names both NULL amounts it drops, with the right plural', () => {
    const q: GroupQuery = { by: 'none', agg: 'count-star', filter: 'amount-100', place: 'where', withRep: false };
    expect(text(groupFrames(q).find((f) => f.phase === 'where')!.say)).toContain('including the 2 NULL amounts');
  });

  it('SELECT is the last clause the animation lights, after HAVING struck a group (review repro)', () => {
    const q: GroupQuery = { by: 'region', agg: 'sum', filter: 'sum-450', place: 'having', withRep: false };
    const frames = groupFrames(q);
    expect(frames.map((f) => f.phase)).toEqual(['rows', 'group', 'having', 'select', 'select']);
    expect(text(frames.find((f) => f.phase === 'having')!.say)).toContain('West');
    expect(text(frames.find((f) => f.phase === 'select')!.say)).toContain('on the groups that survived');
  });

  it('no frame keeps an earlier caption: every frame has its own', () => {
    for (const q of ALL) for (const f of groupFrames(q)) expect(f.say).toBeTruthy();
  });
});

describe('window captions', () => {
  for (const f of FRAMES)
    it(`${f.id}: one frame per row, each naming that row's total`, () => {
      const rows = runWindow(f.id);
      const frames = windowFrames(f.id, rows);
      expect(frames.length).toBe(rows.length + 2);
      rows.forEach((w, k) => expect(text(frames[k + 1].say)).toContain(`: ${showValue(w.value)}`));
      expect(text(frames.at(-1)!.say)).toContain(`All ${SALES.length} rows are still here`);
    });

  it('the default frame says RANGE exactly on the rows with a later tied month', () => {
    const rows = runWindow('default');
    const frames = windowFrames('default', rows);
    const ranged = frames.filter((f) => /default frame is RANGE/.test(text(f.say))).length;
    expect(ranged).toBe(4);
    expect(text(frames.at(-1)!.say)).toContain('4 tied months');
  });
});

describe('ranking caption', () => {
  it('names the first tie and the numbers after it, from the data', () => {
    const say = text(rankCaption());
    expect(say).toContain('In North, two sales tie at 150');
    expect(say).toMatch(/RANK gives both 1 and skips to 3/);
    expect(say).toMatch(/DENSE_RANK gives both 1 and carries on with 2/);
  });

  it('formats AVG to one decimal and NULL as NULL', () => {
    expect(showValue(116.6666)).toBe('116.7');
    expect(showValue(null)).toBe('NULL');
    expect(showValue(500)).toBe('500');
  });
});
