import { b64url, enc } from '../../core/crypto';
import { sha256 } from '../../core/sha256';

/** The PKCE `S256` transform: BASE64URL(SHA-256(ASCII(code_verifier))), with no padding. */
export const s256 = (verifier: string) => b64url(sha256(enc.encode(verifier)));

/** A code_verifier is 43 to 128 characters from the unreserved set (the PKCE specification's own rule). */
export const VERIFIER_LENGTH = { min: 43, max: 128 } as const;
export const isValidVerifier = (v: string) =>
  v.length >= VERIFIER_LENGTH.min && v.length <= VERIFIER_LENGTH.max && /^[A-Za-z0-9\-._~]+$/.test(v);
