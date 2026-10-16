/** The MESI scene's state as pure transitions, so each opening state and each button press can be tested. */
import { COUNTEREXAMPLE, runOps } from './counterexample';
import { freshMachine, step, type Machine, type Op, type Protocol, type StepResult } from './mesi';

export const LOG_LIMIT = 8;

export interface MesiSession {
  machine: Machine;
  protocol: Protocol;
  /** The most recent access, or null before the first. */
  last: StepResult | null;
  /** The most recent accesses, newest last. */
  log: readonly StepResult[];
}

export const mesiOpening = (): MesiSession => ({ machine: freshMachine(), protocol: 'mesi', last: null, log: [] });

export function press(s: MesiSession, op: Op): MesiSession {
  const result = step(s.machine, op, s.protocol);
  return { ...s, machine: result.machine, last: result, log: [...s.log, result].slice(-LOG_LIMIT) };
}

/** Switching the protocol starts over: a half-run history under another set of rules would mean nothing. */
export const withProtocol = (protocol: Protocol): MesiSession => ({ ...mesiOpening(), protocol });

export function replayCounterexample(): MesiSession {
  const results = runOps(COUNTEREXAMPLE, 'no-invalidate');
  const last = results[results.length - 1] ?? null;
  return { machine: last?.machine ?? freshMachine(), protocol: 'no-invalidate', last, log: results.slice(-LOG_LIMIT) };
}
