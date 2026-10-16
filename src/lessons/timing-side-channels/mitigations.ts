/**
 * The mitigation matrix: which classes of leak each mitigation addresses, and what it costs. A decision table in words:
 * no demonstration, no code that probes anything. The coverage verdicts are computed from the toggles; the entries
 * themselves are from memory and hedged on screen.
 */

export type MitigationId = 'serialise' | 'retpoline' | 'isolation' | 'flush' | 'constant-time' | 'microcode';
export type LeakClassId = 'crypto-timing' | 'bounds-bypass' | 'indirect-branch' | 'cross-site' | 'state-across-switch';
export type Coverage = 'full' | 'partial' | 'none';

export interface Mitigation {
  id: MitigationId;
  label: string;
  /** What it costs, in words. */
  cost: string;
}

export interface LeakClass {
  id: LeakClassId;
  label: string;
}

export const MITIGATIONS: readonly Mitigation[] = [
  { id: 'serialise', label: 'Serialising instructions', cost: 'slows the code paths where they are placed, and one missed spot stays open' },
  { id: 'retpoline', label: 'Retpolines', cost: 'slower indirect calls and larger code' },
  { id: 'isolation', label: 'Site and process isolation', cost: 'more memory and more processes to start' },
  { id: 'flush', label: 'Flushing state on a domain switch', cost: 'slower switches and colder caches afterwards' },
  { id: 'constant-time', label: 'Constant-time and bit-sliced crypto code', cost: 'harder to write and often slower than a naive version' },
  { id: 'microcode', label: 'Microcode updates', cost: 'depends on the vendor and the CPU, may cost speed, and does not cover every class' },
];

export const LEAK_CLASSES: readonly LeakClass[] = [
  { id: 'crypto-timing', label: 'Secret-dependent branches and lookups in code that handles keys' },
  { id: 'bounds-bypass', label: 'A bounds check bypassed speculatively, with the value read through the cache' },
  { id: 'indirect-branch', label: 'An indirect-branch predictor trained by another context' },
  { id: 'cross-site', label: 'Other sites\' data in the same process address space' },
  { id: 'state-across-switch', label: 'Cache or predictor state left behind across a security-domain switch' },
];

/**
 * Which classes each mitigation addresses (from memory; hedged on screen): full, partly, or not at all. Only the two
 * mitigations that are complete by construction are `full` (constant-time code for the code written that way, isolation
 * for same-process cross-site reads); the speculation and switch mitigations are `partial`, as the cost text and
 * vendor practice say.
 */
export const COVERAGE: Record<MitigationId, Partial<Record<LeakClassId, Coverage>>> = {
  serialise: { 'bounds-bypass': 'partial' },
  retpoline: { 'indirect-branch': 'partial' },
  isolation: { 'cross-site': 'full', 'bounds-bypass': 'partial' },
  flush: { 'state-across-switch': 'partial', 'indirect-branch': 'partial' },
  'constant-time': { 'crypto-timing': 'full' },
  microcode: { 'indirect-branch': 'partial', 'state-across-switch': 'partial' },
};

export const coverageOf = (m: MitigationId, c: LeakClassId): Coverage => COVERAGE[m][c] ?? 'none';

export type ClassVerdict = 'covered' | 'partly' | 'open';

/** What the enabled mitigations amount to for one class: covered if any addresses it fully, partly if only partial ones do, else open. */
export function classVerdict(enabled: readonly MitigationId[], c: LeakClassId): ClassVerdict {
  const levels = enabled.map((m) => coverageOf(m, c));
  if (levels.includes('full')) return 'covered';
  return levels.includes('partial') ? 'partly' : 'open';
}

export const openClasses = (enabled: readonly MitigationId[]): LeakClassId[] => LEAK_CLASSES.filter((c) => classVerdict(enabled, c.id) === 'open').map((c) => c.id);

export const mitigationOpening = (): MitigationId[] => [];
