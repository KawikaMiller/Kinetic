import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { bitLength, operationCount, popcount, powRun } from './modpow';
import { OPENING, parseExponent, TIMING_PRESETS } from './presets';

const TOY_BASE = 3n;
const TOY_MODULUS = 1_000_003n;

interface Row {
  exponent: bigint;
  bits: number;
  ones: number;
  squarings: number;
  multiplications: number;
  total: number;
}

const rowFor = (e: bigint): Row => {
  const run = powRun(TOY_BASE, e, TOY_MODULUS, 'ltr');
  return { exponent: e, bits: bitLength(e), ones: popcount(e), squarings: run.squarings, multiplications: run.multiplications, total: operationCount(run) };
};

/** Scene 5: the multiplication count follows the 1-bits of the exponent, so a naive loop does different work for different exponents. */
export function TimingScene({ picker }: { picker: ReactNode }) {
  const [exponent, setExponent] = useState<bigint>(OPENING.timing.exponent);
  const [draft, setDraft] = useState(String(OPENING.timing.exponent));
  const [error, setError] = useState<string | null>(null);

  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseExponent(text);
    if (parsed.ok) {
      setExponent(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };

  const rows = useMemo(() => [...TIMING_PRESETS, exponent].filter((e, i, all) => all.indexOf(e) === i).map(rowFor), [exponent]);
  const mine = rowFor(exponent);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const sameLength = rows.filter((r) => r.bits === mine.bits && r.exponent !== exponent);
  const spread = sameLength.length ? Math.max(...sameLength.map((r) => r.total), mine.total) - Math.min(...sameLength.map((r) => r.total), mine.total) : 0;

  return (
    <StageFrame
      height={430}
      intro={
        <>
          The exponent {exponent.toString()} has {mine.bits} bits and {mine.ones} of them are 1, so left-to-right square-and-multiply does {mine.squarings} squarings and {mine.multiplications} multiplications: {mine.total} in all. Another exponent of the same length can need a different count.
        </>
      }
      introKey={exponent.toString()}
      stats={
        <Stats>
          <Stat label="Bits" value={mine.bits} color="var(--info)" sub="squarings = bits - 1" />
          <Stat label="Bits that are 1" value={mine.ones} color="var(--hi)" sub="multiplications = ones - 1" />
          <Stat label="Multiplications in all" value={mine.total} color="var(--ok)" sub={sameLength.length ? `other listed exponents of ${mine.bits} bits differ by up to ${spread}` : 'no other listed exponent has this length'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'squarings (set by the length)', shape: 'square' },
            { color: 'var(--violet)', label: 'multiplications (set by the 1 bits)', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="Exponent (0 to 10^30)" value={draft} onChange={edit} width={170} spellCheck={false} />
          {TIMING_PRESETS.map((e) => (
            <ChipButton key={String(e)} tone="info" on={exponent === e} onClick={() => { setExponent(e); setDraft(String(e)); setError(null); }}>{e.toString()}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'Counts only: nothing here measures a clock or attacks anything.'}</span></Hint>
        </>,
      ]}
    >
      <div className="me-stage stage-pad">
        {rows.map((r) => (
          <div key={String(r.exponent)} className="me-row">
            <span className="me-rowlabel">e = {r.exponent.toString()} ({r.bits} bits, {r.ones} ones)</span>
            <Bar value={r.squarings} max={max} tone="info" label="squarings" trailing={r.squarings} />
            <Bar value={r.multiplications} max={max} tone="violet" label="multiplications" trailing={r.multiplications} />
          </div>
        ))}
        <p className="me-note">
          A loop whose work depends on the secret bits of an exponent leaks something about them to anyone who can watch the time or the power draw. Real implementations are written to do the same work whatever the bits are; the Montgomery ladder and constant-time code are named only, and this lesson measures and attacks nothing: the counts above are operation counts for toy numbers.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes, not cryptography: base {TOY_BASE.toString()}, modulus {TOY_MODULUS.toString()}, no key</Provenance>
        <Provenance kind="real">exact operation counts for this algorithm; real big-integer multiplication cost grows with size</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
