import type { Frame } from '../../core/types';
import { ROOT, matchKeys, naiveScan, runMachine, type Machine, type Match, type ScanStep } from './model';

export interface ScanFrame extends Frame {
  say: string;
  /** The text position being handled, or -1 before the first letter. */
  i: number;
  /** The state the token is in after this step. */
  state: number;
  /** The step this frame shows, or null for the first and last frames. */
  step: ScanStep | null;
  reads: number;
  follows: number;
  found: readonly Match[];
}

const where = (m: Match) => `${m.start} to ${m.end}`;

/** The state as the captions name it: the root, or its string and number. */
export const stateLabel = (machine: Machine, id: number) => (id === ROOT ? 'the root' : `state ${id} (${machine.trie.states[id].string})`);

function captionFor(machine: Machine, step: ScanStep): string {
  const from = stateLabel(machine, step.from);
  const to = stateLabel(machine, step.to);
  switch (step.kind) {
    case 'read':
      return `Read '${step.letter}' at position ${step.i}, with the token at ${from}.`;
    case 'follow':
      return `${from[0].toUpperCase()}${from.slice(1)} has no '${step.letter}' edge: follow its failure link to ${to}.`;
    case 'move':
      return `Take the '${step.letter}' edge from ${from} to ${to}.`;
    case 'stay':
      return `The root has no '${step.letter}' edge: stay at the root.`;
    case 'report':
      return `${from[0].toUpperCase()}${from.slice(1)} ends a pattern: ${step.match?.pattern} found at ${step.match ? where(step.match) : ''}.`;
    case 'out':
      return `Output link from ${stateLabel(machine, step.via ?? step.from)} to ${from}: ${step.match?.pattern} found at ${step.match ? where(step.match) : ''}, ending at the same letter.`;
  }
}

export interface ScanRun {
  frames: ScanFrame[];
  reads: number;
  follows: number;
  matches: readonly Match[];
  /** Matches the naive scan finds that this run did not report (empty unless output links are off). */
  missed: readonly Match[];
}

/** One frame per step of the scan, from a first frame at the root to a closing frame with the totals. */
export function scanFrames(machine: Machine, text: string, outputLinksOn = true): ScanRun {
  const run = runMachine(machine, text, outputLinksOn);
  const truth = naiveScan(machine.trie.patterns, text).matches;
  const have = new Set(matchKeys(run.matches));
  const missed = truth.filter((m) => !have.has(`${m.pattern}@${m.start}`));
  const frames: ScanFrame[] = [{ say: 'The token starts at the root, before the first letter.', i: -1, state: ROOT, step: null, reads: 0, follows: 0, found: [] }];
  let reads = 0;
  let follows = 0;
  let found: Match[] = [];
  for (const step of run.steps) {
    if (step.kind === 'read') reads += 1;
    if (step.kind === 'follow') follows += 1;
    if (step.match) found = [...found, step.match];
    frames.push({ say: captionFor(machine, step), i: step.i, state: step.to, step, reads, follows, found });
  }
  const count = found.length;
  const names = found.map((m) => `${m.pattern} at ${where(m)}`).join(', ');
  const closing = `Done: ${reads} ${reads === 1 ? 'letter' : 'letters'} read, ${follows} failure ${follows === 1 ? 'follow' : 'follows'}, ${count} ${count === 1 ? 'match' : 'matches'}${count ? ` (${names})` : ''}.`;
  const lost = missed.length
    ? ` The naive scan finds ${truth.length}: this run is missing ${missed.map((m) => `${m.pattern} at ${where(m)}`).join(', ')}, because a pattern that ends here as a suffix of the state's string is not reported without output links.`
    : '';
  frames.push({ say: `${closing}${lost}`, i: text.length - 1, state: frames[frames.length - 1].state, step: null, reads, follows, found, hold: 2 });
  return { frames, reads, follows, matches: run.matches, missed };
}
