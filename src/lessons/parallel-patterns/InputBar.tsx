import { ChipButton, Hint, TextField } from '../../components/ui';
import type { ListInput } from './useListInput';

export interface Preset {
  id: string;
  label: string;
  on: boolean;
  apply: () => void;
}

/** The typed list, its refusal line, and the preset chips: the same three controls on every scene. */
export function InputBar({ input, presets }: { input: ListInput; presets: readonly Preset[] }) {
  return (
    <>
      <TextField label="Values (up to 16 integers)" value={input.text} onChange={input.type} width={260} spellCheck={false} />
      {presets.map((p) => (
        <ChipButton key={p.id} tone="info" on={p.on} onClick={p.apply}>
          {p.label}
        </ChipButton>
      ))}
      {input.error && <Hint tone="muted" block>{input.error}</Hint>}
    </>
  );
}
