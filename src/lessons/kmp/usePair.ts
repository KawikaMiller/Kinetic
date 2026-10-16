import { useState } from 'react';
import { parsePair, type Pair } from './presets';

export interface PairState {
  pair: Pair;
  textDraft: string;
  patternDraft: string;
  /** The refusal message while a field holds something unusable (the last good pair stays on screen), else null. */
  error: string | null;
  surrogates: boolean;
  setText: (v: string) => void;
  setPattern: (v: string) => void;
  load: (p: Pair) => void;
}

/** The learner's text and pattern: typed drafts, the last pair that parsed, and the refusal while a draft is not usable. */
export function usePair(initial: Pair): PairState {
  const [pair, setPair] = useState<Pair>(initial);
  const [textDraft, setTextDraft] = useState(initial.text);
  const [patternDraft, setPatternDraft] = useState(initial.pattern);
  const [error, setError] = useState<string | null>(null);
  const [surrogates, setSurrogates] = useState(false);

  const apply = (text: string, pattern: string) => {
    const parsed = parsePair(text, pattern);
    if (parsed.ok) {
      setPair({ text: parsed.text, pattern: parsed.pattern });
      setError(null);
      setSurrogates(parsed.surrogates);
    } else {
      setError(parsed.error);
    }
  };

  return {
    pair,
    textDraft,
    patternDraft,
    error,
    surrogates,
    setText: (v) => {
      setTextDraft(v);
      apply(v, patternDraft);
    },
    setPattern: (v) => {
      setPatternDraft(v);
      apply(textDraft, v);
    },
    load: (p) => {
      setTextDraft(p.text);
      setPatternDraft(p.pattern);
      apply(p.text, p.pattern);
    },
  };
}
