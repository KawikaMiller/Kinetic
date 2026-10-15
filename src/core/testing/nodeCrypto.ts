/**
 * Typed `node:crypto` for tests, as an independent oracle for the app's own hashing (the app's
 * tsconfig has no Node types, so the module is loaded at run time and given just the shape used
 * here, the same way core/testing/node does for `node:child_process`). Test-only: never import
 * this from app code.
 */

export type NodeHashAlgorithm = 'sha1' | 'sha256' | 'sha512';
export type NodeDigest = 'hex' | 'base64' | 'base64url';

interface NodeHash {
  update: (data: Uint8Array | string) => NodeHash;
  digest: (encoding: NodeDigest) => string;
}

interface NodeCrypto {
  createHash: (algorithm: NodeHashAlgorithm) => NodeHash;
  createHmac: (algorithm: NodeHashAlgorithm, key: Uint8Array | string) => NodeHash;
  randomBytes: (size: number) => Uint8Array & { toString: (encoding: NodeDigest) => string };
}

// A variable specifier keeps both TypeScript and Vite from resolving it at build time.
const NODE_CRYPTO = 'node:crypto';
const raw = (await import(/* @vite-ignore */ NODE_CRYPTO)) as NodeCrypto;

/** Digest of `data` with Node's own implementation. */
export const nodeDigest = (algorithm: NodeHashAlgorithm, data: Uint8Array | string, encoding: NodeDigest = 'hex'): string =>
  raw.createHash(algorithm).update(data).digest(encoding);

/** HMAC of `data` under `key` with Node's own implementation. */
export const nodeHmac = (algorithm: NodeHashAlgorithm, key: Uint8Array | string, data: Uint8Array | string, encoding: NodeDigest = 'hex'): string =>
  raw.createHmac(algorithm, key).update(data).digest(encoding);

/** Cryptographically random bytes from Node (a plain copy, so it can be passed to code that expects a `Uint8Array`). */
export const nodeRandomBytes = (size: number): Uint8Array => new Uint8Array(raw.randomBytes(size));

/** `size` random bytes as base64url text (a PKCE-style verifier). */
export const nodeRandomBase64url = (size: number): string => raw.randomBytes(size).toString('base64url');
