/**
 * The fake tarball and its recorded hash. The bytes are seeded printable ASCII with no meaning and no code, so
 * that the real SHA-256 (crypto.subtle, through core/crypto) of the text and of the bytes are the same number.
 */
import { sha256Hex } from '../../core/crypto';
import { mulberry32, randInt } from '../../core/random';

export const TARBALL_BYTES = 256;
export const TARBALL_SEED = 28;
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;

/** 256 bytes of seeded printable ASCII: a stand-in for a package archive. */
export function fakeTarball(seed = TARBALL_SEED): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: TARBALL_BYTES }, () => randInt(FIRST_PRINTABLE, LAST_PRINTABLE, rnd));
}

/** Flip the lowest bit of one byte (flipping it again puts it back); the byte stays ASCII. */
export const flipByte = (bytes: readonly number[], index: number): number[] => bytes.map((b, i) => (i === index ? b ^ 1 : b));

export const bytesText = (bytes: readonly number[]): string => String.fromCharCode(...bytes);

/** The real SHA-256 of the bytes as hex, or null where crypto.subtle is unavailable. */
export const hashBytes = (bytes: readonly number[]): Promise<string | null> => sha256Hex(bytesText(bytes));

export type InstallResult = 'installed' | 'refused';

export interface InstallOutcome {
  result: InstallResult;
  /** The bytes that went in differ from the ones the lockfile hashed. */
  changedInstalled: boolean;
}

/** The install step: with the check on, a hash mismatch refuses; with it off, whatever arrived is installed. */
export function installOutcome(recorded: string, actual: string, checkOn: boolean): InstallOutcome {
  const matches = recorded === actual;
  return { result: checkOn && !matches ? 'refused' : 'installed', changedInstalled: !matches && !checkOn };
}

export const shortHash = (hex: string | null): string => (hex === null ? 'unavailable' : `${hex.slice(0, 16)}…`);
