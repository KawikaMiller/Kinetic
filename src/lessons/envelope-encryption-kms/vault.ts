/** The lesson's in-page vault: the simulated KMS, the stored envelopes and a backup copy. Nothing is persisted. */
import { Kms, decryptRecord, encryptRecord, reencryptRecord, rewrapTenant, type Envelope } from './envelope';

export const TENANTS = [
  { id: 'acme', label: 'Acme' },
  { id: 'birch', label: 'Birch' },
  { id: 'cedar', label: 'Cedar' },
] as const;
export type TenantId = (typeof TENANTS)[number]['id'];

/** The longest record text the lesson accepts. */
export const MAX_TEXT = 64;

/** Two fake example records per tenant, so every scene opens on something to look at. */
export const SEED_TEXT: Record<TenantId, readonly string[]> = {
  acme: ['Invoice 1001 for three widgets', 'Support note: ring back Tuesday'],
  birch: ['Invoice 2001 for one gadget', 'Delivery window: mornings only'],
  cedar: ['Invoice 3001 for ten sprockets', 'Renewal reminder for March'],
};

export interface Vault {
  kms: Kms;
  records: readonly Envelope[];
  /** A copy of every envelope as it was when the backup was taken. */
  backup: readonly Envelope[];
  nextId: number;
  /** Counts every change, so a view can key an async read on it. */
  rev: number;
}

export const tenantLabel = (id: string) => TENANTS.find((t) => t.id === id)?.label ?? id;

const copy = (e: Envelope): Envelope => ({ ...e, iv: e.iv.slice(), ciphertext: e.ciphertext.slice(), wrapped: { ...e.wrapped, iv: e.wrapped.iv.slice(), bytes: e.wrapped.bytes.slice() } });

export async function buildVault(): Promise<Vault> {
  const kms = new Kms();
  const records: Envelope[] = [];
  let n = 1;
  for (const t of TENANTS) {
    await kms.createTenant(t.id);
    for (const text of SEED_TEXT[t.id]) records.push(await encryptRecord(kms, t.id, `rec-${n++}`, text));
  }
  return { kms, records, backup: records.map(copy), nextId: n, rev: 0 };
}

/** Half of a surrogate pair: encoding would turn it into U+FFFD, so the record would not decrypt to what was typed. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export type TextCheck = { ok: true; text: string } | { ok: false; error: string };

/** Record text: not empty, at most MAX_TEXT characters (counted as the learner sees them). Anything else is data, never run. */
export function checkText(raw: string): TextCheck {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Type some text first.' };
  if (LONE_SURROGATE.test(text)) return { ok: false, error: 'That text has a broken character; type it again.' };
  if ([...text].length > MAX_TEXT) return { ok: false, error: `At most ${MAX_TEXT} characters.` };
  return { ok: true, text };
}

export async function addRecord(v: Vault, tenant: TenantId, text: string): Promise<Vault> {
  const e = await encryptRecord(v.kms, tenant, `rec-${v.nextId}`, text);
  return { ...v, records: [...v.records, e], nextId: v.nextId + 1, rev: v.rev + 1 };
}

/** A new KEK version, then every wrapped DEK of the tenant moved onto it. */
export async function rotateTenant(v: Vault, tenant: TenantId): Promise<Vault> {
  await v.kms.rotate(tenant);
  return { ...v, records: await rewrapTenant(v.kms, tenant, v.records), rev: v.rev + 1 };
}

export async function rotateDek(v: Vault, id: string): Promise<Vault> {
  const at = v.records.findIndex((r) => r.id === id);
  if (at < 0) return v;
  const next = await reencryptRecord(v.kms, v.records[at]);
  return { ...v, records: v.records.map((r, i) => (i === at ? next : r)), rev: v.rev + 1 };
}

export function destroyTenant(v: Vault, tenant: TenantId): Vault {
  v.kms.destroy(tenant);
  return { ...v, rev: v.rev + 1 };
}

/** Can this envelope be read right now? Runs the real decryption. */
export async function readable(v: Vault, e: Envelope): Promise<boolean> {
  return (await decryptRecord(v.kms, e, undefined, { count: false })).ok;
}
