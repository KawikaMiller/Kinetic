import type { ReactNode } from 'react';
import { bytes, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import type { ListPage } from './listing';
import { bytesAt, checkParts, partStatesAt, planParts, type Attempt, type Part } from './multipart';
import { FILE_KEY, FILE_SIZE, outcome, renameSteps, stepCount, STORE_LABEL, STORES, type OpId, type StoreId } from './store';

// ---------- the three stores ----------

export interface StoreFrame extends Frame {
  op: OpId;
  /** Requests applied so far: 0 is before the operation. */
  step: number;
}

const summary = (store: StoreId, op: OpId): ReactNode => {
  const o = outcome(op, store);
  return (
    <span key={store} className={`hl ${o.tone}`}>
      {STORE_LABEL[store]}: {bytes(o.bytes)}, {plural(o.requests, o.unit)}
    </span>
  );
};

export const OP_INTRO: Record<OpId, string> = {
  append: 'Add one 100-byte line to the end of the 40 MiB file.',
  rename: 'Rename the reports/ folder to archive/.',
  range: 'Read just bytes 1 to 100 of the file.',
  list: 'List what is under reports/.',
};

/** The closing caption of an operation: what each store moved and made, then the reason that matters. */
function finalCaption(op: OpId): ReactNode {
  const object = outcome(op, 'object');
  const lead = STORES.flatMap((s, i) => (i === 0 ? [summary(s, op)] : [' ', summary(s, op)]));
  return (
    <>
      {lead}. Object storage: {object.verdict.charAt(0).toLowerCase() + object.verdict.slice(1)}.
    </>
  );
}

export function storeFrames(op: OpId): StoreFrame[] {
  const frames: StoreFrame[] = [{ op, step: 0, say: <>{OP_INTRO[op]} Press play to apply it to all three stores. Green is the cheap side, red the costly one.</> }];
  if (op !== 'rename') {
    frames.push({ op, step: 1, say: finalCaption(op) });
    return frames;
  }
  const steps = renameSteps();
  const total = stepCount('rename');
  for (let k = 1; k <= total; k++) {
    const s = steps[k];
    const copy = s.request.startsWith('PUT');
    const both = s.rows.some((r) => r.key.startsWith('reports/')) && s.rows.some((r) => r.key.startsWith('archive/'));
    const last = k === total;
    frames.push({
      op,
      step: k,
      say: last ? (
        <>
          Request {k} of {total} done. {finalCaption(op)} Between the first copy and the last delete a reader saw a folder that was half moved.
        </>
      ) : (
        <>
          Request {k} of {total}: <code>{s.request.split('  ')[0]}</code>. {copy ? 'The copy exists while the original does too' : 'The original is gone'}
          {both ? ': both reports/ and archive/ exist right now, so this is not atomic.' : '.'}
        </>
      ),
    });
  }
  return frames;
}

// ---------- multipart ----------

export interface UploadFrame extends Frame {
  /** Seconds into the upload; the last frame is the Complete call. */
  t: number;
  complete: boolean;
}

export const UPLOAD_STEP_S = 0.5;

export const uploadEnd = (attempts: readonly Attempt[]) => Math.max(0, ...attempts.map((a) => a.end));

/** The part-number list and requests sent by time t, for the HTTP panel. */
export function uploadRequests(parts: readonly Part[], attempts: readonly Attempt[], t: number, complete: boolean): string[] {
  const lines = [`POST /${FILE_KEY}?uploads  ->  200 OK, UploadId up-demo-1`];
  for (const a of attempts.filter((x) => x.start <= t)) {
    lines.push(`PUT /${FILE_KEY}?partNumber=${a.part}&uploadId=up-demo-1${a.attempt > 1 ? '  (retry)' : ''}${t >= a.end ? (a.ok ? '  ->  200 OK' : '  ->  failed') : ''}`);
  }
  if (complete) {
    const check = checkParts(parts);
    lines.push(`POST /${FILE_KEY}?uploadId=up-demo-1  (parts 1 to ${parts.length})  ->  ${check.ok ? '200 OK' : '400 EntityTooSmall'}`);
  }
  return lines;
}

function uploadCaption(parts: readonly Part[], attempts: readonly Attempt[], from: number, to: number): ReactNode {
  const started = attempts.filter((a) => a.start > from && a.start <= to);
  const finished = attempts.filter((a) => a.end > from && a.end <= to);
  const failed = finished.filter((a) => !a.ok);
  const retried = started.filter((a) => a.attempt > 1);
  const done = finished.filter((a) => a.ok);
  const bits: ReactNode[] = [];
  if (failed.length > 0) {
    bits.push(
      <span key="f">
        <span className="hl bad">Part {failed.map((a) => a.part).join(', ')} failed</span> part-way. Only that part is sent again; the others carry on.
      </span>,
    );
  }
  if (retried.length > 0) {
    bits.push(
      <span key="r">
        <span className="hl">Retrying part {retried.map((a) => a.part).join(', ')}</span> by itself.
      </span>,
    );
  }
  if (done.length > 0) bits.push(<span key="d">{plural(done.length, 'part')} finished: {done.map((a) => a.part).join(', ')}.</span>);
  if (started.length > retried.length) bits.push(<span key="s">Started {plural(started.length - retried.length, 'part')} on free connections.</span>);
  const count = parts.length;
  if (bits.length === 0) return <>Uploading in parallel; {count} parts, 4 connections.</>;
  return <>{bits.flatMap((b, i) => (i === 0 ? [b] : [' ', b]))}</>;
}

export function uploadFrames(parts: readonly Part[], attempts: readonly Attempt[]): UploadFrame[] {
  const end = uploadEnd(attempts);
  const check = checkParts(parts);
  const frames: UploadFrame[] = [
    {
      t: 0,
      complete: false,
      say: (
        <>
          Cut the {bytes(FILE_SIZE)} object into {plural(parts.length, 'numbered part')} of {bytes(parts[0]?.size ?? 0)} and send them on four connections at once.
          {check.ok ? '' : ' Watch Complete: the parts are under the minimum.'}
        </>
      ),
    },
  ];
  const steps = Math.ceil(end / UPLOAD_STEP_S);
  for (let k = 1; k <= steps; k++) {
    const t = Math.min(end, k * UPLOAD_STEP_S);
    frames.push({ t, complete: false, say: uploadCaption(parts, attempts, (k - 1) * UPLOAD_STEP_S, t), quiet: true });
  }
  const sent = bytesAt(parts, attempts, end);
  frames.push({
    t: end,
    complete: true,
    hold: 2,
    say: check.ok ? (
      <>
        Complete: the parts are stitched together in part-number order, whatever order they finished in, into one {bytes(FILE_SIZE)} object.{' '}
        {sent.wasted > 0 ? `The failed attempt wasted ${bytes(sent.wasted)}, not the whole file.` : 'No part had to be sent twice.'}
      </>
    ) : (
      <>
        <span className="hl bad">Complete refused</span>: {check.error}. No object was created; the parts stay uploaded until you complete or abort.
      </>
    ),
  });
  return frames;
}

export const stateCounts = (parts: readonly Part[], attempts: readonly Attempt[], t: number) => {
  const states = partStatesAt(parts, attempts, t);
  const count = (s: string) => states.filter((x) => x === s).length;
  return { uploading: count('uploading') + count('retrying'), done: count('done'), failed: count('failed'), pending: count('pending') };
};

export const makeParts = (partSize: number) => planParts(FILE_SIZE, partSize);

export function listingCaption(prefix: string, delimiter: string | null, page: ListPage): ReactNode {
  const keys = page.entries.filter((e) => e.kind === 'key').length;
  const prefixes = page.entries.length - keys;
  return (
    <>
      Prefix <code>{prefix || '(empty)'}</code> {delimiter ? <>with delimiter <code>{delimiter}</code></> : 'with no delimiter'}: {plural(keys, 'key')} and {plural(prefixes, 'common prefix', 'common prefixes')} on this page
      {page.truncated ? ', and the listing is truncated: ask for the next page.' : ', and nothing more follows.'}
    </>
  );
}
