// Real ECDH P-256 key agreement through WebCrypto. Lesson-local: this is its only user.
import { hasSubtle } from '../../core/crypto';

export interface EcdhSide {
  /** The public key as sent on the wire: 65 bytes, 0x04 ‖ x ‖ y (uncompressed point). */
  publicRaw: Uint8Array;
  /** Read back from the CryptoKey, so the "non-extractable" label is the browser's word, not ours. */
  privateExtractable: boolean;
  /** 256 bits derived from this side's private key and the other side's public key. */
  secret: Uint8Array;
}

const ALG = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** Two fresh key pairs and both sides' derived secrets; null without Web Crypto. */
export async function ecdhAgree(): Promise<{ alice: EcdhSide; bob: EcdhSide } | null> {
  if (!hasSubtle()) return null;
  const [a, b] = await Promise.all([
    crypto.subtle.generateKey(ALG, false, ['deriveBits']),
    crypto.subtle.generateKey(ALG, false, ['deriveBits']),
  ]);
  const side = async (mine: CryptoKeyPair, theirs: CryptoKeyPair): Promise<EcdhSide> => ({
    publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey)),
    privateExtractable: mine.privateKey.extractable,
    secret: new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs.publicKey }, mine.privateKey, 256)),
  });
  return { alice: await side(a, b), bob: await side(b, a) };
}
