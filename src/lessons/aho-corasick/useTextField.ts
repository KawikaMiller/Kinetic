import { useState } from 'react';
import { DEFAULT_TEXT, parseText } from './model';

export interface TextState {
  draft: string;
  /** The last text that parsed: what the scene scans. */
  text: string;
  error: string | null;
  set: (raw: string) => void;
}

/** The text field of the scan scenes: the draft as typed, the last usable text, and the refusal in between. */
export function useTextField(initial: string = DEFAULT_TEXT): TextState {
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return {
    draft,
    text,
    error,
    set: (raw) => {
      setDraft(raw);
      const parsed = parseText(raw);
      if (parsed.ok) {
        setText(parsed.text);
        setError(null);
      } else {
        setError(parsed.error);
      }
    },
  };
}
