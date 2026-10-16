import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { bugIntro, outboxFrames, outboxIntro, outboxMilestones, outcomeSummary, pollIntro, pollSummary } from './captions';
import lesson from './index';
import { COMPARE_SEEDS, addOrder, bugSetup, compareAll, initialBug, initialCompare, initialOutbox, initialPoll, outboxSetupOf, parseAmount, pollSetupOf } from './init';
import { DEFAULT_OUTBOX, MAX_ORDERS, PINNED, caseTable, compareSweep, outcomeOf, runOutbox, unpublishedOrders, type Fault } from './outbox';
import { ACTORS, sequenceAt, stateAt, storyTrace } from './view';

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: database first with a crash between the steps is a lost event; publish first at the same crash point is a ghost', () => {
    const s = initialBug();
    expect([s.design, s.fault]).toEqual(['dbfirst', 'between']);
    const lost = runOutbox(bugSetup(s));
    expect(outcomeOf(lost)).toBe('lost event');
    expect(lost.cluster.trace.some((r) => r.kind === 'crash' && r.node === 'service')).toBe(true);
    expect(text(outcomeSummary(lost), { strict: true })).toContain('a lost event: the order exists, the event never came');
    const ghost = runOutbox(bugSetup({ ...s, design: 'pubfirst' }));
    expect(outcomeOf(ghost)).toBe('ghost');
    expect(text(outcomeSummary(ghost), { strict: true })).toContain('a ghost');
    expect(lesson.tryThis[0]).toContain('a lost event');
  });

  it('try-this 2: before step 1 nothing happens in either order; a failed publish loses the event under database first and does nothing under publish first', () => {
    const s = initialBug();
    for (const design of ['dbfirst', 'pubfirst'] as const) expect(outcomeOf(runOutbox(bugSetup({ ...s, design, fault: 'before' }))), design).toBe('nothing');
    expect(outcomeOf(runOutbox(bugSetup({ ...s, fault: 'publish-fails' })))).toBe('lost event');
    expect(outcomeOf(runOutbox(bugSetup({ ...s, design: 'pubfirst', fault: 'publish-fails' })))).toBe('nothing');
    expect(caseTable()).toHaveLength(8);
  });

  it('try-this 3: the default relay crash publishes twice and applies twice; the inbox skips the repeat; "After the commit" delivers once, later', () => {
    const s = initialOutbox();
    expect([s.fault, s.dedupe]).toEqual(['relay-mid', false]);
    const run = runOutbox(outboxSetupOf(s));
    expect(run.published.filter((p) => p.order === 1)).toHaveLength(2);
    expect(stateAt(run, Infinity).effects[0].applied).toBe(2);
    const inbox = runOutbox(outboxSetupOf({ ...s, dedupe: true }));
    expect(stateAt(inbox, Infinity).effects[0]).toMatchObject({ applied: 1, ignored: 1 });
    const later = runOutbox(outboxSetupOf({ ...s, fault: 'after-commit' }));
    expect(later.published).toHaveLength(1);
    expect(later.published[0].at).toBeGreaterThan(later.orders[0].at);
  });

  it('try-this 4: with id 42 committing first the relay publishes 42 and never 41, so one order stays without an event; the commit log delivers both, 42 first', () => {
    const s = initialPoll();
    expect([s.relay, s.ordering]).toEqual(['cursor', 't2-first']);
    const run = runOutbox(pollSetupOf(s), 3_000);
    expect(run.published.map((p) => p.id)).toEqual([42]);
    expect(stateAt(run, Infinity).orders.filter((o) => !run.published.some((p) => p.order === o.order))).toHaveLength(1);
    const log = runOutbox(pollSetupOf({ ...s, relay: 'log' }), 3_000);
    expect(log.published.map((p) => p.id)).toEqual([42, 41]);
  });

  it('try-this 5: the comparison table\'s lowest failing seeds are the ones the try-this names, and the inbox turns "Effect once" green for the outbox rows only', () => {
    expect(initialCompare().dedupe).toBe(false);
    const rows = compareAll();
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row('dbfirst').plain.O2).toBe(PINNED.dbfirst.seed);
    expect(row('poll-cursor').plain.O2).toBe(PINNED['poll-cursor'].seed);
    expect(lesson.tryThis[4]).toContain(`seed ${PINNED.dbfirst.seed}`);
    expect(lesson.tryThis[4]).toContain(`seed ${PINNED['poll-cursor'].seed}`);
    for (const id of ['poll-flag', 'poll-cursor', 'cdc']) {
      expect(row(id).plain.O3, id).not.toBeNull();
      expect(row(id).inbox.O3, id).toBeNull();
    }
    expect(row('poll-cursor').inbox.O2).not.toBeNull();
    expect(COMPARE_SEEDS).toBe(200);
  });
});

describe('every scene opens in a state of its own', () => {
  it('fresh objects each call, and mutating one never reaches the next', () => {
    expect(initialBug()).not.toBe(initialBug());
    const o = initialOutbox();
    o.amounts.push(99);
    o.dedupe = true;
    expect(initialOutbox().amounts).toEqual([120]);
    expect(initialOutbox().dedupe).toBe(false);
    expect([initialBug().fault, initialOutbox().fault, initialPoll().ordering]).toEqual(['between', 'relay-mid', 't2-first']);
  });
  it('switching through all scenes leaves each opening state as it was', () => {
    const before = [initialBug(), initialOutbox(), initialPoll(), initialCompare()];
    for (const make of [initialCompare, initialPoll, initialOutbox, initialBug, initialOutbox]) make();
    expect([initialBug(), initialOutbox(), initialPoll(), initialCompare()]).toEqual(before);
  });
});

describe('hostile input is refused with the reason', () => {
  it('order amounts are bounded whole numbers', () => {
    const refused = (t: string) => {
      const r = parseAmount(t);
      return r.ok ? null : r.error;
    };
    expect(refused('')).toContain('Type an amount');
    expect(refused('0')).toContain('at least 1');
    expect(refused('501')).toContain('at most 500');
    expect(refused('12.5')).toContain('not an amount');
    expect(refused('1e3')).toContain('not an amount');
    expect(parseAmount('500')).toEqual({ ok: true, value: 500 });
  });
  it('a 31st order is refused with a message and the list is unchanged', () => {
    let s = initialOutbox();
    for (let i = 1; i < MAX_ORDERS; i++) s = addOrder(s);
    expect(s.amounts).toHaveLength(MAX_ORDERS);
    const next = addOrder(s);
    expect(next.amounts).toHaveLength(MAX_ORDERS);
    expect(next.refusal).toContain('holds 30 orders');
    expect(addOrder({ ...initialOutbox(), text: 'abc' }).amounts).toHaveLength(1);
  });
  it('thirty orders run: every committed order is published and handled once with the inbox on', () => {
    let s = { ...initialOutbox(), fault: 'none' as Fault, dedupe: true };
    for (let i = 1; i < MAX_ORDERS; i++) s = addOrder(s);
    const run = runOutbox(outboxSetupOf(s), 4_000);
    expect(run.orders).toHaveLength(MAX_ORDERS);
    expect(unpublishedOrders(run)).toEqual([]);
    expect(Object.values(run.effects).every((n) => n === 1)).toBe(true);
  });
});

describe('captions and tables are computed from the run', () => {
  const faults: Fault[] = ['none', 'before', 'between', 'after', 'publish-fails', 'relay-mid', 'after-commit'];
  it('every frame of every fault, design and inbox setting reads cleanly', () => {
    for (const fault of faults) {
      for (const design of ['dbfirst', 'pubfirst', 'outbox'] as const) {
        for (const dedupe of [false, true]) {
          const run = runOutbox({ ...bugSetupFor(design, fault), dedupe });
          for (const f of outboxFrames(run, bugIntro(design === 'outbox' ? 'dbfirst' : design, fault), outcomeSummary(run))) {
            if (f.say) expect(text(f.say, { strict: true }), `${design} ${fault}`).not.toMatch(/NaN|undefined|Infinity/);
          }
        }
      }
    }
    expect(text(outboxIntro('relay-mid', true), { strict: true })).toContain('keeps an inbox');
    expect(text(pollIntro('log'), { strict: true })).toContain('commit log');
  });

  it('a milestone says "second time" exactly for a repeat publish and "ghost" exactly for an event with no order', () => {
    for (let seed = 0; seed < 60; seed++) {
      const run = runOutbox(compareSweep(seed, seed % 3 === 0 ? 'pubfirst' : 'outbox', 'flag', seed % 2 === 0));
      const said = outboxMilestones(run).map((m) => text(m.say, { strict: true }));
      const repeats = run.published.length - new Set(run.published.map((p) => p.order)).size;
      expect(said.filter((t) => t.includes('a second time')).length, `seed ${seed}`).toBe(repeats);
      const ghosts = run.handled.filter((h) => !run.orders.some((o) => o.order === h.order && o.at <= h.at)).length;
      expect(said.filter((t) => t.includes('a ghost')).length, `seed ${seed}`).toBe(ghosts);
    }
  });

  it('the poll summary names the lost row exactly when an order has no published event', () => {
    for (const relay of ['cursor', 'rescan', 'log'] as const) {
      for (const ordering of ['t1-first', 't2-first'] as const) {
        const run = runOutbox(pollSetupOf({ relay, ordering }), 3_000);
        const t = text(pollSummary(run), { strict: true });
        expect(t.includes('was never published'), `${relay} ${ordering}`).toBe(unpublishedOrders(run).length > 0);
      }
    }
  });

  it('the table state at a moment equals an independent reading of the trace: committed orders, sent rows and applied effects', () => {
    for (let seed = 0; seed < 25; seed++) {
      const run = runOutbox(compareSweep(seed, 'outbox', 'flag', true), 1_000);
      for (const now of [0, 60, 150, 400, 1_000]) {
        const s = stateAt(run, now);
        const trace = run.cluster.trace.filter((r) => r.t <= now);
        const markSent = new Set(trace.filter((r) => r.kind === 'deliver' && r.to === 'database' && r.payload?.type === 'mark').map((r) => (r.payload as { id: number }).id));
        expect(s.outbox.filter((r) => r.state === 'sent').map((r) => r.id).sort(), `seed ${seed} t=${now}`).toEqual([...markSent].sort());
        const published = trace.filter((r) => r.kind === 'deliver' && r.to === 'broker').length;
        expect(s.published, `seed ${seed} t=${now}`).toBe(published);
        const handled = trace.filter((r) => r.kind === 'timer' && r.node === 'consumer').length;
        expect(s.effects.reduce((n, e) => n + e.applied + e.ignored, 0), `seed ${seed} t=${now}`).toBe(handled);
      }
    }
  });

  it('the ladder leaves out empty polls and nothing else of the messages', () => {
    const run = runOutbox({ ...DEFAULT_OUTBOX, design: 'outbox' });
    const story = storyTrace(run.cluster.trace);
    expect(story.some((r) => r.payload?.type === 'poll')).toBe(false);
    expect(story.some((r) => r.payload?.type === 'publish')).toBe(true);
    expect(sequenceAt(run, Infinity).messages.length).toBeGreaterThan(5);
    const known = new Set(ACTORS.map((a) => a.id));
    for (const seed of [0, 1, 2, 28]) {
      for (const m of sequenceAt(runOutbox(compareSweep(seed, 'outbox', 'flag', true)), Infinity).messages) {
        expect(known.has(m.from) && (typeof m.to !== 'string' || known.has(m.to)), `seed ${seed} ${m.id}`).toBe(true);
      }
    }
  });
});

function bugSetupFor(design: 'dbfirst' | 'pubfirst' | 'outbox', fault: Fault) {
  return design === 'outbox' ? outboxSetupOf({ ...initialOutbox(), fault: fault === 'between' || fault === 'after' || fault === 'publish-fails' ? 'none' : fault }) : bugSetup({ ...initialBug(), design, fault });
}

describe('lesson content', () => {
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries and five questions with answers spread over the positions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(new Set(lesson.quiz.map((q) => q.answer)).size).toBeGreaterThan(2);
  });
});
