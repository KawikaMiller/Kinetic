/**
 * Envelope encryption on real WebCrypto, with a simulated KMS (a service object in this page). The data is encrypted with
 * AES-GCM under a fresh data key (DEK); the DEK is wrapped by the tenant's key-encryption key (KEK), which is a
 * non-extractable CryptoKey, so this page cannot read its bytes. Nothing is persisted, and nothing leaves the page.
 */
import { enc } from '../../core/crypto';

export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const DEK_BYTES = 32;
/** A wrapped DEK is its own IV, the encrypted 32-byte key and the GCM tag: what a re-wrap touches per record. */
export const WRAPPED_BYTES = IV_BYTES + DEK_BYTES + TAG_BYTES;

export type Bytes = Uint8Array<ArrayBuffer>;

export const randomBytes = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

const dec = new TextDecoder();
const AES = (iv: Bytes, aad: Bytes): AesGcmParams => ({ name: 'AES-GCM', iv, additionalData: aad });

/** AES-256-GCM encrypt: ciphertext followed by the 16-byte tag. The one encrypt function every record goes through. */
export async function aesGcmEncrypt(key: CryptoKey, iv: Bytes, aad: Bytes, plaintext: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.encrypt(AES(iv, aad), key, plaintext));
}

export async function aesGcmDecrypt(key: CryptoKey, iv: Bytes, aad: Bytes, ciphertextAndTag: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.decrypt(AES(iv, aad), key, ciphertextAndTag));
}

export const importAesKey = (raw: Bytes, usages: KeyUsage[]): Promise<CryptoKey> => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, usages);

export interface Wrapped {
  iv: Bytes;
  /** The encrypted DEK with its tag. */
  bytes: Bytes;
  /** Which version of the tenant's KEK wrapped it. */
  version: number;
}

export interface Envelope {
  id: string;
  tenant: string;
  /** The IV of the data encryption. */
  iv: Bytes;
  /** The record's ciphertext with its tag. The plaintext is never stored. */
  ciphertext: Bytes;
  wrapped: Wrapped;
  /** The encryption context the DEK was wrapped under: the tenant id. */
  context: string;
}

export class KmsError extends Error {
  readonly reason: 'kek-destroyed' | 'no-such-version';
  constructor(reason: 'kek-destroyed' | 'no-such-version', message: string) {
    super(message);
    this.reason = reason;
  }
}

/** The simulated KMS: one KEK per tenant, versioned, never readable by its caller, with a count of the calls made. */
export class Kms {
  private readonly keys = new Map<string, Map<number, CryptoKey>>();
  private readonly current = new Map<string, number>();
  private readonly destroyed = new Set<string>();
  /** How many wrap, unwrap and re-wrap calls the page has made. */
  calls = 0;

  async createTenant(tenant: string): Promise<void> {
    this.keys.set(tenant, new Map());
    await this.rotate(tenant);
  }

  /** A new KEK version; older versions stay so existing wrapped DEKs can still be unwrapped. */
  async rotate(tenant: string): Promise<number> {
    const kek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
    const version = (this.current.get(tenant) ?? 0) + 1;
    this.keys.get(tenant)!.set(version, kek);
    this.current.set(tenant, version);
    return version;
  }

  /** Crypto-shredding: the KEK and every version of it are gone. */
  destroy(tenant: string): void {
    this.keys.get(tenant)?.clear();
    this.destroyed.add(tenant);
  }

  isDestroyed = (tenant: string) => this.destroyed.has(tenant);
  version = (tenant: string) => this.current.get(tenant) ?? 0;

  /** What the page can learn about a KEK: its version and that WebCrypto will not export it. */
  describe(tenant: string): { version: number; extractable: boolean } | null {
    const key = this.keys.get(tenant)?.get(this.version(tenant));
    return key ? { version: this.version(tenant), extractable: key.extractable } : null;
  }

  private kek(tenant: string, version: number): CryptoKey {
    if (this.destroyed.has(tenant)) throw new KmsError('kek-destroyed', `the key for ${tenant} was destroyed`);
    const key = this.keys.get(tenant)?.get(version);
    if (!key) throw new KmsError('no-such-version', `no version ${version} of the key for ${tenant}`);
    return key;
  }

  /** Wrap a DEK under the tenant's current KEK, bound to `context`. */
  async wrap(tenant: string, dek: CryptoKey, context: string): Promise<Wrapped> {
    this.calls += 1;
    const version = this.version(tenant);
    const iv = randomBytes(IV_BYTES);
    const bytes = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, this.kek(tenant, version), AES(iv, enc.encode(context))));
    return { iv, bytes, version };
  }

  /** Unwrap a DEK with the KEK of `tenant` and version it was wrapped under. A wrong tenant or context fails authentication. */
  async unwrap(tenant: string, context: string, w: Wrapped): Promise<CryptoKey> {
    this.calls += 1;
    return this.unwrapInside(tenant, context, w);
  }

  private unwrapInside(tenant: string, context: string, w: Wrapped): Promise<CryptoKey> {
    return crypto.subtle.unwrapKey('raw', w.bytes, this.kek(tenant, w.version), AES(w.iv, enc.encode(context)), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  /** Move a wrapped DEK to the current KEK version without the caller ever holding the DEK. */
  async rewrap(tenant: string, context: string, w: Wrapped): Promise<Wrapped> {
    this.calls += 1;
    const dek = await this.unwrapInside(tenant, context, w);
    const version = this.version(tenant);
    const iv = randomBytes(IV_BYTES);
    const bytes = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, this.kek(tenant, version), AES(iv, enc.encode(context))));
    return { iv, bytes, version };
  }
}

const generateDek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

/** Encrypt a record: a fresh DEK, AES-GCM with the record id as additional data, the DEK wrapped by the KMS. The plaintext DEK is dropped. */
export async function encryptRecord(kms: Kms, tenant: string, id: string, text: string): Promise<Envelope> {
  const dek = await generateDek();
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await aesGcmEncrypt(dek, iv, enc.encode(id), enc.encode(text));
  const wrapped = await kms.wrap(tenant, dek, tenant);
  return { id, tenant, iv, ciphertext, wrapped, context: tenant };
}

export type DecryptResult =
  | { ok: true; text: string }
  | { ok: false; stage: 'kms' | 'data'; reason: string; errorName: string };

/** Which KEK and context the KMS is asked to use. The honest ask is the envelope's own; a different one is the "wrong context" demo. */
export interface Claim {
  kekTenant: string;
  context: string;
}

export async function decryptRecord(kms: Kms, env: Envelope, claim: Claim = { kekTenant: env.tenant, context: env.context }): Promise<DecryptResult> {
  let dek: CryptoKey;
  try {
    dek = await kms.unwrap(claim.kekTenant, claim.context, env.wrapped);
  } catch (e) {
    const name = e instanceof KmsError ? e.reason : (e as Error).name;
    return { ok: false, stage: 'kms', errorName: name, reason: e instanceof KmsError ? e.message : 'the KMS could not authenticate the wrapped key for that context' };
  }
  try {
    return { ok: true, text: dec.decode(await aesGcmDecrypt(dek, env.iv, enc.encode(env.id), env.ciphertext)) };
  } catch (e) {
    return { ok: false, stage: 'data', errorName: (e as Error).name, reason: 'the ciphertext failed authentication' };
  }
}

/** Re-wrap every envelope of a tenant under its current KEK; ciphertext and IV are untouched. */
export async function rewrapTenant(kms: Kms, tenant: string, envelopes: readonly Envelope[]): Promise<Envelope[]> {
  return Promise.all(envelopes.map(async (e) => (e.tenant === tenant ? { ...e, wrapped: await kms.rewrap(tenant, e.context, e.wrapped) } : e)));
}

/** Re-encrypt one record under a brand new DEK: the only way to change the DEK itself. */
export async function reencryptRecord(kms: Kms, env: Envelope): Promise<Envelope> {
  const r = await decryptRecord(kms, env);
  if (!r.ok) throw new Error(r.reason);
  return encryptRecord(kms, env.tenant, env.id, r.text);
}
