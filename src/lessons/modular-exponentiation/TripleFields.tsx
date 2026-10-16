import { ChipButton, Hint, TextField } from '../../components/ui';
import { MODULUS_ONE_NOTE, PRESETS } from './presets';
import type { TripleState } from './useTriple';

const FIELD_WIDTH = 150;

/** Base, exponent and modulus fields, preset chips and the status line (the first refusal, else a note about the modulus). */
export function TripleFields({ state }: { state: TripleState }) {
  const { triple, drafts, errors } = state;
  const error = errors.base ?? errors.exponent ?? errors.modulus;
  return (
    <>
      <TextField label="Base" value={drafts.base} onChange={(v) => state.edit('base', v)} width={FIELD_WIDTH} spellCheck={false} />
      <TextField label="Exponent (0 to 10^30)" value={drafts.exponent} onChange={(v) => state.edit('exponent', v)} width={FIELD_WIDTH} spellCheck={false} />
      <TextField label="Modulus (1 to 10^30)" value={drafts.modulus} onChange={(v) => state.edit('modulus', v)} width={FIELD_WIDTH} spellCheck={false} />
      {PRESETS.map((p) => (
        <ChipButton
          key={p.id}
          tone="info"
          on={p.triple.base === triple.base && p.triple.exponent === triple.exponent && p.triple.modulus === triple.modulus}
          onClick={() => state.load(p.triple)}
        >
          {p.label}
        </ChipButton>
      ))}
      <Hint>
        <span role="status">{error ?? (triple.modulus === 1n ? MODULUS_ONE_NOTE : 'Whole numbers only; a base past the modulus or below 0 is reduced first.')}</span>
      </Hint>
    </>
  );
}
