import { useState } from 'react';
import { TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';

/** The largest seed the toy generators take: their states are 16 bits. */
export const MAX_SEED = 65_535;
const SEED_MESSAGES = {
  empty: 'Type a whole number from 0 to 65535.',
  invalid: (typed: string) => `"${typed}" is not a whole number. Seeds are 0 to 65535.`,
  tooSmall: () => 'Seeds start at 0.',
  tooBig: () => `The largest seed is ${MAX_SEED}.`,
};

/** A bounded whole-number seed field: the typed text is read by `parseBoundedInt`, a refusal keeps the old seed and says why. Never fed to a real generator. */
export function SeedInput({ seed, onSeed, label = 'Seed' }: { seed: number; onSeed: (seed: number) => void; label?: string }) {
  const [text, setText] = useState(String(seed));
  const [error, setError] = useState<string | null>(null);
  const type = (typed: string) => {
    setText(typed);
    const r = parseBoundedInt(typed, { min: 0, max: MAX_SEED, messages: SEED_MESSAGES });
    if (r.ok) {
      setError(null);
      onSeed(r.value);
    } else {
      setError(r.error);
    }
  };
  return (
    <>
      <TextField label={label} value={text} onChange={type} onBlur={() => { setText(String(seed)); setError(null); }} width={110} spellCheck={false} />
      {error && <span className="rn-error" role="alert">{error}</span>}
    </>
  );
}
