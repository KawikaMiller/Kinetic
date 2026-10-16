import type { Pda, PdaAcceptMode, PdaConfig } from '../../core/automata';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { ruleText } from './machines';
import { CONFIG_BUDGET, describeRejection, type StepRun } from './stepper';

export interface PlayFrame extends Frame {
  /** The live configurations (empty on the closing frame of a rejected run). */
  configs: PdaConfig[];
  /** Rule indices that fired to reach this frame. */
  fired: number[];
  /** How the run ended, on its last frame. */
  end: 'accepted' | 'rejected' | 'budget' | null;
  /** The closing frame of a rejected run says leftover stack in orange, a missing move in red. */
  rejection: 'leftover' | 'mismatch' | null;
  died: number;
}

const quote = (s: string) => <code>{s === '' ? 'ε' : s}</code>;

/** One frame per move, plus a closing frame that says how the run ended. */
export function playFrames(pda: Pda, run: StepRun, input: string, accept: PdaAcceptMode): PlayFrame[] {
  const frames: PlayFrame[] = run.frames.map((f, i) => {
    const how = accept === 'final-state' ? 'in the accepting state qf' : 'with the stack empty';
    const rules = f.fired.map((r) => quote(ruleText(pda.rules[r])));
    return {
      configs: f.configs,
      fired: f.fired,
      end: null,
      rejection: null,
      died: f.died,
      say:
        i === 0 ? (
          <>Start: state {pda.start}, nothing read, stack {pda.bottom}. {quote(input)} is the input.</>
        ) : (
          <>
            Move {i}: {rules.length === 1 ? <>rule {rules[0]} fired</> : <>{plural(rules.length, 'rule')} fired</>}. {plural(f.configs.length, 'configuration')} live{f.died ? <>, and {plural(f.died, 'earlier configuration')} died here</> : null}.
            {f.accepting ? <> The input is used up {how}: this configuration accepts.</> : null}
          </>
        ),
    };
  });
  const last = frames[frames.length - 1];
  if (run.status === 'accepted') return frames.map((f, i) => (i === frames.length - 1 ? { ...f, end: 'accepted' } : f));
  if (run.status === 'budget-exhausted') return [...frames.slice(0, -1), { ...last, end: 'budget', say: <>Did not finish within {CONFIG_BUDGET.toLocaleString('en-US')} configurations. That says nothing about the answer, only that the lesson stopped counting.</> }];
  const why = describeRejection(input, run.frames.map((f) => f.configs), accept);
  return [...frames, { configs: [], fired: [], died: last.configs.length, end: 'rejected', rejection: why.kind, say: <>Every configuration died. {why.text}.</> }];
}
