/**
 * Six abstract attack classes against seven defences. A class is a name and a one-line description of the idea,
 * never a recipe; the matrix says which defence BLOCKS a class and which only LIMITS it. The rules are the
 * lesson's own simplified model, from memory: real attacks and defences overlap more than a table can show.
 */

export type ClassId = 'typosquat' | 'confusion' | 'maintainer' | 'install-script' | 'build' | 'ci-credentials';
export type DefenceId = 'pin-lock' | 'integrity' | 'scopes' | 'scripts-off' | 'cooldown' | 'provenance' | 'sbom';

export const CLASS_ORDER: readonly ClassId[] = ['typosquat', 'confusion', 'maintainer', 'install-script', 'build', 'ci-credentials'];
export const DEFENCE_ORDER: readonly DefenceId[] = ['pin-lock', 'integrity', 'scopes', 'scripts-off', 'cooldown', 'provenance', 'sbom'];

export const CLASS_LABEL: Record<ClassId, string> = {
  typosquat: 'Look-alike name (typosquatting)',
  confusion: 'Dependency confusion',
  maintainer: 'Compromised maintainer account',
  'install-script': 'Hostile install script',
  build: 'Compromised build',
  'ci-credentials': 'Leaked CI credentials',
};

/** The idea of each class in one plain sentence. No recipe, no technique. */
export const CLASS_IDEA: Record<ClassId, string> = {
  typosquat: 'a package whose name is one slip away from a popular one',
  confusion: 'an internal package name that also exists in a public source, and the resolver takes the higher version',
  maintainer: 'a real maintainer account used by someone else to publish a release',
  'install-script': 'code that runs at install time rather than when the package is used (an abstract token here: no script text exists)',
  build: 'the artifact is not what the source says, because the build that made it was tampered with',
  'ci-credentials': 'a publishing credential leaves the pipeline that should hold it',
};

export const DEFENCE_LABEL: Record<DefenceId, string> = {
  'pin-lock': 'Pin and lock',
  integrity: 'Integrity hashes',
  scopes: 'Single-source scopes',
  'scripts-off': 'Install scripts off',
  cooldown: 'Cooldown',
  provenance: 'Provenance check',
  sbom: 'SBOM',
};

export type Effect = 'blocks' | 'limits';

/** Per class, the defences that block it and the ones that limit it. A defence not listed does nothing about the class. */
export const RULES: Record<ClassId, Partial<Record<DefenceId, Effect>>> = {
  typosquat: { provenance: 'blocks', cooldown: 'limits', 'scripts-off': 'limits', sbom: 'limits' },
  confusion: { scopes: 'blocks', 'pin-lock': 'limits', integrity: 'limits' },
  maintainer: { provenance: 'blocks', cooldown: 'limits', 'pin-lock': 'limits', sbom: 'limits' },
  'install-script': { 'scripts-off': 'blocks', cooldown: 'limits', 'pin-lock': 'limits' },
  build: { provenance: 'limits', cooldown: 'limits', sbom: 'limits', 'pin-lock': 'limits' },
  'ci-credentials': { provenance: 'limits', sbom: 'limits' },
};

/** One line on what a limiting defence does for a class, for the cell's tooltip. */
export const LIMIT_NOTE: Record<ClassId, Partial<Record<DefenceId, string>>> = {
  typosquat: { cooldown: 'a brand-new package waits out the window', 'scripts-off': 'nothing runs at install time, though it can still run when used', sbom: 'you can find where it landed afterwards' },
  confusion: { 'pin-lock': 'the lock keeps the source it resolved from until a deliberate update', integrity: 'a different artifact has a different hash' },
  maintainer: { cooldown: 'the release waits out the window, and may be pulled first', 'pin-lock': 'the locked version stays until a deliberate update', sbom: 'you can find who has the release' },
  'install-script': { cooldown: 'the release waits out the window', 'pin-lock': 'the locked version stays until a deliberate update' },
  build: { provenance: 'it says who built the artifact from which commit, not that the result is benign', cooldown: 'the release waits out the window', sbom: 'you can find who has it', 'pin-lock': 'the locked version stays until a deliberate update' },
  'ci-credentials': { provenance: 'an artifact without an attestation from the real pipeline stands out', sbom: 'you can find who has what was published' },
};

export type Verdict = 'blocked' | 'limited' | 'open';

export type DefenceSet = ReadonlySet<DefenceId>;
export const defenceSet = (...ids: DefenceId[]): DefenceSet => new Set(ids);

/** What the defences that are on do about a class: blocked if any blocks it, limited if any limits it, else open. */
export function verdictOf(cls: ClassId, on: DefenceSet): Verdict {
  const effects = DEFENCE_ORDER.filter((d) => on.has(d)).map((d) => RULES[cls][d]);
  return effects.includes('blocks') ? 'blocked' : effects.includes('limits') ? 'limited' : 'open';
}

/** The defences that explain a verdict: the ones that are on and have that effect on the class. */
export const causesOf = (cls: ClassId, on: DefenceSet): DefenceId[] => {
  const v = verdictOf(cls, on);
  const want: Effect | null = v === 'blocked' ? 'blocks' : v === 'limited' ? 'limits' : null;
  return want === null ? [] : DEFENCE_ORDER.filter((d) => on.has(d) && RULES[cls][d] === want);
};

export function allDefenceSets(): DefenceSet[] {
  return Array.from({ length: 1 << DEFENCE_ORDER.length }, (_, mask) => defenceSet(...DEFENCE_ORDER.filter((_, i) => mask & (1 << i))));
}
