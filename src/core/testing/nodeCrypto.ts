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

export type NodeCurve = 'prime256v1' | 'secp256k1';

interface NodeEcdh {
  setPrivateKey: (key: Uint8Array) => void;
  getPublicKey: (encoding: 'hex', format: 'uncompressed') => string;
  computeSecret: (otherPublicKey: Uint8Array) => Uint8Array;
}

interface NodeGcm {
  setAAD: (aad: Uint8Array) => void;
  update: (data: Uint8Array) => Uint8Array;
  final: () => Uint8Array;
  getAuthTag: () => Uint8Array;
}

interface NodeCrypto {
  createHash: (algorithm: NodeHashAlgorithm) => NodeHash;
  createHmac: (algorithm: NodeHashAlgorithm, key: Uint8Array | string) => NodeHash;
  randomBytes: (size: number) => Uint8Array & { toString: (encoding: NodeDigest) => string };
  createECDH: (curve: NodeCurve) => NodeEcdh;
  hkdfSync: (digest: 'sha256', ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) => ArrayBuffer;
  createCipheriv: (algorithm: string, key: Uint8Array, iv: Uint8Array) => NodeGcm;
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

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const scalarBytes = (scalar: bigint) => hexBytes(scalar.toString(16).padStart(64, '0'));
const toHexText = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The uncompressed public point `04 || x || y` (as hex) of `scalar · G` on a named curve, from Node's
 * own ECDH. The independent oracle for core/ecc. The scalar must be in 1..n-1 (Node refuses others).
 */
export const nodeEcdhPublic = (curve: NodeCurve, scalar: bigint): string => {
  const ecdh = raw.createECDH(curve);
  ecdh.setPrivateKey(scalarBytes(scalar));
  return ecdh.getPublicKey('hex', 'uncompressed');
};

/** The ECDH shared secret (the shared point's x, hex) of `scalar` with a peer's uncompressed public point (hex). */
export const nodeEcdhSecret = (curve: NodeCurve, scalar: bigint, peerPublicHex: string): string => {
  const ecdh = raw.createECDH(curve);
  ecdh.setPrivateKey(scalarBytes(scalar));
  return toHexText(ecdh.computeSecret(hexBytes(peerPublicHex)));
};

/** HKDF-SHA256 (RFC 5869) from Node's `hkdfSync`: the oracle for core/crypto `hkdf`. */
export const nodeHkdf = (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array =>
  new Uint8Array(raw.hkdfSync('sha256', ikm, salt, info, length));

/** AES-GCM seal from Node: ciphertext followed by the 16-byte tag, the same layout as core/crypto `aesGcmEncrypt`. */
export const nodeAesGcmSeal = (key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array => {
  const cipher = raw.createCipheriv(`aes-${8 * key.length}-gcm`, key, iv);
  if (aad) cipher.setAAD(aad);
  const body = Uint8Array.from([...cipher.update(plaintext), ...cipher.final()]);
  return Uint8Array.from([...body, ...cipher.getAuthTag()]);
};

/** `size` random bytes as base64url text (a PKCE-style verifier). */
export const nodeRandomBase64url = (size: number): string => raw.randomBytes(size).toString('base64url');
