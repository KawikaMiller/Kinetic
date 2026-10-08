// A simplified passkey: the authenticator keeps one key pair per site (origin) and signs a
// challenge together with the origin the browser says it is talking to. Real ECDSA (P-256), real
// verification; the real WebAuthn adds attestation, signature counters, user verification and a
// binary wire format, none of which is modelled here.
import { ecdsaKeyPair, ecdsaSign, ecdsaVerify, enc, toHex } from '../../core/crypto';

export const REAL_ORIGIN = 'https://shop.example';
export const LOOKALIKE_ORIGIN = 'https://shop-example.test';
export const CHALLENGE_BYTES = 16;

/** What gets signed: the server's challenge, then the origin the client reports, so neither can be swapped. */
export function signedData(challenge: Uint8Array, origin: string): Uint8Array<ArrayBuffer> {
  const o = enc.encode(origin);
  const out = new Uint8Array(challenge.length + 1 + o.length);
  out.set(challenge, 0);
  out[challenge.length] = 0;
  out.set(o, challenge.length + 1);
  return out;
}

export class Authenticator {
  private readonly keys = new Map<string, CryptoKeyPair>();

  /** Create the credential for one site; only that origin can ever use it. */
  async register(origin: string): Promise<CryptoKey | null> {
    const pair = await ecdsaKeyPair();
    if (!pair) return null;
    this.keys.set(origin, pair);
    return pair.publicKey;
  }

  hasCredentialFor(origin: string) {
    return this.keys.has(origin);
  }

  /** Sign for the origin the browser reports, or null: with no credential for it there is nothing to offer. */
  async assert(origin: string, challenge: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
    const pair = this.keys.get(origin);
    return pair ? ecdsaSign(pair.privateKey, signedData(challenge, origin)) : null;
  }
}

/** The server's check: the signature must cover the challenge it issued and ITS OWN origin. */
export const verifyAssertion = (publicKey: CryptoKey, signature: Uint8Array<ArrayBuffer>, challenge: Uint8Array, expectedOrigin: string) =>
  ecdsaVerify(publicKey, signature, signedData(challenge, expectedOrigin));

export interface PasskeyProof {
  challenge: Uint8Array<ArrayBuffer>;
  /** The authenticator's signature for the real site. */
  signature: Uint8Array<ArrayBuffer>;
  signatureHex: string;
  /** The real server verifying it for its own origin. */
  verifiesForReal: boolean;
  /** The same signature checked as if it had been made for the look-alike origin. */
  verifiesForLookalike: boolean;
  /** What the authenticator offers on the look-alike origin. */
  lookalikeAssertion: Uint8Array | null;
}

/** Everything the phishing scene shows, computed with the real primitives. */
export async function makeProof(): Promise<PasskeyProof | null> {
  const authenticator = new Authenticator();
  const publicKey = await authenticator.register(REAL_ORIGIN);
  if (!publicKey) return null;
  const challenge = crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES));
  const signature = await authenticator.assert(REAL_ORIGIN, challenge);
  if (!signature) return null;
  return {
    challenge,
    signature,
    signatureHex: toHex(signature),
    verifiesForReal: (await verifyAssertion(publicKey, signature, challenge, REAL_ORIGIN)) === true,
    verifiesForLookalike: (await verifyAssertion(publicKey, signature, challenge, LOOKALIKE_ORIGIN)) === true,
    lookalikeAssertion: await authenticator.assert(LOOKALIKE_ORIGIN, challenge),
  };
}
