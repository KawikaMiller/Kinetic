/**
 * What the board shows after Check for a card put in the wrong ring: a run, not a lecture. Every number comes
 * from running the machines or the pumping game.
 *
 *   too small, regular ring, a^n b^n   a DFA that counts has a limit: it fails at n = k + 1 where the PDA accepts
 *   too small, regular ring, others    the regular pumping game, on a string the lesson chose
 *   too small, context-free, a^n b^n c^n   a PDA that matches a's with b's cannot also count the c's
 *   too small, context-free, others    the context-free pumping game
 *   too large                          true, but not the smallest ring
 */
import { pdaRun, type Pda } from '../../core/automata';
import { boundedCounter, firstDisagreement } from '../pushdown-automata/duel';
import { ringIndex, RINGS, type Card, type RingId } from './languages';
import { playGame, regularCount, cfCount } from './pumping';

/** The counter limit of the DFA experiment, and the pumping lengths of the two pumping experiments. */
export const EVIDENCE = { counterLimit: 3, regularP: 3, cfP: 2 } as const;

export type Relation = 'right' | 'too-small' | 'too-large' | 'unsorted';

export interface Evidence {
  relation: Relation;
  /** Sentences to show under the card. */
  lines: string[];
}

const rep = (s: string, n: number) => s.repeat(n);
const isPrime = (n: number) => n >= 2 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);

/** A string in the card's language, at least `p` long, of the shape the pumping argument for that card uses. */
export function witness(card: Card, p: number): string | null {
  switch (card.id) {
    case 'anbn':
      return rep('a', p) + rep('b', p);
    case 'brackets':
      return rep('(', p) + rep(')', p);
    case 'wwr':
      return `${rep('a', p)}bb${rep('a', p)}`;
    case 'ww':
      return `${rep('a', p)}b${rep('a', p)}b`;
    case 'anbncn':
      return rep('a', p) + rep('b', p) + rep('c', p);
    case 'prime': {
      let q = 2 * p + 1;
      while (!isPrime(q)) q++;
      return rep('a', q);
    }
    default:
      return null;
  }
}

/** a^n b^n c^n fools a PDA that counts a's against b's: it also accepts a^n b^n c^m for any m. */
const ANBN_THEN_C: Pda = {
  kind: 'pda', start: 'q0', bottom: 'Z', accept: ['qf'],
  rules: [
    { from: 'q0', read: 'a', pop: 'Z', to: 'q0', push: 'AZ' },
    { from: 'q0', read: 'a', pop: 'A', to: 'q0', push: 'AA' },
    { from: 'q0', read: 'b', pop: 'A', to: 'q1', push: '' },
    { from: 'q1', read: 'b', pop: 'A', to: 'q1', push: '' },
    { from: 'q0', read: '', pop: 'Z', to: 'q2', push: 'Z' },
    { from: 'q1', read: '', pop: 'Z', to: 'q2', push: 'Z' },
    { from: 'q2', read: 'c', pop: 'Z', to: 'q2', push: 'Z' },
    { from: 'q2', read: '', pop: 'Z', to: 'qf', push: 'Z' },
  ],
};

const accepts = (pda: Pda, s: string) => pdaRun(pda, s, { maxConfigs: 5000, accept: 'final-state' }).status === 'accepted';

function pumpLine(card: Card, p: number, mode: 'regular' | 'cf'): string[] {
  const s = witness(card, p);
  if (s === null || card.member === null) return [];
  const game = playGame({ member: card.member }, s, p, mode);
  const total = game.rows.length;
  const closed = mode === 'regular' ? regularCount(s.length, p) : cfCount(s.length, p);
  const how = mode === 'regular' ? 'split x y z' : 'decomposition u v w x y';
  return [
    game.won
      ? `The pumping game with p = ${p} on s = ${s}: all ${total} legal ${mode === 'regular' ? 'splits' : 'decompositions'} (${closed} counted by formula) have a pumped string outside the language, so ${mode === 'regular' ? 'no regular-language loop' : 'no context-free pump'} survives for this p. A proof has to work for every p.`
      : `The pumping game with p = ${p} on s = ${s}: ${game.surviving.length} of ${total} ${how}s survive pumping, so this string does not rule the ring out.`,
  ];
}

export function evidenceFor(card: Card, placed: RingId | null): Evidence {
  if (placed === null) return { relation: 'unsorted', lines: [] };
  if (placed === card.ring) return { relation: 'right', lines: [] };
  const correct = RINGS[ringIndex(card.ring)];
  if (ringIndex(placed) > ringIndex(card.ring)) {
    return { relation: 'too-large', lines: [`True but not the smallest: ${card.label} lies in the ${RINGS[ringIndex(placed)].label.toLowerCase()} ring, and the smallest ring that holds it is ${correct.label.toLowerCase()}.`] };
  }
  const lines: string[] = [];
  if (card.id === 'halts') {
    lines.push('No machine decides this language: it can be recognised by running the program, but a program that never stops is never answered. This lesson only labels it.');
    return { relation: 'too-small', lines };
  }
  if (placed === 'regular' && card.id === 'anbn') {
    const k = EVIDENCE.counterLimit;
    const states = boundedCounter(k).states.length;
    lines.push(`A DFA built to count has ${states} states and handles ${card.label} up to n = ${k}; at n = ${firstDisagreement(k)} it rejects a word that the PDA accepts. A bigger counter only moves that point out.`);
  } else if (placed === 'cf' && card.id === 'anbncn') {
    const p = EVIDENCE.cfP + 1;
    const same = accepts(ANBN_THEN_C, rep('a', p) + rep('b', p) + rep('c', p));
    const more = accepts(ANBN_THEN_C, rep('a', p) + rep('b', p) + rep('c', p + 1));
    lines.push(`A PDA that counts a's against b's ${same ? 'accepts' : 'rejects'} a^${p} b^${p} c^${p} and ${more ? 'accepts' : 'rejects'} a^${p} b^${p} c^${p + 1} too: its stack is empty before the c's arrive, so there is nothing left to count them against.`);
  }
  lines.push(...pumpLine(card, placed === 'regular' ? EVIDENCE.regularP : EVIDENCE.cfP, placed === 'regular' ? 'regular' : 'cf'));
  return { relation: 'too-small', lines };
}

