import { describe, expect, it } from 'vitest';
import { applyResult, initialEdits, loadPreset, noteFor, setGraph, withNote, type GraphEditConfig } from './graphEdits';
import type { Result } from './result';

type Id = 'one' | 'two';
interface G {
  edges: number[];
}

const CONFIG: GraphEditConfig<G, Id> = {
  presets: [{ id: 'one', label: 'First' }, { id: 'two', label: 'Second' }],
  initial: 'one',
  graphOf: (id) => (id === 'one' ? { edges: [1, 2] } : { edges: [1, 2, 3, 4] }),
  edgeCount: (g) => g.edges.length,
};

const addOne = (g: G): Result<G> => (g.edges.length >= 5 ? { ok: false, error: 'At most 5 edges.' } : { ok: true, value: { edges: [...g.edges, 9] } });

describe('graph edit transitions', () => {
  it('starts on the initial preset with no note and its edges as the baseline', () => {
    const s = initialEdits(CONFIG);
    expect(s.presetId).toBe('one');
    expect(s.baseEdges).toBe(2);
    expect(noteFor(s, 'a')).toBe('');
  });

  it('loads a preset with a fresh baseline and the "Loaded <label>." note', () => {
    const s = loadPreset(CONFIG, 'two', 'a');
    expect(s).toMatchObject({ presetId: 'two', baseEdges: 4 });
    expect(noteFor(s, 'a')).toBe('Loaded Second.');
  });

  it('applies a good result and keeps a refused one as a note with the graph unchanged', () => {
    const s0 = initialEdits(CONFIG);
    const s1 = applyResult(s0, addOne(s0.graph), (g) => `Now ${g.edges.length} edges.`, undefined);
    expect(s1.graph.edges).toEqual([1, 2, 9]);
    expect(noteFor(s1, undefined)).toBe('Now 3 edges.');
    const full = setGraph(s1, { edges: [1, 2, 3, 4, 5] }, 'Filled.', undefined);
    const s2 = applyResult(full, addOne(full.graph), 'never shown', undefined);
    expect(s2.graph).toBe(full.graph);
    expect(noteFor(s2, undefined)).toBe('At most 5 edges.');
  });

  it('keys a note to the scene it was written in, and shows nothing in another scene', () => {
    const s = withNote(initialEdits(CONFIG), 'Selected a-b.', 'cut');
    expect(noteFor(s, 'cut')).toBe('Selected a-b.');
    expect(noteFor(s, 'augment')).toBe('');
    expect(noteFor(withNote(s, 'shared', undefined), undefined)).toBe('shared');
  });

  it('counts only the edges added over the preset (baseline stays at the preset size)', () => {
    let s = initialEdits(CONFIG);
    for (let i = 0; i < 3; i++) s = applyResult(s, addOne(s.graph), 'ok', undefined);
    expect(CONFIG.edgeCount(s.graph) - s.baseEdges).toBe(3);
    s = loadPreset(CONFIG, 'two', undefined);
    expect(CONFIG.edgeCount(s.graph) - s.baseEdges).toBe(0);
  });
});
