import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { buildCaption, proofCaption, syncCaption, syncVerdict, toyCaption } from './captions';
import { buildFacts, proofFacts, syncFacts, toyFacts } from './facts';
import lesson from './index';
import { auditPath, buildTree, rootHash, utf8, verifyInclusion } from './merkle';
import { REPLICA_LEAVES, baseLeaves, runSync } from './sync';
import {
  BUILD_OPEN, PROOF_OPEN, SYNC_OPEN, TOY_OPEN, buildLeaves, changeMark, collisionNodes, pickPositions, replicaB, syncFrames, syncMark, tamperedProof, toggleEdit,
} from './view';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n);

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('merkle-trees')).toHaveLength(4);
    expect(sharedSceneComponents('merkle-trees')).toEqual([]);
    expect(sceneElements('merkle-trees').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(BUILD_OPEN).toEqual({ n: 8, rule: 'rfc', selected: 2 });
    expect(SYNC_OPEN).toEqual({ seed: 3, edits: 2 });
    expect(PROOF_OPEN).toEqual({ n: 16, selected: 5 });
    expect(TOY_OPEN).toEqual({ seed: 10, toy: true });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: editing leaf 2 of 8 changes its 3 ancestors and itself, 4 of 15 hashes; duplicate gives equal roots, the RFC split does not', () => {
    // 8 leaves is 8 + 4 + 2 + 1 = 15 hashes; the path from a leaf to the root is 4 of them
    expect(buildFacts()).toEqual({ nodes: 15, changed: 4, rootChanged: true, sameRootRfc: false, sameRootDuplicate: true });
    expect(lesson.tryThis[0]).toContain('4 of 15 hashes turn red');
    expect(lesson.tryThis[0]).toContain('duplicate-last rule gives [a, b, c] and [a, b, c, c] the same root while the RFC split gives different roots');
  });

  it('try-this 2: seed 3 differs at ranges 0 and 6, found in 13 comparisons (worked by hand: 6 differing nodes, 1 + 2 x 6), 2,464 B against 16,384 B', () => {
    const f = syncFacts();
    expect(f).toMatchObject({ truth: [0, 6], found: [0, 6], comparisons: 13, equalComparisons: 1 });
    expect(f.sizes).toMatchObject({ naive: 16 * 1024, smart: 13 * 32 + 2 * 1024 });
    expect(lesson.tryThis[1]).toContain('makes 13 comparisons and finds ranges 0 and 6');
    expect(lesson.tryThis[1]).toContain('anti-entropy sends 2.4 KiB against 16.0 KiB for every range');
  });

  it('try-this 3: leaf 5 of 16 has a 4-hash, 128-byte proof that verifies, and a tampered sibling is refused with the model\'s reason', () => {
    const f = proofFacts();
    expect(f).toMatchObject({ hashes: 4, bytes: 128, dataBytes: 16384, ok: true, bad: false, badReason: 'the recomputed root is not the trusted root' });
    expect(lesson.tryThis[2]).toContain('the proof is 4 hashes, 128 bytes against 16.0 KiB of data');
    expect(lesson.tryThis[2]).toContain('since the recomputed root is not the trusted root');
  });

  it('try-this 4: seed 10 with the toy hash misses ranges 12 and 14 of 7, 11, 12, 14 and the 256-bit hash finds all four', () => {
    const f = toyFacts();
    expect(f).toMatchObject({ lowest: 10, truth: [7, 11, 12, 14], missed: [12, 14], fullMissed: [] });
    expect(lesson.tryThis[3]).toContain(`${f.missSeeds} of 200 seeds miss something`);
    expect(lesson.tryThis[3]).toContain('misses 2 ranges of the 4 that differ');
    expect(f.missSeeds).toBeGreaterThan(0);
  });
});

describe('what the scenes draw', () => {
  it('a changed leaf and its ancestors are red, everything else green, and an unchanged tree is all green', () => {
    const tree = buildTree('sha256', buildLeaves(8))!;
    const all = (n: typeof tree): (typeof tree)[] => [n, ...(n.left ? [...all(n.left), ...all(n.right!)] : [])];
    const marks = all(tree).map((n) => ({ n, m: changeMark(n, new Set([2])) }));
    expect(marks.filter((x) => x.m.tone === 'bad')).toHaveLength(4);
    expect(marks.filter((x) => x.m.tone === 'ok')).toHaveLength(11);
    expect(marks.find((x) => x.n.lo === 2 && x.n.hi === 3)!.m.fill).toBe('solid');
    expect(all(tree).every((n) => changeMark(n, new Set()).tone === 'ok')).toBe(true);
  });

  it('the anti-entropy frames follow the descent: round by round, skipped subtrees are dim, and the last frame names the transfer', () => {
    const a = baseLeaves(REPLICA_LEAVES);
    const b = replicaB(new Set([0, 6]));
    const frames = syncFrames('sha256', a, b, syncCaption);
    expect(frames.map((f) => f.phase)).toEqual(['start', 'round', 'round', 'round', 'round', 'round', 'transfer']);
    expect(frames.at(-1)!.comparisons).toBe(13);
    const rootOnly = frames[1];
    expect(syncMark('r', rootOnly)).toMatchObject({ tone: 'bad' });
    expect(syncMark('rLL', rootOnly)).toBeNull();
    const equal = syncFrames('sha256', a, a, syncCaption);
    expect(equal).toHaveLength(2);
    expect(syncMark('r', equal[1])).toMatchObject({ tone: 'ok' });
    expect(syncMark('rL', equal[1])).toMatchObject({ tone: 'dim' });
  });

  it('edits: the slider picks k distinct positions, a click toggles one, and the toy collision nodes are the ones with equal toy hashes and different full hashes', () => {
    for (const k of [0, 1, 3, 6]) expect(pickPositions(5, k).size).toBe(k);
    expect(toggleEdit(new Set([1, 2]), 2)).toEqual(new Set([1]));
    expect(toggleEdit(new Set([1]), 4)).toEqual(new Set([1, 4]));
    const { a, b } = { a: baseLeaves(16), b: replicaB(new Set([7, 11, 12, 14])) };
    expect(collisionNodes('sha256', a, b).size).toBe(0);
    expect(collisionNodes('toy8', a, b).size).toBeGreaterThanOrEqual(0);
    const toy = runSync('toy8', a, b);
    expect(toy.missed).toEqual([12, 14]);
    expect(collisionNodes('toy8', a, b).size).toBeGreaterThan(0);
  });

  it('a tampered sibling changes the first proof hash and nothing else', () => {
    const leaves = baseLeaves(16);
    const proof = auditPath('sha256', leaves, 5).map((p) => p.hash);
    const t = tamperedProof(proof, 'sibling');
    expect(t[0]).not.toBe(proof[0]);
    expect(t.slice(1)).toEqual(proof.slice(1));
    expect(tamperedProof(proof, 'none')).toEqual(proof);
    expect(verifyInclusion('sha256', utf8(leaves[5]), 5, 16, t, rootHash('sha256', leaves)).ok).toBe(false);
  });
});

describe('captions are computed from the model', () => {
  it('the build caption counts leaves, hashes and the changed path, at the slider extremes and with both rules', () => {
    for (const n of [3, 8, 16]) {
      for (const rule of ['rfc', 'duplicate'] as const) {
        const tree = buildTree('sha256', buildLeaves(n), rule)!;
        expect(text(buildCaption(tree, n, rule, new Set()))).toContain(`${n} leaves`);
        const c = text(buildCaption(tree, n, rule, new Set([0])));
        expect(c).toContain('1 leaf edited');
        expect(c).toMatch(/\d+ hashes? changed on the way to the root/);
      }
    }
  });

  it('the sync caption and verdict quote the comparisons and the bound, and say a miss is a miss', () => {
    const a = baseLeaves(16);
    const r = runSync('sha256', a, replicaB(new Set([0, 6])));
    expect(text(syncVerdict(r, 16, 2))).toContain('Found 2 differences in 13 comparisons (the bound for 2 differences is 17)');
    const toy = runSync('toy8', a, replicaB(new Set([7, 11, 12, 14])));
    expect(text(syncVerdict(toy, 16, 4))).toContain('missed 2 differences (range 12, 14)');
    const equal = syncFrames('sha256', a, a, syncCaption);
    expect(text(equal[1].say!)).toContain('the roots match after 1 comparison');
  });

  it('the proof caption says verified for a good proof and names the reason for a bad one', () => {
    const leaves = baseLeaves(16);
    const proof = auditPath('sha256', leaves, 5).map((p) => p.hash);
    const root = rootHash('sha256', leaves);
    expect(text(proofCaption(verifyInclusion('sha256', utf8(leaves[5]), 5, 16, proof, root), 5, 16))).toContain('4 sibling hashes recompute the root');
    expect(text(proofCaption(verifyInclusion('sha256', utf8(leaves[5]), 9, 16, proof, root), 9, 16))).toContain('Verification failed: the recomputed root is not the trusted root');
    expect(text(proofCaption(verifyInclusion('sha256', utf8(leaves[5]), 99, 16, proof, root), 99, 16))).toContain('index 99 is outside a tree of 16 leaves');
  });

  it('the toy caption names the hash, the counts and the number of seeds that miss', () => {
    expect(text(toyCaption(true, [12, 14], [7, 11, 12, 14], 10, 7))).toContain('found 2 and missed 2 ranges (12, 14). 7 of 200 seeds miss something with this hash');
    expect(text(toyCaption(false, [], [7, 11, 12, 14], 10, 0))).toContain('all 4 differences found');
  });
});

describe('lesson content', () => {
  it('has four try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
