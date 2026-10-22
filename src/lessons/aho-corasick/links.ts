import type { GraphEdgeMark } from '../../components/GraphView';
import type { ScanFrame } from './frames';
import { ROOT, type Machine } from './model';

/** A link drawn on top of the trie: a failure link (violet, dashed), a follow in progress (info) or an output link (ok, dashed). */
export interface LinkMark {
  from: number;
  to: number;
  tone: GraphEdgeMark['tone'];
}

/** The failure links worth drawing (those not into the root), with the one being followed or reported through recoloured. */
export function linksFor(machine: Machine, frame: ScanFrame): LinkMark[] {
  const step = frame.step;
  const marks: LinkMark[] = [];
  machine.trie.states.forEach((s) => {
    if (s.id === ROOT || machine.fail[s.id] === ROOT) return;
    const followed = step?.kind === 'follow' && step.from === s.id;
    const reported = step?.kind === 'out' && step.via === s.id && step.to === machine.fail[s.id];
    marks.push({ from: s.id, to: machine.fail[s.id], tone: followed ? 'info' : reported ? 'ok' : 'violet' });
  });
  if (step?.kind === 'out' && step.via !== undefined && machine.fail[step.via] !== step.to) marks.push({ from: step.via, to: step.to, tone: 'ok' });
  return marks;
}
