import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Game, PumpLanguage, PumpMode } from './pumping';
import { cannotWin } from './pumping';

export function ringsCaption(s: { sorted: number; checked: boolean; correct: number; total: number }): ReactNode {
  if (s.checked) {
    return <>{s.correct} of {s.total} cards are in the smallest ring that holds them. Each wrong placement is answered below with a run, not a rule.</>;
  }
  return <>Put each language in the smallest ring that holds it (rings nest: each one contains the ones inside it), then press Check. {s.sorted} of {s.total} placed so far.</>;
}

export function pumpingCaption({ lang, mode, p, game, s, error }: { lang: PumpLanguage; mode: PumpMode; p: number; game: Game | null; s: string | null; error: string | null }): ReactNode {
  if (!game || s === null) return <>{error ?? 'Choose a string.'}</>;
  const total = game.rows.length;
  const parts = mode === 'regular' ? 'splits' : 'decompositions';
  if (game.won) {
    return (
      <>
        Won for this case: all {total} legal {parts} of {s} (p = {p}) have a pumped string outside the language. This is one p and one string; the lemma speaks of every p, so a proof has to cover them all.
      </>
    );
  }
  const guaranteed = cannotWin(lang, mode);
  return (
    <>
      Not won: {plural(game.surviving.length, parts === 'splits' ? 'split' : 'decomposition')} of {total} survive pumping, so {s} does not beat this {parts === 'splits' ? 'split rule' : 'decomposition rule'}.{' '}
      {guaranteed
        ? <>{lang.label} is {mode === 'regular' ? 'regular' : 'context-free'}, so the lemma promises a survivor for every long enough string: this game cannot be won, which is the lemma working.</>
        : <>Failing with one string proves nothing: the language is not {mode === 'regular' ? 'regular' : 'context-free'}, and choosing the string is the skill.</>}
    </>
  );
}

export function minimiseCaption({ states, round, classes, stable }: { states: number; round: number | null; classes: number | null; stable: boolean }): ReactNode {
  if (round === null) return <>This machine has {states} states. Select two states and claim they are equivalent, or press Refine to run partition refinement.</>;
  if (stable) return <>Round {round}: nothing splits any more. The {classes} classes are the states of the smallest DFA for this language.</>;
  return <>Round {round}: {classes} classes. Refine again: a class splits when its members send some symbol to different classes.</>;
}
