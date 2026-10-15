import { useState } from 'react';
import type { FieldParse } from '../../core/parse';

/**
 * A typed number field that keeps the last valid value: what the lesson computes with stays
 * valid while the text is half-typed or refused, and `error` says why the text was refused.
 */
export function useNumberField(initial: string, parse: (text: string) => FieldParse<number>) {
  const [text, setText] = useState(initial);
  const [kept, setKept] = useState(() => {
    const first = parse(initial);
    return first.ok ? first.value : 1;
  });
  const current = parse(text);
  const onChange = (next: string) => {
    setText(next);
    const parsed = parse(next);
    if (parsed.ok) setKept(parsed.value);
  };
  return { text, onChange, value: current.ok ? current.value : kept, error: current.ok ? null : current.error };
}
