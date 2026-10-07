import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { boundFrames, countingFrames, radixFrames } from './frames';
import { answersFor, COUNT_PRESETS, firstBreak, INPUT_ORDERS, isSorted, nodeOf, RADIX_PRESETS, type BucketOrder } from './model';

const text = (f: { say?: unknown }) => captionText(f.say as never);

/** Every yes/no sequence that ends at a leaf. */
function allPaths(): boolean[][] {
  const out: boolean[][] = [];
  const go = (answers: boolean[]) => {
    const fr = boundFrames(answers, null);
    const last = fr[fr.length - 1];
    const node = nodeOf(last.path[last.path.length - 1]);
    if (node.kind === 'leaf') out.push(answers);
    else {
      go([...answers, true]);
      go([...answers, false]);
    }
  };
  go([]);
  return out;
}

describe('boundFrames', () => {
  it('ends every chip input at the leaf naming its sorted order, with the right comparison count', () => {
    for (const v of INPUT_ORDERS) {
      const fr = boundFrames(answersFor(v), v);
      const last = fr[fr.length - 1];
      const leaf = nodeOf(last.path[last.path.length - 1]);
      expect(leaf.kind).toBe('leaf');
      if (leaf.kind !== 'leaf') continue;
      const sortedLetters = (['a', 'b', 'c'] as const).slice().sort((x, y) => v[x] - v[y]).join(' < ');
      const say = text(last);
      expect(say).toContain(`the order is ${sortedLetters}`);
      expect(say).toContain(`after ${last.answers.length} comparison`);
      expect(fr).toHaveLength(last.answers.length + 1);
    }
  });

  it('walks all six manual paths, and says "only 2" exactly on the two short ones', () => {
    const paths = allPaths();
    expect(paths).toHaveLength(6);
    for (const p of paths) {
      const say = text(boundFrames(p, null).at(-1)!);
      expect(say.includes('needed only 2'), p.join()).toBe(p.length === 2);
      expect(say).toContain('needs 3 comparisons on some input of three');
      expect(say).toContain('any input in that order ends here');
    }
  });

  it('every step caption states the comparison that was answered', () => {
    const v = INPUT_ORDERS[3];
    const fr = boundFrames(answersFor(v), v);
    fr.slice(1).forEach((f, i) => expect(text(f)).toContain(`Comparison ${i + 1}:`));
    expect(text(fr[1])).toContain('(2 < 3)');
  });
});

describe('countingFrames', () => {
  it('ends sorted and stable on every preset and on 200 seeded lists', () => {
    const rnd = mulberry32(21);
    const lists = [...COUNT_PRESETS.map((p) => [...p.keys]), ...Array.from({ length: 200 }, () => Array.from({ length: randInt(1, 12, rnd) }, () => randInt(0, 9, rnd)))];
    for (const keys of lists) {
      const fr = countingFrames(keys);
      const last = fr[fr.length - 1];
      expect(last.out.map((it) => it?.key)).toEqual([...keys].sort((a, b) => a - b));
      expect(text(last)).toContain('Sorted with 0 comparisons');
      expect(text(last)).toContain('stable');
      expect(last.work).toBe(2 * keys.length + 10);
    }
  });

  it('mentions stability exactly when an equal key was placed before', () => {
    const fr = countingFrames([...COUNT_PRESETS[0].keys]);
    const placeFrames = fr.filter((f) => f.phase === 'place');
    const seen = new Set<number>();
    for (const f of placeFrames) {
      const it = f.out[f.slot!]!;
      expect(text(f).includes('that is what stable means')).toBe(seen.has(it.key));
      seen.add(it.key);
    }
  });

  it('states each start as the running sum of counts', () => {
    const fr = countingFrames([...COUNT_PRESETS[0].keys]);
    const s4 = fr.find((f) => f.phase === 'start' && f.hotKey === 4)!;
    expect(text(s4)).toContain('start[4] = start[3] + count[3] = 3 + 2 = 5');
  });
});

describe('radixFrames', () => {
  const orders: BucketOrder[] = ['fifo', 'lifo'];

  it('every read-back caption matches the strip, for every preset and bucket order', () => {
    for (const p of RADIX_PRESETS) {
      for (const order of orders) {
        const fr = radixFrames([...p.keys], order);
        for (const f of fr.filter((x) => x.collected && !x.done && x.pass !== null)) {
          const broken = firstBreak(f.strip, f.pass! + 1);
          expect(text(f).includes('not in order'), `${p.id} ${order} pass ${f.pass}`).toBe(broken !== null);
        }
        const last = fr[fr.length - 1];
        expect(text(last).startsWith(isSorted(last.strip) ? 'Sorted' : 'Not sorted'), `${p.id} ${order}`).toBe(true);
        expect(isSorted(last.strip)).toBe(order === 'fifo');
        const broken = firstBreak(last.strip, 3);
        if (broken) expect(text(last)).toContain(`${String(broken[0].key).padStart(3, '0')} still comes before ${String(broken[1].key).padStart(3, '0')}`);
      }
    }
  });

  it('counts one digit read per number per pass', () => {
    const keys = [...RADIX_PRESETS[0].keys];
    const fr = radixFrames(keys, 'fifo');
    expect(fr[fr.length - 1].reads).toBe(3 * keys.length);
  });

  it('names the bucket each number joins', () => {
    const fr = radixFrames([457, 329], 'fifo');
    expect(text(fr[1])).toContain('457: ones digit 7, so it joins bucket 7');
  });
});
