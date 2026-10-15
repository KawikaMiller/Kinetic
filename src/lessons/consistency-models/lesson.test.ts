import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { buildLaneModel, moveItem } from '../../core/laneEditor';
import { relationCaption, serviceCaption, timelineCaption } from './captions';
import lesson from './index';
import {
  CLIENTS, DEFAULT_PRESET, LIMITS, MODEL_NAME, ORDER_MODELS, PRESETS, explainViolation, opsOf, orderVerdict, presetById, smallestViolation, strongestHolding, verdictsOf,
  type OrderModel, type OpModel,
} from './model';
import {
  BROKEN_SEED, DEFAULT_DESIGN, DESIGNS, FOLLOWER_NOT_SEQUENTIAL_SEED, SERVICE_OPS, SEARCH_SEEDS, failureAt, lowestFailingSeed, runService, type Design,
} from './service';
import { answeredBy, chainStates, firstBreakTime, serviceView } from './view';

const verdictsFor = (id: string) => {
  const p = presetById(id);
  return { ops: opsOf(p.model()), verdicts: verdictsOf(opsOf(p.model()), { values: p.quiet }) };
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the default history is the stale read; linearizable fails, sequential and causal hold, and the ringed bars are the write and the read', () => {
    expect(DEFAULT_PRESET.id).toBe('stale-read');
    const { ops, verdicts } = verdictsFor(DEFAULT_PRESET.id);
    expect([verdicts.linearizable.ok, verdicts.sequential.ok, verdicts.causal.ok]).toEqual([false, true, true]);
    expect(smallestViolation('linearizable', ops)!.map((o) => `${o.client} ${o.kind} ${o.value}`)).toEqual(['C1 write 1', 'C2 read 0']);
    const c = text(timelineCaption({ ops, verdicts, focus: 'linearizable', viewer: 'C1', subset: smallestViolation('linearizable', ops) }));
    expect(c).toContain('The strongest order model this history satisfies is sequential.');
    expect(c).toContain("C2's R(x)→0 began after C1's W(x=1) was acknowledged");
    expect(c).toContain('The ringed bars (C1 W(x=1), C2 R(x)→0)');
  });

  it("try-this 2: selecting C2's read and pressing the left button twice makes it share slot 3 with the write, and linearizable turns to holds", () => {
    const model: OpModel = DEFAULT_PRESET.model();
    const read = model.items.find((i) => i.lane === 1 && i.data.kind === 'read')!;
    const write = model.items.find((i) => i.data.kind === 'write')!;
    expect([write.start, write.end, read.start, read.end]).toEqual([1, 3, 5, 7]);
    const step = (m: OpModel) => {
      const edit = moveItem(m, read.id, 0, -1);
      if (!edit.ok) throw new Error(edit.reason);
      return edit.model;
    };
    const once = step(model);
    expect(orderVerdict('linearizable', opsOf(once)).ok).toBe(false);
    const twice = step(once);
    const moved = twice.items.find((i) => i.id === read.id)!;
    expect(moved.start).toBe(write.end);
    expect(orderVerdict('linearizable', opsOf(twice)).ok).toBe(true);
  });

  it('try-this 3: "two orders" has causal holding, sequential failing and converged no; "causality broken" has converged yes and causal failing', () => {
    const two = verdictsFor('two-orders').verdicts;
    expect([two.causal.ok, two.sequential.ok, two.converged.state]).toEqual([true, false, 'bad']);
    const broken = verdictsFor('causality-broken').verdicts;
    expect([broken.causal.ok, broken.converged.state]).toEqual([false, 'ok']);
    expect(text(timelineCaption({ ...verdictsFor('two-orders'), focus: 'sequential', viewer: 'C1', subset: null }))).toContain(two.converged.message);
  });

  it('try-this 4: dropping "two orders" into the chain makes causal the strongest box and the converged box say no', () => {
    const { verdicts } = verdictsFor('two-orders');
    const states = chainStates(strongestHolding(verdicts));
    expect(states).toEqual({ linearizable: 'fails', sequential: 'fails', causal: 'strongest' });
    expect(verdicts.converged.state).toBe('bad');
    const c = text(relationCaption(presetById('two-orders'), verdicts));
    expect(c).toContain('the strongest order model it satisfies is causal');
    expect(c).toContain('Converged (the quiet reads agree): no');
  });

  it('try-this 5: on the default seed follower reads fail linearizable and keep sequential, one leader holds all three, the session cache keeps sequential and causal, and the lowest seed that breaks sequential for follower reads is 1', () => {
    expect(DEFAULT_DESIGN).toBe('follower');
    const follower = runService(DEFAULT_DESIGN, BROKEN_SEED);
    expect([failureAt('linearizable', follower.ops) === null, failureAt('sequential', follower.ops) === null, failureAt('causal', follower.ops) === null]).toEqual([false, true, true]);
    const leader = runService('leader', BROKEN_SEED);
    for (const m of ORDER_MODELS) expect(failureAt(m, leader.ops), m).toBeNull();
    const session = runService('session', BROKEN_SEED);
    expect([failureAt('linearizable', session.ops) === null, failureAt('sequential', session.ops) === null, failureAt('causal', session.ops) === null]).toEqual([false, true, true]);
    expect(lowestFailingSeed('follower', 'sequential', SEARCH_SEEDS)).toBe(FOLLOWER_NOT_SEQUENTIAL_SEED);
    expect(FOLLOWER_NOT_SEQUENTIAL_SEED).toBe(1);
    const run = runService('follower', FOLLOWER_NOT_SEQUENTIAL_SEED);
    const subset = smallestViolation('sequential', serviceView(run, run.end).ops)!;
    expect(subset.map((o) => `${o.client} ${o.kind} ${o.value}`)).toEqual(['C2 write 3', 'C2 write 4', 'C2 read 3']);
    expect(explainViolation('sequential', subset)).toBe('C2 wrote 4 and then read 3: a client has to see its own earlier write.');
  });
});

describe('scene 1 captions are computed from the verdicts, for every preset and every focus', () => {
  it('say "holds" exactly when the focused model holds, and quote the converged verdict', () => {
    for (const p of PRESETS) {
      const ops = opsOf(p.model());
      const verdicts = verdictsOf(ops, { values: p.quiet });
      for (const focus of ORDER_MODELS) {
        for (const viewer of CLIENTS) {
          const subset = smallestViolation(focus, ops);
          const c = text(timelineCaption({ ops, verdicts, focus, viewer, subset }), { strict: true });
          expect(c.includes(`${MODEL_NAME[focus]} holds:`), `${p.id} ${focus}`).toBe(verdicts[focus].ok);
          expect(c.includes(`${MODEL_NAME[focus]} fails.`), `${p.id} ${focus}`).toBe(!verdicts[focus].ok);
          expect(c).toContain(verdicts.converged.message);
          const strongest = strongestHolding(verdicts);
          expect(c.includes(`satisfies is ${strongest}.`)).toBe(strongest !== null);
          if (focus !== 'causal') expect(c.includes(`${viewer}'s view`), 'the viewer control only matters for causal').toBe(false);
        }
      }
    }
  });

  it('an empty timeline says how to start', () => {
    expect(text(timelineCaption({ ops: [], verdicts: verdictsOf([], { values: [0, 0, 0] }), focus: 'linearizable', viewer: 'C1', subset: null }))).toBe(
      "Press a slot on a client's row to add an operation. A write is W(x=v), a read is R(x)→v, and x starts at 0.",
    );
  });

  it('the quiet reads change only the converged verdict, never the three order verdicts (a hidden control feeds no other number)', () => {
    const ops = opsOf(presetById('causality-broken').model());
    const base = verdictsOf(ops, { values: [2, 2, 2] });
    for (const values of [[0, 0, 0], [1, 2, 3], [-1, -1, -1], [10, 0, 5]]) {
      const v = verdictsOf(ops, { values });
      for (const m of ORDER_MODELS) expect(v[m], m).toEqual(base[m]);
    }
  });
});

describe('scene 3 captions are computed from the recorded run', () => {
  const closedForm = (run: ReturnType<typeof runService>, t: number) => {
    const view = serviceView(run, t);
    const breaks = Object.fromEntries(ORDER_MODELS.map((m) => [m, firstBreakTime(m, run.ops)])) as Record<OrderModel, number | null>;
    const firstBreak = view.explained && breaks[view.explained] !== null ? { model: view.explained, at: breaks[view.explained]! } : null;
    return { view, text: text(serviceCaption({ design: run.design, seed: run.seed, t, end: run.end, answered: answeredBy(run.ops, t), view, firstBreak }), { strict: true }), firstBreak };
  };

  it('every design, several seeds and replay times: the answered count and the verdict words match the history', () => {
    for (const { id } of DESIGNS) {
      for (const seed of [0, 1, 2, 3, 17, 42]) {
        const run = runService(id as Design, seed);
        for (const t of [0, Math.floor(run.end / 3), Math.floor(run.end / 2), run.end]) {
          const { view, text: c } = closedForm(run, t);
          expect(c).toContain(`${answeredBy(run.ops, t)} of ${SERVICE_OPS} operations have answered`);
          expect(c).toContain(`replayed to ${t} of ${run.end} ms`);
          expect(c.includes('No order model accepts'), `${id} ${seed} ${t}`).toBe(view.strongest === null);
          if (view.explained) expect(c).toContain(`${MODEL_NAME[view.explained]} fails:`);
          else expect(c.includes(' fails:')).toBe(false);
        }
      }
    }
  });

  it('the first-break time is the time of a real response at which the checker flips, and the history just before it passes', () => {
    const run = runService(DEFAULT_DESIGN, BROKEN_SEED);
    const at = firstBreakTime('linearizable', run.ops)!;
    expect(run.ops.some((o) => o.response === at)).toBe(true);
    expect(failureAt('linearizable', run.ops, at)).not.toBeNull();
    expect(failureAt('linearizable', run.ops, at - 1)).toBeNull();
    expect(failureAt('linearizable', run.ops, -1)).toBeNull();
  });

  it('on the default seed the explanation for follower reads is the stale-read rule, in words', () => {
    const run = runService(DEFAULT_DESIGN, BROKEN_SEED);
    const view = serviceView(run, run.end);
    expect(view.explained).toBe('linearizable');
    expect(view.why).toBe(explainViolation('linearizable', view.subset!));
    expect(view.subset!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('quiz question 4 is decided by its stem', () => {
  const history = (rows: readonly [number, number, number, 'write' | 'read', number][]) =>
    opsOf(buildLaneModel(LIMITS, rows.map(([lane, start, end, kind, value]) => ({ lane, slot: start, span: end - start, data: { kind, value } }))));
  it('C1 writes 1 then 2 and C2 reads 2 then 1: converged yes, causal no (the stem), while the same reads of two concurrent writes are causal', () => {
    const ordered = history([[0, 1, 3, 'write', 1], [0, 4, 6, 'write', 2], [1, 8, 9, 'read', 2], [1, 10, 11, 'read', 1]]);
    const v = verdictsOf(ordered, { values: [2, 2, 2] });
    expect([v.causal.ok, v.converged.state]).toEqual([false, 'ok']);
    const concurrent = history([[0, 1, 3, 'write', 1], [1, 1, 3, 'write', 2], [1, 8, 9, 'read', 2], [1, 10, 11, 'read', 1]]);
    expect(verdictsOf(concurrent, { values: [2, 2, 2] }).causal.ok).toBe(true);
    expect(lesson.quiz[3].q).toContain('C1 writes 1 and then writes 2');
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('not causally consistent');
  });
});

describe('lesson content', () => {
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries, four key ideas and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.keyIdeas).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
  });
});
