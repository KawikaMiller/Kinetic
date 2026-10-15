import { useState } from 'react';
import { Button, TextField } from '../../components/ui';
import { nextSeed, parseSeed } from './seed';
import './seedField.css';

/**
 * The seed control shared by the Tier 3 statistics lessons (distributions, percentiles-statistics,
 * queueing-theory, hypothesis-testing-ab): a text field read through `parseSeed`, a "new seed"
 * button, and the refusal message when the typed text is not a seed (the old seed stays).
 * Phase 2: this belongs in `components/`; it lives here only because batches never edit shared code.
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
      {error && <span className="dist-seed-error" role="status">{error} Keeping seed {seed}.</span>}
    </>
  );
}
