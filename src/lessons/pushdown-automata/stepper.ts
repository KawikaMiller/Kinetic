/**
 * A PDA run as frames: the set of live configurations after each move, which rules fired to get there, and
 * how the run ended. Built on core/automata's configuration sets, so a machine that guesses (wwᴿ) shows every
 * guess at once.
 */
import { pdaAccepting, pdaMoves, pdaRun, type Pda, type PdaAcceptMode, type PdaConfig, type PdaRun } from '../../core/automata';

/** Distinct configurations a run may generate before the lesson stops and says so. */
export const CONFIG_BUDGET = 5000;

export interface StepFrame {
  /** Live configurations after this many moves (frame 0 is the start). */
  configs: PdaConfig[];
  /** Indices of the rules that fired on the way here (empty for frame 0). */
  fired: number[];
  /** Configurations of the previous frame that had no move: they died here. */
  died: number;
  /** An accepting configuration is live. */
  accepting: boolean;
}

export interface StepRun {
  frames: StepFrame[];
  status: PdaRun['status'];
  explored: number;
  /** Frames beyond the last one in which every configuration died (a rejected run). */
  allDied: boolean;
}

/** Indices of the rules that apply to at least one configuration in `from` and give a configuration in `to`. */
function firedRules(pda: Pda, input: string, from: readonly PdaConfig[], to: readonly PdaConfig[]): number[] {
  const wanted = new Set(to.map((c) => `${c.state}\u0000${c.pos}\u0000${c.stack}`));
  const fired = new Set<number>();
  pda.rules.forEach((r, i) => {
    for (const c of from) {
      const top = c.stack[0];
      if (r.from !== c.state || r.pop !== top) continue;
      if (r.read !== '' && r.read !== input[c.pos]) continue;
      const next = { state: r.to, pos: c.pos + (r.read === '' ? 0 : 1), stack: r.push + c.stack.slice(1) };
      if (wanted.has(`${next.state}\u0000${next.pos}\u0000${next.stack}`)) fired.add(i);
    }
  });
  return [...fired];
}

export interface Rejection {
  /** `leftover`: the input ran out with symbols still on the stack. `mismatch`: the machine had no move for what it saw. */
  kind: 'leftover' | 'mismatch';
  text: string;
}

/** Where a run that did not accept got stuck: the configuration that read the most input, then had the shortest stack. The bottom marker is not "left over" when accepting by final state. */
export function describeRejection(input: string, levels: readonly PdaConfig[][], accept: PdaAcceptMode): Rejection {
  const c = levels.flat().reduce((best, x) => (x.pos > best.pos || (x.pos === best.pos && x.stack.length < best.stack.length) ? x : best));
  const left = c.stack.length - (accept === 'final-state' ? 1 : 0);
  if (c.pos === input.length && left > 0) return { kind: 'leftover', text: `rejected: input finished with ${left} ${left === 1 ? 'symbol' : 'symbols'} still on the stack` };
  if (c.pos === input.length) return { kind: 'mismatch', text: 'rejected: the input is used up but the machine is in a state with no way to finish' };
  if (c.stack.length === 0) return { kind: 'mismatch', text: 'rejected: stack empty but input remains' };
  return { kind: 'mismatch', text: `rejected: in state ${c.state} no rule reads ${input[c.pos]} with ${c.stack[0]} on top` };
}

export function stepRun(pda: Pda, input: string, accept: PdaAcceptMode): StepRun {
  const run = pdaRun(pda, input, { maxConfigs: CONFIG_BUDGET, accept });
  const frames: StepFrame[] = run.levels.map((configs, i) => ({
    configs,
    fired: i === 0 ? [] : firedRules(pda, input, run.levels[i - 1], configs),
    died: i === 0 ? 0 : run.levels[i - 1].filter((c) => pdaMoves(pda, input, c).length === 0).length,
    accepting: configs.some((c) => pdaAccepting(pda, input, c, accept)),
  }));
  return { frames, status: run.status, explored: run.explored, allDied: run.status === 'rejected' };
}
