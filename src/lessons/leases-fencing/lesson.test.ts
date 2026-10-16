import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { eventCaption, leaseFrames, needsSummary, summaryCaption } from './captions';
import { domainEndMs, leaseBars, leaseEvents, storeRows } from './events';
import { PAUSE_GRID_MS, initialFailure, initialNeeds, initialRenew, needsReading, needsSetup, outcomeTable, pinnedText, staleCounts, validateRenew } from './init';
import lesson from './index';
import { DEFAULT_SETUP, FENCE_MODES, FIRST_TOKEN, LEASE_BROKEN_SEED, PINNED_SEED, runLease, statsAt, sweepSetup, verdictOf, type FenceMode, type LeaseSetup } from './model';

const setup = (over: Partial<LeaseSetup>): LeaseSetup => ({ ...DEFAULT_SETUP, ...over });

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the defaults grant 33 then 34, A writes 33 last and storage applies it; the invariants stat reads "F1 broken"', () => {
    const s = initialFailure();
    expect([s.mode, s.ttlMs, s.pauseMs, s.seed]).toEqual(['none', 10_000, 12_000, LEASE_BROKEN_SEED]);
    const run = runLease(s);
    expect(run.grants.map((g) => g.token)).toEqual([FIRST_TOKEN, FIRST_TOKEN + 1]);
    expect(run.store.at(-1)).toMatchObject({ from: 'A', token: FIRST_TOKEN, stale: true });
    expect(statsAt(run, Infinity).staleApplied).toBe(1);
    expect(verdictOf(s)?.rule).toBe('F1');
    const t = lesson.tryThis[0];
    expect(t).toContain('a 10 s lease');
    expect(t).toContain('paused 12 s');
    expect(t).toContain(`seed ${LEASE_BROKEN_SEED}`);
    expect(t).toContain('"F1 broken"');
  });

  it('try-this 2: check-first stops A (stale count 0); moving the pause to just before the write brings the stale write back', () => {
    const base = initialFailure();
    const checked = runLease({ ...base, mode: 'check' });
    expect(statsAt(checked, Infinity).staleApplied).toBe(0);
    expect(checked.abandoned.map((a) => a.why)).toEqual(['check']);
    const late = runLease({ ...base, mode: 'check', pauseAt: 'write' });
    expect(statsAt(late, Infinity).staleApplied).toBe(1);
    expect(lesson.tryThis[1]).toContain('"Check the lease first"');
    expect(lesson.tryThis[1]).toContain('"just before the write"');
  });

  it('try-this 3: fencing rejects A\'s write with "stale token 33 < 34"; random tokens on the loaded pinned seed break F3 and then turn away the newest holder', () => {
    const base = initialFailure();
    const fenced = runLease({ ...base, mode: 'fence' });
    expect(statsAt(fenced, Infinity)).toMatchObject({ staleApplied: 0, rejected: 1 });
    const row = storeRows(fenced, Infinity).find((r) => String(r.text).includes('rejected'))!;
    expect(String(row.text)).toContain(`rejected, stale token ${FIRST_TOKEN} < ${FIRST_TOKEN + 1}`);
    expect(lesson.tryThis[2]).toContain(`"rejected: stale token ${FIRST_TOKEN} < ${FIRST_TOKEN + 1}"`);
    const seed = PINNED_SEED['fence-random']!;
    expect(lesson.tryThis[2]).toContain(`(${seed})`);
    const loaded = sweepSetup(seed, 'fence-random');
    const run = runLease(loaded);
    expect(run.grants[1].token).toBeLessThan(run.grants[0].token);
    expect(verdictOf(loaded)?.rule).toBe('F3');
    expect(statsAt(run, Infinity).refusedNewest).toBe(1);
  });

  it('try-this 4: in the renewal scene the defaults lapse the lease and land a stale write; a 3 s pause is survived and B gets the lock only after A releases; a TTL below the heartbeat is refused', () => {
    const s = initialRenew();
    expect([s.ttlMs, s.heartbeatMs, s.pauseMs]).toEqual([9_000, 3_000, 12_000]);
    const lapsed = runLease(s);
    expect(lapsed.grants[0].endedBy).toBe('expiry');
    expect(statsAt(lapsed, Infinity).staleApplied).toBe(1);
    const short = runLease({ ...s, pauseMs: 3_000 });
    expect(statsAt(short, Infinity)).toMatchObject({ staleApplied: 0, rejected: 0, applied: 2 });
    expect(short.grants[0].endedBy).toBe('release');
    expect(short.grants[1].at).toBeGreaterThanOrEqual(short.grants[0].endedAt!);
    expect(short.grants[0].renewedAt.length).toBeGreaterThan(0);
    expect(validateRenew(2_000, 3_000)).toBe('The lease would lapse between renewals: the TTL has to be longer than the heartbeat interval.');
    expect(lesson.tryThis[3]).toContain('The lease would lapse between renewals');
  });

  it('try-this 5: with storage checking tokens the stale write is rejected; flipping to "cannot check" lets it through', () => {
    const n = initialNeeds();
    expect(n).toEqual({ purpose: 'correctness', storeChecks: true });
    expect(needsReading(runLease(needsSetup(n)))).toMatchObject({ jobsRun: 2, staleApplied: 0, rejected: 1 });
    expect(needsReading(runLease(needsSetup({ ...n, storeChecks: false })))).toMatchObject({ jobsRun: 2, staleApplied: 1, rejected: 0 });
    expect(lesson.tryThis[4]).toContain('"Cannot check (an outside API)"');
  });
});

describe('each scene opens in a state of its own (a pure function, no state shared between scenes)', () => {
  it('the three opening states are fresh objects every call and differ where the scenes differ', () => {
    expect(initialFailure()).not.toBe(initialFailure());
    expect(initialFailure()).toEqual(DEFAULT_SETUP);
    expect(initialFailure().heartbeatMs).toBeNull();
    expect(initialRenew().heartbeatMs).toBe(3_000);
    const a = initialFailure();
    a.mode = 'fence';
    a.pauseMs = 0;
    expect(initialFailure()).toEqual(DEFAULT_SETUP);
    expect(initialRenew().mode).toBe('none');
    expect(needsSetup(initialNeeds()).mode).toBe('fence');
  });

  it('switching through all scenes and back leaves each opening state exactly as it was', () => {
    const before = [initialFailure(), initialRenew(), initialNeeds()];
    for (const make of [initialRenew, initialNeeds, initialFailure, initialNeeds, initialRenew]) make();
    expect([initialFailure(), initialRenew(), initialNeeds()]).toEqual(before);
  });
});

describe('hidden controls do not reach the numbers', () => {
  it('the outcome table ignores the safeguard, pause and pause position of the run on screen (each row sets its own)', () => {
    const base = initialRenew();
    const ref = outcomeTable(base);
    for (const mode of FENCE_MODES) {
      for (const pauseAt of ['job', 'write'] as const) {
        for (const pauseMs of [0, 12_000]) expect(outcomeTable({ ...base, mode, pauseAt, pauseMs })).toEqual(ref);
      }
    }
  });

  it('scene 3\'s run depends on whether storage checks tokens and on nothing else the purpose choice carries', () => {
    for (const storeChecks of [true, false]) {
      const a = runLease(needsSetup({ purpose: 'efficiency', storeChecks }));
      const b = runLease(needsSetup({ purpose: 'correctness', storeChecks }));
      expect(a.cluster.trace).toEqual(b.cluster.trace);
    }
  });

  it('the first scene\'s defaults are untouched by the renewal scene\'s heartbeat and partition (they stay off in scene 1)', () => {
    const plain = runLease(DEFAULT_SETUP);
    const withUnused = runLease({ ...DEFAULT_SETUP, storeChecks: true });
    expect(withUnused.cluster.trace).toEqual(plain.cluster.trace);
    expect(DEFAULT_SETUP.heartbeatMs).toBeNull();
    expect(DEFAULT_SETUP.partition).toBe(false);
  });
});

describe('the outcome table is run through the simulator and says what the lesson says', () => {
  it('at the renewal defaults every cell matches a hand-worked expectation from the timeline', () => {
    const table = outcomeTable(initialRenew());
    const row = (id: string) => table.find((r) => r.row.id === id)!.cells.map((c) => c.outcome);
    // Pause 0, 3, 6 s: A wakes at 5 s or 8 s and its heartbeat reaches the lock before the 9 s lease ends. 10, 15, 20 s: A wakes at 12 s or later, after its 11 s job was due, and writes before it hears anything.
    expect(row('none')).toEqual(['fine', 'fine', 'fine', 'stale', 'stale', 'stale']);
    expect(row('fence')).toEqual(['fine', 'fine', 'fine', 'rejected', 'rejected', 'rejected']);
    expect(row('check-before')).toEqual(['fine', 'fine', 'fine', 'stopped', 'stopped', 'stopped']);
    expect(PAUSE_GRID_MS).toEqual([0, 3_000, 6_000, 10_000, 15_000, 20_000]);
  });

  it('the table at the renewal defaults does not depend on the seed: no cell sits on a race between a reply and a write', () => {
    const ref = outcomeTable(initialRenew()).map((r) => r.cells.map((c) => c.outcome));
    for (let seed = 1; seed < 25; seed++) expect(outcomeTable({ ...initialRenew(), seed }).map((r) => r.cells.map((c) => c.outcome)), `seed ${seed}`).toEqual(ref);
  });

  it('the pause-after-the-check row is the one the check cannot catch: it ends in a stale write once the pause outlasts the renewed lease', () => {
    const cells = outcomeTable(initialRenew()).find((r) => r.row.id === 'check-after')!.cells;
    expect(cells.map((c) => c.outcome)).toContain('stale');
    expect(cells[0].outcome).toBe('fine');
  });

  it('the sentence under the table counts the stale cells of each row', () => {
    const table = outcomeTable(initialRenew());
    const sentence = staleCounts(table);
    for (const { row, cells } of table) expect(sentence).toContain(`${row.label}: ${cells.filter((c) => c.outcome === 'stale').length} of ${PAUSE_GRID_MS.length} pauses`);
  });

  it('a partition that cuts A from the lock turns an unpaused renewing client into a stale writer, unless storage fences', () => {
    const part = { ...initialRenew(), partition: true };
    const rows = outcomeTable(part);
    expect(rows.find((r) => r.row.id === 'none')!.cells[0].outcome).toBe('stale');
    expect(rows.find((r) => r.row.id === 'fence')!.cells[0].outcome).toBe('rejected');
    expect(rows.find((r) => r.row.id === 'check-before')!.cells[0].outcome).toBe('stopped');
  });

  it('the renewal refusal fires exactly when the TTL is below the heartbeat', () => {
    for (let ttl = 1_000; ttl <= 30_000; ttl += 1_000) {
      for (let hb = 500; hb <= 15_000; hb += 500) expect(validateRenew(ttl, hb) !== null, `${ttl}/${hb}`).toBe(ttl < hb);
    }
  });
});

describe('captions and drawings are computed from the run', () => {
  const combos = FENCE_MODES.flatMap((mode) =>
    (['job', 'write'] as const).flatMap((pauseAt) => [0, 12_000].flatMap((pauseMs) => [false, true].map((lockCrash) => setup({ mode, pauseAt, pauseMs, lockCrash })))),
  );

  it('every frame caption of every control combination reads cleanly (no glued sentences, NaN or undefined)', () => {
    for (const s of combos) {
      const run = runLease(s);
      for (const f of leaseFrames(run, verdictOf(s))) {
        if (f.say === undefined) continue;
        const t = text(f.say, { strict: true });
        expect(t, JSON.stringify(s)).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });

  it('a write caption says "rejected" exactly when storage rejected it, mentions an overwrite exactly for a stale applied write, and turns the rightful holder away exactly then', () => {
    for (const mode of FENCE_MODES) {
      for (let seed = 0; seed < 60; seed++) {
        const run = runLease(sweepSetup(seed, mode));
        for (const ev of leaseEvents(run)) {
          if (ev.kind !== 'write') continue;
          const t = text(eventCaption(run, ev), { strict: true });
          expect(t.includes('rejected'), `${mode} ${seed}`).toBe(!ev.entry.applied);
          expect(t.includes('overwrites it'), `${mode} ${seed}`).toBe(ev.entry.stale);
          expect(t.includes('turns the rightful holder away'), `${mode} ${seed}`).toBe(ev.entry.refusedNewest);
          expect(t).toContain(`token ${ev.entry.token}`);
        }
      }
    }
  });

  it('the summary caption quotes the counts the stats show', () => {
    for (const s of combos) {
      const run = runLease(s);
      const st = statsAt(run, Infinity);
      const t = text(summaryCaption(run, verdictOf(s)), { strict: true });
      expect(t).toContain(`storage applied ${st.applied} ${st.applied === 1 ? 'write' : 'writes'} and rejected ${st.rejected}`);
      expect(t.includes('no stale write got through'), JSON.stringify(s)).toBe(st.staleApplied === 0 && st.refusedNewest === 0);
    }
  });

  it('scene 3\'s closing caption agrees with its reading in all four combinations of purpose and storage', () => {
    for (const purpose of ['efficiency', 'correctness'] as const) {
      for (const storeChecks of [true, false]) {
        const r = needsReading(runLease(needsSetup({ purpose, storeChecks })));
        const t = text(needsSummary(purpose, storeChecks, r), { strict: true });
        if (purpose === 'correctness') {
          expect(t.includes('stale write was applied'), `${storeChecks}`).toBe(r.staleApplied > 0);
          expect(t.includes(`rejected ${r.rejected} stale write`), `${storeChecks}`).toBe(r.staleApplied === 0);
        } else {
          expect(t).toContain(`${r.jobsRun} clients ran the job`);
          expect(t).toContain(`${r.jobsRun - 1} repeated run`);
        }
      }
    }
  });

  it('log rows carry the stable id seed:position, unique in a run and the same on every run', () => {
    const run = runLease(sweepSetup(5, 'none'));
    const ids = storeRows(run, Infinity).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(storeRows(runLease(sweepSetup(5, 'none')), Infinity).map((r) => r.id));
    expect(ids.every((id) => String(id).startsWith('5:'))).toBe(true);
  });

  it('the Gantt bars match the run: ids are unique, every bar sits inside the axis, red marks only a stale or wrongly refused write, and the paused bar is the pause window', () => {
    for (const mode of FENCE_MODES) {
      for (let seed = 0; seed < 40; seed++) {
        const run = runLease(sweepSetup(seed, mode));
        const bars = leaseBars(run);
        expect(new Set(bars.map((b) => b.id)).size, `${mode} ${seed}`).toBe(bars.length);
        const end = domainEndMs(run) / 1000;
        for (const b of bars) {
          expect(b.start).toBeGreaterThanOrEqual(0);
          expect(b.end).toBeLessThanOrEqual(end + 1e-9);
        }
        for (const e of run.store) {
          const bar = bars.find((b) => b.id === `write-${e.id}`)!;
          expect(bar.tone === 'bad', `${mode} ${seed} write ${e.id}`).toBe(e.stale || e.refusedNewest);
        }
        const pause = bars.find((b) => b.id === 'pause');
        expect(Boolean(pause)).toBe(run.pause !== null);
        if (pause && run.pause?.to) expect([pause.start, pause.end]).toEqual([run.pause.from / 1000, run.pause.to / 1000]);
      }
    }
  });

  it('the pinned-seed line says which seed, or that none breaks the data rules', () => {
    for (const mode of FENCE_MODES) {
      const t = pinnedText(mode);
      const seed = PINNED_SEED[mode];
      expect(t.includes(`Seed ${seed} is the lowest of 200`)).toBe(seed !== null);
      expect(t.includes('None of the 200')).toBe(seed === null);
    }
  });
});

describe('lesson content', () => {
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('names every mode on screen in the watch text', () => {
    for (const word of ['green', 'grey', 'orange', 'violet', 'blue', 'red', 'yellow']) expect(lesson.summary.watch).toContain(word);
    expect(new Set(lesson.quiz.map((q) => q.answer)).size).toBeGreaterThan(2);
    const modes: FenceMode[] = [...FENCE_MODES];
    expect(modes).toHaveLength(4);
  });
});
