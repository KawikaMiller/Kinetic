import { useState } from 'react';
import { TextField } from '../../components/ui';
import { parseLength } from './length';

const group = (n: number) => n.toLocaleString('en-US');

/** A typed whole number: a refused entry keeps the old value and says why; the text follows `value` when a slider changes it. */
export function LengthField({
  label, value, min, max, onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValue: (v: number) => void;
}) {
  const [text, setText] = useState(group(value));
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(group(value));
    setError(null);
  }

  const type = (typed: string) => {
    setText(typed);
    const parsed = parseLength(typed, label, min, max);
    if (parsed.ok) {
      setError(null);
      if (parsed.value !== value) onValue(parsed.value);
    } else {
      setError(`${parsed.error} Keeping ${group(value)}.`);
    }
  };

  return (
    <div className="ftq-field">
      <TextField
        label={label}
        value={text}
        width={118}
        spellCheck={false}
        onChange={type}
        onBlur={() => {
          setText(group(value));
          setError(null);
        }}
      />
      {error && <span className="ftq-refusal" role="status">{error}</span>}
    </div>
  );
}
