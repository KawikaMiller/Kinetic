/**
 * A toy build attestation: the artifact's hash, who built it and from which commit, chained into one signed
 * statement. The "signature" is an HMAC under a fake demo key (real attestations use public-key signatures and
 * a transparency log: SLSA, Sigstore and npm provenance are named, not reproduced). The hashes and the HMAC are
 * real crypto.subtle; the builders, commits and keys are invented.
 */
import { hmacSha256 } from '../../core/crypto';
import { fakeSecret } from '../../core/fakeSecret';
import { fakeTarball, flipByte, hashBytes } from './integrity';

export const EXPECTED_BUILDER = 'builder-1.ci.example.test';
export const OTHER_BUILDER = 'builder-9.other.example.test';
/** The commit the release tag points to, as the project's source says (an invented 40-hex string). */
export const EXPECTED_COMMIT = '3f9a1c0de27b84e65a0b19c3d4f70e8a2b6c5d41';
export const OTHER_COMMIT = '9b1e04c7a3d85f20e6b7c18d24a90f3e5c6b7a82';

const TRUSTED_KEY = fakeSecret('demo-', 'builder-1-', 'signing-key');
const OTHER_KEY = fakeSecret('demo-', 'builder-9-', 'signing-key');

export interface Attestation {
  artifactHash: string;
  builder: string;
  commit: string;
  signature: string;
}

export type ScenarioId = 'genuine' | 'repackaged' | 'none' | 'other-builder' | 'wrong-commit';
export const SCENARIO_ORDER: readonly ScenarioId[] = ['genuine', 'repackaged', 'none', 'other-builder', 'wrong-commit'];
export const SCENARIO_LABEL: Record<ScenarioId, string> = {
  genuine: 'The genuine build',
  repackaged: 'A repackaged artifact',
  none: 'No attestation',
  'other-builder': 'Another builder',
  'wrong-commit': 'The wrong commit',
};

const statement = (a: Pick<Attestation, 'artifactHash' | 'builder' | 'commit'>) => `${a.artifactHash}|${a.builder}|${a.commit}`;

async function attest(bytes: readonly number[], builder: string, commit: string, key: string): Promise<Attestation | null> {
  const artifactHash = await hashBytes(bytes);
  if (artifactHash === null) return null;
  const signature = await hmacSha256(key, statement({ artifactHash, builder, commit }), 'hex');
  return signature === null ? null : { artifactHash, builder, commit, signature };
}

export interface Case {
  /** The artifact as it arrives. */
  artifact: number[];
  attestation: Attestation | null;
}

/** The artifact and attestation each scenario hands the verifier (null where crypto.subtle is unavailable). */
export async function buildCase(id: ScenarioId): Promise<Case | null> {
  const genuine = fakeTarball();
  if (id === 'none') return { artifact: genuine, attestation: null };
  if (id === 'other-builder') return caseOf(genuine, await attest(genuine, OTHER_BUILDER, EXPECTED_COMMIT, OTHER_KEY));
  if (id === 'wrong-commit') return caseOf(genuine, await attest(genuine, EXPECTED_BUILDER, OTHER_COMMIT, TRUSTED_KEY));
  const att = await attest(genuine, EXPECTED_BUILDER, EXPECTED_COMMIT, TRUSTED_KEY);
  return caseOf(id === 'repackaged' ? flipByte(genuine, 0) : genuine, att);
}

const caseOf = (artifact: number[], attestation: Attestation | null): Case | null => (attestation ? { artifact, attestation } : null);

export interface Check {
  id: 'present' | 'artifact' | 'builder' | 'commit' | 'signature';
  label: string;
  ok: boolean;
}

/** Verify an artifact against its attestation: present, the hash of the artifact, the builder, the commit and the signature. */
export async function verify(c: Case): Promise<Check[]> {
  const a = c.attestation;
  if (!a) return [{ id: 'present', label: 'an attestation came with it', ok: false }];
  const actual = await hashBytes(c.artifact);
  const expectedSignature = await hmacSha256(TRUSTED_KEY, statement(a), 'hex');
  return [
    { id: 'present', label: 'an attestation came with it', ok: true },
    { id: 'artifact', label: 'the artifact hash matches the attestation', ok: actual !== null && actual === a.artifactHash },
    { id: 'builder', label: `built by the expected builder (${EXPECTED_BUILDER})`, ok: a.builder === EXPECTED_BUILDER },
    { id: 'commit', label: 'built from the commit the release tag names', ok: a.commit === EXPECTED_COMMIT },
    { id: 'signature', label: 'the signature is valid under the expected builder key', ok: expectedSignature !== null && expectedSignature === a.signature },
  ];
}

export const passes = (checks: readonly Check[]): boolean => checks.every((c) => c.ok);

