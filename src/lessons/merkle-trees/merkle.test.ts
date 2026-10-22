import { describe, expect, it } from 'vitest';
import { hexToBytes, toHex } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import { nodeDigest } from '../../core/testing/nodeCrypto';
import {
  MAX_LEAF_BYTES, auditPath, auditPathLength, buildTree, checkLeafText, emptyHash, flatten, leafHash, leafHashOfBytes, nodeHash, pathIds, rootHash, utf8, verifyInclusion, type OddRule,
} from './merkle';

/** Independent: node:crypto SHA-256 over the same bytes, hex. */
const nodeSha = (data: Uint8Array) => nodeDigest('sha256', data);
const cat = (...parts: number[][]) => Uint8Array.from(parts.flat());
const text = (seed: number, n: number): string[] => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => Array.from({ length: Math.floor(rnd() * 20) }, () => String.fromCharCode(97 + Math.floor(rnd() * 26))).join(''));
};


describe('leaf and node hashes against node:crypto, for every node of 200 seeded trees', () => {
  /** An independent tree hash: the RFC 6962 recursion written with node:crypto and raw byte prefixes. */
  const mth = (leaves: string[]): string => {
    if (leaves.length === 0) return nodeSha(new Uint8Array(0));
    if (leaves.length === 1) return nodeSha(cat([0], [...utf8(leaves[0])]));
    let k = 1;
    while (k * 2 < leaves.length) k *= 2;
    return nodeSha(cat([1], [...hexToBytes(mth(leaves.slice(0, k)))], [...hexToBytes(mth(leaves.slice(k)))]));
  };

  it('the root of every tree equals the node:crypto recursion, and so does every node on the way', () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = 1 + (seed % 20);
      const leaves = text(seed, n);
      const tree = buildTree('sha256', leaves)!;
      for (const node of flatten(tree)) expect(node.hash, `seed ${seed} node ${node.id}`).toBe(mth(leaves.slice(node.lo, node.hi)));
      expect(tree.hash).toBe(mth(leaves));
      expect(rootHash('sha256', leaves)).toBe(tree.hash);
    }
  });

  it('prefixes: a leaf hashes 0x00 then the data, a node 0x01 then both child hashes, and the same bytes without the prefix hash differently', () => {
    expect(leafHash('sha256', 'a')).toBe(nodeSha(Uint8Array.of(0, 97)));
    expect(leafHash('sha256', 'a')).not.toBe(nodeSha(Uint8Array.of(97)));
    const l = leafHash('sha256', 'a');
    const r = leafHash('sha256', 'b');
    expect(nodeHash('sha256', l, r)).toBe(nodeSha(cat([1], [...hexToBytes(l)], [...hexToBytes(r)])));
  });

  it('domain separation: a node over two leaf hashes is not the leaf hash of their 64 concatenated bytes', () => {
    const l = leafHash('sha256', 'a');
    const r = leafHash('sha256', 'b');
    const forged = leafHashOfBytes('sha256', cat([...hexToBytes(l)], [...hexToBytes(r)]));
    expect(forged).not.toBe(nodeHash('sha256', l, r));
  });
});

describe('Certificate Transparency test vectors (RFC 6962 trees, recalled from the CT reference tests and recomputed here)', () => {
  const LEAVES = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'].map(hexToBytes);
  const ROOTS = [
    '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d', 'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
    'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77', 'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
    '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4', '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
    'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c', '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
  ];

  it('the empty tree is SHA-256 of the empty string', () => {
    expect(emptyHash('sha256')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(rootHash('sha256', [])).toBe(emptyHash('sha256'));
  });

  it('the roots of the first 1 to 8 of the eight CT test leaves match, so the 0x00 and 0x01 prefixes and the split at the largest power of two below n are the RFC\'s', () => {
    const hash = (lo: number, hi: number): string => {
      if (hi - lo === 1) return leafHashOfBytes('sha256', LEAVES[lo]);
      let k = 1;
      while (k * 2 < hi - lo) k *= 2;
      return nodeHash('sha256', hash(lo, lo + k), hash(lo + k, hi));
    };
    ROOTS.forEach((root, i) => expect(hash(0, i + 1), `${i + 1} leaves`).toBe(root));
  });
});

describe('the odd leaf count rules', () => {
  it('with the duplicate-last rule [a, b, c] and [a, b, c, c] have the same root; with the RFC split they differ', () => {
    expect(rootHash('sha256', ['a', 'b', 'c'], 'duplicate')).toBe(rootHash('sha256', ['a', 'b', 'c', 'c'], 'duplicate'));
    expect(rootHash('sha256', ['a', 'b', 'c'], 'rfc')).not.toBe(rootHash('sha256', ['a', 'b', 'c', 'c'], 'rfc'));
  });

  it('for a power of two the two rules build the same tree; for others the duplicate tree has copied nodes the RFC tree has not', () => {
    for (const n of [1, 2, 4, 8, 16]) expect(rootHash('sha256', text(n, n), 'rfc')).toBe(rootHash('sha256', text(n, n), 'duplicate'));
    const rules: OddRule[] = ['rfc', 'duplicate'];
    const copies = rules.map((r) => flatten(buildTree('sha256', text(3, 5), r)).filter((x) => x.copy).length);
    expect(copies[0]).toBe(0);
    expect(copies[1]).toBeGreaterThan(0);
  });

  it('the duplicate rule\'s [a, b, c] root equals the hand-built H(1||H(1||a,b)||H(1||c,c))', () => {
    const a = leafHash('sha256', 'a');
    const b = leafHash('sha256', 'b');
    const c = leafHash('sha256', 'c');
    expect(rootHash('sha256', ['a', 'b', 'c'], 'duplicate')).toBe(nodeHash('sha256', nodeHash('sha256', a, b), nodeHash('sha256', c, c)));
  });
});

describe('inclusion proofs', () => {
  const proofOf = (leaves: string[], i: number) => auditPath('sha256', leaves, i).map((s) => s.hash);

  it('every proof verifies for every leaf of trees with n = 1 to 33, and its length is the depth of that leaf (at most ceil(log2 n))', () => {
    for (let n = 1; n <= 33; n++) {
      const leaves = text(100 + n, n);
      const root = rootHash('sha256', leaves);
      let longest = 0;
      for (let i = 0; i < n; i++) {
        const proof = proofOf(leaves, i);
        const v = verifyInclusion('sha256', utf8(leaves[i]), i, n, proof, root);
        expect(v.ok, `n=${n} i=${i}: ${v.reason}`).toBe(true);
        expect(proof).toHaveLength(auditPathLength(n, i));
        longest = Math.max(longest, proof.length);
      }
      expect(longest).toBe(Math.ceil(Math.log2(n)));
    }
  });

  it('the proof the verifier recomputes the root from is the sibling hashes along the path of the drawn tree', () => {
    const leaves = text(7, 11);
    const tree = buildTree('sha256', leaves)!;
    const nodes = Object.fromEntries(flatten(tree).map((x) => [x.id, x]));
    const target = flatten(tree).find((x) => x.lo === 6 && x.hi === 7)!;
    const siblings = pathIds(target.id).slice(1).reverse().map((id) => nodes[id.slice(0, -1) + (id.endsWith('L') ? 'R' : 'L')].hash);
    expect(proofOf(leaves, 6)).toEqual(siblings);
  });

  it('changing any single bit of the leaf, any sibling hash or the claimed index makes verification fail, exhaustive over trees of 1 to 12 leaves', () => {
    for (let n = 1; n <= 12; n++) {
      const leaves = text(200 + n, n);
      const root = rootHash('sha256', leaves);
      for (let i = 0; i < n; i++) {
        const proof = proofOf(leaves, i);
        const data = utf8(leaves[i] + 'x');
        const ok = verifyInclusion('sha256', data, i, n, proof, root);
        // a leaf text with an extra character is a different leaf: it must fail; flip every bit of the true leaf instead
        expect(ok.ok).toBe(false);
        const real = utf8(leaves[i]);
        for (let bit = 0; bit < real.length * 8; bit++) {
          const flipped = Uint8Array.from(real);
          flipped[bit >> 3] ^= 1 << (bit & 7);
          expect(verifyInclusion('sha256', flipped, i, n, proof, root).ok, `n=${n} i=${i} leaf bit ${bit}`).toBe(false);
        }
        proof.forEach((p, s) => {
          for (let bit = 0; bit < 256; bit += 17) {
            const b = hexToBytes(p);
            b[bit >> 3] ^= 1 << (bit & 7);
            const bad = proof.map((q, j) => (j === s ? toHex(b) : q));
            expect(verifyInclusion('sha256', real, i, n, bad, root).ok, `n=${n} i=${i} sibling ${s} bit ${bit}`).toBe(false);
          }
        });
        if (n > 1) for (let j = 0; j < n; j++) if (j !== i) expect(verifyInclusion('sha256', real, j, n, proof, root).ok, `n=${n} claimed ${j} for ${i}`).toBe(false);
        expect(verifyInclusion('sha256', real, n, n, proof, root).ok).toBe(false);
        expect(verifyInclusion('sha256', real, -1, n, proof, root).ok).toBe(false);
        expect(verifyInclusion('sha256', real, i, n, [...proof, root], root).ok).toBe(false);
        if (proof.length > 0) expect(verifyInclusion('sha256', real, i, n, proof.slice(1), root).ok).toBe(false);
      }
    }
  });

  it('an invalid index is refused with a reason that names the size', () => {
    const v = verifyInclusion('sha256', utf8('a'), 5, 3, [], rootHash('sha256', ['a', 'b', 'c']));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('index 5 is outside a tree of 3 leaves');
  });
});

describe('leaf text rules', () => {
  it('accepts up to 64 bytes counted in UTF-8, and refuses more, control characters and lone surrogates', () => {
    expect(checkLeafText('a'.repeat(MAX_LEAF_BYTES))).toEqual({ ok: true });
    expect(checkLeafText('a'.repeat(MAX_LEAF_BYTES + 1))).toMatchObject({ ok: false });
    expect(checkLeafText('é'.repeat(32))).toEqual({ ok: true });
    expect(checkLeafText('é'.repeat(33))).toMatchObject({ ok: false, error: expect.stringContaining('66') });
    expect(checkLeafText('a\u0000b')).toMatchObject({ ok: false });
    expect(checkLeafText('\ud800')).toMatchObject({ ok: false });
    expect(checkLeafText('😀')).toEqual({ ok: true });
    expect(checkLeafText('')).toEqual({ ok: true });
  });
});
