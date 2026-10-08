import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { MAX_NODES, canWrap, nodeCount, renameTarget, swapRelation, unwrapNode, wrapNode } from './edit';
import { nullCaption, pushdownFrames, runFrames } from './frames';
import {
  PRESETS, TEACHERS, bin, eq, evaluate, findNode, intermediateRows, postOrder, proj, pushedPlan, rel, relabel, resultOf, sel, unpushedPlan, type Expr,
} from './model';
import { NULL_QUERIES, runNullQuery } from './nulls';
import { panelsFor } from './view';

const text = captionText;
const MODES = ['set', 'bag'] as const;

describe('run frames', () => {
  for (const p of PRESETS)
    for (const mode of MODES)
      it(`${p.id} (${mode}): one frame per operator, each caption naming its own row count`, () => {
        const frames = runFrames(p.expr, mode);
        const ev = evaluate(p.expr, mode);
        const ops = postOrder(p.expr).filter((x) => x.op !== 'rel');
        const runs = frames.filter((f) => f.node && f.phase === 'run');
        expect(runs.map((f) => f.node)).toEqual(ops.map((x) => x.id));
        for (const f of frames.filter((x) => x.node)) {
          const r = ev.get(f.node!)!;
          if (!r.ok) throw new Error('preset has an error');
          const say = text(f.say);
          const d = r.detail;
          if (d.op === 'select') expect(say).toContain(`keeps the ${d.kept.filter(Boolean).length}`);
          else if (d.op === 'project' && f.phase === 'collapse') expect(say).toContain(`${r.out.rows.length} row`);
          else if (d.op === 'project' && mode === 'bag') expect(say).toContain(`${r.out.rows.length} row`);
          else if (d.op === 'join' || d.op === 'product') expect(say).toContain(`${r.out.rows.length} row`);
          else if (d.op === 'diff') expect(say).toContain(`${r.out.rows.length} row`);
        }
        const last = text(frames.at(-1)!.say);
        const root = resultOf(p.expr, mode);
        expect(last).toContain(`Result: ${root.ok ? root.out.rows.length : -1} row`);
      });

  it('π gets a collapse frame only in set mode, and only when it made duplicates', () => {
    const teacher = PRESETS[0].expr;
    expect(runFrames(teacher, 'set').some((f) => f.phase === 'collapse')).toBe(true);
    expect(runFrames(teacher, 'bag').some((f) => f.phase === 'collapse')).toBe(false);
    const noDup = relabel(proj(['sid'], rel('Students')));
    expect(runFrames(noDup, 'set').some((f) => f.phase === 'collapse')).toBe(false);
  });

  it('the teacher preset names the duplicate Ada only in bag mode', () => {
    expect(text(runFrames(PRESETS[0].expr, 'bag').at(-1)!.say)).toMatch(/Some repeat/);
    expect(text(runFrames(PRESETS[0].expr, 'set').at(-1)!.say)).not.toMatch(/Some repeat/);
  });

  it('stops at the node that fails, and the summary names it', () => {
    const bad = relabel(proj(['name'], bin('product', rel('Students'), rel('Enrolments'))));
    const frames = runFrames(bad, 'set');
    const failing = postOrder(bad).find((x) => x.op === 'product')!;
    expect(frames.filter((f) => f.node).map((f) => f.node)).toEqual([failing.id]);
    expect(text(frames.at(-2)!.say)).toMatch(/can't run/);
    expect(text(frames.at(-1)!.say)).toMatch(/Stopped at ×/);
  });

  it('a node shows its count from the frame it runs on, never before', () => {
    const e = PRESETS[0].expr;
    const frames = runFrames(e, 'set');
    for (const f of frames.filter((x) => x.node && x.phase === 'run')) {
      const before = frames[frames.indexOf(f) - 1];
      expect(before.done).not.toContain(f.node);
    }
    expect(frames.at(-1)!.done.length).toBe(postOrder(e).length);
  });
});

describe('table panels agree with the evaluator', () => {
  for (const p of PRESETS)
    for (const mode of MODES)
      it(`${p.id} (${mode})`, () => {
        const ev = evaluate(p.expr, mode);
        for (const f of runFrames(p.expr, mode)) {
          const final = f.node === null && f !== runFrames(p.expr, mode)[0];
          const panels = panelsFor(p.expr, ev, f.node, f.phase, final, mode);
          if (!f.node) continue;
          const r = ev.get(f.node)!;
          if (!r.ok) continue;
          const d = r.detail;
          if (d.op === 'select') expect(panels.inputs[0].rows.filter((x) => x.struck).length).toBe(d.kept.filter((k) => !k).length);
          if (d.op === 'diff') expect(panels.inputs[0].rows.filter((x) => x.struck).length).toBe(d.removed.filter(Boolean).length);
          if (d.op === 'join') expect(panels.inputs.flatMap((x) => x.rows).filter((x) => x.struck).length).toBe(d.leftUnmatched.length + d.rightUnmatched.length);
          if ((d.op === 'project' || d.op === 'union') && f.phase === 'collapse') expect(panels.output!.rows.length).toBe(r.out.rows.length);
          if (d.op === 'project' && f.phase === 'run' && mode === 'set') expect(panels.output!.rows.filter((x) => x.flash).length).toBe(d.dupOf.filter((k) => k >= 0).length);
          if (d.op === 'project' && mode === 'bag') expect(panels.output!.rows.some((x) => x.flash)).toBe(false);
        }
      });
});

describe('editing', () => {
  it('wraps the picked node, selects the wrapper, and never reuses an id', () => {
    const start = PRESETS[2].expr;
    const r = wrapNode(start, start.id, { op: 'join', right: 'Enrolments' })!;
    const ids = postOrder(r.tree).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findNode(r.tree, r.selected)!.op).toBe('join');
    expect(r.tree.id).toBe(r.selected);
  });

  it('unwraps an operator to its (left) input and refuses base relations', () => {
    const e = PRESETS[0].expr;
    const r = unwrapNode(e, e.id)!;
    expect(r.tree.op).toBe('select');
    const leaf = postOrder(e).find((x) => x.op === 'rel')!;
    expect(unwrapNode(e, leaf.id)).toBeNull();
  });

  it('swaps a leaf, and a renamed copy makes the clashing product valid', () => {
    const e = PRESETS[2].expr;
    const courses = postOrder(e).find((x) => x.op === 'rel' && x.name === 'Courses')!;
    const clash = swapRelation(e, courses.id, 'Enrolments');
    expect(resultOf(clash, 'set').ok).toBe(false);
    const fixed = wrapNode(clash, courses.id, { op: 'rename', from: 'sid', to: renameTarget('sid', ['sid', 'cid']) })!;
    const out = resultOf(fixed.tree, 'set');
    expect(out.ok && out.out.rows.length).toBe(35);
  });

  it(`caps trees at ${MAX_NODES} nodes`, () => {
    let e: Expr = relabel(rel('Students'));
    while (canWrap(e, false)) e = wrapNode(e, e.id, { op: 'project', cols: ['sid'] })!.tree;
    expect(nodeCount(e)).toBe(MAX_NODES);
    expect(wrapNode(e, e.id, { op: 'project', cols: ['sid'] })).toBeNull();
  });

  it('picks the lowest free rename', () => {
    expect(renameTarget('sid', ['sid', 'sid2'])).toBe('sid3');
  });
});

describe('pushdown captions', () => {
  for (const t of TEACHERS)
    for (const rewrite of ['sigma', 'sigma-reorder'] as const)
      it(`${t} / ${rewrite}: the final caption states both totals from the model and which rewrites made them`, () => {
        const u = unpushedPlan(t);
        const p = pushedPlan(t, rewrite);
        const say = text(pushdownFrames(u, p, 'set', rewrite).at(-1)!.say);
        expect(say).toContain('Same result');
        expect(say).toContain(`held ${intermediateRows(u, 'set')} rows against ${intermediateRows(p, 'set')} rows`);
        if (rewrite === 'sigma') expect(say).toContain('Only σ moved');
        else expect(say).toContain('regrouped');
      });
});

describe('bag difference caption', () => {
  it('says each right row cancels one left row under EXCEPT ALL, and the set caption does not', () => {
    const e = relabel(bin('diff', proj(['sid'], rel('Enrolments')), proj(['sid'], sel(eq('year', 3), rel('Students')))));
    const diff = postOrder(e).find((n) => n.op === 'diff')!;
    const bag = runFrames(e, 'bag').find((f) => f.node === diff.id)!;
    const set = runFrames(e, 'set').find((f) => f.node === diff.id)!;
    expect(text(bag.say)).toMatch(/cancels one matching left row/);
    expect(text(set.say)).toMatch(/keeps the left rows that aren't on the right/);
    const ev = evaluate(e, 'bag').get(diff.id)!;
    expect(ev.ok && ev.out.rows.length).toBe(6);
  });
});

describe('NULL captions, every query × version × NULL row', () => {
  for (const q of NULL_QUERIES)
    for (const v of ['trap', 'fix'] as const)
      for (const unknown of [false, true])
        it(`${q.id} ${v} ${unknown}`, () => {
          const run = runNullQuery(q.id, v, unknown);
          const say = text(nullCaption(q.id, v, unknown, run));
          const k = run.result.rows.length;
          expect(say).toContain(`${k} ${k === 1 ? 'row' : 'rows'}`);
          if (q.id === 'not-in' && v === 'trap' && unknown) expect(say).toMatch(/1 UNKNOWN/);
        });
});
