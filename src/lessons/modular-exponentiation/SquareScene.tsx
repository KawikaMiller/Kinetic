import type { ReactNode } from 'react';
import { bitLength } from '../../core/bits';
import { OPENING } from './presets';
import { PowerPlayer } from './PowerPlayer';
import { TripleFields } from './TripleFields';
import { useTriple } from './useTriple';

/** Scene 1: left-to-right square-and-multiply, one modular multiplication per step, against repeated multiplication. */
export function SquareScene({ picker }: { picker: ReactNode }) {
  const state = useTriple(OPENING.square);
  return (
    <PowerPlayer
      picker={picker}
      triple={state.triple}
      direction="ltr"
      controls={<TripleFields state={state} />}
      note={<p className="me-note">Reduce after every operation: the running value never grows past the modulus. The exponent has {bitLength(state.triple.exponent)} bits, and the work follows the number of bits, not the size of the exponent.</p>}
    />
  );
}
