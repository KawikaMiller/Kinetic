import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { ms, times } from '../../core/format';
import {
  FORCED_LINE, THRASH_ROWS, THRASH_RUNS, THRASH_SOURCE, THRASH_TAGS, forcedLayouts, median, runThrash, thrashOps, type RowIo, type ThrashMode,
} from './model';

const MODES: ThrashMode[] = ['interleaved', 'batched'];
const MODE_TITLE: Record<ThrashMode, string> = { interleaved: 'Interleaved: read, write, read, write', batched: 'Batched: all reads, then all writes' };
/** The two widths (in %) the rows alternate between, so every pass really changes something. */
const WIDTHS = [62, 94] as const;
/** The timer's grain: a faster result than this is shown as this when taking a ratio. */
const TIMER_GRAIN_MS = 0.1;
/** Below this ratio the two timings are called close, not a clear gap. */
const CLEAR_GAP = 1.5;

type Medians = Record<ThrashMode, number>;
const FORCED: Record<ThrashMode, number> = {
  interleaved: forcedLayouts(thrashOps('interleaved', THRASH_ROWS)),
  batched: forcedLayouts(thrashOps('batched', THRASH_ROWS)),
};

/** Times each loop on the real rows: one warm-up pass, then THRASH_RUNS measured ones, alternating the modes. */
function measure(rows: HTMLElement[]): Medians {
  const io: RowIo = {
    read: (i) => rows[i].offsetHeight,
    write: (i, v) => {
      rows[i].style.width = `${v}%`;
    },
  };
  let pass = 0;
  const once = (mode: ThrashMode): number => {
    const value = WIDTHS[pass++ % WIDTHS.length];
    const start = performance.now();
    runThrash(mode, rows.length, io, value);
    io.read(0); // the layout the browser still owes: every pass pays for it
    return performance.now() - start;
  };
  MODES.forEach(once);
  const samples: Record<ThrashMode, number[]> = { interleaved: [], batched: [] };
  for (let i = 0; i < THRASH_RUNS; i++) MODES.forEach((m) => samples[m].push(once(m)));
  return { interleaved: median(samples.interleaved), batched: median(samples.batched) };
}

function resultCaption(m: Medians): ReactNode {
  const ratio = m.interleaved / Math.max(m.batched, TIMER_GRAIN_MS);
  return <>Measured just now on this device, over {THRASH_ROWS} real rows (median of {THRASH_RUNS} passes): <span className="hl bad">interleaved {ms(m.interleaved)}</span>{' '}
    and <span className="hl ok">batched {ms(m.batched)}</span>{ratio >= CLEAR_GAP ? <>, about {times(Math.round(ratio * 10) / 10)} apart</> : <>: close together this time, so run it again</>}.
    The interleaved loop makes the browser redo layout on nearly every row, the batched one once. Timings depend on the device and change from run to run.</>;
}

const INTRO = <>Two loops do the same job on {THRASH_ROWS} real rows: read each row&apos;s height and change its width. One interleaves the reads and writes, one batches
  them. Press Run to time both on this device.</>;

/** Layout thrashing, measured for real. */
export function ThrashScene({ picker }: { picker: ReactNode }) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Medians | null>(null);
  const [running, setRunning] = useState(false);
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(result ? resultCaption(result) : INTRO);
  }, [result, setCaption]);

  const run = () => {
    setRunning(true);
    // Let "Measuring…" paint first: the loops below block the page for a moment.
    setTimeout(() => {
      const rows = rowsRef.current ? [...rowsRef.current.children] : [];
      setResult(measure(rows as HTMLElement[]));
      setRunning(false);
    }, 40);
  };

  const scale = result ? Math.max(result.interleaved, result.batched, TIMER_GRAIN_MS) : 1;
  return (
    <StageFrame
      height={420}
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={run} disabled={running}>
            {running ? 'Measuring…' : result ? 'Run again' : `Run on ${THRASH_ROWS} rows`}
          </Button>
        </>,
      ]}
    >
      <div className="stage-pad bp">
        <div className="bp-thrash-top">
          <div className="bp-thrash-code">
            {MODES.map((m) => (
              <CodePanel
                key={m}
                title={MODE_TITLE[m]}
                lines={THRASH_SOURCE[m]}
                gutter="none"
                stateOf={(i) => (i === FORCED_LINE[m] ? 'bad' : 'idle')}
                trailing={(i) => THRASH_TAGS[m][i] ?? null}
              />
            ))}
          </div>
          <div className="bp-rows" ref={rowsRef} aria-label="The 200 real rows the loops run on" tabIndex={0}>
            {Array.from({ length: THRASH_ROWS }, (_, i) => (
              <div key={i} className="bp-row" style={{ width: `${WIDTHS[1]}%` }}>
                Row {i + 1}: how tall this box is depends on how wide it is, because its text wraps.
              </div>
            ))}
          </div>
        </div>
        <div className="bp-thrash-results">
          <SectionTitle weight="regular" hint={`median of ${THRASH_RUNS} passes after a warm-up, measured with performance.now()`}>Time on this device</SectionTitle>
          {MODES.map((m) => (
            <Bar
              key={m}
              value={result ? result[m] : 0}
              max={scale}
              tone={m === 'interleaved' ? 'bad' : 'ok'}
              height={14}
              label={<span className="bp-bar-label">{m === 'interleaved' ? 'Interleaved' : 'Batched'}</span>}
              trailing={<span className="bp-bar-value">{result ? ms(result[m]) : 'not run yet'}</span>}
            />
          ))}
          <Stats>
            <Stat label="Forced layouts, interleaved" value={FORCED.interleaved} sub="counted from the loop's order, not timed" color="var(--bad)" />
            <Stat label="Forced layouts, batched" value={FORCED.batched} sub="one layout is still owed at the end of both" color="var(--ok)" />
          </Stats>
        </div>
        <Hint block>
          Real DOM, real timings: your device sets the numbers, so they change between runs and machines. A read such as <code>offsetHeight</code> right after a write
          makes the browser finish layout early so it can answer; the model counts those reads.
        </Hint>
      </div>
    </StageFrame>
  );
}
