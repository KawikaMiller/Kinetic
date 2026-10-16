/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { changedNodes } from './captions';
import { auditPath, buildTree, flatten, rootHash, utf8, verifyInclusion, type OddRule } from './merkle';
import { BLOCK_BYTES, HASH_BYTES, REPLICA_LEAVES, baseLeaves, directDiff, lowestMiss, missSeedCount, runSync, seededReplicas } from './sync';
import { BUILD_OPEN, PROOF_OPEN, SYNC_OPEN, TOY_OPEN, buildLeaves, bytesSent, pickPositions, replicaB, tamperedProof } from './view';

/** Scene 1 from its defaults: edit the selected leaf (add a character). */
export function buildFacts() {
  const leaves = buildLeaves(BUILD_OPEN.n);
  const tree = buildTree('sha256', leaves, BUILD_OPEN.rule)!;
  const edited = leaves.map((t, i) => (i === BUILD_OPEN.selected ? `${t}!` : t));
  const after = buildTree('sha256', edited, BUILD_OPEN.rule)!;
  const dup = (['rfc', 'duplicate'] as OddRule[]).map((r) => rootHash('sha256', ['a', 'b', 'c'], r) === rootHash('sha256', ['a', 'b', 'c', 'c'], r));
  return {
    nodes: flatten(tree).length,
    changed: changedNodes(after, new Set([BUILD_OPEN.selected])),
    rootChanged: tree.hash !== after.hash,
    sameRootRfc: dup[0],
    sameRootDuplicate: dup[1],
  };
}

/** Scene 2 from its defaults: seed 3, two ranges differ. */
export function syncFacts() {
  const a = baseLeaves(REPLICA_LEAVES);
  const edits = pickPositions(SYNC_OPEN.seed, SYNC_OPEN.edits);
  const b = replicaB(edits);
  const r = runSync('sha256', a, b);
  const equal = runSync('sha256', a, a);
  return { found: r.found, comparisons: r.comparisons, sizes: bytesSent(REPLICA_LEAVES, r.comparisons, r.found.length), equalComparisons: equal.comparisons, truth: directDiff(a, b) };
}

/** Scene 3 from its defaults: leaf 5 of 16, then a tampered sibling. */
export function proofFacts() {
  const leaves = baseLeaves(PROOF_OPEN.n);
  const root = rootHash('sha256', leaves);
  const proof = auditPath('sha256', leaves, PROOF_OPEN.selected).map((p) => p.hash);
  const ok = verifyInclusion('sha256', utf8(leaves[PROOF_OPEN.selected]), PROOF_OPEN.selected, PROOF_OPEN.n, proof, root);
  const bad = verifyInclusion('sha256', utf8(leaves[PROOF_OPEN.selected]), PROOF_OPEN.selected, PROOF_OPEN.n, tamperedProof(proof, 'sibling'), root);
  return { hashes: proof.length, bytes: proof.length * HASH_BYTES, dataBytes: PROOF_OPEN.n * BLOCK_BYTES, ok: ok.ok, bad: bad.ok, badReason: bad.reason };
}

/** Scene 4 from its defaults: seed 10 with the toy hash, then SHA-256. */
export function toyFacts() {
  const r = seededReplicas(TOY_OPEN.seed);
  const toy = runSync('toy8', r.a, r.b);
  const full = runSync('sha256', r.a, r.b);
  const missSeeds = missSeedCount('toy8');
  return { lowest: lowestMiss('toy8'), truth: toy.truth, missed: toy.missed, fullMissed: full.missed, missSeeds };
}
