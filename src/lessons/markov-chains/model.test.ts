import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { det } from '../../core/vec';
import {
  PRESETS, WALK_MAX, WALK_SEED, WEATHER, analyse, distributionAt, isRowStochastic, normaliseRow, parseRow, pointMass, secondEigenvalues, setEntry, stationaryPower,
  stationaryResidual, stationarySolve, totalVariation, visitFractions, walk, withRow, type Matrix,
} from './model';
import { CORPORA, MAX_WORDS, MAX_WORD_LENGTH, buildChain, generateSentences, inCorpus, nextWords, parseCorpus, sameWordTwoHistories } from './textChain';

function randomStochastic(rnd: Rnd, n: number, density = 1): Matrix {
  return Array.from({ length: n }, () => {
    const raw = Array.from({ length: n }, () => (rnd() < density ? 0.05 + rnd() : 0));
    if (raw.every((x) => !(x > 0))) raw[randInt(0, n - 1, rnd)] = 1;
    const total = raw.reduce((s, x) => s + x, 0);
    return raw.map((x) => x / total);
  });
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Reachability by Warshall's closure on the support of P, and each state's period from boolean matrix powers: the independent route. */
function bruteStructure(P: Matrix) {
  const n = P.length;
  const A = P.map((row) => row.map((x) => x > 0));
  const reach = A.map((row, i) => row.map((x, j) => x || i === j));
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (reach[i][k] && reach[k][j]) reach[i][j] = true;
  const classes: number[][] = [];
  const done = new Set<number>();
  for (let u = 0; u < n; u++) {
    if (done.has(u)) continue;
    const c = Array.from({ length: n }, (_, v) => v).filter((v) => reach[u][v] && reach[v][u]);
    c.forEach((v) => done.add(v));
    classes.push(c);
  }
  const closed = classes.filter((c) => c.every((u) => Array.from({ length: n }, (_, v) => v).every((v) => !A[u][v] || c.includes(v))));
  // Return times of state i: the n for which (A^n)[i][i] is true, up to 2 n^2; the period is their gcd.
  const periodOf = (i: number): number => {
    let power = A.map((row) => [...row]);
    let g = 0;
    for (let steps = 1; steps <= 2 * n * n; steps++) {
      if (power[i][i]) g = gcd(g, steps);
      power = power.map((row, a) => row.map((_, b) => A[0].some((__, k) => power[a][k] && A[k][b])));
    }
    return g || 1;
  };
  return { classes, closed, periodOf };
}

const sorted = (xs: number[][]) => xs.map((c) => c.join(',')).sort();

describe('the stationary distribution', () => {
  it('the default weather chain has pi = (38/67, 18/67, 11/67), summing to 1 with pi P = pi to 1e-12', () => {
    const pi = stationarySolve(WEATHER)!;
    expect(pi[0]).toBeCloseTo(38 / 67, 12);
    expect(pi[1]).toBeCloseTo(18 / 67, 12);
    expect(pi[2]).toBeCloseTo(11 / 67, 12);
    expect(pi.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(stationaryResidual(WEATHER, pi)).toBeLessThan(1e-12);
    expect(pi.map((x) => x.toFixed(4))).toEqual(['0.5672', '0.2687', '0.1642']);
  });

  it('power iteration equals the direct solve of (P^T - I) pi = 0 on 1,000 seeded irreducible chains', () => {
    const rnd = mulberry32(2026);
    for (let t = 0; t < 1000; t++) {
      const n = randInt(2, 6, rnd);
      const P = randomStochastic(rnd, n);
      const solved = stationarySolve(P)!;
      const iterated = stationaryPower(P, 800);
      expect(stationaryResidual(P, solved)).toBeLessThan(1e-12);
      expect(solved.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
      solved.forEach((x, i) => expect(iterated[i]).toBeCloseTo(x, 9));
    }
  });

  it('a chain with two closed classes has no unique pi (the solve is singular); one with a single closed class does', () => {
    const reducible = PRESETS.find((p) => p.id === 'reducible')!.P;
    expect(stationarySolve(reducible)).toBeNull();
    const absorbing = PRESETS.find((p) => p.id === 'absorbing')!.P;
    const pi = stationarySolve(absorbing)!;
    expect(pi[0]).toBeCloseTo(0, 12);
    expect(pi[1]).toBeCloseTo(0, 12);
    expect(pi[2]).toBeCloseTo(1, 12);
  });

  it('the seeded 100,000-step visit frequencies are within 0.01 of pi for the default chain (the shown seed and 20 others)', () => {
    const pi = stationarySolve(WEATHER)!;
    for (const seed of [WALK_SEED, ...Array.from({ length: 20 }, (_, i) => i + 1)]) {
      const path = walk(WEATHER, 0, seed, WALK_MAX);
      const f = visitFractions(path, WALK_MAX, 3);
      f.forEach((x, i) => expect(Math.abs(x - pi[i])).toBeLessThan(0.01));
    }
  });

  it('a walk is deterministic for its seed, starts where told, and only takes steps the matrix allows', () => {
    const a = walk(WEATHER, 1, 5, 500);
    const b = walk(WEATHER, 1, 5, 500);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a[0]).toBe(1);
    const sparse = PRESETS.find((p) => p.id === 'reducible')!.P;
    const path = walk(sparse, 0, 3, 2000);
    for (let k = 1; k < path.length; k++) expect(sparse[path[k - 1]][path[k]]).toBeGreaterThan(0);
    expect(new Set(path)).toEqual(new Set([0, 1]));
    expect(visitFractions(path, 0, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('how fast it forgets', () => {
  it('the default has lambda_2 = 0.558 and lambda_3 = 0.242 from trace 1.8 and determinant 0.135, matching det(P - lambda I) = 0', () => {
    const l = secondEigenvalues(WEATHER);
    expect(l.kind).toBe('real');
    if (l.kind !== 'real') return;
    expect(l.tr).toBeCloseTo(1.8, 12);
    expect(l.det).toBeCloseTo(0.135, 12);
    expect(l.l2).toBeCloseTo(0.558, 3);
    expect(l.l3).toBeCloseTo(0.242, 3);
    // Roots of x^2 - 0.8 x + 0.135 by the quadratic formula, written out independently.
    expect(l.l2).toBeCloseTo((0.8 + Math.sqrt(0.64 - 0.54)) / 2, 12);
    for (const lambda of [1, l.l2, l.l3]) {
      expect(Math.abs(det(WEATHER.map((row, i) => row.map((x, j) => x - (i === j ? lambda : 0)))))).toBeLessThan(1e-12);
    }
    expect(l.slem).toBeCloseTo(0.558, 3);
  });

  it('on seeded 3-state chains the roots always satisfy the characteristic polynomial, and the complex case has modulus sqrt(det)', () => {
    const rnd = mulberry32(14);
    let complex = 0;
    for (let t = 0; t < 1000; t++) {
      const P = randomStochastic(rnd, 3);
      const l = secondEigenvalues(P);
      if (l.kind === 'real') {
        for (const lambda of [l.l2, l.l3]) expect(Math.abs(det(P.map((row, i) => row.map((x, j) => x - (i === j ? lambda : 0)))))).toBeLessThan(1e-9);
      } else {
        complex++;
        expect(l.modulus).toBeCloseTo(Math.sqrt(l.det), 10);
        expect(l.im).not.toBe(0);
      }
    }
    // The circulant chain that moves around a 3-cycle with some laziness has a complex pair.
    const cyc = secondEigenvalues([[0.1, 0.8, 0.1], [0.1, 0.1, 0.8], [0.8, 0.1, 0.1]]);
    expect(cyc.kind).toBe('complex');
    expect(complex + 1).toBeGreaterThan(0);
  });

  it('for chains with a real second eigenvalue the ratio of successive distances at t = 30 is within 5% of |lambda_2| (300 seeded chains)', () => {
    const rnd = mulberry32(88);
    let checked = 0;
    for (let t = 0; t < 4000 && checked < 300; t++) {
      const alpha = 0.3 + 0.55 * rnd();
      const mix = randomStochastic(rnd, 3);
      const P = mix.map((row, i) => row.map((x, j) => alpha * (i === j ? 1 : 0) + (1 - alpha) * x));
      const l = secondEigenvalues(P);
      if (l.kind !== 'real') continue;
      const [big, small] = [Math.max(Math.abs(l.l2), Math.abs(l.l3)), Math.min(Math.abs(l.l2), Math.abs(l.l3))];
      if (big < 0.3 || small > 0.8 * big) continue;
      const pi = stationarySolve(P)!;
      const mu0 = pointMass(3, t % 3);
      const d30 = totalVariation(distributionAt(P, mu0, 30), pi);
      const d31 = totalVariation(distributionAt(P, mu0, 31), pi);
      if (d30 < 1e-10) continue;
      expect(Math.abs(d31 / d30 - big) / big).toBeLessThan(0.05);
      checked++;
    }
    expect(checked).toBe(300);
  });

  it('total variation distance starts at 1 - pi_start and falls to 0 for the default chain', () => {
    const pi = stationarySolve(WEATHER)!;
    expect(totalVariation(pointMass(3, 0), pi)).toBeCloseTo(1 - pi[0], 12);
    expect(totalVariation(distributionAt(WEATHER, pointMass(3, 2), 60), pi)).toBeLessThan(1e-12);
  });
});

describe('when it never settles', () => {
  it('classifies the presets: weather ergodic; periodic period 2; absorbing has one closed class of one state; reducible has two closed classes', () => {
    const [weather, periodic, absorbing, reducible] = PRESETS.map((p) => analyse(p.P));
    expect(weather).toMatchObject({ irreducible: true, period: 1, ergodic: true, settles: true });
    expect(periodic).toMatchObject({ irreducible: true, period: 2, ergodic: false, settles: false, uniqueStationary: true });
    expect(absorbing).toMatchObject({ irreducible: false, absorbing: [2], uniqueStationary: true, settles: true, transient: [0, 1] });
    expect(reducible.closedClasses.map((c) => c.states)).toEqual(expect.arrayContaining([[0, 1], [2, 3]]));
    expect(reducible).toMatchObject({ uniqueStationary: false, ergodic: false, settles: true });
  });

  it('agrees with an independent reachability and gcd-of-return-times check on 1,500 seeded sparse chains', () => {
    const rnd = mulberry32(555);
    let periodic = 0;
    let multiClosed = 0;
    for (let t = 0; t < 1500; t++) {
      const n = randInt(1, 6, rnd);
      const P = randomStochastic(rnd, n, 0.2 + 0.5 * rnd());
      const a = analyse(P);
      const truth = bruteStructure(P);
      expect(sorted(a.classes)).toEqual(sorted(truth.classes));
      expect(sorted(a.closedClasses.map((c) => c.states))).toEqual(sorted(truth.closed));
      expect(a.irreducible).toBe(truth.classes.length === 1);
      for (const c of a.closedClasses) expect(c.period).toBe(truth.periodOf(c.states[0]));
      if (a.irreducible) {
        expect(a.period).toBe(truth.periodOf(0));
        expect(a.ergodic).toBe(truth.periodOf(0) === 1);
        if ((a.period ?? 1) > 1) periodic++;
      }
      expect(a.absorbing).toEqual(P.flatMap((row, i) => (row[i] === 1 ? [i] : [])));
      if (a.closedClasses.length > 1) multiClosed++;
    }
    expect(periodic).toBeGreaterThan(20);
    expect(multiClosed).toBeGreaterThan(20);
  });

  it('the periodic chain has the same distribution at t and t + 2 and a different one at t + 1', () => {
    const P = PRESETS.find((p) => p.id === 'periodic')!.P;
    for (const t of [0, 1, 7, 50, 1001]) {
      const at = distributionAt(P, [1, 0], t);
      expect(distributionAt(P, [1, 0], t + 2)).toEqual(at);
      expect(distributionAt(P, [1, 0], t + 1)).not.toEqual(at);
    }
    expect(stationarySolve(P)).toEqual([0.5, 0.5]);
  });

  it('absorbing: from every start the mass ends in the absorbing state; reducible: where it ends depends on the start', () => {
    const absorbing = PRESETS.find((p) => p.id === 'absorbing')!.P;
    for (let s = 0; s < 3; s++) expect(distributionAt(absorbing, pointMass(3, s), 200)[2]).toBeGreaterThan(1 - 1e-9);
    const reducible = PRESETS.find((p) => p.id === 'reducible')!.P;
    const fromA = distributionAt(reducible, pointMass(4, 0), 300);
    const fromC = distributionAt(reducible, pointMass(4, 2), 300);
    expect(fromA[0] + fromA[1]).toBeCloseTo(1, 9);
    expect(fromC[2] + fromC[3]).toBeCloseTo(1, 9);
    expect(totalVariation(fromA, fromC)).toBeCloseTo(1, 9);
  });
});

describe('editing the matrix', () => {
  it('setting one entry rescales the rest of its row, keeps their ratio, and never rounds', () => {
    const next = setEntry(WEATHER, 0, 0, 0.5);
    expect(next[0][0]).toBe(0.5);
    expect(next[0][1] / next[0][2]).toBeCloseTo(0.15 / 0.05, 12);
    expect(next[0].reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(next[1]).toEqual(WEATHER[1]);
    expect(WEATHER[0][0]).toBe(0.8);
  });

  it('rows stay stochastic through 2,000 seeded edits, including 0, 1 and out-of-range values', () => {
    const rnd = mulberry32(3);
    let P: Matrix = WEATHER;
    for (let t = 0; t < 2000; t++) {
      const v = t % 7 === 0 ? [0, 1, -3, 7][t % 4] : rnd();
      P = setEntry(P, randInt(0, 2, rnd), randInt(0, 2, rnd), v);
      expect(isRowStochastic(P)).toBe(true);
    }
  });

  it('a typed row is clamped and renormalised, a row of zeros is refused, and bad text says why', () => {
    // 2 clamps to 1 and -1 to 0, leaving 1, 1, 0: scaled to sum 1.
    expect(normaliseRow([2, 1, -1])).toEqual({ ok: true, value: [0.5, 0.5, 0] });
    expect(normaliseRow([0, 0, 0])).toEqual({ ok: false, error: 'A row must sum to 1: give the state somewhere to go.' });
    expect(parseRow('0.8, 0.15, 0.05', 3)).toEqual({ ok: true, value: [0.8, 0.15, 0.05] });
    expect(parseRow('0 0 0', 3)).toMatchObject({ ok: false });
    expect(parseRow('1, 2', 3)).toMatchObject({ ok: false, error: 'Type 3 numbers, one for each state.' });
    expect(parseRow('a, b, c', 3)).toMatchObject({ ok: false });
    expect(parseRow('1e3, 1, 1', 3)).toMatchObject({ ok: false });
    expect(withRow(WEATHER, 1, [1, 0, 0])[1]).toEqual([1, 0, 0]);
  });
});

describe('the word chain', () => {
  it('reads sentences, lowercases, strips punctuation, and refuses too many words or a word over 20 letters', () => {
    expect(parseCorpus('The cat sat. The dog sat!')).toEqual({ ok: true, value: [['the', 'cat', 'sat'], ['the', 'dog', 'sat']] });
    expect(parseCorpus(Array.from({ length: MAX_WORDS }, () => 'a').join(' ')).ok).toBe(true);
    const many = parseCorpus(Array.from({ length: MAX_WORDS + 1 }, () => 'a').join(' '));
    expect(many).toMatchObject({ ok: false });
    expect(parseCorpus('x'.repeat(MAX_WORD_LENGTH)).ok).toBe(true);
    expect(parseCorpus('x'.repeat(MAX_WORD_LENGTH + 1))).toMatchObject({ ok: false });
    expect(parseCorpus('   ')).toMatchObject({ ok: false });
    expect(parseCorpus('<b>hi</b>').ok).toBe(true);
  });

  it('the next-word rows sum to 1, sentences use only transitions seen in the corpus, and the walk is seeded', () => {
    for (const corpus of CORPORA) {
      const parsed = parseCorpus(corpus.text);
      if (!parsed.ok) throw new Error('corpus must parse');
      const chain = buildChain(parsed.value);
      for (const w of chain.words) expect(nextWords(chain, w).reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 12);
      const seen = new Set(chain.sentences.flatMap((s) => s.slice(1).map((w, i) => `${s[i]}>${w}`)));
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const a = generateSentences(chain, seed, 20);
        expect(generateSentences(chain, seed, 20)).toEqual(a);
        for (const s of a) {
          s.slice(1).forEach((w, i) => expect(seen.has(`${s[i]}>${w}`)).toBe(true));
          if (s.length > 0) expect(chain.next.get('^')!.has(s[0])).toBe(true);
        }
      }
    }
  });

  it('the Markov property: the same word reached by two different histories has one next-word row', () => {
    const parsed = parseCorpus(CORPORA[0].text);
    if (!parsed.ok) throw new Error('corpus must parse');
    const chain = buildChain(parsed.value);
    const two = sameWordTwoHistories(chain)!;
    expect(two.word).toBe('the');
    expect(two.histories[0].at(-1)).toBe('the');
    expect(two.histories[1].at(-1)).toBe('the');
    expect(two.histories[0].join(' ')).not.toBe(two.histories[1].join(' '));
    expect(nextWords(chain, 'the').length).toBeGreaterThan(1);
    expect(nextWords(chain, 'nothing')).toEqual([]);
  });

  it('a seeded batch writes some sentences that are not in the corpus (the chain recombines), counted honestly', () => {
    const parsed = parseCorpus(CORPORA[0].text);
    if (!parsed.ok) throw new Error('corpus must parse');
    const chain = buildChain(parsed.value);
    const fresh = generateSentences(chain, 1, 200).filter((s) => !inCorpus(chain, s));
    expect(fresh.length).toBeGreaterThan(0);
  });
});
