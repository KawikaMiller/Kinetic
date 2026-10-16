/** Captions and stat text, every number taken from the model on screen. Plain strings, so tests can read them. */
import { pct } from '../../core/format';
import { BUS_NAMES, MESI_NAMES, type Machine, type StepResult } from './mesi';
import { TRANSFER_CYCLES, layoutLabel, placement, type SharingConfig, type SharingRun } from './sharing';

export const n = (v: number) => v.toLocaleString('en-US');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

export const MESI_INTRO = 'Four cores, one cache line X. Press Read or Write on any core and watch the bus transaction, who reacts, and every copy\'s state.';

/** One access, in words: what the core did, what crossed the bus, who reacted, and what it read or wrote. */
export function accessCaption(r: StepResult): string {
  const who = `Core ${r.op.core} ${r.op.access === 'read' ? 'read' : 'wrote'}`;
  const state = r.from === r.to ? `its copy is ${MESI_NAMES[r.from]}` : `its copy went ${MESI_NAMES[r.from]} to ${MESI_NAMES[r.to]}`;
  const bus = r.bus === null ? 'no bus traffic' : `a ${BUS_NAMES[r.bus]} (${r.source === 'memory' ? 'memory supplied the line' : r.source === 'cache' ? 'another cache supplied the line' : 'the other copies are told'})`;
  const reacted = r.reactions
    .filter((x) => x.from !== x.to || x.wroteBack || x.supplied)
    .map((x) => `core ${x.core} ${x.from} to ${x.to}${x.wroteBack ? ' after writing back to memory' : ''}`);
  const reactions = r.reactions.length === 0 ? '' : reacted.length === 0 ? ' The other copies are left as they were.' : ` Reactions: ${reacted.join('; ')}.`;
  const value = r.op.access === 'read'
    ? ` It read ${n(r.readValue ?? 0)}${r.stale ? `, but the latest write is ${n(r.machine.latest)}: stale.` : ', the latest write.'}`
    : ` It stored ${n(r.written ?? 0)}.`;
  return `${who}: ${state}, ${bus}.${reactions}${value} Bus transactions so far: ${n(r.machine.busCount)}.`;
}

export const memoryNote = (m: Machine) => (m.memory === m.latest ? 'up to date' : `stale: the latest write is ${n(m.latest)}`);

export function sharingCaption(cfg: SharingConfig, run: SharingRun): string {
  const layout = layoutLabel(cfg.layout, cfg.lineBytes);
  const tail = cfg.layout === 'merged' ? ` plus ${plural(run.readTransfers, 'line read')} to merge` : '';
  const { lines } = placement(cfg);
  const share = cfg.layout === 'atomic'
    ? 'both threads write the same variable, so the line moves between the cores'
    : run.refused
      ? `${run.refused}, so it is the shared-counter case`
      : lines[0] === lines[1]
        ? 'the counters never touch the same variable, yet they share a line, so the line moves between the cores'
        : 'the counters sit on different lines, so each core keeps its line';
  return `${layout}: ${n(cfg.writes)} writes in bursts of ${n(cfg.burst)} made ${plural(run.transfers, 'ownership transfer')}${tail} and ${plural(run.hits, 'hit')}: ${share}. Cost ${n(run.cost)} cycles (${n(run.transfers + run.readTransfers)} x ${n(TRANSFER_CYCLES)} + ${n(run.hits)} x 1).`;
}

/** How much of the cost is line movement. */
export const transferShare = (run: SharingRun) => (run.cost === 0 ? 0 : ((run.transfers + run.readTransfers) * TRANSFER_CYCLES) / run.cost);
export const shareText = (run: SharingRun) => pct(transferShare(run));
