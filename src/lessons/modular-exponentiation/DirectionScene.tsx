import { useMemo, useState, type ReactNode } from 'react';
import { Segmented } from '../../components/ui';
import { powRun, type Direction } from './modpow';
import { OPENING } from './presets';
import { PowerPlayer } from './PowerPlayer';
import { TripleFields } from './TripleFields';
import { useTriple } from './useTriple';

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left' },
];

/** Scene 3: the two scan directions give the same result and the same count, but keep different things in memory. */
export function DirectionScene({ picker }: { picker: ReactNode }) {
  const state = useTriple(OPENING.direction);
  const [direction, setDirection] = useState<Direction>(OPENING.direction.direction);
  const { base, exponent, modulus } = state.triple;
  const both = useMemo(() => ({ ltr: powRun(base, exponent, modulus, 'ltr'), rtl: powRun(base, exponent, modulus, 'rtl') }), [base, exponent, modulus]);
  const same = both.ltr.result === both.rtl.result;
  return (
    <PowerPlayer
      picker={picker}
      triple={state.triple}
      direction={direction}
      controls={
        <>
          <Segmented label="Scan" value={direction} onChange={setDirection} options={DIRECTIONS} />
          <TripleFields state={state} />
        </>
      }
      note={
        <p className="me-note">
          Both directions give {same ? <b>{both.ltr.result.toString()}</b> : 'different results (a bug)'} in {both.ltr.squarings + both.ltr.multiplications} multiplications ({both.ltr.squarings} squarings, {both.ltr.multiplications} multiplications; right to left {both.rtl.squarings} and {both.rtl.multiplications}). Left to right holds {both.ltr.held} number and needs the bits from the top; right to left holds {both.rtl.held}, the result and the running power, and can start from the bit it reads first. A windowed variant, which handles several bits per step, is named only.
        </p>
      }
    />
  );
}
