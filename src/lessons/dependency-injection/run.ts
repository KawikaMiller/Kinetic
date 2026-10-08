import type { Tone } from '../../core/tone';
import { DOUBLES, HARNESS, INFRA, LOCAL_IMPLS, ORDER_SERVICE, TESTS, mainLines, type MailerChoice, type RepoChoice, type Wiring } from './programs';

export interface RunOutput {
  lines: { text: string; tone: Tone }[];
  /** One entry per test (scene 1) or per run of main (scene 2). */
  passed: boolean[];
}

/**
 * Runs a lesson-authored program for real. Safe: `new Function` only ever receives the
 * fixed program texts in programs.ts (scene 2 picks between fixed lines); nothing the
 * learner types reaches it. A strict CSP without 'unsafe-eval' would block it.
 */
export function runProgram(lines: readonly string[]): RunOutput {
  const out: RunOutput = { lines: [], passed: [] };
  const log = (text: string, tone: Tone = 'muted') => out.lines.push({ text, tone });
  try {
    new Function('log', 'passed', lines.join('\n'))(log, out.passed);
  } catch (e) {
    log(`Uncaught ${(e as Error).name}: ${(e as Error).message}`, 'bad');
    out.passed.push(false);
  }
  return out;
}

/** Scene 1's program: simulated infrastructure, the service, the doubles, the harness and the test. */
export const testProgram = (w: Wiring) => [...INFRA, ...ORDER_SERVICE[w], ...DOUBLES, ...HARNESS, ...TESTS[w]];

/** Scene 2's program: both sets of implementations, the injected service and main(). */
export const rootProgram = (repo: RepoChoice, mailer: MailerChoice) => [...INFRA, ...LOCAL_IMPLS, ...ORDER_SERVICE.injected, ...mainLines(repo, mailer)];

export const runTest = (w: Wiring) => runProgram(testProgram(w));
export const runRoot = (repo: RepoChoice, mailer: MailerChoice) => runProgram(rootProgram(repo, mailer));
