/**
 * The "why not the master key for everything" comparison: one simulated second of traffic, counted call by call.
 * The per-call numbers are illustrative constants, not any provider's; the counts come from running the loop.
 */
import { mulberry32 } from '../../core/random';
import { WRAPPED_BYTES } from './envelope';

/** Illustrative: a direct KMS encrypt takes a small payload only (AWS KMS is about 4 KiB, from memory; check its documentation). */
export const DIRECT_LIMIT_BYTES = 4096;
/** Illustrative per-call KMS latency in milliseconds. */
export const CALL_MS = 10;
/** Illustrative calls-per-second quota. */
export const QUOTA_PER_SECOND = 1000;
/** Each record written is read this many times in the second. */
export const READS_PER_WRITE = 2;
/** The archive the reads draw from, in records: old data, so its DEKs are not already in memory. */
export const ARCHIVE_RECORDS = 100_000;
/** NIST SP 800-38D's bound on messages under one key with random 96-bit IVs: 2 to the 32 (from memory, check the document). */
export const RANDOM_IV_LIMIT = 2 ** 32;
const SAMPLE_SEED = 20_260;

export type Design = 'direct' | 'envelope';

export interface WorkloadInput {
  recordsPerSecond: number;
  recordBytes: number;
  /** Envelope only: how many records share one data key. */
  recordsPerKey: number;
  /** Envelope only: a data key unwrapped once stays in memory for the second. */
  cache: boolean;
}

export interface WorkloadResult {
  design: Design;
  writes: number;
  reads: number;
  kmsCalls: number;
  /** Bytes sent to the KMS in the second. */
  kmsBytes: number;
  /** Time the calls take one after another, at the illustrative latency. */
  kmsMs: number;
  /** The direct design cannot take a record this big at all. */
  refused: boolean;
}

/** Run one second of traffic through a design, counting what reaches the KMS. */
export function runWorkload(design: Design, w: WorkloadInput): WorkloadResult {
  const writes = w.recordsPerSecond;
  const reads = writes * READS_PER_WRITE;
  if (design === 'direct') {
    const refused = w.recordBytes > DIRECT_LIMIT_BYTES;
    const kmsCalls = refused ? 0 : writes + reads;
    return { design, writes, reads, kmsCalls, kmsBytes: kmsCalls * w.recordBytes, kmsMs: kmsCalls * CALL_MS, refused };
  }
  let kmsCalls = 0;
  for (let i = 0; i < writes; i++) if (i % w.recordsPerKey === 0) kmsCalls += 1;
  const keys = Math.ceil(ARCHIVE_RECORDS / w.recordsPerKey);
  const rnd = mulberry32(SAMPLE_SEED);
  const unwrapped = new Set<number>();
  for (let i = 0; i < reads; i++) {
    const key = Math.floor(rnd() * keys);
    if (!w.cache || !unwrapped.has(key)) kmsCalls += 1;
    unwrapped.add(key);
  }
  return { design, writes, reads, kmsCalls, kmsBytes: kmsCalls * WRAPPED_BYTES, kmsMs: kmsCalls * CALL_MS, refused: false };
}
