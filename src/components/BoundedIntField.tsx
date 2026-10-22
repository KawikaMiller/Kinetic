import { useId, useState } from 'react';
import { parseBoundedIntField, groupInt, standardIntMessages, type BoundedIntMessages } from './boundedIntParse';
import { TextField } from './ui';

const FIELD_WIDTH = 118;

/**
 * A typed whole number next to the sliders and chips that can also set it. A refused entry keeps the old value and
 * says why, under the field; the text follows `value` when something else changes it; leaving the field puts the
 * value back. `onValue` fires only for a valid entry that changes the value.
 */
export function BoundedIntField({
  label, value, min, max, onValue, messages = standardIntMessages, className = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValue: (v: number) => void;
  /** Refusal wording, when a lesson keeps its own sentences. */
  messages?: BoundedIntMessages;
  /** Extra class on the wrapper, for a lesson's spacing. */
  className?: string;
}) {
  const [text, setText] = useState(groupInt(value));
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(groupInt(value));
    setError(null);
  }

  const type = (typed: string) => {
    setText(typed);
    const parsed = parseBoundedIntField(typed, label, min, max, messages);
    if (parsed.ok) {
      setError(null);
      if (parsed.value !== value) onValue(parsed.value);
    } else {
      setError(`${parsed.error} Keeping ${groupInt(value)}.`);
    }
  };

  return (
    <IntFieldView
      label={label}
      text={text}
      error={error}
      className={className}
      onType={type}
      onBlur={() => {
        setText(groupInt(value));
        setError(null);
      }}
    />
  );
}

/**
 * The field and its refusal, drawn from state. A refused entry marks the input `aria-invalid` and points
 * `aria-describedby` at the refusal, so a screen reader reads the reason with the field and not only when the
 * status region happens to be announced.
 */
export function IntFieldView({
  label, text, error, className = '', onType, onBlur,
}: {
  label: string;
  text: string;
  error: string | null;
  className?: string;
  onType: (typed: string) => void;
  onBlur: () => void;
}) {
  const refusalId = `int-field-refusal-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div className={`int-field ${className}`}>
      <TextField
        label={label}
        value={text}
        width={FIELD_WIDTH}
        spellCheck={false}
        invalid={error !== null}
        ariaDescribedBy={error !== null ? refusalId : undefined}
        onChange={onType}
        onBlur={onBlur}
      />
      {error && <span id={refusalId} className="int-field-refusal" role="status">{error}</span>}
    </div>
  );
}
