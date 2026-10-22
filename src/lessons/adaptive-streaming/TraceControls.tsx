import { ControlGroup, ChipButton, Slider } from '../../components/ui';
import { SeedField } from '../../components/SeedField';
import { SEGMENT, TRACES, type TraceId } from './abr';

/** The network and segment-length controls scenes 1 and 2 share. The seed is shown only for the trace that reads it. */
export function TraceControls({
  trace, seed, S, onTrace, onSeed, onSegment,
}: {
  trace: TraceId;
  seed: number;
  S: number;
  onTrace: (t: TraceId) => void;
  onSeed: (s: number) => void;
  onSegment: (s: number) => void;
}) {
  return (
    <>
      <ControlGroup label="Network" inline>
        {TRACES.map((t) => (
          <ChipButton key={t.id} on={trace === t.id} onClick={() => onTrace(t.id)}>
            {t.label}
          </ChipButton>
        ))}
      </ControlGroup>
      {trace === 'random' && <SeedField seed={seed} onSeed={onSeed} />}
      <Slider label="Segment length" value={S} min={SEGMENT.min} max={SEGMENT.max} format={(n) => `${n} s`} onChange={onSegment} />
    </>
  );
}
