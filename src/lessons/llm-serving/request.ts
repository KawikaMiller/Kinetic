import { runRequest } from './cost';
import { milliseconds, share } from './text';

export const PROMPT_LIMITS = { min: 1, max: 8192 } as const;
export const OUTPUT_LIMITS = { min: 1, max: 1024 } as const;
export const REQUEST_OPENING = { prompt: 1000, output: 200 } as const;

/** The scene-1 caption, computed from the run (never typed). */
export function requestCaption(n: number, m: number): string {
  const run = runRequest(n, m);
  const tpot = run.tpot === null ? 'There are no later tokens to time.' : `Each later token takes about ${milliseconds(run.tpot)} (${run.decodeRegime}).`;
  return `Time to first token is ${milliseconds(run.ttft)} (${run.prefill.regime}). ${tpot} Prefill handles ${share(run.promptShareOfTokens)} of the tokens in ${share(run.promptShareOfTime)} of the time.`;
}
