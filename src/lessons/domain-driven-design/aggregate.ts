/**
 * Scene 3 of domain-driven-design: an Order may hold at most 5 lines and holds 4. Two actors each read
 * the order, check there is room, and add a line. The two read-then-write sequences interleave in six
 * ways, and each design is run through all six:
 *
 * - `records`: order lines are independent records, so a write adds a line whatever has happened since the read.
 * - `aggregate`: the Order is one consistency boundary with a version; a write made on a stale version
 *   is refused and that actor retries (reads again and checks again).
 */

export const MAX_LINES = 5;
export const START_LINES = 4;

export type Design = 'records' | 'aggregate';
export type Actor = 0 | 1;
export interface Step {
  actor: Actor;
  kind: 'read' | 'write';
}

/** Every ordering of R0, W0, R1, W1 in which each actor reads before it writes: six of them. */
export function interleavings(): Step[][] {
  const out: Step[][] = [];
  const walk = (done: [number, number], acc: Step[]) => {
    if (acc.length === 4) {
      out.push(acc);
      return;
    }
    for (const actor of [0, 1] as const) {
      if (done[actor] < 2) walk(actor === 0 ? [done[0] + 1, done[1]] : [done[0], done[1] + 1], [...acc, { actor, kind: done[actor] === 0 ? 'read' : 'write' }]);
    }
  };
  walk([0, 0], []);
  return out;
}

export const stepName = (s: Step) => `${s.kind === 'read' ? 'R' : 'W'}${s.actor + 1}`;
export const interleavingName = (o: readonly Step[]) => o.map(stepName).join(' ');

export interface Event {
  step: Step;
  /** What happened, in a sentence. */
  note: string;
  /** Lines in the order after this step. */
  lines: number;
  version: number;
  outcome: 'read' | 'added' | 'refused' | 'conflict-retry';
}

export interface Run {
  design: Design;
  events: Event[];
  finalLines: number;
  /** The order ended above its limit. */
  violated: boolean;
}

export function run(design: Design, order: readonly Step[]): Run {
  let lines = START_LINES;
  let version = 0;
  const seen: { lines: number; version: number; room: boolean }[] = [];
  const events: Event[] = [];
  const who = (a: Actor) => `Actor ${a + 1}`;
  for (const step of order) {
    if (step.kind === 'read') {
      const room = lines + 1 <= MAX_LINES;
      seen[step.actor] = { lines, version, room };
      events.push({ step, lines, version, outcome: 'read', note: `${who(step.actor)} reads ${lines} lines and checks: ${room ? `room for one more (${lines + 1} <= ${MAX_LINES})` : `no room (${lines + 1} > ${MAX_LINES})`}.` });
      continue;
    }
    const mine = seen[step.actor];
    if (!mine.room) {
      events.push({ step, lines, version, outcome: 'refused', note: `${who(step.actor)} had no room, so it adds nothing.` });
    } else if (design === 'aggregate' && mine.version !== version) {
      const current = lines;
      const room = current + 1 <= MAX_LINES;
      if (room) {
        lines += 1;
        version += 1;
      }
      events.push({
        step,
        lines,
        version,
        outcome: 'conflict-retry',
        note: `${who(step.actor)}'s write is refused: the order changed since its read. It reads again, sees ${current} lines and ${room ? `adds its line: ${lines} lines.` : 'finds no room, so it adds nothing.'}`,
      });
    } else {
      lines += 1;
      version += 1;
      events.push({ step, lines, version, outcome: 'added', note: `${who(step.actor)} adds its line: ${lines} lines.` });
    }
  }
  return { design, events, finalLines: lines, violated: lines > MAX_LINES };
}

export interface Tally {
  runs: Run[];
  violations: number;
}

/** Run one design through every interleaving. */
export function tally(design: Design): Tally {
  const runs = interleavings().map((o) => run(design, o));
  return { runs, violations: runs.filter((r) => r.violated).length };
}
