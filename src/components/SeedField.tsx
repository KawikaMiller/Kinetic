import { useState } from 'react';
import { nextSeed, parseSeed } from '../core/seed';
import { Button, TextField } from './ui';
import './seedField.css';

/**
 * The seed control of the statistics, queueing and distributed-systems lessons: a text field read
 * through `parseSeed` (core/seed), a "new seed" button, and the refusal message when the typed
 * text is not a seed (the old seed stays). Renders a fragment, so it sits inside the lesson's own
 * controls row.
 */
export function SeedField({ seed, onSeed }: { seed: number; onSeed: (seed: number) => void }) {
  const [text, setText] = useState(String(seed));
  const [error, setError] = useState<string | null>(null);

  const type = (typed: string) => {
    setText(typed);
    const parsed = parseSeed(typed);
    if (parsed.ok) {
      setError(null);
      if (parsed.value !== seed) onSeed(parsed.value);
    } else {
      setError(parsed.error);
    }
  };
  const settle = () => {
    setText(String(seed));
    setError(null);
  };
  const fresh = () => {
    const next = nextSeed(seed);
    setText(String(next));
    setError(null);
    onSeed(next);
  };

  return (
    <>
      <TextField label="Seed" value={text} onChange={type} onBlur={settle} width={110} spellCheck={false} />
      <Button onClick={fresh}>New seed</Button>
      {error && <span className="seed-field-error" role="status">{error} Keeping seed {seed}.</span>}
    </>
  );
}
