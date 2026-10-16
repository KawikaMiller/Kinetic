import type { ReactNode } from 'react';
import { bytes as rawBytes, decimal, integer, plural, power } from '../../core/format';
import { IV_BYTES, WRAPPED_BYTES, type DecryptResult, type Envelope } from './envelope';
import { CALL_MS, DIRECT_LIMIT_BYTES, QUOTA_PER_SECOND, RANDOM_IV_LIMIT, type WorkloadResult } from './workload';
import { tenantLabel, type TenantId } from './vault';

/** The bytes an envelope occupies: the data IV, the ciphertext with its tag, and the wrapped DEK. */
const bytes = (n: number) => rawBytes(n, { iec: true });

export const envelopeBytes = (e: Envelope) => e.iv.length + e.ciphertext.length + e.wrapped.iv.length + e.wrapped.bytes.length;

/** Scene 1: the selected record's envelope, and the outcome of the last decryption. */
export function hierarchyCaption(tenant: TenantId, kekVersion: number, e: Envelope | undefined, last: DecryptResult | null): ReactNode {
  if (!e) return <>{tenantLabel(tenant)} has no records yet: add one and watch its envelope appear.</>;
  return (
    <>
      {tenantLabel(tenant)}'s record {e.id} is stored as an envelope of {bytes(envelopeBytes(e))}: a {IV_BYTES}-byte IV, {bytes(e.ciphertext.length)} of ciphertext with its tag, and its data key wrapped by the KEK (version {kekVersion}) into {bytes(WRAPPED_BYTES)}.{' '}
      {last === null ? 'Press Decrypt to run the chain backwards through the KMS.' : last.ok ? <>Decrypted: the KMS unwrapped the data key and AES-GCM verified the record.</> : <>Refused at the {last.stage === 'kms' ? 'KMS' : 'data'} step ({last.errorName}): {last.reason}.</>}
    </>
  );
}

export interface RotationReport {
  rows: { id: string; dataBefore: string; dataAfter: string; wrapBefore: string; wrapAfter: string; versionBefore: number; versionAfter: number }[];
  kind: 'kek' | 'dek';
}

/** Scene 2: what rotating touched, from the hashes measured before and after, and the cost at the sliders' size. */
export function rotationCaption(report: RotationReport | null, records: number, recordBytes: number): ReactNode {
  const rewrap = records * WRAPPED_BYTES;
  const reencrypt = records * recordBytes;
  const cost = (
    <>For {integer(records)} records of {bytes(recordBytes)}, re-wrapping touches {bytes(rewrap)} and re-encrypting the data touches {bytes(reencrypt)}.</>
  );
  if (!report) return <>Rotate the KEK to move every data key onto a new version. {cost}</>;
  const sameData = report.rows.filter((r) => r.dataBefore === r.dataAfter).length;
  const changedWrap = report.rows.filter((r) => r.wrapBefore !== r.wrapAfter).length;
  return report.kind === 'kek' ? (
    <>
      After the rotation {sameData} of {report.rows.length} data hashes are identical and {changedWrap} wrapped keys changed. {cost}
    </>
  ) : (
    <>Re-encrypting {report.rows[0].id} gave it a new data key: its ciphertext hash changed ({sameData === 0 ? 'it differs' : 'it is the same'}), which is the only way to change the data key itself. {cost}</>
  );
}

export interface ShredStatus {
  live: number;
  liveTotal: number;
  backup: number;
  backupTotal: number;
}

/** Scene 3: what can still be read live and from the backup for the tenant, after the last action. */
export function shredCaption(tenant: TenantId, destroyed: boolean, s: ShredStatus, note: string | null): ReactNode {
  return (
    <>
      {note ? <>{note} </> : null}
      {tenantLabel(tenant)}'s key is {destroyed ? 'destroyed' : 'in place'}: {s.live} of {s.liveTotal} live records and {s.backup} of {s.backupTotal} backup copies can be read.
      {destroyed ? ' The ciphertext still exists in both places; without the key it is unreadable.' : ''}
    </>
  );
}

/** Scene 4: calls, bytes and quota for the two designs at the sliders, and what that means for one key. */
export function workloadCaption(direct: WorkloadResult, envelope: WorkloadResult, recordsPerKey: number): ReactNode {
  const days = RANDOM_IV_LIMIT / (direct.writes * 86_400);
  return (
    <>
      {direct.refused
        ? <>Direct encryption cannot take records past {bytes(DIRECT_LIMIT_BYTES)} at all. </>
        : <>Direct encryption makes {integer(direct.kmsCalls)} KMS calls a second ({integer((direct.kmsCalls / QUOTA_PER_SECOND) * 100)}% of an illustrative quota of {integer(QUOTA_PER_SECOND)}). </>}
      Envelope encryption with {plural(recordsPerKey, 'record')} per key makes {integer(envelope.kmsCalls)} and sends {bytes(envelope.kmsBytes)} instead of {bytes(direct.kmsBytes)}, at {CALL_MS} ms a call in sequence that is {integer(envelope.kmsMs)} ms of waiting instead of {integer(direct.kmsMs)}.
      {' '}One key encrypting {integer(direct.writes)} records a second would reach the bound of {power(Math.log2(RANDOM_IV_LIMIT))} messages in {decimal(days, 1)} days.
    </>
  );
}
