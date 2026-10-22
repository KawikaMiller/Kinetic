/** The four fixed phrasings of what a check covered (AC-0/T4 #27, #28), made from a result and never typed. */
import { integer } from './format';

/** An exhaustive search finished: it may say "holds in all N". */
export const exhaustiveText = (states: number, bounds: string): string => `holds in all ${integer(states)} reachable states of this model (${bounds})`;

/** A search stopped by its budget: it may not say "holds". */
export const truncatedText = (states: number): string => `no violation in the first ${integer(states)} states explored; not exhaustive`;

/** A seeded run over seeds `from` to `to`. */
export const sampledText = (held: number, total: number, from: number, to: number): string =>
  `held on ${held} of ${total} seeded schedules (seeds ${from} to ${to}); sampled, not exhaustive`;

/** Liveness is its own claim: how many seeds had no decision by T. */
export const livenessText = (undecided: number, total: number, by: string): string => `no decision by ${by} on ${undecided} of ${total} seeds`;
