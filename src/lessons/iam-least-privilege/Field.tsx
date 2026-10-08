import { useState } from 'react';
import { TextField } from '../../components/ui';
import type { Parsed } from './policy';

/**
 * A text field that commits only valid values: while the draft is invalid it shows why under the
 * field and the last valid value stays in force; on blur it snaps back to that value.
 */
export function ValidatedField({ label, value, parse, onCommit, width = 190 }: { label: string; value: string; parse: (text: string) => Parsed; onCommit: (v: string) => void; width?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const result = draft === null ? null : parse(draft);
  const error = result && !result.ok ? result.error : null;
  return (
    <span className="iam-field">
      <TextField
        label={label}
        value={shown}
        width={width}
        spellCheck={false}
        onChange={(text) => {
          const r = parse(text);
          setDraft(text);
          if (r.ok) onCommit(r.value);
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="iam-field-error" role="status">{error}</span>
    </span>
  );
}
