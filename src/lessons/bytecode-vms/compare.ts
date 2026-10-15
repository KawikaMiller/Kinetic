import { formatInstr, formatReg, parseExpression, registerCodeFor, runRegister, stackCodeFor } from './lang';
import { SAMPLE_SLOTS } from './presets';
import { runFrames } from './vm';

export interface Comparison {
  stack: string[];
  register: string[];
  stackOut: number | undefined;
  registerOut: number | undefined;
}

/** Both compilers on one expression, counted in one unit (instructions run to print the value, HALT not counted) and run on the sample slots. */
export function compareExpression(text: string): { ok: true; value: Comparison } | { ok: false; error: string } {
  const parsed = parseExpression(text);
  if (!parsed.ok) return parsed;
  const stack = stackCodeFor(parsed.value);
  const register = registerCodeFor(parsed.value);
  const run = runFrames([...stack, { op: 'HALT' }], SAMPLE_SLOTS);
  return {
    ok: true,
    value: {
      stack: stack.map(formatInstr),
      register: register.map(formatReg),
      stackOut: run[run.length - 1].out[0],
      registerOut: runRegister(register, SAMPLE_SLOTS)[0],
    },
  };
}

