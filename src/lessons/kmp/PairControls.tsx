import { ChipButton, Hint, TextField } from '../../components/ui';
import { PATTERN_MAX, SURROGATE_NOTE, TEXT_MAX, type Pair, type Preset } from './presets';
import type { PairState } from './usePair';

/** The text and pattern fields with preset chips and the status line (refusals included). */
export function PairControls({ state, presets, showText = true }: { state: PairState; presets: Preset[]; showText?: boolean }) {
  return (
    <>
      {showText && <TextField label={`Text (up to ${TEXT_MAX})`} value={state.textDraft} onChange={state.setText} maxLength={TEXT_MAX} width={300} spellCheck={false} />}
      <TextField label={`Pattern (1 to ${PATTERN_MAX})`} value={state.patternDraft} onChange={state.setPattern} maxLength={PATTERN_MAX} width={140} spellCheck={false} />
      {presets.map((p) => (
        <ChipButton key={p.id} tone="info" on={state.pair.text === p.text && state.pair.pattern === p.pattern} onClick={() => state.load(p as Pair)}>{p.label}</ChipButton>
      ))}
      <Hint>
        <span role="status">
          {state.error ?? (state.surrogates ? SURROGATE_NOTE : 'Type your own text and pattern, or pick a preset. Characters are UTF-16 code units.')}
        </span>
      </Hint>
    </>
  );
}
