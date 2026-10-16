import { ChipButton, ControlGroup, Hint, Slider } from '../../components/ui';
import { PRESETS, RTT_RANGE, THINK_RANGE } from './init';

const SATELLITE = PRESETS.find((p) => p.id === 'satellite');

/** The round-trip slider with the three presets, and the server think-time slider when the scene uses one. */
export function NetControls({ rttMs, onRtt, thinkMs, onThink }: { rttMs: number; onRtt: (ms: number) => void; thinkMs?: number; onThink?: (ms: number) => void }) {
  return (
    <>
      <Slider label="Round trip" value={rttMs} min={RTT_RANGE.min} max={RTT_RANGE.max} step={RTT_RANGE.step} format={(v) => `${v} ms`} onChange={onRtt} />
      {thinkMs !== undefined && onThink && (
        <Slider label="Server think time" value={thinkMs} min={THINK_RANGE.min} max={THINK_RANGE.max} step={THINK_RANGE.step} format={(v) => `${v} ms`} onChange={onThink} />
      )}
      <ControlGroup label="Presets" inline>
        {PRESETS.map((p) => (
          <ChipButton key={p.id} on={rttMs === p.rttMs} onClick={() => onRtt(p.rttMs)}>
            {p.label}
          </ChipButton>
        ))}
      </ControlGroup>
      {rttMs === RTT_RANGE.max && SATELLITE?.note && <Hint tone="muted">{SATELLITE.note}</Hint>}
    </>
  );
}
