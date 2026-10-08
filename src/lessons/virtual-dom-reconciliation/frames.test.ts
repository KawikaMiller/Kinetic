import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { describePatch, diffFrames, nodeStatuses, nodeSummary } from './frames';
import { KEY_MODES, LIST_PRESETS, TREE_OLD, TREE_PRESETS, countsOf, runDiff, runList } from './model';

const scenarios = [
  ...TREE_PRESETS.map((p) => ({ name: p.label, s: runDiff(TREE_OLD, p.next) })),
  ...LIST_PRESETS.flatMap((p) => KEY_MODES.map((m) => ({ name: `${p.label}, ${m.label}`, s: runList(p.id, m.value) }))),
];

describe('captions', () => {
  for (const { name, s } of scenarios) {
    it(`${name}: every frame has a caption with no glued sentences`, () => {
      for (const f of diffFrames(s, 'intro')) expectCaption(f.say);
    });
  }

  it('one frame per step, plus the intro and the summary', () => {
    const s = runList('reverse', 'id');
    expect(diffFrames(s, 'intro')).toHaveLength(s.result.steps.length + 2);
  });

  it('the summary frame states the DOM calls the counts say, and a render that changes nothing says zero', () => {
    const insert = runList('insert-start', 'none');
    const c = countsOf(insert.result);
    const last = diffFrames(insert, 'intro').at(-1)!;
    expect(captionText(last.say)).toContain(`${c.ops} DOM calls`);
    expect(captionText(last.say)).toContain(`${c.built} node built`);
    const same = runDiff(TREE_OLD, TREE_PRESETS[4].next);
    expect(captionText(diffFrames(same, 'intro').at(-1)!.say)).toContain('0 DOM calls');
  });

  it('a step caption names the rule it applied', () => {
    const replace = diffFrames(runDiff(TREE_OLD, TREE_PRESETS[3].next), 'intro')[1].say;
    expect(captionText(replace)).toContain('different type');
    expect(captionText(replace)).toContain('4 nodes');
    const keyedInsert = diffFrames(runList('insert-start', 'id'), 'intro').find((f) => captionText(f.say).includes('INSERT'))!.say;
    expect(captionText(keyedInsert)).toContain('No old child has key f');
    const positionalInsert = diffFrames(runList('insert-start', 'none'), 'intro').find((f) => captionText(f.say).includes('INSERT'))!.say;
    expect(captionText(positionalInsert)).toContain('no child at position 5');
  });

  it('only the keyed reorder mentions a move, and it says why', () => {
    const texts = (preset: Parameters<typeof runList>[0], mode: Parameters<typeof runList>[1]) => diffFrames(runList(preset, mode), 'intro').map((f) => captionText(f.say));
    expect(texts('reverse', 'id').filter((t) => t.includes('MOVE'))).toHaveLength(4);
    expect(texts('reverse', 'id').find((t) => t.includes('MOVE'))).toContain('stays put was after it in the old list');
    expect(texts('reverse', 'none').some((t) => t.includes('MOVE'))).toBe(false);
  });
});

describe('node statuses colour the trees from the patches', () => {
  it('before any step nothing is coloured; after all of them every node the diff reached is', () => {
    const s = runDiff(TREE_OLD, TREE_PRESETS[0].next);
    expect(nodeStatuses(s, 0).old.size).toBe(0);
    const all = nodeStatuses(s, s.result.steps.length);
    expect([...all.old.values()].filter((v) => v === 'update')).toHaveLength(1);
    expect([...all.old.values()].filter((v) => v === 'same')).toHaveLength(3);
    expect(all.next.size).toBe(4);
  });

  it('a replace colours the whole old and new subtree orange, and nothing is visited inside it', () => {
    const s = runDiff(TREE_OLD, TREE_PRESETS[3].next);
    const all = nodeStatuses(s, s.result.steps.length);
    expect([...all.old.values()]).toEqual(['replace', 'replace', 'replace', 'replace']);
    expect([...all.next.values()]).toEqual(['replace', 'replace', 'replace', 'replace']);
  });

  it('a keyed insert colours only the new node; a removed node is red in the old tree', () => {
    const ins = runList('insert-start', 'id');
    const a = nodeStatuses(ins, ins.result.steps.length);
    expect([...a.next.values()].filter((v) => v === 'insert')).toHaveLength(1);
    expect([...a.old.values()].filter((v) => v === 'same')).toHaveLength(6);
    const del = runList('delete-middle', 'id');
    expect([...nodeStatuses(del, del.result.steps.length).old.values()].filter((v) => v === 'remove')).toHaveLength(1);
  });
});

describe('patch log lines', () => {
  it('describe each patch kind with the ids the model uses', () => {
    const s = runList('reverse', 'id');
    const lines = s.result.patches.map((p) => describePatch(p, () => '?'));
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.startsWith('MOVE #'))).toBe(true);
    const upd = runDiff(TREE_OLD, TREE_PRESETS[0].next).result.patches[0];
    expect(describePatch(upd, () => '?')).toBe('UPDATE #3 text “350 ml” → “450 ml”');
    const ins = runList('insert-start', 'id').result.patches[0];
    if (ins.op !== 'insert') throw new Error('expected an insert');
    expect(describePatch(ins, () => nodeSummary(ins.node))).toBe('INSERT <li> #7 “Fay” first in #1');
  });
});

