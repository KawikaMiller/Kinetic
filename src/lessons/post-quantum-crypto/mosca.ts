/** Mosca's inequality: data that must stay secret x years, migration taking y years, a hypothetical machine z years away. */
export const X_MAX = 50;
export const Y_MAX = 20;
export const Z_MAX = 50;

export interface Mosca {
  x: number;
  y: number;
  z: number;
}

export const DEFAULT_MOSCA: Mosca = { x: 10, y: 5, z: 12 };

/** What is being protected: secrecy of recorded data, or the trust in a signature or a key. Only the wording of x differs. */
export type Protects = 'secrecy' | 'signature';

export interface Verdict {
  /** The years of exposure the verdict compares with z: x + y. */
  exposure: number;
  /** z - exposure: negative means the machine arrives first. */
  slack: number;
  atRisk: boolean;
}

/**
 * At risk exactly when x + y > z (strict: x + y = z is not at risk). For secrecy x is how long the data must stay secret.
 * For a signature scheme x is how long a signature, or a key burned into fielded devices, stays trusted after it is made:
 * a forgery is accepted for as long as the old key is trusted, so x counts. x is 0 only for a signature that is checked at the
 * moment it is made, and then only the migration y has to beat z.
 */
export function verdict(m: Mosca): Verdict {
  const exposure = m.x + m.y;
  return { exposure, slack: m.z - exposure, atRisk: exposure > m.z };
}

export interface MoscaPreset {
  label: string;
  protects: Protects;
  values: Mosca;
}

/** Illustrative numbers only: the page forecasts nothing. */
export const MOSCA_PRESETS: readonly MoscaPreset[] = [
  { label: 'a one-day session token', protects: 'secrecy', values: { x: 0, y: 5, z: 12 } },
  { label: 'medical records', protects: 'secrecy', values: { x: 30, y: 5, z: 12 } },
  { label: 'a login assertion checked once', protects: 'signature', values: { x: 0, y: 10, z: 12 } },
  { label: 'a root key fielded in devices', protects: 'signature', values: { x: 15, y: 10, z: 12 } },
];

export interface HarvestCell {
  role: 'today' | 'horizon' | 'machine';
  /** Years from now. */
  year: number;
  text: string;
  /** The cell where the old scheme must be out of use or the data still secret, red when at risk. */
  atRisk: boolean;
}

const CELL_ORDER: Record<HarvestCell['role'], number> = { today: 0, horizon: 1, machine: 2 };

/** The three moments of the timeline, sorted by year (x + y can fall before or after z); equal years keep today, horizon, machine. */
export function harvestCells(m: Mosca, protects: Protects): HarvestCell[] {
  const v = verdict(m);
  const secrecy = protects === 'secrecy';
  const cells: HarvestCell[] = [
    { role: 'today', year: 0, atRisk: false, text: secrecy ? 'traffic is recorded: it is ciphertext, unreadable for now' : 'signatures are made and checked as usual: nothing can be forged yet' },
    {
      role: 'machine',
      year: m.z,
      atRisk: false,
      text: secrecy ? 'the hypothetical machine exists and the recording can be read' : 'the hypothetical machine exists and could forge a signature under the old scheme',
    },
    {
      role: 'horizon',
      year: v.exposure,
      atRisk: v.atRisk,
      text: secrecy ? 'the data must still be secret, counting the time to migrate' : 'the last signature or key still trusted under the old scheme must be gone: it stays trusted x years after it is made, and the migration takes y',
    },
  ];
  return cells.sort((p, q) => p.year - q.year || CELL_ORDER[p.role] - CELL_ORDER[q.role]);
}

export const slackText = (slack: number): string => `slack ${slack < 0 ? `-${-slack}` : slack}`;
