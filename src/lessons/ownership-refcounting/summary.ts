import { CYCLE_SCRIPT, replay, type Fate, type Op } from './heap';
import { checkSequential, freedAt, PRESETS } from './ownership';

export interface Column {
  id: 'counting' | 'tracing' | 'ownership';
  title: string;
  /** When memory goes back, from the run. */
  when: string;
  /** What the approach cannot do or costs, from the run. */
  cost: string;
}

/** The run the summary reads: the cycle script, then a collect. */
export const SUMMARY_LOG: readonly Op[] = [...CYCLE_SCRIPT, { kind: 'collect' }];

const freedList = (fates: Fate[]) => fates.flatMap((f, i) => (f.kind === 'freed' ? [`obj ${i} at op ${f.at}`] : []));
const names = (xs: string[]) => (xs.length ? xs.join(', ') : 'none');

/** The three columns of "when does memory go back", generated from the counting, tracing and ownership runs. */
export function summaryColumns(): Column[] {
  const counting = replay(SUMMARY_LOG, 'counting');
  const tracing = replay(SUMMARY_LOG, 'tracing');
  const strays = counting.fates.flatMap((f, i) => (f.kind === 'leaked' ? [`obj ${i}`] : []));
  const accepted = PRESETS.find((p) => p.accepted)!;
  const verdict = checkSequential(accepted.program);
  const freed = freedAt(accepted.program);
  const counted = counting.heaps[counting.heaps.length - 1].updates;
  return [
    { id: 'counting', title: 'Reference counting', when: `At the instant a count reaches zero. On the cycle script that freed: ${names(freedList(counting.fates))}.`, cost: `${counted} count updates, and leaked: ${names(strays)} (a cycle keeps itself alive).` },
    { id: 'tracing', title: 'Tracing collection', when: `Only when a collect runs. On the same script that freed: ${names(freedList(tracing.fates))}, cycle included.`, cost: 'Nothing is freed between collects, and the collector has to find the reachable objects.' },
    { id: 'ownership', title: 'Ownership (compile-time rules)', when: `At a known point: ${freed.why} in the accepted program "${accepted.label}" (${verdict.accepted ? 'accepted' : 'rejected'}).`, cost: 'No count and no collector, but some correct programs are rejected.' },
  ];
}
