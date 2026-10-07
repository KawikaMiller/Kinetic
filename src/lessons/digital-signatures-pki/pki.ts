// A tiny simulated PKI: certificate stand-ins (JSON, not X.509) with real ECDSA P-256
// signatures, a simulated trust store, and a chain validator that walks from the leaf up
// and stops at the first failure with its reason. All names are fictional; time comes from
// a fixed lesson clock, never Date.now(), so every run gives the same verdicts.
import { ecdsaKeyPair, ecdsaSign, ecdsaVerify, enc, hasSubtle, hexToBytes, toHex } from '../../core/crypto';

/** The lesson's "now". */
export const LESSON_NOW = '2026-03-01T12:00:00Z';

export interface Cert {
  subject: string;
  issuer: string;
  /** Hostnames a leaf is valid for (empty for CAs). */
  names: string[];
  notBefore: string;
  notAfter: string;
  /** May this certificate issue other certificates? (X.509's basicConstraints CA flag.) */
  isCA: boolean;
  /** The subject's public key: 65 bytes, 0x04 ‖ x ‖ y, as hex. */
  publicKey: string;
  /** The issuer's ECDSA signature over everything above, as hex (64 bytes, r ‖ s). */
  signature: string;
}

export type Unsigned = Omit<Cert, 'signature'>;

/** The exact bytes a certificate's signature covers: its fields in a fixed order. */
export const tbsBytes = (c: Unsigned) =>
  enc.encode(JSON.stringify([c.subject, c.issuer, c.names, c.notBefore, c.notAfter, c.isCA, c.publicKey]));

export async function publicHex(k: CryptoKeyPair): Promise<string> {
  return toHex(await crypto.subtle.exportKey('raw', k.publicKey));
}

export async function issue(fields: Unsigned, issuerKey: CryptoKey): Promise<Cert> {
  const sig = await ecdsaSign(issuerKey, tbsBytes(fields));
  return { ...fields, signature: toHex(sig!) };
}

const importPublic = (hex: string) =>
  crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);

/** A real ECDSA verify of `cert`'s signature with the public key in `issuer`. */
export async function signatureValid(cert: Cert, issuer: Cert): Promise<boolean> {
  try {
    return (await ecdsaVerify(await importPublic(issuer.publicKey), hexToBytes(cert.signature), tbsBytes(cert))) === true;
  } catch {
    return false;
  }
}

/**
 * Hostname match, case-insensitive. A wildcard is allowed only as the whole leftmost label
 * and stands for exactly one label: *.shop.example matches www.shop.example, not
 * shop.example and not a.b.shop.example.
 */
export function matchName(host: string, pattern: string): boolean {
  const h = host.toLowerCase().split('.');
  const p = pattern.toLowerCase().split('.');
  if (h.length !== p.length) return false;
  return p.every((label, i) => (i === 0 && label === '*' ? h[0].length > 0 : label === h[i]));
}

export type Reason =
  | 'expired' | 'not-yet-valid' | 'name-mismatch' | 'missing-issuer' | 'bad-signature' | 'issuer-not-ca' | 'self-signed' | 'unknown-root';

/** The browser-style wording for each failure. */
export const REASON_TEXT: Record<Reason, string> = {
  expired: 'certificate has expired',
  'not-yet-valid': 'certificate is not yet valid',
  'name-mismatch': 'certificate is not valid for this name',
  'missing-issuer': 'can\'t find the issuer\'s certificate (a missing intermediate)',
  'bad-signature': 'signature doesn\'t verify (the certificate was changed after signing)',
  'issuer-not-ca': 'issuer isn\'t allowed to issue certificates (CA flag off)',
  'self-signed': 'self-signed certificate: nobody you trust vouches for it',
  'unknown-root': 'issued by a root that isn\'t in your trust store',
};

export type CheckId = 'dates' | 'name' | 'issuer' | 'signature' | 'ca' | 'trust';

export interface Check {
  /** Index into the presented chain (leaf = 0). */
  cert: number;
  id: CheckId;
  ok: boolean;
  detail: string;
  reason?: Reason;
}

export interface Validation {
  checks: Check[];
  /** null when the chain is valid. */
  reason: Reason | null;
}

const inStore = (c: Cert, store: readonly Cert[]) => store.some((s) => s.subject === c.subject && s.publicKey === c.publicKey);
const shortDate = (iso: string) => iso.slice(0, 10);

/**
 * Walk the chain from the leaf up, as a browser does in outline: dates and name on the leaf,
 * then for each certificate find its issuer, verify the signature with the issuer's key,
 * require the issuer to be a CA, check its dates, and stop at a root in the trust store.
 * The first failing check ends the walk.
 */
export async function validate(chain: readonly Cert[], store: readonly Cert[], host: string, now = LESSON_NOW): Promise<Validation> {
  const checks: Check[] = [];
  const fail = (c: Omit<Check, 'ok'> & { reason: Reason }): Validation => {
    checks.push({ ...c, ok: false });
    return { checks, reason: c.reason };
  };
  const dates = (c: Cert, i: number): Validation | null => {
    if (now > c.notAfter) return fail({ cert: i, id: 'dates', detail: `expired ${shortDate(c.notAfter)}`, reason: 'expired' });
    if (now < c.notBefore) return fail({ cert: i, id: 'dates', detail: `valid only from ${shortDate(c.notBefore)}`, reason: 'not-yet-valid' });
    checks.push({ cert: i, id: 'dates', ok: true, detail: `valid ${shortDate(c.notBefore)} to ${shortDate(c.notAfter)}` });
    return null;
  };

  const leaf = chain[0];
  const d = dates(leaf, 0);
  if (d) return d;
  if (!leaf.names.some((n) => matchName(host, n))) {
    return fail({ cert: 0, id: 'name', detail: `for ${leaf.names.join(', ')}, not ${host}`, reason: 'name-mismatch' });
  }
  checks.push({ cert: 0, id: 'name', ok: true, detail: `${host} matches` });

  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (cert.issuer === cert.subject) {
      const ok = await signatureValid(cert, cert);
      if (!ok) return fail({ cert: i, id: 'signature', detail: 'its own signature doesn\'t verify', reason: 'bad-signature' });
      checks.push({ cert: i, id: 'signature', ok: true, detail: 'signs itself, and the signature checks out' });
      if (inStore(cert, store)) {
        checks.push({ cert: i, id: 'trust', ok: true, detail: 'in your trust store' });
        return { checks, reason: null };
      }
      return fail({ cert: i, id: 'trust', detail: 'not in your trust store', reason: i === 0 ? 'self-signed' : 'unknown-root' });
    }
    const presented = chain.findIndex((c, j) => j > i && c.subject === cert.issuer);
    const anchor = store.find((s) => s.subject === cert.issuer);
    const issuer = presented >= 0 ? chain[presented] : anchor;
    if (!issuer) return fail({ cert: i, id: 'issuer', detail: `no certificate for "${cert.issuer}" was sent`, reason: 'missing-issuer' });
    checks.push({ cert: i, id: 'issuer', ok: true, detail: `issued by ${cert.issuer}` });
    if (!(await signatureValid(cert, issuer))) {
      return fail({ cert: i, id: 'signature', detail: `${cert.issuer}'s signature doesn't verify`, reason: 'bad-signature' });
    }
    checks.push({ cert: i, id: 'signature', ok: true, detail: `${cert.issuer}'s signature verifies` });
    if (!issuer.isCA) return fail({ cert: i, id: 'ca', detail: `${issuer.subject} has the CA flag off`, reason: 'issuer-not-ca' });
    checks.push({ cert: i, id: 'ca', ok: true, detail: `${issuer.subject} may issue certificates` });
    if (presented < 0) {
      checks.push({ cert: i, id: 'trust', ok: true, detail: `${issuer.subject} is a root in your trust store` });
      return { checks, reason: null };
    }
    const id = dates(issuer, presented);
    if (id) return id;
  }
  return { checks, reason: 'missing-issuer' };
}

// ── The fictional PKI and its presets ──────────────────────────────

export const HOST = 'shop.example';
export const ROOT = 'Kinetic Demo Root CA';
export const INTERMEDIATE = 'Kinetic Demo Issuing CA';
export const ROGUE_ROOT = 'Unlisted Root CA';

export type Preset =
  | 'valid' | 'expired' | 'not-yet-valid' | 'name-mismatch' | 'unknown-root' | 'missing-intermediate' | 'not-ca' | 'tampered' | 'self-signed';

/** What each preset is built to fail with: the documented reason the validator must return. */
export const EXPECTED: Record<Preset, Reason | null> = {
  valid: null,
  expired: 'expired',
  'not-yet-valid': 'not-yet-valid',
  'name-mismatch': 'name-mismatch',
  'unknown-root': 'unknown-root',
  'missing-intermediate': 'missing-issuer',
  'not-ca': 'issuer-not-ca',
  tampered: 'bad-signature',
  'self-signed': 'self-signed',
};

export interface Keys {
  root: CryptoKeyPair;
  inter: CryptoKeyPair;
  leaf: CryptoKeyPair;
  rogue: CryptoKeyPair;
}

export async function makeKeys(): Promise<Keys | null> {
  if (!hasSubtle()) return null;
  const [root, inter, leaf, rogue] = await Promise.all([ecdsaKeyPair(), ecdsaKeyPair(), ecdsaKeyPair(), ecdsaKeyPair()]);
  return { root: root!, inter: inter!, leaf: leaf!, rogue: rogue! };
}

export interface Scenario {
  /** What the server presents, leaf first. */
  chain: Cert[];
  store: Cert[];
  host: string;
  /** The intermediate the leaf names but the server didn't send. */
  missing: string | null;
}

const YEAR = { from: '2025-09-01T00:00:00Z', to: '2026-09-01T00:00:00Z' };
const CA_SPAN = { from: '2020-01-01T00:00:00Z', to: '2035-01-01T00:00:00Z' };

export async function scenario(preset: Preset, keys: Keys): Promise<Scenario> {
  const pub = { root: await publicHex(keys.root), inter: await publicHex(keys.inter), leaf: await publicHex(keys.leaf), rogue: await publicHex(keys.rogue) };
  const root = await issue({ subject: ROOT, issuer: ROOT, names: [], notBefore: CA_SPAN.from, notAfter: CA_SPAN.to, isCA: true, publicKey: pub.root }, keys.root.privateKey);
  const store = [root];
  const caFields = { subject: INTERMEDIATE, names: [], notBefore: CA_SPAN.from, notAfter: CA_SPAN.to, publicKey: pub.inter };
  const inter = await issue({ ...caFields, issuer: ROOT, isCA: preset !== 'not-ca' }, keys.root.privateKey);
  const leafFields: Unsigned = {
    subject: HOST, issuer: INTERMEDIATE, names: [HOST], notBefore: YEAR.from, notAfter: YEAR.to, isCA: false, publicKey: pub.leaf,
  };
  const leafWith = (patch: Partial<Unsigned>) => issue({ ...leafFields, ...patch }, keys.inter.privateKey);
  const base = { store, host: HOST, missing: null };

  switch (preset) {
    case 'expired':
      return { ...base, chain: [await leafWith({ notBefore: '2025-01-01T00:00:00Z', notAfter: '2026-01-01T00:00:00Z' }), inter] };
    case 'not-yet-valid':
      return { ...base, chain: [await leafWith({ notBefore: '2026-06-01T00:00:00Z', notAfter: '2027-06-01T00:00:00Z' }), inter] };
    case 'name-mismatch':
      return { ...base, host: `www.${HOST}`, chain: [await leafWith({}), inter] };
    case 'missing-intermediate':
      return { ...base, missing: INTERMEDIATE, chain: [await leafWith({})] };
    case 'tampered': {
      // Signed honestly, then a name added afterwards: the signature no longer covers what's there.
      const signed = await leafWith({});
      return { ...base, chain: [{ ...signed, names: [HOST, `pay.${HOST}`] }, inter] };
    }
    case 'unknown-root': {
      const rogue = await issue({ subject: ROGUE_ROOT, issuer: ROGUE_ROOT, names: [], notBefore: CA_SPAN.from, notAfter: CA_SPAN.to, isCA: true, publicKey: pub.rogue }, keys.rogue.privateKey);
      const rogueInter = await issue({ ...caFields, issuer: ROGUE_ROOT, isCA: true }, keys.rogue.privateKey);
      return { ...base, chain: [await leafWith({}), rogueInter, rogue] };
    }
    case 'self-signed': {
      const self = await issue({ ...leafFields, issuer: HOST }, keys.leaf.privateKey);
      return { ...base, chain: [self] };
    }
    default:
      return { ...base, chain: [await leafWith({}), inter] };
  }
}
