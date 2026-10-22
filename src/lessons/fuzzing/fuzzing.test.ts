import { describe, expect, it } from 'vitest';
import { bucketCrashes, runFuzz, SEED_INPUT, type FuzzerKind } from './fuzzer';
import { MAX_HEX_CHARS, parseHexBytes } from './hexInput';
import { listing, tagsIn } from './listing';
import { crashesAt, minimise } from './minimise';
import { largestCrash } from './model';
import { BRANCH, MAX_INPUT_BYTES, cfgEdges, edgeId, edgesOf, runTarget, type TargetOptions } from './target';

const BYTEWISE: TargetOptions = { magic: 'bytewise', boundsCheck: true };
const SINGLE: TargetOptions = { magic: 'single', boundsCheck: true };
const UNCHECKED: TargetOptions = { magic: 'bytewise', boundsCheck: false };
const KNTC = [0x4b, 0x4e, 0x54, 0x43];

/**
 * An independent reading of the record format, written as a walk over a plain index with names instead of
 * the target's branch constants: it returns the branch numbers it passes (by their documented numbers) and
 * the verdict as text. Used as the oracle for the target and for the fuzzers' coverage.
 */
function reference(bytes: readonly number[], magic: 'bytewise' | 'single', check: boolean): { path: number[]; verdict: string; overReads: number } {
  const path = [0];
  let over = 0;
  const at = (i: number) => {
    if (i < bytes.length) return bytes[i];
    over++;
    if (check) throw new Error('over-read');
    return 0;
  };
  const reject = (why: string) => {
    path.push(11);
    return { path, verdict: `rejected ${why}`, overReads: over };
  };
  if (magic === 'single') {
    if (bytes.slice(0, 4).join(',') !== '75,78,84,67') return reject('magic');
    path.push(4);
  } else {
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== 'KNTC'.charCodeAt(i)) return reject('magic');
      path.push(i + 1);
    }
  }
  if (bytes.length < 5) return reject('short');
  path.push(5);
  const declared = bytes[4];
  let sum = 0;
  let place = 'b6';
  try {
    for (let k = 0; k < declared; k++) {
      place = 'b6';
      sum = (sum + at(5 + k)) % 256;
      path.push(6);
    }
    path.push(7);
    place = 'b8';
    const stored = at(5 + declared);
    path.push(8);
    if (stored === sum) {
      path.push(9);
      return { path, verdict: 'accepted', overReads: over };
    }
    path.push(10);
    return { path, verdict: 'rejected checksum', overReads: over };
  } catch {
    return { path, verdict: `crash ${place}`, overReads: over };
  }
}

const verdictOf = (bytes: readonly number[], o: TargetOptions) => {
  const out = runTarget(bytes, o).outcome;
  return out.kind === 'crash' ? `crash b${out.site}` : out.kind === 'accepted' ? 'accepted' : `rejected ${out.reason}`;
};

describe('the toy target', () => {
  const vectors: { name: string; bytes: number[]; path: number[]; verdict: string }[] = [
    { name: 'empty input', bytes: [], path: [0, 11], verdict: 'rejected magic' },
    { name: 'only the K', bytes: [0x4b], path: [0, 1, 11], verdict: 'rejected magic' },
    { name: 'magic and no length byte', bytes: KNTC, path: [0, 1, 2, 3, 4, 11], verdict: 'rejected short' },
    { name: 'empty payload with a matching checksum', bytes: [...KNTC, 0, 0], path: [0, 1, 2, 3, 4, 5, 7, 8, 9], verdict: 'accepted' },
    { name: 'empty payload and the checksum byte missing', bytes: [...KNTC, 0], path: [0, 1, 2, 3, 4, 5, 7], verdict: 'crash b8' },
    { name: 'two payload bytes summing to the checksum', bytes: [...KNTC, 2, 1, 2, 3], path: [0, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9], verdict: 'accepted' },
    { name: 'two payload bytes and a wrong checksum', bytes: [...KNTC, 2, 1, 2, 4], path: [0, 1, 2, 3, 4, 5, 6, 6, 7, 8, 10], verdict: 'rejected checksum' },
    { name: 'a length that promises more than the input holds', bytes: [...KNTC, 9, 1], path: [0, 1, 2, 3, 4, 5, 6], verdict: 'crash b6' },
  ];
  for (const v of vectors) {
    it(`hand-worked vector: ${v.name}`, () => {
      const run = runTarget(v.bytes, BYTEWISE);
      expect(run.path).toEqual(v.path);
      expect(verdictOf(v.bytes, BYTEWISE)).toBe(v.verdict);
    });
  }

  it('agrees with the independent reference on every input of up to 3 bytes over a small alphabet, and on 5000 seeded ones', () => {
    const alphabet = [0, 1, 0x4b, 0x4e, 0x54, 0x43];
    const inputs: number[][] = [[]];
    for (let len = 1; len <= 3; len++) {
      const prev = inputs.filter((i) => i.length === len - 1);
      for (const p of prev) for (const a of alphabet) inputs.push([...p, a]);
    }
    let state = 12345;
    const next = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state;
    };
    for (let k = 0; k < 5000; k++) {
      const useMagic = next() % 3 !== 0;
      const body = Array.from({ length: next() % 14 }, () => next() % 4);
      inputs.push(useMagic ? [...KNTC, ...body] : body.map((b) => b * 40));
    }
    for (const bytes of inputs) {
      for (const [magic, check] of [['bytewise', true], ['single', true], ['bytewise', false], ['single', false]] as const) {
        const ref = reference(bytes, magic, check);
        const run = runTarget(bytes, { magic, boundsCheck: check });
        expect(verdictOf(bytes, { magic, boundsCheck: check }), `${bytes.join(' ')} ${magic} ${check}`).toBe(ref.verdict);
        if (magic === 'bytewise') expect(run.path).toEqual(ref.path);
        expect(run.overReads).toBe(ref.overReads);
      }
    }
  });

  it('the one-comparison mode skips b1..b3 and otherwise follows the same path', () => {
    const run = runTarget([...KNTC, 0, 0], SINGLE);
    expect(run.path).toEqual([0, 4, 5, 7, 8, 9]);
  });

  it('every edge of the hand-listed graph is reachable and no run leaves it', () => {
    const inputs: number[][] = [
      [], [0x4b], [0x4b, 0x4e], [0x4b, 0], [0x4b, 0x4e, 0x54], [0x4b, 0x4e, 0], [...KNTC], [0x4b, 0x4e, 0x54, 0],
      [...KNTC, 0, 0], [...KNTC, 0], [...KNTC, 1, 0, 0], [...KNTC, 2, 0, 0, 0], [...KNTC, 1, 1, 2], [...KNTC, 1, 1, 1],
    ];
    for (const options of [BYTEWISE, SINGLE]) {
      const listed = new Set(cfgEdges(options.magic).map(([a, b]) => edgeId(a, b)));
      const seen = new Set(inputs.flatMap((i) => edgesOf(runTarget(i, options).path)));
      expect([...listed].filter((e) => !seen.has(e))).toEqual([]);
      expect([...seen].filter((e) => !listed.has(e))).toEqual([]);
    }
  });

  it('names every branch b1..b11 exactly once in the listing, and b4 stands in for the magic bytes in the one-comparison listing', () => {
    expect(tagsIn(listing('bytewise')).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const single = tagsIn(listing('single'));
    expect(single).not.toContain(1);
    expect(single).toContain(BRANCH.magicOk);
    for (const line of listing('bytewise')) if (line.branch !== undefined) expect(line.text).toMatch(new RegExp(`b${line.branch}\\b`));
  });
});

describe('the fuzzers', () => {
  const SEEDS = 200;
  const EXECUTIONS = 20_000;

  it('is deterministic from the seed and differs across seeds', () => {
    const a = runFuzz({ kind: 'guided', seed: 7, executions: 2000, target: BYTEWISE });
    const b = runFuzz({ kind: 'guided', seed: 7, executions: 2000, target: BYTEWISE });
    const c = runFuzz({ kind: 'guided', seed: 8, executions: 2000, target: BYTEWISE });
    expect([...a.coverage]).toEqual([...b.coverage]);
    expect(a.corpus.map((e) => e.bytes)).toEqual(b.corpus.map((e) => e.bytes));
    expect(a.corpus.map((e) => e.bytes)).not.toEqual(c.corpus.map((e) => e.bytes));
  });

  it('blind random bytes get the magic accepted on 0 of 200 seeds in 20,000 executions, and the chance is far below 1e-4', () => {
    const MAGIC_CHANCE_PER_EXECUTION = 2 ** -32;
    expect(EXECUTIONS * MAGIC_CHANCE_PER_EXECUTION).toBeLessThan(1e-4);
    let reached = 0;
    for (let seed = 0; seed < SEEDS; seed++) if (runFuzz({ kind: 'blind', seed, executions: EXECUTIONS, target: BYTEWISE }).magicAt !== null) reached++;
    expect(reached).toBe(0);
  }, 120_000);

  it('guided gets the magic accepted on 0 of 200 seeds when the check is one 4-byte comparison, and on most when it is byte by byte', () => {
    let single = 0;
    let bytewise = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      if (runFuzz({ kind: 'guided', seed, executions: EXECUTIONS, target: SINGLE }).magicAt !== null) single++;
      if (runFuzz({ kind: 'guided', seed, executions: EXECUTIONS, target: BYTEWISE }).magicAt !== null) bytewise++;
    }
    expect(single).toBe(0);
    // Measured when the lesson was built: 163 of 200 seeds crash within 20,000 executions (every one of them accepted the magic first).
    expect(bytewise).toBeGreaterThanOrEqual(163);
  }, 240_000);

  it('picks as the default the lowest seed whose guided run first crashes between 5,000 and 8,000 executions', () => {
    const first = (seed: number) => runFuzz({ kind: 'guided', seed, executions: EXECUTIONS, target: BYTEWISE }).firstCrashAt;
    const lowest = Array.from({ length: SEEDS }, (_, s) => s).find((s) => {
      const at = first(s);
      return at !== null && at >= 5000 && at <= 8000;
    });
    expect(lowest).toBe(13);
  }, 120_000);

  it('covered edges equal an independent replay that logs every branch, for both fuzzers and both magic modes', () => {
    for (const kind of ['blind', 'guided'] as FuzzerKind[]) {
      for (const options of [BYTEWISE, SINGLE, UNCHECKED]) {
        for (const seed of [0, 1, 13]) {
          const inputs: number[][] = [[...SEED_INPUT]];
          const run = runFuzz({ kind, seed, executions: 3000, target: options, observe: (b) => inputs.push([...b]) });
          const replayed = new Set<number>();
          let crashes = 0;
          for (const bytes of inputs) {
            const ref = reference(bytes, options.magic, options.boundsCheck);
            ref.path.slice(1).forEach((to, i) => replayed.add(edgeId(ref.path[i], to)));
            if (ref.verdict.startsWith('crash')) crashes++;
          }
          expect([...replayed].sort((a, b) => a - b)).toEqual([...run.edges].sort((a, b) => a - b));
          expect(run.crashes.length).toBe(crashes);
          expect(inputs.length).toBe(3001);
        }
      }
    }
  });

  it('never feeds the target more bytes than it allows', () => {
    let longest = 0;
    runFuzz({ kind: 'guided', seed: 13, executions: EXECUTIONS, target: BYTEWISE, observe: (b) => (longest = Math.max(longest, b.length)) });
    expect(longest).toBeLessThanOrEqual(MAX_INPUT_BYTES);
  });

  it('with the bounds check off, no execution on any of 200 seeds throws, yet over-reads still happen', () => {
    let overReadRuns = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const run = runFuzz({ kind: 'guided', seed, executions: 5000, target: UNCHECKED });
      expect(run.crashes).toHaveLength(0);
      overReadRuns += run.overReadRuns;
    }
    expect(overReadRuns).toBeGreaterThan(0);
  }, 120_000);
});

describe('the minimiser and the buckets', () => {
  it('returns an input that still crashes at the same site and is 1-minimal by brute force', () => {
    let checked = 0;
    for (const seed of [13, 23, 30, 36]) {
      const run = runFuzz({ kind: 'guided', seed, executions: EXECUTIONS_FOR_MIN, target: BYTEWISE });
      for (const bucket of bucketCrashes(run.crashes)) {
        const largest = largestCrash(run.crashes, bucket.site)!;
        const { result } = minimise(largest.bytes, (b) => crashesAt(b, bucket.site, BYTEWISE));
        expect(crashesAt(result, bucket.site, BYTEWISE)).toBe(true);
        expect(result.length).toBeLessThanOrEqual(largest.bytes.length);
        for (let i = 0; i < result.length; i++) {
          const without = [...result.slice(0, i), ...result.slice(i + 1)];
          expect(crashesAt(without, bucket.site, BYTEWISE), `dropping byte ${i} of ${result.join(' ')}`).toBe(false);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('shrinks a b6 crash to the 5 bytes the format needs: the magic, then a length byte above zero (the minimiser may promote a payload byte to be the length)', () => {
    const { result } = minimise([...KNTC, 9, 1, 2, 3, 4, 5, 6], (b) => crashesAt(b, BRANCH.payloadByte, BYTEWISE));
    expect(result).toHaveLength(5);
    expect(result.slice(0, 4)).toEqual(KNTC);
    expect(result[4]).toBeGreaterThan(0);
  });

  it('two different crash sites make two buckets and one site makes one', () => {
    const crash = (site: 6 | 8, bytes: number[], at: number) => ({ at, bytes, site });
    const two = bucketCrashes([crash(6, [1], 1), crash(8, [2], 2), crash(6, [3], 3)]);
    expect(two.map((b) => [b.site, b.count])).toEqual([[6, 2], [8, 1]]);
    expect(bucketCrashes([crash(6, [1], 1), crash(6, [2], 2)])).toHaveLength(1);
  });

  it('the real fuzzer run at the default seed finds both sites', () => {
    const run = runFuzz({ kind: 'guided', seed: 13, executions: 20_000, target: BYTEWISE });
    expect(bucketCrashes(run.crashes).map((b) => b.site)).toEqual([BRANCH.payloadByte, BRANCH.checksumRead]);
  });
});

const EXECUTIONS_FOR_MIN = 20_000;

describe('the hex field', () => {
  it('reads hex pairs and refuses with the position that is wrong', () => {
    expect(parseHexBytes('4b 4E 0')).toEqual({ ok: true, value: [0x4b, 0x4e, 0] });
    expect(parseHexBytes('')).toMatchObject({ ok: false });
    expect(parseHexBytes('4b zz')).toEqual({ ok: false, error: 'Position 4: "zz" is not a hex byte (one or two digits 0-9, a-f).' });
    expect(parseHexBytes('4b 123')).toMatchObject({ ok: false });
  });

  it('refuses text past the byte cap before it looks at digits', () => {
    expect(parseHexBytes('00 '.repeat(MAX_INPUT_BYTES).trim())).toMatchObject({ ok: true });
    expect(parseHexBytes('00 '.repeat(MAX_INPUT_BYTES + 1).trim())).toMatchObject({ ok: false });
    expect(parseHexBytes('0'.repeat(MAX_HEX_CHARS + 1))).toMatchObject({ ok: false });
  });
});
