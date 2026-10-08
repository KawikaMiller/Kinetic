// How long a leaked credential stays useful. Everything takes a lesson clock `t` (simulated
// minutes), so a test can drive it. The long-lived key's lifetime is "until someone rotates it":
// illustrative, and drawn not to scale.

export const ROLE_MINUTES = 15;
/** An access key in a config file that nobody rotates for a year (illustrative). */
export const KEY_ROTATION_MINUTES = 365 * 24 * 60;
export const DEFAULT_ROTATION_MIN = 10;
export const DOMAIN_MINUTES = 60;

/** A credential issued at `issuedAt` that stops working after `ttl` minutes. */
export interface Credential {
  issuedAt: number;
  ttl: number;
}

export const isValid = (c: Credential, t: number) => t >= c.issuedAt && t < c.issuedAt + c.ttl;
export const expiresAt = (c: Credential) => c.issuedAt + c.ttl;

/** Minutes a copy made at `leakAt` still works, or 0 if it was already dead. */
export const exposure = (c: Credential, leakAt: number) => (isValid(c, leakAt) ? expiresAt(c) - leakAt : 0);

/** The vault hands each deploy a database credential that lives for one rotation period. */
export const vaultCredentialAt = (rotation: number, t: number): Credential => {
  const k = Math.floor(t / rotation);
  return { issuedAt: k * rotation, ttl: rotation };
};

export const vaultCredentials = (rotation: number, until: number): Credential[] =>
  Array.from({ length: Math.ceil(until / rotation) }, (_, k) => ({ issuedAt: k * rotation, ttl: rotation }));

export interface Exposure {
  key: number;
  role: number;
  vault: number;
}

export function exposures(leakAt: number, rotation: number): Exposure {
  return {
    key: exposure({ issuedAt: 0, ttl: KEY_ROTATION_MINUTES }, leakAt),
    // Role sessions run back to back, like the bars drawn in the lane, so a copy is made mid-session.
    role: exposure(vaultCredentialAt(ROLE_MINUTES, leakAt), leakAt),
    vault: exposure(vaultCredentialAt(rotation, leakAt), leakAt),
  };
}

export type LaneId = 'key' | 'role' | 'vault';
export interface LaneBar {
  id: string;
  lane: LaneId;
  start: number;
  end: number;
  /** info: a credential in normal use. bad: the leaked copy, still working. dim: the leaked copy, expired. */
  tone: 'info' | 'bad' | 'dim';
  label?: string;
}

/** One lane: back-to-back credentials of `ttl` minutes, the leaked one split at the leak (the part after it is the copy). */
function sessionBars(lane: LaneId, ttl: number, leakAt: number, now: number, domain: number, label: string): LaneBar[] {
  const leaked = now >= leakAt;
  const bars: LaneBar[] = [];
  for (let k = 0; k * ttl < domain; k++) {
    const start = k * ttl;
    const expiry = start + ttl;
    const end = Math.min(expiry, domain);
    const holdsLeak = leaked && leakAt >= start && leakAt < expiry;
    if (!holdsLeak) {
      bars.push({ id: `${lane}-${k}`, lane, start, end, tone: 'info', label });
      continue;
    }
    if (leakAt > start) bars.push({ id: `${lane}-${k}-a`, lane, start, end: leakAt, tone: 'info' });
    const alive = now < expiry;
    bars.push({ id: `${lane}-${k}-b`, lane, start: leakAt, end, tone: alive ? 'bad' : 'dim', label: alive ? 'copy still works' : 'copy expired' });
  }
  return bars;
}

/** The three lanes' bars at lesson time `now`. */
export function laneBars(leakAt: number, rotation: number, now: number, domain = DOMAIN_MINUTES): LaneBar[] {
  return [
    ...sessionBars('key', KEY_ROTATION_MINUTES,leakAt, now, domain, 'access key: no expiry'),
    ...sessionBars('role', ROLE_MINUTES, leakAt, now, domain, 'role session'),
    ...sessionBars('vault', rotation, leakAt, now, domain, 'vault credential'),
  ];
}
