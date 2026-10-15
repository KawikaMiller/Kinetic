import { useState } from 'react';
import { Button, Hint, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { randomSeed } from './config';
import { SEED_MAX } from './generator';

const seedMessages = {
  empty: 'Type a seed, a whole number.',
  invalid: (typed: string) => `"${typed}" is not a whole number; the seed stays as it was.`,
  tooSmall: () => 'Seeds start at 0; the seed stays as it was.',
  tooBig: () => `Keep the seed at or under ${SEED_MAX.toLocaleString('en-US')}; the seed stays as it was.`,
};

/** The standard seed field: refuses anything but a whole number in range and keeps the old seed. */
export function SeedField({ seed, onSeed }: { seed: number; onSeed: (seed: number) => void }) {
  const [text, setText] = useState(String(seed));
  const [shown, setShown] = useState(seed);
  const [error, setError] = useState<string | null>(null);
  if (seed !== shown) {
    setShown(seed);
    setText(String(seed));
    setError(null);
  }
  const commit = () => {
    const parsed = parseBoundedInt(text, { min: 0, max: SEED_MAX, messages: seedMessages });
    if (parsed.ok) {
      setError(null);
      onSeed(parsed.value);
    } else {
      setError(parsed.error);
      setText(String(seed));
    }
  };
  return (
    <>
      <TextField label="Seed" value={text} onChange={setText} onEnter={commit} onBlur={commit} width={120} spellCheck={false} ariaLabel="Seed" />
      <Button onClick={() => onSeed(randomSeed())}>New seed</Button>
      {error && <Hint tone="muted">{error}</Hint>}
    </>
  );
}
