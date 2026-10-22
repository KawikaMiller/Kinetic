/**
 * Turing machine tables shared across lessons, as data for core/tm: the author's reference tables for binary
 * increment and palindrome check (written in the table text a learner types, parsed by `mustParseTm`), and the
 * three context-sensitive machines a^n b^n c^n, ww and a^n with n prime. The long tables are generated here,
 * never parsed from learner text. A machine accepts by halting in `accept`; stuck (no rule) and `reject` both
 * mean rejected.
 */
import { TM_BLANK, type Tm, type TmMove, type TmRule } from './tm';

export const INCREMENT_REFERENCE = `# Right end first, then carry leftwards
q0 0 -> 0 R q0
q0 1 -> 1 R q0
q0 _ -> _ L q1
q1 1 -> 0 L q1
q1 0 -> 1 S halt
q1 _ -> 1 S halt`;


export const PALINDROME_REFERENCE = `# Erase the first letter, match the last
q0 a -> _ R qA
q0 b -> _ R qB
q0 _ -> _ S accept
qA a -> a R qA
qA b -> b R qA
qA _ -> _ L cA
cA a -> _ L back
cA b -> b S reject
cA _ -> _ S accept
qB a -> a R qB
qB b -> b R qB
qB _ -> _ L cB
cB b -> _ L back
cB a -> a S reject
cB _ -> _ S accept
back a -> a L back
back b -> b L back
back _ -> _ R q0`;


/** One rule for each symbol in `read`, copying the symbol unless `write` is given. */
function on(state: string, read: readonly string[], move: TmMove, next: string, write?: string): TmRule[] {
  return read.map((s) => ({ state, read: s, write: write ?? s, move, next }));
}

const blank = (state: string, move: TmMove, next: string): TmRule[] => on(state, [TM_BLANK], move, next);

/**
 * a^n b^n c^n: cross off one a, one b and one c per pass (X, Y, Z), come back to the X, repeat; when no a is
 * left, check that only Y's and Z's remain.
 */
export const ANBNCN: Tm = {
  start: 'q0',
  rules: [
    ...on('q0', ['a'], 'R', 'q1', 'X'), ...on('q0', ['Y'], 'R', 'q4'), ...blank('q0', 'S', 'accept'),
    ...on('q1', ['a', 'Y'], 'R', 'q1'), ...on('q1', ['b'], 'R', 'q2', 'Y'),
    ...on('q2', ['b', 'Z'], 'R', 'q2'), ...on('q2', ['c'], 'L', 'q3', 'Z'),
    ...on('q3', ['a', 'b', 'Y', 'Z'], 'L', 'q3'), ...on('q3', ['X'], 'R', 'q0'),
    ...on('q4', ['Y', 'Z'], 'R', 'q4'), ...blank('q4', 'S', 'accept'),
  ],
};

/**
 * ww over {a, b}: cross the string off from both ends to find the middle (A and B for the left half, 0 and 1
 * for the right half, so the symbols are kept), then compare the halves pair by pair, left cell against its
 * partner in the right half (X and Y for done).
 */
export const WW: Tm = {
  start: 'q0',
  rules: [
    ...blank('q0', 'S', 'accept'), ...on('q0', ['a'], 'R', 'qa', 'A'), ...on('q0', ['b'], 'R', 'qa', 'B'),
    ...on('q0', ['A', 'B'], 'R', 'q0'), ...on('q0', ['0', '1'], 'L', 'qB0'),
    ...on('qa', ['a', 'b', 'A', 'B'], 'R', 'qa'), ...on('qa', ['0', '1', TM_BLANK], 'L', 'qL'),
    ...on('qL', ['a'], 'L', 'qRet', '0'), ...on('qL', ['b'], 'L', 'qRet', '1'),
    ...on('qRet', ['a', 'b', 'A', 'B', '0', '1'], 'L', 'qRet'), ...blank('qRet', 'R', 'q0'),
    ...on('qB0', ['A', 'B'], 'L', 'qB0'), ...blank('qB0', 'R', 'q10'),
    ...on('q10', ['X'], 'R', 'q10'), ...on('q10', ['A'], 'R', 'pa', 'X'), ...on('q10', ['B'], 'R', 'pb', 'X'), ...on('q10', ['Y'], 'R', 'qEnd'),
    ...on('pa', ['A', 'B', 'Y'], 'R', 'pa'), ...on('pa', ['0'], 'L', 'ret', 'Y'),
    ...on('pb', ['A', 'B', 'Y'], 'R', 'pb'), ...on('pb', ['1'], 'L', 'ret', 'Y'),
    ...on('ret', ['A', 'B', 'X', 'Y', '0', '1'], 'L', 'ret'), ...blank('ret', 'R', 'q10'),
    ...on('qEnd', ['Y'], 'R', 'qEnd'), ...blank('qEnd', 'S', 'accept'),
  ],
};

/**
 * a^n with n prime. The first d a's become D (the divisor, starting at 2); the rest is the region R. A pass
 * crosses one a off R (X) for each D (a D becomes E while it is spent). If R runs out exactly at a pass
 * boundary, d divides n, so n is composite; if it runs out in the middle of a pass, d does not divide n and the
 * next a becomes a D. If no a is left in R when d is chosen, no d below n divided it: prime.
 */
export const PRIME: Tm = {
  start: 'q0',
  rules: [
    ...blank('q0', 'S', 'reject'), ...on('q0', ['a'], 'R', 'q1', 'D'),
    ...blank('q1', 'S', 'reject'), ...on('q1', ['a'], 'R', 'q2', 'D'),
    ...blank('q2', 'S', 'accept'), ...on('q2', ['a'], 'L', 'h'),
    ...on('h', ['a', 'D', 'E', 'X'], 'L', 'h'), ...blank('h', 'R', 'r0'),
    ...on('r0', ['E'], 'R', 'r0'), ...on('r0', ['D'], 'R', 'f', 'E'), ...on('r0', ['a', 'X'], 'L', 'rs'),
    ...on('f', ['D', 'E', 'X'], 'R', 'f'), ...on('f', ['a'], 'L', 'g', 'X'), ...blank('f', 'L', 'nd1'),
    ...on('g', ['a', 'D', 'E', 'X'], 'L', 'g'), ...blank('g', 'R', 'r0'),
    ...on('rs', ['E', 'D'], 'L', 'rs', 'D'), ...blank('rs', 'R', 'rr'),
    ...on('rr', ['D', 'X'], 'R', 'rr'), ...on('rr', ['a'], 'L', 'h'), ...blank('rr', 'S', 'reject'),
    ...on('nd1', ['X', 'a'], 'L', 'nd1', 'a'), ...on('nd1', ['E', 'D'], 'L', 'nd1', 'D'), ...blank('nd1', 'R', 'nd2'),
    ...on('nd2', ['D'], 'R', 'nd2'), ...on('nd2', ['a'], 'R', 'nd3', 'D'),
    ...blank('nd3', 'S', 'accept'), ...on('nd3', ['a'], 'L', 'h'),
  ],
};
