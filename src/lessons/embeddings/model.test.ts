import { describe, expect, it } from 'vitest';
import { cosine, dot, norm } from '../../core/vec';
import {
  ANALOGIES, DIMS, DOCUMENTS, MAP, MAP_POINTS, TOP_K, VOCAB, analogy, keywordOverlap, lookup, misleadingPair, neighbours,
  phraseVector, project, rankDocuments, tokenize,
} from './model';
import { covariance, pca, topEigen } from '../../core/linalg';

/** Reference: the cyclic Jacobi eigenvalue method for a symmetric matrix (independent of power iteration). */
function jacobi(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const [akp, akq] = [a[k][p], a[k][q]];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const [apk, aqk] = [a[p][k], a[q][k]];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const [vkp, vkq] = [v[k][p], v[k][q]];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = a.map((_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

describe('the toy vocabulary', () => {
  it('has about 60 distinct words, each an 8-number vector on the named dimensions', () => {
    expect(VOCAB.length).toBeGreaterThanOrEqual(55);
    expect(VOCAB.length).toBeLessThanOrEqual(65);
    expect(new Set(VOCAB.map((w) => w.word)).size).toBe(VOCAB.length);
    VOCAB.forEach((w) => {
      expect(w.v).toHaveLength(DIMS.length);
      expect(norm(w.v)).toBeGreaterThan(0);
    });
  });
});

describe('neighbours', () => {
  it('equal a brute-force cosine sort over the whole vocabulary, for every word', () => {
    for (const w of VOCAB) {
      const brute = VOCAB.filter((x) => x !== w)
        .map((x) => ({ word: x.word, c: dot(w.v, x.v) / (norm(w.v) * norm(x.v)) }))
        .sort((p, q) => q.c - p.c || p.word.localeCompare(q.word))
        .slice(0, TOP_K);
      const got = neighbours(w.v, TOP_K, [w.word]);
      expect(got.map((n) => n.word.word)).toEqual(brute.map((b) => b.word));
      got.forEach((n, i) => expect(n.cos).toBeCloseTo(brute[i].c, 12));
    }
  });

  it('a zero vector has no neighbours instead of NaN scores', () => {
    expect(neighbours(new Array(DIMS.length).fill(0))).toEqual([]);
  });
});

describe('phrases', () => {
  it('the phrase vector is the mean of its known words, unknown words listed once', () => {
    const p = phraseVector('Fixing my VEHICLE, my car!');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.known).toEqual(['fixing', 'vehicle', 'car']);
    expect(p.unknown).toEqual(['my']);
    const mean = DIMS.map((_, i) => (lookup('fixing')!.v[i] + lookup('vehicle')!.v[i] + lookup('car')!.v[i]) / 3);
    p.vector.forEach((x, i) => expect(x).toBeCloseTo(mean[i], 12));
  });

  it('hostile input is defined: empty, all-unknown, digits, emoji and markup give a message or are ignored, never NaN', () => {
    expect(phraseVector('')).toMatchObject({ ok: false, reason: 'Type a word or a short phrase.' });
    expect(phraseVector('   ')).toMatchObject({ ok: false });
    expect(phraseVector('the quick xylophone')).toMatchObject({ ok: false, reason: 'None of these words are in this toy vocabulary.', unknown: ['the', 'quick', 'xylophone'] });
    expect(phraseVector('1e400 -1')).toMatchObject({ ok: false, unknown: ['e'] });
    expect(tokenize('<b>cat</b> 🐱, dog,,puppy')).toEqual(['b', 'cat', 'b', 'dog', 'puppy']);
    const p = phraseVector('<b>cat</b> 🐱');
    expect(p.ok && p.vector.every(Number.isFinite)).toBe(true);
    expect(phraseVector('9'.repeat(23))).toMatchObject({ ok: false, reason: 'Type a word or a short phrase.' });
  });

  it('"car repair" and "fixing my vehicle" share no words but their toy vectors point almost the same way', () => {
    expect(keywordOverlap('car repair', 'fixing my vehicle')).toEqual({ shared: [], score: 0 });
    const a = phraseVector('car repair');
    const b = phraseVector('fixing my vehicle');
    expect(a.ok && b.ok && cosine(a.vector, b.vector)).toBeGreaterThan(0.95);
  });

  it('keyword overlap is Jaccard over the typed words', () => {
    expect(keywordOverlap('cat food', 'dog food')).toEqual({ shared: ['food'], score: 1 / 3 });
    expect(keywordOverlap('', '')).toEqual({ shared: [], score: 0 });
  });
});

describe('analogies', () => {
  it('puppy − dog + cat lands on kitten (built into the toy vectors on purpose)', () => {
    const r = analogy(ANALOGIES.find((a) => a.id === 'kitten')!);
    expect(r.holds).toBe(true);
    expect(r.top[0].word.word).toBe('kitten');
  });

  it('cow − big + small does NOT land on calf: in these dimensions small is not young', () => {
    const r = analogy(ANALOGIES.find((a) => a.id === 'calf')!);
    expect(r.holds).toBe(false);
    expect(r.top.map((n) => n.word.word)).not.toContain('calf');
  });

  it('never answers with one of its own input words', () => {
    for (const a of ANALOGIES) expect(analogy(a).top.map((n) => n.word.word)).not.toEqual(expect.arrayContaining([a.a]));
  });
});

describe('PCA', () => {
  const cov = covariance(VOCAB.map((w) => w.v));
  const ref = jacobi(cov);

  it('the axes are orthonormal', () => {
    const [u, v] = MAP.axes;
    expect(norm(u)).toBeCloseTo(1, 10);
    expect(norm(v)).toBeCloseTo(1, 10);
    expect(dot(u, v)).toBeCloseTo(0, 10);
  });

  it('match the reference eigen-decomposition of the 8×8 covariance (up to sign), with variances in decreasing order', () => {
    MAP.axes.forEach((axis, i) => {
      expect(Math.abs(dot(axis, ref.vectors[i]))).toBeCloseTo(1, 8);
      expect(MAP.variances[i]).toBeCloseTo(ref.values[i], 10);
    });
    expect(MAP.variances[0]).toBeGreaterThanOrEqual(MAP.variances[1]);
    expect(ref.values[1]).toBeGreaterThan(ref.values[2] + 1e-6);
    expect(MAP.total).toBeCloseTo(ref.values.reduce((s, x) => s + x, 0), 10);
  });

  it('power iteration finds every eigenpair of the covariance, in decreasing order', () => {
    const all = topEigen(cov, DIMS.length);
    all.values.forEach((v, i) => expect(v).toBeCloseTo(ref.values[i], 8));
  });

  it('projecting the mean gives the origin, and each map point is (x − mean)·axis', () => {
    expect(project(MAP, MAP.mean).map((x) => Math.abs(x) < 1e-12)).toEqual([true, true]);
    const w = VOCAB[7];
    const x = w.v.map((c, i) => c - MAP.mean[i]);
    expect(MAP_POINTS[7][0]).toBeCloseTo(dot(x, MAP.axes[0]), 12);
    const axis = pca([[1, 0], [-1, 0], [0, 0.5], [0, -0.5]]).axes[0];
    expect(Math.abs(axis[0])).toBeCloseTo(1, 12);
    expect(axis[1]).toBeCloseTo(0, 12);
  });

  it('the misleading pair is close on the map but has a low cosine in 8-D', () => {
    const p = misleadingPair();
    expect(p.cos).toBeLessThanOrEqual(0.3);
    const spread = Math.max(...MAP_POINTS.map((q) => q[0])) - Math.min(...MAP_POINTS.map((q) => q[0]));
    expect(p.dist2d).toBeLessThan(spread * 0.05);
  });
});

describe('document search', () => {
  it('ranks every document by cosine exactly as a brute-force sort would', () => {
    for (const q of ['car repair', 'kitten', 'sweet food', 'fixing my vehicle', 'big animal']) {
      const qv = phraseVector(q);
      if (!qv.ok) throw new Error(q);
      const brute = DOCUMENTS.map((d, i) => {
        const dv = phraseVector(d);
        return { i, c: dv.ok ? cosine(qv.vector, dv.vector) : -Infinity };
      }).sort((a, b) => b.c - a.c || a.i - b.i);
      expect(rankDocuments(qv.vector).map((r) => r.index)).toEqual(brute.map((b) => b.i));
    }
  });

  it('the car-repair query puts the garage and tyre documents first, ahead of the keyword-free animal ones', () => {
    const q = phraseVector('car repair');
    if (!q.ok) throw new Error();
    const r = rankDocuments(q.vector).map((x) => x.doc);
    expect(r.slice(0, 2)).toEqual(['garage mechanic service prices', 'my car needs a new tyre']);
  });
});
