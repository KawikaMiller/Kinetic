import { describe, expect, it } from 'vitest';
import {
  DOM, DOM_ROOT, FORCED_LINE, LONG_FRAME_MS, THRASH_TAGS, PROPERTIES, PROPERTY_INFO, RESTYLABLE, STAGES, THRASH_ROWS, THRASH_SOURCE, UA_HIDDEN,
  buildRenderTree, domOrder, forcedLayouts, frameStats, isCompositeOnly, median, runThrash, stagesRerun, thrashOps,
  type HideStyle, type Property, type RowIo, type StageId, type Styles, type ThrashOp,
} from './model';

// ── Property → stages ────────────────────────────────────────────────────

/** A csstriggers-style list, written by hand from the documented behaviour (Chromium). */
const DOCUMENTED: Record<Property, { plain: StageId[]; promoted: StageId[] }> = {
  width: { plain: ['style', 'layout', 'paint', 'composite'], promoted: ['style', 'layout', 'paint', 'composite'] },
  top: { plain: ['style', 'layout', 'paint', 'composite'], promoted: ['style', 'layout', 'paint', 'composite'] },
  color: { plain: ['style', 'paint', 'composite'], promoted: ['style', 'paint', 'composite'] },
  background: { plain: ['style', 'paint', 'composite'], promoted: ['style', 'paint', 'composite'] },
  'box-shadow': { plain: ['style', 'paint', 'composite'], promoted: ['style', 'paint', 'composite'] },
  transform: { plain: ['style', 'paint', 'composite'], promoted: ['style', 'composite'] },
  opacity: { plain: ['style', 'paint', 'composite'], promoted: ['style', 'composite'] },
};

describe('which stages a property change re-runs', () => {
  it('matches the documented list for every property, plain and promoted', () => {
    for (const p of PROPERTIES) {
      expect(stagesRerun(p, false), `${p} plain`).toEqual(DOCUMENTED[p].plain);
      expect(stagesRerun(p, true), `${p} promoted`).toEqual(DOCUMENTED[p].promoted);
    }
    expect(Object.keys(DOCUMENTED).sort()).toEqual([...PROPERTIES].sort());
  });

  it('never re-parses, always recomputes style, and keeps pipeline order', () => {
    for (const p of PROPERTIES) {
      for (const promoted of [false, true]) {
        const stages = stagesRerun(p, promoted);
        expect(stages).not.toContain('parse-html');
        expect(stages).not.toContain('parse-css');
        expect(stages[0]).toBe('style');
        expect(stages.at(-1)).toBe('composite');
        const positions = stages.map((s) => STAGES.indexOf(s));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    }
  });

  it('a layout change also repaints and recomposites (what is downstream of it re-runs)', () => {
    for (const p of PROPERTIES.filter((x) => PROPERTY_INFO[x].trigger === 'layout')) {
      expect(stagesRerun(p, false)).toEqual(expect.arrayContaining(['layout', 'paint', 'composite']));
    }
  });

  it('only transform and opacity can skip paint, and only when promoted', () => {
    for (const p of PROPERTIES) {
      const skipsPaint = !stagesRerun(p, true).includes('paint');
      expect(skipsPaint).toBe(p === 'transform' || p === 'opacity');
      expect(stagesRerun(p, false)).toContain('paint');
    }
    expect(isCompositeOnly(stagesRerun('transform', true))).toBe(true);
    expect(isCompositeOnly(stagesRerun('transform', false))).toBe(false);
    expect(isCompositeOnly(stagesRerun('box-shadow', true))).toBe(false);
  });
});

// ── The thrash loop ───────────────────────────────────────────────────────

/** An io that records what the loop did, in order. */
function recorder(): { io: RowIo; ops: ThrashOp[] } {
  const ops: ThrashOp[] = [];
  return {
    ops,
    io: {
      read: (row) => (ops.push({ kind: 'read', row }), row + 1),
      write: (row) => void ops.push({ kind: 'write', row }),
    },
  };
}

describe('the layout-thrashing loop', () => {
  it('the interleaved loop reads then writes row by row; the batched one reads every row, then writes every row', () => {
    const a = recorder();
    runThrash('interleaved', 4, a.io, 70);
    expect(a.ops.map((o) => `${o.kind[0]}${o.row}`)).toEqual(['r0', 'w0', 'r1', 'w1', 'r2', 'w2', 'r3', 'w3']);
    const b = recorder();
    runThrash('batched', 4, b.io, 70);
    expect(b.ops.map((o) => `${o.kind[0]}${o.row}`)).toEqual(['r0', 'r1', 'r2', 'r3', 'w0', 'w1', 'w2', 'w3']);
  });

  it('what the loops really do equals the generated op list, for the real row count', () => {
    for (const mode of ['interleaved', 'batched'] as const) {
      const r = recorder();
      runThrash(mode, THRASH_ROWS, r.io, 70);
      expect(r.ops).toEqual(thrashOps(mode, THRASH_ROWS));
    }
  });

  it('both loops read the same numbers: only the order differs', () => {
    const rows = 25;
    const read = (row: number) => 10 + row;
    const a = runThrash('interleaved', rows, { read, write: () => {} }, 1);
    const b = runThrash('batched', rows, { read, write: () => {} }, 1);
    expect(a).toBe(b);
    expect(a).toBe(Array.from({ length: rows }, (_, i) => 10 + i).reduce((x, y) => x + y));
  });

  it('forced layouts: every read after the first write in the interleaved loop, none in the batched one', () => {
    expect(forcedLayouts(thrashOps('interleaved', THRASH_ROWS))).toBe(THRASH_ROWS - 1);
    expect(forcedLayouts(thrashOps('batched', THRASH_ROWS))).toBe(0);
    expect(forcedLayouts(thrashOps('interleaved', THRASH_ROWS), true)).toBe(THRASH_ROWS);
    expect(forcedLayouts(thrashOps('batched', THRASH_ROWS), true)).toBe(1);
    expect(forcedLayouts([])).toBe(0);
    // Hand-worked: read, write, write, read, read -> only the first read after the writes is stale.
    const ops: ThrashOp[] = [
      { kind: 'read', row: 0 }, { kind: 'write', row: 0 }, { kind: 'write', row: 1 }, { kind: 'read', row: 1 }, { kind: 'read', row: 2 },
    ];
    expect(forcedLayouts(ops)).toBe(1);
  });

  it('the code panel shows the same shape the loops have', () => {
    const inter = THRASH_SOURCE.interleaved;
    const readLine = inter.findIndex((l) => l.includes('offsetHeight'));
    const writeLine = inter.findIndex((l) => l.includes('style.width'));
    expect(inter[0]).toMatch(/^for \(/);
    expect(readLine).toBeGreaterThan(0);
    expect(writeLine).toBe(readLine + 1);
    expect(FORCED_LINE.interleaved).toBe(readLine);
    const batched = THRASH_SOURCE.batched;
    const bRead = batched.findIndex((l) => l.includes('offsetHeight'));
    const bWrite = batched.findIndex((l) => l.includes('style.width'));
    expect(bRead).toBeLessThan(bWrite);
    expect(batched.slice(bRead + 1, bWrite).some((l) => l.includes('offsetHeight'))).toBe(false);
    expect(FORCED_LINE.batched).toBe(-1);
  });

  it('the tags sit on the lines they describe', () => {
    const inter = THRASH_SOURCE.interleaved;
    expect(inter[Number(Object.keys(THRASH_TAGS.interleaved)[0])]).toContain('offsetHeight');
    expect(THRASH_TAGS.interleaved[FORCED_LINE.interleaved]).toBe('forces layout');
    const batched = THRASH_SOURCE.batched;
    expect(batched[1]).toContain('offsetHeight');
    expect(THRASH_TAGS.batched[1]).toBe('reads');
    expect(batched[4]).toContain('style.width');
    expect(THRASH_TAGS.batched[4]).toBe('writes');
  });

  it('median picks the middle of an odd list whatever its order', () => {
    expect(median([5, 1, 9, 3, 7])).toBe(5);
    expect(median([2])).toBe(2);
    expect(median([30, 10, 20])).toBe(20);
  });
});

// ── Frame stats ───────────────────────────────────────────────────────────

describe('frame stats', () => {
  it('reports the last, the worst and the long frames', () => {
    const s = frameStats([16.7, 16.6, 120, 16.7, 51, LONG_FRAME_MS]);
    expect(s).toEqual({ last: LONG_FRAME_MS, worst: 120, longFrames: 2 });
  });

  it('is all zeros for no frames', () => {
    expect(frameStats([])).toEqual({ last: 0, worst: 0, longFrames: 0 });
  });
});

// ── The render tree ───────────────────────────────────────────────────────

const CHOICES: HideStyle[] = ['normal', 'display-none', 'visibility-hidden'];
const allStyles = (): Styles[] =>
  CHOICES.flatMap((nav) => CHOICES.flatMap((note) => CHOICES.map((list) => ({ nav, note, list }))));

/** Brute-force reference: walk from each node up to the root. */
function parentOf(id: string): string | null {
  return Object.values(DOM).find((n) => n.children.includes(id))?.id ?? null;
}
function ancestorsAndSelf(id: string): string[] {
  const out: string[] = [];
  for (let at: string | null = id; at; at = parentOf(at)) out.push(at);
  return out;
}

describe('the render tree', () => {
  it('a node has a box exactly when no ancestor-or-self is display: none (or hidden by the browser itself)', () => {
    for (const styles of allStyles()) {
      const { inTree } = buildRenderTree(styles);
      for (const id of domOrder()) {
        const chain = ancestorsAndSelf(id);
        const expected = chain.every((a) => !UA_HIDDEN.has(a) && styles[a] !== 'display-none');
        expect(inTree.has(id), `${id} with ${JSON.stringify(styles)}`).toBe(expected);
      }
    }
  });

  it('visibility: hidden keeps the box (and its children\'s) in the tree but unpainted; display: none does not', () => {
    const hiddenList = buildRenderTree({ list: 'visibility-hidden' });
    for (const id of ['list', 'item1', 'item2']) {
      expect(hiddenList.inTree.has(id)).toBe(true);
      expect(hiddenList.unpainted.has(id)).toBe(true);
    }
    expect(hiddenList.unpainted.has('intro')).toBe(false);
    const goneList = buildRenderTree({ list: 'display-none' });
    for (const id of ['list', 'item1', 'item2']) expect(goneList.inTree.has(id)).toBe(false);
    expect(goneList.inTree.has('intro')).toBe(true);
  });

  it('display: none wins over an inherited visibility: hidden, and an unpainted node is always in the tree', () => {
    for (const styles of allStyles()) {
      const { inTree, unpainted } = buildRenderTree(styles);
      for (const id of unpainted) expect(inTree.has(id)).toBe(true);
    }
  });

  it('<head> is in the DOM but never in the render tree, and the default page has 11 boxes for its 13 nodes', () => {
    const { inTree } = buildRenderTree({});
    expect(domOrder()).toHaveLength(13);
    expect(inTree.has('head')).toBe(false);
    expect(inTree.has('title')).toBe(false);
    expect(inTree.size).toBe(11);
  });

  it('only the three restylable elements exist in the DOM and domOrder lists the whole tree once', () => {
    for (const id of RESTYLABLE) expect(DOM[id]).toBeDefined();
    const order = domOrder();
    expect(new Set(order).size).toBe(order.length);
    expect(order[0]).toBe(DOM_ROOT);
    expect(order).toHaveLength(Object.keys(DOM).length);
  });
});
