// Non-cryptographic string hashes for lessons (rings, shards, bloom bits, short ids).
// For real crypto (SHA-256, HMAC) see crypto.ts.

/** FNV-1a, unsigned 32-bit. Cheap and deterministic, but its low bits spread poorly. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** murmur3's 32-bit finaliser: mixes every input bit into every output bit. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Well-spread unsigned 32-bit hash: FNV-1a then fmix32. Use for rings, shards and buckets. */
export const hash32 = (s: string) => fmix32(fnv1a(s));

/** FNV-1a as a short hex id, like a git short hash: hexHash('blob hi') → '5d1c2a9'. */
export const hexHash = (s: string, len = 7) => fnv1a(s).toString(16).padStart(8, '0').slice(0, len);
