import { useState } from 'react';
import { hasSurrogate, type Parsed } from './model';

export interface FieldState {
  /** What the learner has typed. */
  draft: string;
  /** The last draft that parsed: the one the scene is showing. */
  value: string;
  /** The refusal while the draft is not usable (the last good value stays on screen), else null. */
  error: string | null;
  surrogates: boolean;
  set: (raw: string) => void;
}

/** A text field read through `parse`: the draft as typed, the last value that parsed, and the refusal in between. */
export function useField(parse: (raw: string) => Parsed, initial: string): FieldState {
  const [draft, setDraft] = useState(initial);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [surrogates, setSurrogates] = useState(hasSurrogate(initial));
  const set = (raw: string) => {
    setDraft(raw);
    const parsed = parse(raw);
    if (parsed.ok) {
      setValue(parsed.value);
      setError(null);
      setSurrogates(parsed.surrogates);
    } else {
      setError(parsed.error);
    }
  };
  return { draft, value, error, surrogates, set };
}
