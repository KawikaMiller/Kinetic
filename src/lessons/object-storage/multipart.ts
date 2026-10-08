/**
 * Multipart upload: the object is cut into numbered parts that upload in parallel, one that fails
 * is retried alone, and Complete stitches the parts together in part-number order. The 5 MiB minimum
 * part size (every part but the last) and the 10,000-part limit follow the common S3-compatible
 * convention; other services differ.
 */
import { mulberry32 } from '../../core/random';
import { MIB } from './store';

export const MIN_PART = 5 * MIB;
export const MAX_PARTS = 10_000;
/** The part chosen to fail, kept only if that part still exists after the part count changed; otherwise back to none (0). */
export const clampFailPart = (failPart: number, partCount: number) => (failPart > partCount ? 0 : failPart);

export const CONCURRENCY = 4;
/** Bytes per second one connection carries: illustrative. */
export const BANDWIDTH = 2 * MIB;
/** A failing attempt dies this far into its upload. */
export const FAIL_AT = 0.6;
/** Seconds the client waits before it retries a failed part. */
export const RETRY_DELAY_S = 0.5;

export interface Part {
  number: number;
  offset: number;
  size: number;
}

/** Cut `total` bytes into parts of `partSize`; the last takes what is left. Part numbers start at 1. */
export function planParts(total: number, partSize: number): Part[] {
  if (!(total > 0) || !(partSize > 0)) return [];
  const parts: Part[] = [];
  for (let offset = 0; offset < total; offset += partSize) parts.push({ number: parts.length + 1, offset, size: Math.min(partSize, total - offset) });
  return parts;
}

export type CheckResult = { ok: true } | { ok: false; error: string };

/** What Complete would say: every part except the last must reach the minimum, and there are at most MAX_PARTS. */
export function checkParts(parts: readonly Part[], minPart = MIN_PART): CheckResult {
  if (parts.length > MAX_PARTS) return { ok: false, error: `TooManyParts: ${parts.length} parts, at most ${MAX_PARTS}` };
  const small = parts.slice(0, -1).find((p) => p.size < minPart);
  if (small) return { ok: false, error: `EntityTooSmall: part ${small.number} is ${small.size / MIB} MiB, the minimum is ${minPart / MIB} MiB (the last part may be smaller)` };
  return { ok: true };
}

export interface Attempt {
  part: number;
  attempt: number;
  start: number;
  end: number;
  ok: boolean;
}

export interface ScheduleOptions {
  /** This part's first attempt fails part-way and is retried alone; null for none. */
  failPart: number | null;
  seed: number;
  concurrency?: number;
  bandwidth?: number;
}

/** Run the uploads on a few parallel connections: parts in order, each taking the next free connection. */
export function schedule(parts: readonly Part[], o: ScheduleOptions): Attempt[] {
  const rnd = mulberry32(o.seed);
  const free = Array.from({ length: o.concurrency ?? CONCURRENCY }, () => 0);
  const bandwidth = o.bandwidth ?? BANDWIDTH;
  const queue: { part: Part; attempt: number; notBefore: number }[] = parts.map((part) => ({ part, attempt: 1, notBefore: 0 }));
  const out: Attempt[] = [];
  while (queue.length > 0) {
    const w = free.indexOf(Math.min(...free));
    // The first job that can start on the free connection now; a retry that isn't due yet waits without holding a connection.
    const due = queue.findIndex((j) => j.notBefore <= free[w]);
    const next = due >= 0 ? due : queue.reduce((best, j, i) => (j.notBefore < queue[best].notBefore ? i : best), 0);
    const job = queue.splice(next, 1)[0];
    const start = Math.max(free[w], job.notBefore);
    const full = (job.part.size / bandwidth) * (0.85 + 0.3 * rnd());
    const fails = job.attempt === 1 && o.failPart === job.part.number;
    const end = start + (fails ? full * FAIL_AT : full);
    free[w] = end;
    out.push({ part: job.part.number, attempt: job.attempt, start, end, ok: !fails });
    if (fails) queue.unshift({ part: job.part, attempt: 2, notBefore: end + RETRY_DELAY_S });
  }
  return out.sort((a, b) => a.start - b.start || a.part - b.part);
}

/** Part numbers in the order their successful uploads finished. */
export const completionOrder = (attempts: readonly Attempt[]): number[] => attempts.filter((a) => a.ok).sort((a, b) => a.end - b.end).map((a) => a.part);

export type AssembleResult = { ok: true; data: Uint8Array } | { ok: false; error: string };

/** Complete: put the uploaded parts together in part-number order, however they arrived. */
export function assemble(uploaded: readonly { number: number; data: Uint8Array }[], minPart = MIN_PART): AssembleResult {
  const sorted = [...uploaded].sort((a, b) => a.number - b.number);
  const parts = sorted.map((p) => ({ number: p.number, offset: 0, size: p.data.length }));
  const check = checkParts(parts, minPart);
  if (!check.ok) return check;
  const out = new Uint8Array(sorted.reduce((n, p) => n + p.data.length, 0));
  let at = 0;
  for (const p of sorted) {
    out.set(p.data, at);
    at += p.data.length;
  }
  return { ok: true, data: out };
}

export type PartState = 'pending' | 'uploading' | 'failed' | 'retrying' | 'done';

/** What each part is doing at time t. */
export function partStatesAt(parts: readonly Part[], attempts: readonly Attempt[], t: number): PartState[] {
  return parts.map((p) => {
    const mine = attempts.filter((a) => a.part === p.number && a.start <= t);
    const last = mine.at(-1);
    if (!last) return 'pending';
    if (t < last.end) return last.attempt > 1 ? 'retrying' : 'uploading';
    if (last.ok) return 'done';
    return 'failed';
  });
}

/** Bytes sent by time t, counting a failed attempt's wasted bytes, and bytes of finished parts. */
export function bytesAt(parts: readonly Part[], attempts: readonly Attempt[], t: number): { sent: number; wasted: number; done: number } {
  let sent = 0;
  let wasted = 0;
  let done = 0;
  for (const a of attempts) {
    if (a.start > t) continue;
    const size = parts[a.part - 1].size;
    const fraction = Math.min(1, (t - a.start) / (a.end - a.start));
    const total = a.ok ? size : size * FAIL_AT;
    sent += total * fraction;
    if (!a.ok) wasted += total * fraction;
    if (a.ok && t >= a.end) done += size;
  }
  return { sent, wasted, done };
}
