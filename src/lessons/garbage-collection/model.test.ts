import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { genFrames, markSweepFrames } from './frames';
import {
  afterSweep, compact, dangling, freeSpace, mark, minorCollect, minorMark, pauseOf, refCounts, shortLivedRuns, sweep, writeField, PAUSE, type Heap, type Obj,
} from './model';
import { GEN_START, NURSERY_SLOTS, PRESETS } from './presets';

/** Independent reference: recursive depth-first reachability. */
function reachable(h: Heap, starts: (string | null)[], ok: (o: Obj) => boolean = () => true): Set<string> {
  const m = new Map(h.objects.map((o) => [o.id, o]));
  const seen = new Set<string>();
  const visit = (id: string | null) => {
    if (id === null || seen.has(id) || !m.has(id) || !ok(m.get(id)!)) return;
    seen.add(id);
    for (const f of m.get(id)!.fields) visit(f.to);
  };
  starts.forEach(visit);
  return seen;
}

function randomHeap(seed: number): Heap {
  const rnd = mulberry32(seed);
  const n = 1 + Math.floor(rnd() * 12);
  const ids = Array.from({ length: n }, (_, i) => `o${i}`);
  const pick = () => (rnd() < 0.25 ? null : ids[Math.floor(rnd() * n)]);
  const objects: Obj[] = ids.map((id, i) => ({
    id, label: id, slot: i, gen: rnd() < 0.5 ? 'young' : 'old', age: 0,
    fields: Array.from({ length: Math.floor(rnd() * 3) }, (_, k) => ({ name: `f${k}`, to: pick() })),
  }));
  const roots = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, k) => ({ id: `r${k}`, label: `r${k}`, kind: 'stack' as const, to: pick() }));
  return { slots: 12, objects, roots };
}

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);

describe('mark and sweep', () => {
  it('mark finds exactly what DFS reaches, on every preset and 500 random heaps', () => {
    const heaps = [...PRESETS.map((p) => p.heap), ...SEEDS.map(randomHeap)];
    for (const h of heaps) {
      const want = reachable(h, h.roots.map((r) => r.to));
      const got = mark(h).marked;
      expect(new Set(got)).toEqual(want);
      expect(got).toHaveLength(want.size);
      // Sweep frees exactly the rest.
      expect(new Set(sweep(h, got))).toEqual(new Set(h.objects.map((o) => o.id).filter((id) => !want.has(id))));
      expect(dangling(afterSweep(h, sweep(h, got)))).toEqual([]);
    }
  });

  it('the tri-colour invariant holds at every step: no black object points at a white one', () => {
    for (const h of [...PRESETS.map((p) => p.heap), ...SEEDS.slice(0, 100).map(randomHeap)]) {
      const m = new Map(h.objects.map((o) => [o.id, o]));
      for (const s of mark(h).steps) {
        const shaded = new Set([...s.gray, ...s.black]);
        for (const b of s.black) for (const f of m.get(b)!.fields) if (f.to !== null && m.has(f.to)) expect(shaded.has(f.to)).toBe(true);
      }
    }
  });

  it('the cycle preset: both nodes are collected, though each has a reference count of 1', () => {
    const h = PRESETS.find((p) => p.id === 'cycle')!.heap;
    const freed = sweep(h, mark(h).marked);
    expect(freed).toEqual(['a', 'b']);
    expect(refCounts(h).get('a')).toBe(1);
    expect(refCounts(h).get('b')).toBe(1);
  });

  it('compaction keeps every reference pointing at the same object and leaves one free run', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const h0 = randomHeap(seed);
      const h = afterSweep(h0, sweep(h0, mark(h0).marked));
      const { heap } = compact(h);
      expect(heap.objects.map((o) => o.id)).toEqual([...h.objects].sort((a, b) => a.slot - b.slot).map((o) => o.id));
      expect(heap.objects.map((o) => o.slot)).toEqual(heap.objects.map((_, i) => i));
      expect(heap.objects.map((o) => o.fields)).toEqual([...h.objects].sort((a, b) => a.slot - b.slot).map((o) => o.fields));
      const space = freeSpace(heap);
      expect(space.largestRun).toBe(space.free);
    }
  });

  it('freeSpace against brute force', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const h = randomHeap(seed);
      const used = h.objects.map((o) => o.slot);
      let best = 0;
      for (let a = 0; a < h.slots; a++) for (let b = a; b < h.slots; b++) {
        if (used.some((s) => s >= a && s <= b)) break;
        best = Math.max(best, b - a + 1);
      }
      expect(freeSpace(h).largestRun).toBe(best);
    }
  });

  it('the pause is a named cost per live object and per slot', () => {
    expect(pauseOf(9, 12, false).totalUs).toBe(9 * PAUSE.markPerLive + 12 * PAUSE.sweepPerSlot);
    expect(pauseOf(9, 12, true).totalUs).toBe(9 * PAUSE.markPerLive + 12 * PAUSE.sweepPerSlot + 9 * PAUSE.movePerLive);
    expect(pauseOf(10, 12, false).totalUs).toBeGreaterThan(pauseOf(9, 12, false).totalUs);
  });
});

describe('generational', () => {
  /** A complete remembered set: every old object holding a young reference. */
  const fullRemembered = (h: Heap) => {
    const m = new Map(h.objects.map((o) => [o.id, o]));
    return h.objects.filter((o) => o.gen === 'old' && o.fields.some((f) => f.to !== null && m.get(f.to)?.gen === 'young')).map((o) => o.id);
  };

  it('with the remembered set, a minor GC marks exactly the young objects reachable from roots or old objects', () => {
    for (const seed of SEEDS) {
      const h = randomHeap(seed);
      const old = h.objects.filter((o) => o.gen === 'old');
      // Reference: a full trace from the roots and every old object, restricted to young objects.
      const starts = [...h.roots.map((r) => r.to), ...old.flatMap((o) => o.fields.map((f) => f.to))];
      const want = reachable(h, starts, (o) => o.gen === 'young');
      expect(new Set(minorMark(h, fullRemembered(h)).marked)).toEqual(want);
    }
  });

  it('without it, a young object referenced only from an old one is wrongly freed', () => {
    const withEntry: Heap = { ...GEN_START, objects: [...GEN_START.objects, { id: 'en', label: 'entry', slot: 4, gen: 'young', age: 0, fields: [] }] };
    const on = writeField(withEntry, [], 'c', 'last', 'en', true);
    const off = writeField(withEntry, [], 'c', 'last', 'en', false);
    expect(on.remembered).toEqual(['c']);
    expect(off.remembered).toEqual([]);
    const keep = minorCollect(on.heap, minorMark(on.heap, on.remembered).marked, NURSERY_SLOTS);
    const lose = minorCollect(off.heap, minorMark(off.heap, off.remembered).marked, NURSERY_SLOTS);
    expect(keep.freed).not.toContain('en');
    expect(lose.freed).toContain('en');
    expect(dangling(keep.heap)).toEqual([]);
    expect(dangling(lose.heap)).toEqual([{ from: 'c', field: 'last', to: 'en' }]);
  });

  it('the write barrier records only old → young stores', () => {
    const h: Heap = { ...GEN_START, objects: [...GEN_START.objects, { id: 'en', label: 'entry', slot: 4, gen: 'young', age: 0, fields: [{ name: 'x', to: null }] }] };
    expect(writeField(h, [], 'c', 'opts', 'cfg', true).remembered).toEqual([]); // old → old
    expect(writeField(h, [], 'en', 'x', 'bd', true).remembered).toEqual([]); // young → young
    expect(writeField(h, [], 'c', 'last', 'en', true).remembered).toEqual(['c']);
  });

  it('survivors age, and are promoted into a free old slot after PROMOTE_AGE minor GCs', () => {
    const frames = genFrames(GEN_START, true);
    const end = frames.at(-1)!.heap;
    const entry = end.objects.find((o) => o.id === 'en')!;
    expect(entry.gen).toBe('old');
    expect(entry.slot).toBeGreaterThanOrEqual(NURSERY_SLOTS);
    expect(new Set(end.objects.map((o) => o.slot)).size).toBe(end.objects.length);
    expect(end.objects.filter((o) => o.gen === 'young').map((o) => o.id)).toEqual([]);
    expect(frames.some((f) => f.promoted.includes('en'))).toBe(true);
  });

  it('the barrier-off run ends with a dangling cache.last and says so', () => {
    const frames = genFrames(GEN_START, false);
    expect(dangling(frames.at(-1)!.heap)).toHaveLength(1);
    expect(frames.map((f) => captionText(f.say)).some((t) => t.includes('points at freed memory'))).toBe(true);
    expect(genFrames(GEN_START, true).map((f) => captionText(f.say)).some((t) => t.includes('freed memory'))).toBe(false);
  });

  it('many short-lived objects: many short minor pauses against a few long full ones', () => {
    const { generational, full } = shortLivedRuns();
    const max = (r: typeof full) => Math.max(...r.pauses.map((p) => p.us));
    expect(generational.pauses.length).toBeGreaterThan(full.pauses.length);
    expect(max(generational)).toBeLessThan(max(full) / 4);
    // Each full GC traces more survivors than the one before.
    full.pauses.forEach((p, i) => i && expect(p.live).toBeGreaterThan(full.pauses[i - 1].live));
  });
});

describe('mark-sweep captions on every preset × compact', () => {
  for (const p of PRESETS) {
    for (const compactOn of [false, true]) {
      it(`${p.id} compact=${compactOn}`, () => {
        const run = markSweepFrames(p.heap, compactOn);
        const texts = run.frames.map((f) => captionText(f.say));
        for (const t of texts) expect(t).not.toMatch(/undefined|NaN|null/);
        expect(texts.at(-1)).toContain(`${run.pause.totalUs.toLocaleString('en-US')} µs`);
        const fragNote = texts.find((t) => t.startsWith('Swept.'))!;
        const space = freeSpace(afterSweep(p.heap, run.freed));
        expect(fragNote.includes('fragmentation')).toBe(space.largestRun < space.free);
        expect(texts.some((t) => t.includes('reference count'))).toBe(p.id === 'cycle');
        expect(texts.some((t) => t.startsWith('Compact'))).toBe(compactOn);
        if (compactOn) expect(freeSpace(run.final).largestRun).toBe(freeSpace(run.final).free);
      });
    }
  }
});
