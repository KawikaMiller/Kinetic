import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { plainTone } from '../../core/tone';
import { useInterval } from '../../core/useInterval';
import { windowsCaption } from './captions';
import { newStream, runTo } from './engine';
import { DEFAULT_DELAY, WINDOWS_SEED, EVENT_COUNT, MAX_DELAY, MIN_DELAY, arrivalOrder, generate } from './events';
import { clockLabel, horizonOf, PLOT_W } from './layout';
import { PLOT_FONT, drawnFrom, keyTone } from './plotModel';
import { WindowPlot } from './Plots';
import { SpecControls } from './SpecControls';
import { DEFAULT_WINDOW_CONTROLS, specOf, type WindowControls } from './windows';

/** Event-time windows that keep everything: nothing is ever late, so the picture shows the window type and nothing else. */
const KEEP_EVERYTHING = 1e9;
const PLAY_MS = 350;

export function WindowsScene({ picker }: { picker: ReactNode }) {
  const [controls, setControls] = useState<WindowControls>(DEFAULT_WINDOW_CONTROLS);
  const [maxDelay, setMaxDelay] = useState(DEFAULT_DELAY);
  const [seed, setSeed] = useState(WINDOWS_SEED);
  const [arrived, setArrived] = useState(EVENT_COUNT);
  const [playing, setPlaying] = useState(false);

  const spec = useMemo(() => specOf(controls), [controls]);
  const fixture = useMemo(() => generate(seed, maxDelay), [seed, maxDelay]);
  const order = useMemo(() => arrivalOrder(fixture.events), [fixture]);
  const stream = useMemo(() => runTo(newStream(order, { spec, bound: 0, lateness: KEEP_EVERYTHING, sideOutput: false }), arrived), [order, spec, arrived]);
  const horizon = horizonOf(fixture.events);
  const placed = stream.windows.reduce((n, w) => n + w.ids.length, 0);

  useIntroCaption(windowsCaption({ spec, arrived, events: fixture.events, windows: stream.windows.length }), [spec, fixture, arrived, stream]);
  useInterval(() => {
    if (arrived >= EVENT_COUNT) setPlaying(false);
    else setArrived((k) => k + 1);
  }, PLAY_MS, playing);

  const slideOrSize = spec.kind === 'sliding' ? spec.slide : spec.kind === 'tumbling' ? spec.size : 1;
  const windows = drawnFrom(stream.windows, (w) => (spec.kind === 'session' ? keyTone(w.key as 'A') : plainTone(Math.round(w.start / slideOrSize))));

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Windows" value={stream.windows.length} sub={`after ${arrived} of ${EVENT_COUNT} arrivals`} />
          <Stat label="Placements" value={placed} sub={spec.kind === 'sliding' ? 'an event counts once in each window it falls in' : 'one per event'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: spec.kind === 'session' ? 'a session, one hue per user' : 'a window (a hue each); the number is its count', shape: 'square' },
            { color: 'var(--line-2)', label: 'an event that has not arrived yet (hollow)', shape: 'dot' },
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
          <Slider label="Events arrived" value={arrived} min={0} max={EVENT_COUNT} onChange={(k) => { setPlaying(false); setArrived(k); }} />
          <Button onClick={() => { setArrived(0); setPlaying(true); }}>Play from the start</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Box>
          <SectionTitle hint="half-open: [start, end) includes its start and not its end">Windows over event time</SectionTitle>
          <WideRegion minWidth={minWidthForText(PLOT_W, PLOT_FONT)} label="Windows on the event-time axis: scroll sideways to see all of it">
            <WindowPlot
              spec={spec}
              windows={windows}
              dots={order.map((e, i) => ({ event: e, tone: keyTone(e.key), hollow: i >= arrived }))}
              horizon={horizon}
              ariaLabel={`${stream.windows.length} ${spec.kind} windows holding ${arrived} arrived events`}
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="every window so far">The windows</SectionTitle>
          {stream.windows.length === 0 ? (
            <p className="empty-note">No windows: nothing has arrived.</p>
          ) : (
            <div className="sw-scroll" role="region" aria-label="The windows and their counts" tabIndex={0}>
              <table className="data-table sw-table">
                <thead>
                  <tr>{spec.kind === 'session' && <th scope="col">User</th>}<th scope="col">Range</th><th scope="col">Events</th></tr>
                </thead>
                <tbody>
                  {stream.windows.map((w) => (
                    <tr key={`${w.key}:${w.start}:${w.end}`}>
                      {spec.kind === 'session' && <td>{w.key}</td>}
                      <td>[{w.start}, {w.end}){w.start >= 0 ? ` = ${clockLabel(w.start)} to ${clockLabel(w.end)}` : ''}</td>
                      <td>{w.ids.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>the same seeded clicks as the other scenes; windows keep every event until the end</Provenance>
          <Provenance kind="from-memory">some systems call sliding windows hopping windows, and each stream processor has its own names and options (check its documentation)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
