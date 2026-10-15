import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sccFrames } from './frames';
import lesson from './index';
import { PRESETS, canonical, condense, edgeEffect, kosaraju, presetById } from './model';
import { edgeVerdict } from './text';
import { ORDER_CHOICES } from './useSccEditor';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const tangle = presetById('tangle').graph;
const idx = (n: string) => tangle.names.indexOf(n);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the tangle ends pass 1 with the stack c h g f e d b a and pass 2 finds four components', () => {
    const run = kosaraju(tangle);
    const frames = sccFrames(tangle, run);
    const all = frames.map((f) => text(f.say));
    expect(all.some((t) => t.includes('Finish order, first to last: c, h, g, f, e, d, b, a; the top of the stack is a'))).toBe(true);
    expect(all[all.length - 1]).toContain('4 components: {a, b, c}, {d, e, f}, {g}, {h}');
    // The last frame's stack and components agree with the caption.
    const last = frames[frames.length - 1];
    expect(last.finished.map((v) => tangle.names[v]).join('')).toBe('chgfedba');
    expect(new Set(last.comp).size).toBe(4);
    expect(lesson.tryThis[0]).toContain('finish stack c, h, g, f, e, d, b, a (top on the right)');
    expect(lesson.tryThis[0]).toContain('finds 4 components {a b c}, {d e f}, {g}, {h}');
  });

  it('try-this 2: four components, a valid dependency order, and no edge of the collapsed graph points back', () => {
    const run = kosaraju(tangle);
    const c = condense(tangle, run.comp, run.components.length);
    expect(run.components).toHaveLength(4);
    const pos = new Map(c.order!.map((x, i) => [x, i]));
    expect(c.edges.every(([a, b]) => pos.get(a)! < pos.get(b)!)).toBe(true);
    expect(c.edges).toHaveLength(3);
    expect(lesson.tryThis[1]).toContain('the 4 components line up');
  });

  it('try-this 3: reversed changes the finish order and the components stay the same', () => {
    const reversed = ORDER_CHOICES.find((o) => o.id === 'reversed')!.build(tangle.names.length);
    const base = kosaraju(tangle);
    const run = kosaraju(tangle, reversed);
    const baseFinish = base.finishOrder.map((v) => tangle.names[v]).join(', ');
    const finish = run.finishOrder.map((v) => tangle.names[v]).join(', ');
    expect(finish).not.toBe(baseFinish);
    expect(canonical(run.components)).toBe(canonical(base.components));
    expect(lesson.tryThis[2]).toContain(`changes from ${baseFinish} to ${finish}`);
  });

  it('try-this 4: d to a takes 4 components to 3, e to d changes nothing, and the sentence says so', () => {
    const d2a = edgeEffect(tangle, idx('d'), idx('a'));
    expect([d2a.before, d2a.after]).toEqual([4, 3]);
    expect(edgeVerdict(tangle.names, idx('d'), idx('a'), d2a)).toContain('components fuse into {a b c d e f}: 4 components before, 3 after');
    const e2d = edgeEffect(tangle, idx('e'), idx('d'));
    expect([e2d.before, e2d.after]).toEqual([4, 4]);
    expect(edgeVerdict(tangle.names, idx('e'), idx('d'), e2d)).toContain('leaves the components alone (4 before, 4 after)');
    expect(lesson.tryThis[3]).toContain('drag an edge from d to a');
    expect(lesson.tryThis[3]).toContain('count drops from 4 to 3');
  });
});

describe('every caption reads cleanly', () => {
  it('walks every preset x every start order choice through the step-through scene: no NaN, no glued sentence, and the last frame names every node', () => {
    let count = 0;
    for (const p of PRESETS) {
      for (const choice of ORDER_CHOICES) {
        const run = kosaraju(p.graph, choice.build(p.graph.names.length));
        const frames = sccFrames(p.graph, run);
        for (const f of frames) {
          expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
          count++;
        }
        const last = frames[frames.length - 1];
        expect(last.comp.every((c) => c >= 0)).toBe(true);
        expect(canonical(run.components)).toBe(canonical(kosaraju(p.graph).components));
      }
    }
    expect(count).toBeGreaterThan(100);
  });

  it('the stack in each frame is the finish order so far, and pass-1 frames never assign a component', () => {
    const run = kosaraju(tangle);
    const frames = sccFrames(tangle, run);
    for (const f of frames) {
      expect(f.finished).toEqual(run.finishOrder.slice(0, f.finished.length));
      if (f.phase === 'pass1') expect(f.comp.every((c) => c === -1)).toBe(true);
    }
  });
});
