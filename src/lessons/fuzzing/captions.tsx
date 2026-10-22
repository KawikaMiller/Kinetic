import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { bucketCrashes, describeOutcome, type CorpusEntry, type FuzzResult } from './fuzzer';
import { formatHex } from './hexInput';
import type { Minimised } from './minimise';
import { edgeName } from './model';
import type { TargetOptions, TargetRun } from './target';

const n = (v: number) => v.toLocaleString('en-US');

/** The race scene's caption: both fuzzers on the same seed and budget, computed from the two runs. */
export function raceCaption(blind: FuzzResult, guided: FuzzResult, total: number, magic: TargetOptions['magic']): ReactNode {
  const crash = (r: FuzzResult) => (r.firstCrashAt === null ? 'no crash yet' : `first crash at execution ${n(r.firstCrashAt)}`);
  const magicText =
    guided.magicAt === null && blind.magicAt === null
      ? 'Neither one got the magic bytes accepted.'
      : `Guided got the magic bytes accepted at execution ${guided.magicAt === null ? 'never' : n(guided.magicAt)}${blind.magicAt === null ? ', blind never did' : `, blind at execution ${n(blind.magicAt)}`}.`;
  const how =
    magic === 'bytewise'
      ? 'Each right magic byte is a new edge, so guidance can climb it one byte at a time.'
      : 'One 4-byte comparison gives no partial progress, so guidance has nothing to climb.';
  return (
    <>
      In {n(guided.executions)} executions guided covers {guided.edges.size} of {total} edges ({crash(guided)}); blind covers {blind.edges.size} ({crash(blind)}). {magicText} {how}
    </>
  );
}

/** The corpus scene's caption: what the picked entry is and what it added. */
export function corpusCaption(entry: CorpusEntry, corpusSize: number): ReactNode {
  if (entry.parent === null) {
    return <>Entry #0 is the seed input, four zero bytes. The corpus holds {plural(corpusSize, 'entry', 'entries')}; each one after it was kept for reaching an edge nothing before it had.</>;
  }
  return (
    <>
      Entry #{entry.id} came from entry #{entry.parent} at execution {n(entry.at)} by {entry.mutations.join(' then ')}, and was kept because it added {plural(entry.newEdges.length, 'edge')}: {entry.newEdges.map(edgeName).join(', ')}.
    </>
  );
}

/** The crash scene's caption when the run found nothing. */
export const noCrashCaption = (guided: FuzzResult): ReactNode => (
  <>This run found no crash in {n(guided.executions)} executions, so there is nothing to minimise or sort into buckets. Raise the executions or try another seed.</>
);

/** The crash scene's opening caption: the bucket count, then the input about to be minimised. */
export function crashStartCaption(guided: FuzzResult, site: number, length: number): ReactNode {
  const buckets = bucketCrashes(guided.crashes);
  const sites = buckets.map((b) => `b${b.site}`).join(' and ');
  return (
    <>
      {n(guided.crashes.length)} crashing {guided.crashes.length === 1 ? 'input falls' : 'inputs fall'} into {plural(buckets.length, 'bucket')} by the branch that threw ({sites}). The largest input of b{site} is {plural(length, 'byte')}: press play to drop chunks while it still crashes there.
    </>
  );
}

/** One minimiser step in words. */
export function minimiseStepCaption(from: number, to: number, kept: boolean, length: number, site: number): ReactNode {
  const range = to - from === 1 ? `byte ${from}` : `bytes ${from} to ${to - 1}`;
  return kept ? (
    <>Drop {range} of {length}: the rest still crashes at b{site}, so they stay dropped.</>
  ) : (
    <>Drop {range} of {length}: the crash at b{site} goes away, so they are needed and go back.</>
  );
}

export function minimiseDoneCaption(before: number, minimised: Minimised, site: number): ReactNode {
  return (
    <>
      Done: {plural(before, 'byte')} down to {plural(minimised.result.length, 'byte')} ({formatHex(minimised.result)}), after {plural(minimised.steps.length, 'try', 'tries')}. Removing any single byte of it stops the crash at b{site}.
    </>
  );
}

/** The oracle scene's caption: the same run with the bounds check on or off. */
export function oracleCaption(boundsCheck: boolean, guided: FuzzResult): ReactNode {
  const same = guided.crashes.length === guided.overReadRuns;
  return boundsCheck ? (
    <>
      With the reader checking bounds, {n(guided.crashes.length)} executions crashed and {n(guided.overReadRuns)} read past the end of their input{same ? ': each over-read was noticed, as a crash' : ''}.
    </>
  ) : (
    <>
      With the check off, {n(guided.crashes.length)} executions crashed, yet {n(guided.overReadRuns)} still read past the end of their input. The bug is the same; nothing was looking.
    </>
  );
}

/** The probe field's verdict for one typed input. */
export function probeCaption(run: TargetRun, boundsCheck: boolean): ReactNode {
  const reads = run.overReads === 0 ? 'no read went past the end' : `${plural(run.overReads, 'read')} went past the end${boundsCheck ? '' : ' unnoticed'}`;
  return <>This input: {describeOutcome(run.outcome)}; {reads}.</>;
}
