import { useState } from 'react';
import { parseInputs, type OpId } from './patterns';

export interface ListInput {
  text: string;
  /** The last list the learner typed that was accepted; always valid for `op`. */
  values: number[];
  op: OpId;
  error: string | null;
  type: (text: string) => void;
  /** Loads a preset list (and the operator it needs) and clears any refusal. */
  load: (values: readonly number[], op?: OpId) => void;
  /** Switches the operator; refused (with a message, the old operator kept) when the list cannot be digit strings. */
  setOp: (op: OpId) => void;
}

const negativesOrFractions = (values: readonly number[]): boolean => values.some((v) => v < 0 || !Number.isInteger(v));

/** The typed-list state the three scenes share: a text field that keeps the last accepted list when the text is refused. */
export function useListInput(initial: { values: readonly number[]; op: OpId }): ListInput {
  const [text, setText] = useState(initial.values.join(', '));
  const [values, setValues] = useState<number[]>([...initial.values]);
  const [op, setOpState] = useState<OpId>(initial.op);
  const [error, setError] = useState<string | null>(null);

  return {
    text,
    values,
    op,
    error,
    type: (next) => {
      setText(next);
      const parsed = parseInputs(next, op);
      if (parsed.ok) {
        setError(null);
        setValues(parsed.values);
      } else setError(`${parsed.error} The list stays ${values.join(', ')}.`);
    },
    load: (next, nextOp) => {
      setText(next.join(', '));
      setValues([...next]);
      if (nextOp) setOpState(nextOp);
      setError(null);
    },
    setOp: (next) => {
      if (next === 'concat' && negativesOrFractions(values)) {
        setError('Concatenation treats values as digit strings, so negatives and decimals are refused in this mode. The operator stays the same.');
        return;
      }
      setError(null);
      setOpState(next);
    },
  };
}
