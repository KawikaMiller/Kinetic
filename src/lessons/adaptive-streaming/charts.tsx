import { Curve, HLine, Plot2D, Segments, VLine } from '../../components/Plot2D';
import type { Tone } from '../../core/tone';
import { LADDER, MAX_BUFFER, bufferAt, type Run } from './abr';
import { stepsOf } from './chartMath';

const CHART_HEIGHT = 200;
const RATE_TOP = 7;
const BUFFER_STEP = 0.25;

/** Throughput (grey) and the bitrate each segment was fetched at (a rung per segment, up to `now`). */
export function ThroughputPlot({ trace, run, domain, now, width }: { trace: readonly number[]; run: Run; domain: number; now: number; width: number }) {
  return (
    <Plot2D x={{ domain: [0, domain], label: 'time (s)' }} y={{ domain: [0, RATE_TOP], label: 'Mbit/s' }} width={width} height={CHART_HEIGHT} ariaLabel="The network throughput as a staircase and the bitrate of each downloaded segment">
      {LADDER.map((b) => <HLine key={b} at={b} tone="dim" />)}
      <Curve points={stepsOf(trace, domain)} tone="dim" />
      <Segments
        segments={run.segs.filter((s) => s.start <= now).map((s) => ({ from: [s.start, s.bitrate] as [number, number], to: [Math.min(s.end, now), s.bitrate] as [number, number], tone: 'hi' as Tone }))}
      />
      <VLine at={Math.min(now, domain)} tone="hi" />
    </Plot2D>
  );
}

/** The buffer level up to `now`, the stalls on the floor, and the cap. */
export function BufferPlot({ run, domain, now, width }: { run: Run; domain: number; now: number; width: number }) {
  const pts: [number, number][] = [];
  for (let t = 0; t <= Math.min(now, domain); t += BUFFER_STEP) pts.push([t, bufferAt(run, t)]);
  const stalls = run.segs.filter((s) => s.stall > 0 && s.end <= now).map((s) => ({ from: [s.end - s.stall, 0] as [number, number], to: [s.end, 0] as [number, number], tone: 'bad' as Tone }));
  return (
    <Plot2D x={{ domain: [0, domain], label: 'time (s)' }} y={{ domain: [0, MAX_BUFFER + 5], label: 'buffer (s)' }} width={width} height={CHART_HEIGHT} ariaLabel="The playback buffer in seconds over time, with stalls marked on the floor">
      <HLine at={MAX_BUFFER} tone="dim" label="cap" />
      {pts.length > 1 && <Curve points={pts} tone="info" />}
      <Segments segments={stalls} />
      <VLine at={Math.min(now, domain)} tone="hi" />
    </Plot2D>
  );
}
