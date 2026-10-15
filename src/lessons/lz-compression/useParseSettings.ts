import { useState } from 'react';
import { DEFAULT_TEXT } from './model';
import { DEFAULT_MIN_MATCH, DEFAULT_WINDOW, checkText } from './lz77';

/**
 * The text, window and minimum match every scene but the code-length editor works on. They live in the
 * Stage and each of those scenes shows the controls, so nothing the learner sees depends on a control
 * that is not on screen. A refused text keeps the last accepted one and says why.
 */
export function useParseSettings() {
  const [raw, setRaw] = useState(DEFAULT_TEXT);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [window, setWindow] = useState(DEFAULT_WINDOW);
  const [minMatch, setMinMatch] = useState<number>(DEFAULT_MIN_MATCH);
  const checked = checkText(raw);
  return {
    raw,
    text,
    window,
    minMatch,
    error: checked.ok ? null : checked.error,
    type: (typed: string) => {
      setRaw(typed);
      const next = checkText(typed);
      if (next.ok) setText(typed);
    },
    pick: (preset: string) => {
      setRaw(preset);
      setText(preset);
    },
    setWindow,
    setMinMatch,
  };
}

export type ParseSettings = ReturnType<typeof useParseSettings>;
