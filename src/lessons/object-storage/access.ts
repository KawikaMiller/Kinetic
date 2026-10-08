/**
 * The access and money side of an object store: a presigned URL (a link that carries its own
 * permission, expiry and signature), read-after-write consistency, and an illustrative price model.
 * The signature is a toy hash, not a real signing algorithm, and every price is made up.
 */
import { fnv1a, hash32 } from '../../core/hash';

export type Method = 'GET' | 'PUT';

export interface Presigned {
  method: Method;
  key: string;
  /** Unix seconds after which the link stops working. */
  expires: number;
  signature: string;
}

const hex8 = (n: number) => n.toString(16).padStart(8, '0');

/** A toy signature over what the link grants: it changes if the method, key or expiry change, and needs the secret. */
export function sign(secret: string, method: Method, key: string, expires: number): string {
  const canonical = `${method}\n${key}\n${expires}`;
  return hex8(hash32(`${secret}|${canonical}`)) + hex8(fnv1a(`${canonical}|${secret}`));
}

export function presign(secret: string, method: Method, key: string, issuedAt: number, ttlSeconds: number): Presigned {
  const expires = issuedAt + ttlSeconds;
  return { method, key, expires, signature: sign(secret, method, key, expires) };
}

export type Verdict = 'ok' | 'expired' | 'bad-signature';

/** What the store does with a request that arrives with this link at time `now`: the signature must match, then the link must not have expired. */
export function verify(secret: string, link: Presigned, now: number): Verdict {
  if (link.signature !== sign(secret, link.method, link.key, link.expires)) return 'bad-signature';
  return now > link.expires ? 'expired' : 'ok';
}

export const toUrl = (link: Presigned, host = 'example-reports.objects.example') =>
  `https://${host}/${link.key}?method=${link.method}&expires=${link.expires}&signature=${link.signature}`;

// ---------- consistency ----------

export type ConsistencyModel = 'strong' | 'eventual';
/** Reads after a write that still see the old copy under an eventually consistent store. */
export const STALE_READS = 2;

/** Which version a read sees after an overwrite, given how many reads came before it. Strong: always the new one. */
export function readAfterWrite(model: ConsistencyModel, readsSoFar: number): 'new' | 'old' {
  return model === 'strong' || readsSoFar >= STALE_READS ? 'new' : 'old';
}

// ---------- the price model ----------

export type StorageClass = 'standard' | 'infrequent' | 'archive';
export const CLASSES: StorageClass[] = ['standard', 'infrequent', 'archive'];

export interface Prices {
  /** Dollars per GB stored for a month. */
  storage: number;
  /** Dollars per 1,000 write requests and per 1,000 read requests. */
  per1000Writes: number;
  per1000Reads: number;
  /** Dollars per GB read back from the class. */
  retrievalPerGb: number;
  /** Dollars per GB sent out to the internet. */
  egressPerGb: number;
}

export const PRICES: Record<StorageClass, Prices> = {
  standard: { storage: 0.023, per1000Writes: 0.005, per1000Reads: 0.0004, retrievalPerGb: 0, egressPerGb: 0.09 },
  infrequent: { storage: 0.0125, per1000Writes: 0.01, per1000Reads: 0.001, retrievalPerGb: 0.01, egressPerGb: 0.09 },
  archive: { storage: 0.004, per1000Writes: 0.03, per1000Reads: 0.002, retrievalPerGb: 0.03, egressPerGb: 0.09 },
};

export interface Usage {
  storedGb: number;
  writes: number;
  reads: number;
  /** GB read back from the class (this is also what leaves, if it all goes to the internet). */
  readBackGb: number;
  /** GB sent to the internet. */
  egressGb: number;
}

export interface Bill {
  storage: number;
  requests: number;
  retrieval: number;
  egress: number;
  total: number;
}

/** Only what was read back can leave for the internet, so lowering the read-back volume pulls the egress down with it. */
export const withReadBack = (u: Usage, readBackGb: number): Usage => ({ ...u, readBackGb, egressGb: Math.min(u.egressGb, readBackGb) });

/** A month's bill: linear in every part of the usage. */
export function monthlyBill(cls: StorageClass, u: Usage): Bill {
  const p = PRICES[cls];
  const storage = u.storedGb * p.storage;
  const requests = (u.writes / 1000) * p.per1000Writes + (u.reads / 1000) * p.per1000Reads;
  const retrieval = u.readBackGb * p.retrievalPerGb;
  const egress = u.egressGb * p.egressPerGb;
  return { storage, requests, retrieval, egress, total: storage + requests + retrieval + egress };
}
