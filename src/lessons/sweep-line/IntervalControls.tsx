import { Button, ChipButton, Hint, TextField } from '../../components/ui';
import { MAX_INTERVALS, TIME_MAX, type IntervalPreset } from './presets';
import type { IntervalsState } from './useIntervals';

/** The typed interval list with preset chips, add and remove, and the status line (refusals included). */
export function IntervalControls({ state, presets }: { state: IntervalsState; presets: IntervalPreset[] }) {
  const same = (p: IntervalPreset) => p.intervals.length === state.intervals.length && p.intervals.every((x, i) => x.start === state.intervals[i].start && x.end === state.intervals[i].end);
  return (
    <>
      <TextField label="Intervals (start-end, ...)" value={state.text} onChange={state.type} width={300} spellCheck={false} />
      {presets.map((p) => (
        <ChipButton key={p.id} tone="info" on={same(p)} onClick={() => state.load(p.intervals)}>{p.label}</ChipButton>
      ))}
      <Button onClick={state.add}>Add</Button>
      <Button onClick={state.removeLast}>Remove last</Button>
      {state.swapOffer && <Button onClick={state.acceptSwap}>Swap the ends</Button>}
      <Hint>
        <span role="status">
          {state.note ?? `Each interval is [start, end): an interval that ends at 10 and one that starts at 10 do not overlap. Times run 0 to ${TIME_MAX}, up to ${MAX_INTERVALS} intervals; drag a handle (it snaps to half an hour; an arrow key moves it one half hour, Shift a few) or type the list.`}
        </span>
      </Hint>
    </>
  );
}
