import { useState } from 'react';
import { TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';

/**
 * A typed whole number within [min, max]: a value out of range or not a number is refused with a sentence
 * and the old value stays in use; leaving the field puts it back.
 */
export function CostField({
  label, value, min, max, onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValue: (v: number) => void;
}) {
  const [text, setText] = useState(value.toLocaleString('en-US'));
  const [error, setError] = useState<string | null>(null);

  const type = (typed: string) => {
    setText(typed);
    const parsed = parseBoundedInt(typed, {
      min,
      max,
      thousands: true,
      messages: {
        empty: `Type a whole number for ${label}.`,
        invalid: (t) => `"${t}" isn't a whole number.`,
        tooSmall: () => `${label} has to be at least ${min.toLocaleString('en-US')}.`,
        tooBig: () => `${label} goes up to ${max.toLocaleString('en-US')} here.`,
      },
    });
    if (parsed.ok) {
      setError(null);
      onValue(parsed.value);
    } else {
      setError(`${parsed.error} Keeping ${value.toLocaleString('en-US')}.`);
    }
  };

  return (
    <div className="at-field">
      <TextField
        label={label}
        value={text}
        width={118}
        spellCheck={false}
        onChange={type}
        onBlur={() => {
          setText(value.toLocaleString('en-US'));
          setError(null);
        }}
      />
      {error && <span className="at-refusal" role="status">{error}</span>}
    </div>
  );
}
