import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { useInterval } from '../../core/useInterval';
import { watermarkCaption } from './captions';
import { BOUND_RANGE, DEFAULT_BOUND, DEFAULT_LATENESS, LATENESS_RANGE, STRAGGLER_BEHIND, droppedCount, fireDelay, heldWindows } from './engine';
import { DEFAULT_DELAY, WATERMARK_SEED, EVENT_COUNT, MAX_DELAY, MIN_DELAY, arrivalOrder, generate, type Evt } from './events';
import { clockLabel, horizonOf, PLOT_W } from './layout';
import { PLOT_FONT, drawnFrom, keyTone } from './plotModel';
import { WindowPlot } from './Plots';
import { resultRows } from './results';
import { makeSim } from './sim';
import { SpecControls } from './SpecControls';
import { STRAGGLER_ID, withStraggler } from './straggler';
import { DEFAULT_WINDOW_CONTROLS, specOf, type WindowControls } from './windows';

const PLAY_MS = 300;

export function WatermarkScene({ picker }: { picker: ReactNode }) {
  const [controls, setControls] = useState<WindowControls>(DEFAULT_WINDOW_CONTROLS);
  const [maxDelay, setMaxDelay] = useState(DEFAULT_DELAY);
  const [seed, setSeed] = useState(WATERMARK_SEED);
  const [bound, setBound] = useState(DEFAULT_BOUND);
  const [lateness, setLateness] = useState(DEFAULT_LATENESS);
  const [sideOutput, setSideOutput] = useState(false);
  const [k, setK] = useState(EVENT_COUNT);
  const [straggler, setStraggler] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const spec = useMemo(() => specOf(controls), [controls]);
  const base = useMemo(() => arrivalOrder(generate(seed, maxDelay).events), [seed, maxDelay]);
  const arrivals = useMemo<Evt[]>(() => (straggler === null ? base : (withStraggler(base, straggler, bound) ?? base)), [base, straggler, bound]);
  const n = arrivals.length;
  const sim = useMemo(() => makeSim(seed, arrivals, { spec, bound, lateness, sideOutput }), [seed, arrivals, spec, bound, lateness, sideOutput]);
  const at = Math.min(k, n);
  const stream = sim.at(at) ?? sim.state;
  const rows = useMemo(() => resultRows(stream, arrivals), [stream, arrivals]);
  const horizon = horizonOf(arrivals);
  const dropped = droppedCount(stream);
  const wait = fireDelay(stream);
  const held = heldWindows(stream).length;
  const peak = Math.max(1, ...rows.map((r) => r.truth));
  const canSend = at > 0 && straggler === null;

  useIntroCaption(watermarkCaption({ stream, rows, n }), [stream, rows]);
  useInterval(() => {
    if (at >= n) setPlaying(false);
    else setK(at + 1);
  }, PLAY_MS, playing);

  const windows = drawnFrom(stream.windows, (w) => (w.fired ? 'dim' : 'violet'));
  const fateTone = (e: Evt): Tone => (stream.fates[e.id] === 'dropped' ? 'bad' : stream.fates[e.id] === 'late' ? 'info' : stream.fates[e.id] === 'on-time' ? 'ok' : keyTone(e.key));

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Result delay" value={wait.windows === 0 ? '–' : `${wait.mean.toFixed(1)} s`} sub={wait.windows === 0 ? 'no window has fired' : ["mean, from a window's end to the arrival that fires it", `longest ${wait.longest} s`]} />
          <Stat label="Dropped events" value={dropped} color={dropped > 0 ? 'var(--bad)' : 'var(--ok)'} sub={sideOutput ? `${stream.side.length} in the side output` : 'gone for good'} />
          <Stat label="State held" value={held} sub="windows kept for late events" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'an event on time', shape: 'dot' },
            { color: 'var(--info)', label: 'late but counted', shape: 'dot' },
            { color: 'var(--bad)', label: 'dropped', shape: 'dot' },
            { color: 'var(--hi)', label: 'the watermark', shape: 'line' },
            { color: 'var(--violet)', label: 'an open window (a fired one is dim)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SpecControls value={controls} onChange={(patch) => setControls((c) => ({ ...c, ...patch }))} />
        </>,
        <>
          <Slider label="Delay bound D" value={maxDelay} min={MIN_DELAY} max={MAX_DELAY} format={(v) => `${v} s`} onChange={setMaxDelay} />
          <Slider label="Watermark bound" value={bound} {...BOUND_RANGE} format={(v) => `${v} s`} onChange={setBound} />
          <Slider label="Allowed lateness" value={lateness} {...LATENESS_RANGE} format={(v) => `${v} s`} onChange={setLateness} />
          <Toggle label="Dropped events" value={sideOutput} onChange={setSideOutput} off="Discard" on="Side output" />
        </>,
        <>
          <Slider label="Arrivals processed" value={at} min={0} max={n} onChange={(next) => { setPlaying(false); setK(next); }} />
          <Button onClick={() => { setK(0); setPlaying(true); }}>Play from the start</Button>
          <ChipButton tone="orange" on={straggler !== null} onClick={() => { if (straggler === null) { setStraggler(at); setK(at + 1); } else setStraggler(null); }} disabled={straggler === null && !canSend}>
            {straggler === null ? `Send a straggler (${STRAGGLER_BEHIND} s behind)` : 'Remove the straggler'}
          </ChipButton>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Box>
          <SectionTitle hint="on the event-time axis">Watermark and windows</SectionTitle>
          <WideRegion minWidth={minWidthForText(PLOT_W, PLOT_FONT)} label="Watermark and windows: scroll sideways to see all of it">
            <WindowPlot
              spec={spec}
              windows={windows}
              dots={arrivals.map((e, i) => ({ event: e, tone: fateTone(e), hollow: i >= at }))}
              horizon={horizon}
              watermark={stream.watermark}
              ariaLabel={`Windows and the watermark after ${at} of ${n} arrivals`}
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="streamed against the offline truth over every event; the bar is as long as the truth">Result against ground truth</SectionTitle>
          {rows.length === 0 ? (
            <p className="empty-note">No windows: there are no events.</p>
          ) : (
            <div className="sw-results">
              {rows.map((r) => (
                <div key={`${r.span.key}:${r.span.start}:${r.span.end}`} className="sw-result">
                  <span className="sw-result-name">{r.span.key === '*' ? '' : `${r.span.key} `}{clockLabel(r.span.start)} to {clockLabel(r.span.end)}</span>
                  <Bar
                    segments={[{ value: r.streamed, tone: 'info' }, { value: r.dropped, tone: 'bad' }, { value: r.pending, tone: 'dim' }]}
                    max={peak}
                    height={10}
                    animate={false}
                    ariaLabel={`${r.truth} events in this window by event time; streamed ${r.streamed}, dropped ${r.dropped}, still to arrive ${r.pending}`}
                  />
                  <span className="sw-result-nums">
                    {r.streamed} of {r.truth}
                    {r.dropped > 0 && <b className="sw-wrong"> ({r.dropped} dropped)</b>}
                    {spec.kind === 'session' && !r.produced && r.pending < r.truth && <b className="sw-wrong"> (no matching session)</b>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {spec.kind === 'session' && <Hint>a dropped event can leave a session split or merged differently, so a session is matched by its exact range</Hint>}
        </Box>
        <Box>
          <SectionTitle hint="windows firing, late updates and drops">What the job did</SectionTitle>
          <LogStream
            label="Window events"
            maxHeight={130}
            follow
            max={60}
            live="off"
            empty="Nothing yet: process an arrival."
            rows={stream.log.map((l) => ({ id: l.id, at: `t${l.at}`, tone: l.tone, text: l.text }))}
          />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded clicks, one arrival a tick{straggler !== null ? `; straggler is event ${STRAGGLER_ID}` : ''}</Provenance>
          <Provenance kind="from-memory">the watermark here is the largest event time seen minus a bound, one common strategy; Flink, Beam and Spark have their own APIs and defaults (check their documentation)</Provenance>
        </ProvenanceRow>
        {sim.violation && <p className="sw-status" role="status">The safety check failed at arrival {sim.violation.tick}: {sim.violation.message}.</p>}
        <Hint tone="muted" block>Watermarks are a heuristic: an event further behind than the bound and the allowed lateness is lost under the discard policy.</Hint>
      </div>
    </StageFrame>
  );
}
