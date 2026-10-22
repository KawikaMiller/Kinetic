import { useState } from 'react';
import { parseBoundedInt } from '../../core/parse';
import { PAYOFF_MAX, PAYOFF_MESSAGES, PAYOFF_MIN, resizeGame, setPayoff, type Game } from './model';

export interface GameState {
  game: Game;
  /** What is typed in a payoff field that has not been accepted (or has just been), by field. */
  drafts: Readonly<Record<string, string>>;
  /** The refusal for the field last edited, or null. */
  error: string | null;
  fieldKey: (who: 'A' | 'B', r: number, c: number) => string;
  edit: (who: 'A' | 'B', r: number, c: number, text: string) => void;
  settle: (who: 'A' | 'B', r: number, c: number) => void;
  load: (game: Game) => void;
  resize: (rows: number, cols: number) => void;
}

const fieldKey = (who: 'A' | 'B', r: number, c: number) => `${who}${r}${c}`;

/** The learner's payoff matrix: typed drafts per field, the last game that parsed, and the refusal for a bad entry (the old payoff stays). */
export function useGame(initial: Game): GameState {
  const [game, setGame] = useState<Game>(initial);
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  return {
    game,
    drafts,
    error,
    fieldKey,
    edit: (who, r, c, text) => {
      setDrafts({ ...drafts, [fieldKey(who, r, c)]: text });
      const parsed = parseBoundedInt(text, { min: PAYOFF_MIN, max: PAYOFF_MAX, messages: PAYOFF_MESSAGES });
      if (parsed.ok) {
        setGame(setPayoff(game, who, r, c, parsed.value));
        setError(null);
      } else {
        setError(parsed.error);
      }
    },
    settle: (who, r, c) => {
      setDrafts(Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== fieldKey(who, r, c))));
      setError(null);
    },
    load: (next) => {
      setGame(next);
      setDrafts({});
      setError(null);
    },
    resize: (rows, cols) => {
      setGame(resizeGame(game, rows, cols));
      setDrafts({});
      setError(null);
    },
  };
}
