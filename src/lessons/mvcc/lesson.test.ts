import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { opText, rowsText, workbenchCaption } from './captions';
import { chainDb, chainOf } from './chain';
import {
  KEYS, MAX_VERSIONS, SERIALIZATION_ERROR, apply, applyAll, newDb, openSlots, readRows, removable, tally, txOf, viewOf, visible, type Db, type Op, type Timing, type Who,
} from './engine';
import { IDLE_UPDATES, PRESETS } from './presets';
import { BROKEN_SEED, counterexample, runSchedule } from './schedule';
import { classifyAll, pageOf, pinnedVids, snapshotText } from './view';
import lesson from './index';

const rowsFor = (db: Db, who: Who) => {
  const { self, snap } = viewOf(db, who);
  return readRows(db, self, snap);
};

describe('try-this entries, from the default state (per-transaction snapshots, nothing open), as written', () => {
  it('try-this 1: BEGIN, SELECT, an autocommit UPDATE of A to 40, then T1 still reads A = 10 and autocommit reads A = 40, with nothing refused', () => {
    expect(newDb().timing).toBe('transaction');
    const { db, outcomes } = applyAll(newDb(), [
      { kind: 'begin' }, { kind: 'select', who: 1 }, { kind: 'update', who: 'auto', key: 'A', value: 40 }, { kind: 'select', who: 1 }, { kind: 'select', who: 'auto' },
    ]);
    expect(outcomes.every((o) => o.status === 'ok')).toBe(true);
    const reads = outcomes.flatMap((o) => (o.status === 'ok' && o.rows ? [o.rows.A] : []));
    expect(reads).toEqual([10, 10, 40]);
    const c = text(workbenchCaption(db, 1, 'versions', { status: 'ok', text: 'read' }), { strict: true });
    expect(c).toContain('T1 would read A = 10, B = 20, C = 30');
    expect(c).toContain('3 of the 4 versions are visible');
  });

  it('try-this 2: the writer is refused with the wait message; after T1 commits, T2\'s UPDATE aborts it with a serialization error', () => {
    const { db, outcomes } = applyAll(newDb(), PRESETS.writers());
    expect(outcomes.at(-1)).toEqual({ status: 'refused', message: 'T2 would wait for T1 (row locked): finish T1 first' });
    expect(lesson.tryThis[1]).toContain('T2 would wait for T1 (row locked): finish T1 first');
    const after = applyAll(db, [{ kind: 'commit', who: 1 }, { kind: 'update', who: 2, key: 'A', value: 40 }]);
    expect(after.outcomes[1]).toMatchObject({ status: 'aborted' });
    expect(after.outcomes[1].message).toContain(SERIALIZATION_ERROR);
    expect(lesson.tryThis[1]).toContain(SERIALIZATION_ERROR);
    expect(txOf(after.db, 2)).toBeUndefined();
  });

  it('try-this 3: with per-statement snapshots the same retry updates the newest version and T2 reads A = 40', () => {
    const base: Db = { ...newDb(), timing: 'statement' };
    const { db } = applyAll(base, [...PRESETS.writers(), { kind: 'commit', who: 1 }]);
    const retry = apply(db, { kind: 'update', who: 2, key: 'A', value: 40 });
    expect(retry.outcome.status).toBe('ok');
    expect(rowsFor(retry.db, 2).A).toBe(40);
    expect(retry.db.versions.filter((v) => v.key === 'A' && v.xmax === null).map((v) => v.value)).toEqual([40]);
  });

  it('try-this 4: idle in transaction gives row A 51 versions; VACUUM removes 0; after T1 commits it removes 50', () => {
    const { db } = applyAll(newDb(), PRESETS.idle());
    expect(openSlots(db)).toEqual([1]);
    expect(db.versions.filter((v) => v.key === 'A')).toHaveLength(51);
    expect(apply(db, { kind: 'vacuum' }).outcome).toMatchObject({ removed: 0 });
    const done = applyAll(db, [{ kind: 'commit', who: 1 }, { kind: 'vacuum' }]);
    expect(done.outcomes[1]).toMatchObject({ removed: IDLE_UPDATES });
    expect(lesson.tryThis[3]).toContain('51 versions');
    expect(lesson.tryThis[3]).toContain('it removes 50');
    const c = text(workbenchCaption(db, 1, 'vacuum', null), { strict: true });
    expect(c).toContain('0 more'.replace('0 more', `${tally(db).pinned} more`));
    expect(c).toContain(`The table holds ${db.versions.length} of ${MAX_VERSIONS} versions`);
  });

  it('try-this 5: the broken VACUUM replay ends with the violation the lesson quotes', () => {
    const c = counterexample();
    const last = c.steps.at(-1)!;
    expect(c.seed).toBe(BROKEN_SEED);
    expect(last.violation).toMatch(/snapshot read .* before VACUUM and .* after/);
    expect(lesson.tryThis[4]).toContain(last.violation!);
    expect(lesson.tryThis[4]).toContain(`seed ${BROKEN_SEED}`);
    expect(opText(last.op)).toBe('broken VACUUM');
  });
});

describe('captions and colours are computed from the engine (AC-0/T3 #14, #17)', () => {
  const dbs: { name: string; db: Db }[] = [
    { name: 'fresh', db: newDb() },
    ...(['idle', 'bloat', 'readers', 'writers'] as const).map((id) => ({ name: id, db: applyAll(newDb(), PRESETS[id]()).db })),
    ...[1, 2, 3, 4, 5, 6].flatMap((seed) => (['transaction', 'statement'] as Timing[]).map((timing) => ({ name: `seed ${seed} ${timing}`, db: runSchedule(seed, { timing }).steps.at(-1)!.db }))),
  ];
  const viewers: Who[] = ['auto', 1, 2, 3];

  it('states what the viewer reads and how many versions are visible, for every database, viewer and scene', () => {
    let checked = 0;
    for (const { name, db } of dbs) {
      for (const who of viewers) {
        for (const scene of ['versions', 'vacuum'] as const) {
          const c = text(workbenchCaption(db, who, scene, null), { strict: true });
          const { self, snap } = viewOf(db, who);
          const visibleCount = db.versions.filter((v) => visible(db, v, self, snap)).length;
          expect(c, `${name} ${who} ${scene}`).toContain(rowsText(rowsFor(db, who)));
          expect(c).toContain(`${visibleCount} of the ${db.versions.length} ${db.versions.length === 1 ? 'version is' : 'versions are'} visible`);
          const t = tally(db);
          if (scene === 'vacuum') {
            expect(c.includes(`${t.dead} dead`) || t.dead === 0).toBe(true);
            expect(c.includes('No version is dead.')).toBe(t.dead === 0);
            expect(c.includes('open snapshot may still need')).toBe(t.pinned > 0);
          } else expect(c).not.toContain('dead');
          checked++;
        }
      }
    }
    expect(checked).toBe(dbs.length * 8);
  });

  it('the rails count the same visible versions as the visibility rule, and a dead rail is exactly a removable version', () => {
    for (const { name, db } of dbs) {
      const gone = new Set(removable(db).map((v) => v.vid));
      for (const who of viewers) {
        const views = classifyAll(db, who);
        const { self, snap } = viewOf(db, who);
        db.versions.forEach((v, i) => {
          expect(views[i].tone === 'ok', `${name} ${who} v${v.vid}`).toBe(visible(db, v, self, snap));
          if (!visible(db, v, self, snap)) expect(views[i].tone === 'bad', `${name} ${who} v${v.vid}`).toBe(gone.has(v.vid));
          expect(['ok', 'dim', 'bad']).toContain(views[i].tone);
        });
      }
    }
  });

  it('a pinned version is one kept only for an open snapshot: not dead, not visible to a new reader, committed and replaced', () => {
    for (const { db } of dbs) {
      const fresh = viewOf(db, 'auto').snap;
      const gone = new Set(removable(db).map((v) => v.vid));
      for (const vid of pinnedVids(db)) {
        const v = db.versions.find((x) => x.vid === vid)!;
        expect(gone.has(vid)).toBe(false);
        expect(visible(db, v, null, fresh)).toBe(false);
        expect(v.xmax).not.toBeNull();
      }
      expect(pinnedVids(db).size).toBe(tally(db).pinned);
    }
  });

  it('the snapshot sentence names the same horizon the engine holds, and the idle preset has one violet-marked set of pinned versions', () => {
    const { db } = applyAll(newDb(), PRESETS.idle());
    expect(snapshotText(db, 1)).toContain('its snapshot sees ids below x');
    expect(tally(db)).toMatchObject({ live: 3, dead: 0, pinned: 50, total: 53 });
    expect(pinnedVids(db).size).toBe(IDLE_UPDATES);
  });

  it('hidden controls feed nothing: the key, value and page chips only matter to the write they trigger, and the broken replay never touches the learner\'s database', () => {
    const base = applyAll(newDb(), PRESETS.readers()).db;
    const before = JSON.stringify(base);
    counterexample();
    counterexample();
    expect(JSON.stringify(base)).toBe(before);
    expect(JSON.stringify(counterexample().steps.map((s) => s.outcome))).toBe(JSON.stringify(counterexample().steps.map((s) => s.outcome)));
    for (const key of KEYS) for (const value of [40, 50, 60, 70]) {
      const r = apply(base, { kind: 'update', who: 'auto', key, value } as Op);
      expect(r.db.versions.length).toBe(base.versions.length + 1);
    }
    expect(pageOf(53, 0)).toEqual({ from: 45, to: 53, pages: 7 });
    expect(pageOf(53, 99)).toEqual({ from: 0, to: 5, pages: 7 });
    expect(pageOf(3, 0)).toEqual({ from: 0, to: 3, pages: 1 });
  });

  it('the chain scene is the engine\'s own: n updates make n + 1 versions, and a reader after update k reads version k + 1', () => {
    for (let updates = 0; updates <= 4; updates++) {
      expect(chainOf(chainDb(updates, null))).toHaveLength(updates + 1);
      for (let k = 0; k <= updates; k++) {
        const db = chainDb(updates, k);
        const views = classifyAll(db, 1);
        const seen = db.versions.filter((v, i) => v.key === 'A' && views[i].tone === 'ok');
        expect(seen, `${updates} ${k}`).toHaveLength(1);
        expect(chainOf(db).indexOf(seen[0])).toBe(k);
      }
    }
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
