/** Numbers the try-this, key ideas and quiz quote, computed from constants and the pure workload model (the vault itself is async and tested separately). */
import { bytes, integer, ratioText } from '../../core/format';
import { IV_BYTES, TAG_BYTES, WRAPPED_BYTES } from './envelope';
import { OPENING } from './opening';
import { SEED_TEXT } from './vault';
import { DIRECT_LIMIT_BYTES, QUOTA_PER_SECOND, runWorkload } from './workload';

/** The defaults of the rotation and workload sliders, read from the same place the scenes read them. */
export const DEFAULTS = { rotationRecords: 10 ** OPENING.rotation.exponent, rotationKib: OPENING.rotation.kib, ...OPENING.workload } as const;

const first = SEED_TEXT.acme[0];
const rewrap = DEFAULTS.rotationRecords * WRAPPED_BYTES;
const reencrypt = DEFAULTS.rotationRecords * DEFAULTS.rotationKib * 1024;
const input = { recordsPerSecond: DEFAULTS.rate, recordBytes: DEFAULTS.size, recordsPerKey: DEFAULTS.perKey, cache: true };
const direct = runWorkload('direct', input);
const envelope = runWorkload('envelope', input);
const perRecordKeys = runWorkload('envelope', { ...input, recordsPerKey: 1 });

export const FACTS = {
  rate: DEFAULTS.rate,
  size: DEFAULTS.size,
  perKey: DEFAULTS.perKey,
  /** Asserted by the shredding test against a real vault. */
  unreadable: 0,
  firstText: first,
  firstLength: first.length,
  firstEnvelope: IV_BYTES + first.length + TAG_BYTES + WRAPPED_BYTES,
  ciphertextWithTag: first.length + TAG_BYTES,
  ivBytes: IV_BYTES,
  wrapped: WRAPPED_BYTES,
  recordsPerTenant: SEED_TEXT.acme.length,
  recordsAfterAdd: SEED_TEXT.acme.length + 1,
  rewrapText: bytes(rewrap, { iec: true }),
  reencryptText: bytes(reencrypt, { iec: true }),
  ratioText: ratioText(reencrypt / rewrap),
  records: integer(DEFAULTS.rotationRecords),
  directCalls: direct.kmsCalls,
  envelopeCalls: envelope.kmsCalls,
  perRecordKeyCalls: perRecordKeys.kmsCalls,
  quota: QUOTA_PER_SECOND,
  directOverQuota: direct.kmsCalls > QUOTA_PER_SECOND,
  directBytes: bytes(direct.kmsBytes, { iec: true }),
  envelopeBytes: bytes(envelope.kmsBytes, { iec: true }),
  limit: bytes(DIRECT_LIMIT_BYTES, { iec: true }),
  bigRecordRefused: runWorkload('direct', { ...input, recordBytes: 8192 }).refused,
};
