import { describe, expect, it } from 'vitest';
import { pct } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { cacheFrames, elementName, hex } from './frames';
import lesson from './index';
import { hitRate, sceneAddresses, sceneFor, simulateCache, CACHE, tally, type LayoutId, type Order } from './model';

const LAYOUTS: LayoutId[] = ['small', 'wide', 'stride', 'structs'];
const ORDERS: Order[] = ['rows', 'cols'];

describe('every layout × loop order: one caption per access, each true to it', () => {
  for (const layout of LAYOUTS) {
    for (const order of ORDERS) {
      it(`${layout}, ${order}`, () => {
        const s = sceneFor(layout, order);
        const { accesses, frames } = cacheFrames(s);
        expect(frames).toHaveLength(accesses.length + 2);
        accesses.forEach((a, i) => {
          const f = frames[i + 1];
          expect(f.i).toBe(i);
          const text = captionText(f.say);
          const [r, c] = s.visits[i];
          expect(text.startsWith(`${elementName(s, r, c)} at ${hex(a.addr)}: tag ${hex(a.split.tag)}, set ${a.split.set}, offset ${a.split.offset}.`)).toBe(true);
          expect(text.includes('Hit:')).toBe(a.hit);
          expect(text.includes(`Miss (${a.kind})`)).toBe(!a.hit);
          expect(text.includes('LRU throws out')).toBe(a.evicted !== null);
          if (a.evicted !== null) expect(text).toContain(`line ${hex(a.evicted)} (way ${a.way})`);
        });
        const last = captionText(frames[frames.length - 1].say);
        const t = tally(accesses);
        expect(last).toContain(`${t.hits} hit`);
        expect(last).toContain(`(${t.compulsory} compulsory, ${t.capacity} capacity, ${t.conflict} conflict)`);
        expect(last).toContain(`Hit rate ${pct(hitRate(t))}`);
        expect(last.includes('fits in this 512-byte cache')).toBe(layout === 'small');
      });
    }
  }
});

describe('element names match the loop', () => {
  it('array of structs reads p[i].x; struct of arrays reads p.x[i]', () => {
    const aos = sceneFor('structs', 'rows');
    expect(aos.visits.map(([r, c]) => elementName(aos, r, c)).slice(0, 2)).toEqual(['p[0].x', 'p[1].x']);
    expect(aos.visits.every(([r, c]) => aos.field!(r, c) === 'x')).toBe(true);
    const soa = sceneFor('structs', 'cols');
    expect(soa.visits.map(([r, c]) => elementName(soa, r, c)).slice(0, 2)).toEqual(['p.x[0]', 'p.x[1]']);
    expect(soa.visits.every(([r, c]) => soa.field!(r, c) === 'x')).toBe(true);
  });
});

describe('numbers quoted in the lesson come from the model', () => {
  const rate = (l: LayoutId, o: Order) => hitRate(tally(simulateCache(sceneAddresses(sceneFor(l, o)), CACHE)));
  it('the 16 × 16 tip: 94% against 0%', () => {
    expect(lesson.tryThis[0]).toContain(`a ${pct(rate('wide', 'rows'))} hit rate against ${pct(rate('wide', 'cols'))}`);
  });
  it('quiz: 16 misses row-wise over a[16][16]', () => {
    const t = tally(simulateCache(sceneAddresses(sceneFor('wide', 'rows')), CACHE));
    const q = lesson.quiz[4];
    expect(q.options[q.answer]).toBe(`${t.misses} misses`);
  });
  it('quiz: the set bits for 64-byte lines and 4 sets are bits 6 and 7', () => {
    for (let addr = 0; addr < 1024; addr++) {
      const set = (addr >> 6) & 3;
      expect(simulateCache([addr], CACHE)[0].split.set).toBe(set);
    }
  });
});
