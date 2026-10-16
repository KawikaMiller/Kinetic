import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { ALPHABET_BOUNDS, GENERATORS, GENERATOR_DEFAULT, LENGTH_BOUNDS, clampText, generatedBits, possibilities } from './model';
import { textEntropy } from '../../core/entropy';
import { bits2, generatedCaption, sampleCaption } from './text';

/** The sample string is short: a password, not an essay. */
const SAMPLE_MAX = 40;
const SAMPLE_DEFAULT = 'password';

/** A bounded number field's typed text and the last value it parsed to (kept when the text is refused). */
function useBoundedField(initial: number, bounds: { min: number; max: number }) {
  const [text, setText] = useState(String(initial));
  const [value, setValue] = useState(initial);
  const parsed = parseBoundedInt(text, bounds);
  const type = (typed: string) => {
    setText(typed);
    const next = parseBoundedInt(typed, bounds);
    if (next.ok) setValue(next.value);
  };
  const set = (v: number) => {
    setText(String(v));
    setValue(v);
  };
  return { text, value, error: parsed.ok ? null : parsed.error, type, set };
}

export function PasswordScene({ picker }: { picker: ReactNode }) {
  const length = useBoundedField(GENERATOR_DEFAULT.length, LENGTH_BOUNDS);
  const alphabet = useBoundedField(GENERATOR_DEFAULT.alphabet, ALPHABET_BOUNDS);
  const [sample, setSample] = useState(SAMPLE_DEFAULT);
  const sampleStats = useMemo(() => textEntropy(sample), [sample]);
  const bits = generatedBits(length.value, alphabet.value);
  const generator = GENERATORS.find((g) => g.length === length.value && g.alphabet === alphabet.value);

  return (
    <StageFrame
      height={400}
      intro={generatedCaption(length.value, alphabet.value)}
      introKey={[length.value, alphabet.value]}
      stats={
        <Stats>
          <Stat label="Bits per symbol" value={bits2(Math.log2(alphabet.value))} sub={`log2 ${alphabet.value}`} />
          <Stat label="Strength L × log2 N" value={`${bits2(bits)} bits`} color="var(--violet)" sub={`${length.value} × ${bits2(Math.log2(alphabet.value))}`} />
          <Stat label="Possibilities" value={possibilities(bits)} sub={[`2^${bits2(bits)}`, 'a guesser needs about half on average']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'bits of the generator (a property of the process)', shape: 'line' },
            { color: 'var(--info)', label: 'order-0 total of one string (a property of the sample)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Generators" inline>
            {GENERATORS.map((g) => (
              <ChipButton
                key={g.id}
                tone="info"
                on={generator?.id === g.id}
                onClick={() => {
                  length.set(g.length);
                  alphabet.set(g.alphabet);
                }}
              >
                {g.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label={`Symbols L (${LENGTH_BOUNDS.min}-${LENGTH_BOUNDS.max})`} value={length.text} onChange={length.type} onBlur={() => length.set(length.value)} width={70} spellCheck={false} ariaLabel="Number of symbols L" />
          <TextField label={`Alphabet N (${ALPHABET_BOUNDS.min}-${ALPHABET_BOUNDS.max})`} value={alphabet.text} onChange={alphabet.type} onBlur={() => alphabet.set(alphabet.value)} width={80} spellCheck={false} ariaLabel="Alphabet size N" />
          {(length.error || alphabet.error) && (
            <Hint tone="muted" block>
              {length.error ? `L: ${length.error} ` : ''}
              {alphabet.error ? `N: ${alphabet.error} ` : ''}
              Showing the last value that was accepted.
            </Hint>
          )}
        </>,
        <>
          <TextField label="A sample string" value={sample} onChange={setSample} sanitize={(s) => clampText(s, SAMPLE_MAX)} width={200} spellCheck={false} ariaLabel="Sample string" />
          <Hint>Up to {SAMPLE_MAX} characters.</Hint>
        </>,
      ]}
    >
      <div className="ent-stage stage-pad">
        <div className="ent-panel">
          <h4 className="ent-panel-title">Strength comes from how it was made</h4>
          <p className="ent-note">
            The entropy of a <i>distribution</i> measures the generating process: every one of the {possibilities(bits)} outcomes was equally likely. A number computed from <i>one sample</i> only describes that sample.
          </p>
        </div>
        <div className="ent-panel">
          <h4 className="ent-panel-title">What one sample&apos;s order-0 figure says</h4>
          <p className="ent-note">{sampleCaption(sampleStats, alphabet.value)}</p>
          <p className="ent-note">
            <ClaimLabel kind="practice">guessing tools try common passwords, words and patterns before uniform search</ClaimLabel> A human-chosen string is guessed by dictionary, so{sampleStats ? ` 2^${bits2(sampleStats.totalBits)}` : ' a power of two from its total'} is not the number of guesses an attacker needs.
          </p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the arithmetic is computed live; the strength of a generator assumes every symbol is drawn uniformly and independently</Provenance>
        <Provenance kind="from-memory">7,776 words is the size of the common diceware list (6^5, five dice rolls): a standard figure, from memory, verify before relying on it</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
