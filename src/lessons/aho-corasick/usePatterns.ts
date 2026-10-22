import { useMemo, useState } from 'react';
import { DEFAULT_PATTERNS, addPattern, buildMachine, type Machine } from './model';

export interface PatternState {
  patterns: readonly string[];
  machine: Machine;
  draft: string;
  error: string | null;
  setDraft: (v: string) => void;
  add: () => void;
  remove: (index: number) => void;
  load: (patterns: readonly string[]) => void;
}

/** The learner's pattern list: typed draft, the refusal when an add is not allowed, and the automaton rebuilt from the list. */
export function usePatterns(initial: readonly string[] = DEFAULT_PATTERNS): PatternState {
  const [patterns, setPatterns] = useState<readonly string[]>(initial);
  const [draft, setDraftText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const machine = useMemo(() => buildMachine(patterns), [patterns]);
  return {
    patterns,
    machine,
    draft,
    error,
    setDraft: (v) => {
      setDraftText(v);
      setError(null);
    },
    add: () => {
      const result = addPattern(patterns, draft);
      if (result.ok) {
        setPatterns(result.patterns);
        setDraftText('');
        setError(null);
      } else {
        setError(result.error);
      }
    },
    remove: (index) => {
      setPatterns(patterns.filter((_, i) => i !== index));
      setError(null);
    },
    load: (next) => {
      setPatterns(next);
      setError(null);
    },
  };
}
