import type { ReactNode } from 'react';
import { ChipButton, ControlGroup, Hint, Segmented, Slider, TextField } from '../../components/ui';
import { MIN_MATCH_OPTIONS, MAX_TEXT, WINDOW_BOUNDS } from './lz77';
import { TEXT_PRESETS } from './model';
import type { ParseSettings } from './useParseSettings';

const MIN_MATCH_CHOICES = MIN_MATCH_OPTIONS.map((m) => ({ value: m, label: String(m) }));

/**
 * The text, window and minimum-match controls, as the rows every parsing scene shows (each is one
 * entry of a StageFrame `controls` array, after the scene picker's row).
 */
export function parseControlRows(s: ParseSettings): ReactNode[] {
  return [
    <ControlGroup key="examples" label="Examples" inline>
      {TEXT_PRESETS.map((p) => (
        <ChipButton key={p.id} tone="info" on={s.text === p.text} onClick={() => s.pick(p.text)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>,
    <>
      <TextField
        label={`Text (up to ${MAX_TEXT} characters, each a byte 0-255)`}
        value={s.raw}
        onChange={s.type}
        width={280}
        spellCheck={false}
        ariaLabel="Text to compress"
      />
      {s.error && (
        <Hint tone="muted" block>
          {s.error} Showing the last text that was accepted.
        </Hint>
      )}
    </>,
    <>
      <Slider label="Window (characters back)" value={s.window} min={WINDOW_BOUNDS.min} max={WINDOW_BOUNDS.max} onChange={s.setWindow} />
      <Segmented label="Minimum match" value={s.minMatch} onChange={s.setMinMatch} options={MIN_MATCH_CHOICES} />
      <Hint>DEFLATE&apos;s window is 32 KiB and its shortest match is 3.</Hint>
    </>,
  ];
}
