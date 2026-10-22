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

/** What is being protected: secrecy of recorded data, or the trust in a signature scheme. */
export type Protects = 'secrecy' | 'signature';

export interface Verdict {
  /** The years of exposure the verdict compares with z: x + y for secrecy, y alone for a signature scheme. */
  exposure: number;
  /** z - exposure: negative means the machine arrives first. */
  slack: number;
  atRisk: boolean;
}

/**
 * Secrecy: at risk exactly when x + y > z (strict: x + y = z is not at risk). Signature: harvesting does not
 * apply, a forgery needs the machine at signing time, so only the migration y has to beat z.
 */
export function verdict(m: Mosca, protects: Protects): Verdict {
  const exposure = protects === 'secrecy' ? m.x + m.y : m.y;
  return { exposure, slack: m.z - exposure, atRisk: exposure > m.z };
}

export interface MoscaPreset {
  label: string;
  protects: Protects;
  values: Mosca;
}

export const MOSCA_PRESETS: readonly MoscaPreset[] = [
  { label: 'a one-day session token', protects: 'secrecy', values: { x: 0, y: 5, z: 12 } },
  { label: 'medical records', protects: 'secrecy', values: { x: 30, y: 5, z: 12 } },
  { label: 'a firmware signing key', protects: 'signature', values: { x: 0, y: 10, z: 12 } },
];

export const slackText = (slack: number): string => `slack ${slack < 0 ? `-${-slack}` : slack}`;
