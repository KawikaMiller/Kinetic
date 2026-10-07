import { useRef, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TruthTable, type TruthColumn } from '../../components/TruthTable';
import { Button, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { toBits, type Bit } from '../../core/bits';
import { plural } from '../../core/format';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { truthRowIndex, truthRows } from '../../core/truth';
import { useInterval } from '../../core/useInterval';
import { captureCaption, dToggleCaption, edgeCaption, srCaption } from './frames';
import {
  BITS, CLOCK_PERIOD, GLITCH_SCRIPT, MAX_PERIOD, MIN_PERIOD, SR_START, capture, clockAt, isRisingEdge, nextSample, settleTicks, simulate,
  srSettle, sumSettleTicks, type Sample, type SrState, type SrStatus,
} from './model';
import { SrLatch } from './SrLatch';
import { DIAGRAM_WIDTH, TimingDiagram } from './TimingDiagram';
import './styles.css';

const SCENES = [
  { value: 'sr' as const, label: 'SR latch' },
  { value: 'dff' as const, label: 'Latch vs flip-flop' },
  { value: 'counter' as const, label: 'Register & counter' },
];

const SAMPLE_MS = 160;
const EDGE_MS = 900;
const HISTORY = 8;
/** Samples kept in memory: enough for the diagram's window plus a little history. */
const WINDOW_KEEP = 64;
const HONEST_IDEAL = 'Idealised gates: a real latch or flip-flop can go metastable if D changes right at the clock edge (setup and hold time). That isn\'t modelled here.';

const bin = (v: number) => v.toString(2).padStart(BITS, '0');

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'sr' });
  if (scene === 'dff') return <FlipFlopScene picker={picker} />;
  if (scene === 'counter') return <CounterScene picker={picker} />;
  return <SrScene picker={picker} />;
}

// ── SR latch ─────────────────────────────────────────────────────────────

const SR_VARS = ['S', 'R'];

function SrScene({ picker }: { picker: ReactNode }) {
  const [inputs, setInputs] = useState<{ s: Bit; r: Bit }>({ s: 0, r: 0 });
  const [latch, setLatch] = useState<{ state: SrState; status: SrStatus }>({ state: SR_START, status: 'hold' });
  const setCaption = useSetCaption();

  useIntroCaption(<>Two NOR gates, each feeding its output back into the other. Turn S on and off again: Q stays 1 after you let go. That's memory.</>);

  const apply = (s: Bit, r: Bit) => {
    const next = srSettle(latch.state, s, r);
    setInputs({ s, r });
    setLatch(next);
    setCaption(srCaption(next.status, next.state), { quiet: true });
  };

  const columns: TruthColumn[] = [
    { label: 'Q', fn: (row) => srSettle(latch.state, row.S ? 1 : 0, row.R ? 1 : 0).state.q === 1 },
    { label: 'Q̄', fn: (row) => srSettle(latch.state, row.S ? 1 : 0, row.R ? 1 : 0).state.qBar === 1 },
  ];
  const { status, state } = latch;
  // Rows with no trustworthy answer from here: the invalid input, and any input the latch can't settle under.
  const badRows = truthRows(SR_VARS).flatMap((row, i) => {
    const outcome = srSettle(state, row.S ? 1 : 0, row.R ? 1 : 0).status;
    return outcome === 'invalid' || outcome === 'unpredictable' ? [i] : [];
  });

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Q (stored)" value={status === 'unpredictable' ? '?' : state.q} color="var(--violet)" />
          <Stat label="State" value={status} color={status === 'invalid' || status === 'unpredictable' ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'wire = 1', shape: 'line' },
            { color: 'var(--dim)', label: 'wire = 0', shape: 'line' },
            { color: 'var(--violet)', label: 'stored Q' },
            { color: 'var(--bad)', label: 'invalid / unpredictable' },
            { color: 'var(--info)', label: 'current table row' },
          ]}
        />
      }
      controls={[
        picker,
        <Hint key="h">Click S or R (or Tab to them and press Space) to switch them on and off, or click a row of the table.</Hint>,
      ]}
    >
      <div className="stage-pad sq sq-sr">
        <div className="sq-board">
          <SrLatch s={inputs.s} r={inputs.r} state={state} status={status} onFlip={(which) => (which === 'S' ? apply(inputs.s ? 0 : 1, inputs.r) : apply(inputs.s, inputs.r ? 0 : 1))} />
        </div>
        <div className="sq-side">
          <TruthTable
            vars={SR_VARS}
            columns={columns}
            format="10"
            trueTone="hi"
            currentTone="info"
            currentRow={truthRowIndex(SR_VARS, { S: inputs.s === 1, R: inputs.r === 1 })}
            mismatchRows={badRows}
            onRowClick={(row) => apply(row.S ? 1 : 0, row.R ? 1 : 0)}
          />
          <Hint block>
            Q and Q̄ for each input, starting from the latch's current state. Red rows have no valid answer: S = R = 1 is invalid, and from the
            invalid state, releasing both at once never settles.
          </Hint>
        </div>
        <Hint block>{HONEST_IDEAL}</Hint>
      </div>
    </StageFrame>
  );
}

// ── D latch vs D flip-flop ───────────────────────────────────────────────

/** The opening waveform: D rises while CLK is low, so the latch and the flip-flop pick it up at different moments. */
const OPENING: Bit[] = [...Array<Bit>(CLOCK_PERIOD + 6).fill(0), ...Array<Bit>(CLOCK_PERIOD * 2 - 6).fill(1)];

function FlipFlopScene({ picker }: { picker: ReactNode }) {
  const [samples, setSamples] = useState<Sample[]>(() => simulate(OPENING));
  const [d, setD] = useState<Bit>(1);
  const [script, setScript] = useState<Bit[]>([]);
  const [running, setRunning] = useState(false);
  const setCaption = useSetCaption();
  const last: Sample | undefined = samples[samples.length - 1];
  /** Time of the next sample to be drawn. */
  const nextT = last ? last.t + 1 : 0;

  useIntroCaption(<>CLK, D and two circuits that store D: a latch (level-sensitive) and a flip-flop (edge-triggered). Press Run, then toggle D at
    different moments.</>);

  /** Append `count` samples, D coming from the script first, then the D level. */
  const advance = (count: number) => {
    let list = samples;
    let queue = script;
    let level = d;
    let edge: Sample | null = null;
    for (let k = 0; k < count; k++) {
      level = queue[0] ?? level;
      queue = queue.slice(1);
      const s = nextSample(list[list.length - 1] ?? null, level);
      list = [...list, s].slice(-WINDOW_KEEP);
      if (isRisingEdge(s.t)) edge = s;
    }
    setSamples(list);
    setScript(queue);
    setD(level);
    if (edge) setCaption(edgeCaption(edge), { quiet: true });
  };

  useInterval(() => advance(1), SAMPLE_MS, running);

  const toggleD = () => {
    const next = (1 - d) as Bit;
    setD(next);
    setScript([]);
    setCaption(dToggleCaption(clockAt(nextT), next), { quiet: true });
  };

  /** Run until the clock next changes level (half a period). */
  const stepClock = () => {
    const now = clockAt(nextT);
    let n = 1;
    while (clockAt(nextT + n) === now) n++;
    advance(n);
  };

  const glitch = () => {
    setSamples([]);
    setD(1);
    setScript([...GLITCH_SCRIPT]);
    setRunning(true);
    setCaption(<>Glitch preset: D is 1 at the rising edge, then dips to 0 for a moment while CLK is still high. Watch both Q lanes.</>);
  };

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="CLK" value={last?.clk ?? 0} color={last?.clk ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label="D" value={d} color={d ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label="Q latch" value={last?.latch ?? 0} color="var(--violet)" sub={last?.clk ? 'transparent' : 'holding'} />
          <Stat label="Q flip-flop" value={last?.ff ?? 0} color="var(--violet)" sub="changes only at ↑" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: '1', shape: 'line' },
            { color: 'var(--dim)', label: '0', shape: 'line' },
            { color: 'var(--info)', label: 'rising edge (flip-flop captures)', shape: 'line' },
            { color: 'var(--violet)', label: 'stored Q', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PauseButton paused={!running} onToggle={() => setRunning(!running)} />
          <Button onClick={stepClock} disabled={running}>Step clock</Button>
          <Button variant="primary" onClick={toggleD}>Toggle D (now {d})</Button>
        </>,
        <>
          <Button onClick={glitch}>Glitch preset</Button>
          <Hint>D changes take effect from the next sample. The diagram scrolls left as time passes.</Hint>
        </>,
      ]}
    >
      <div className="stage-pad sq">
        <WideRegion minWidth={DIAGRAM_WIDTH} label="Timing diagram: scroll sideways to see all of it">
          <TimingDiagram samples={samples} />
        </WideRegion>
        <Hint block>{HONEST_IDEAL} The clock period is illustrative: {CLOCK_PERIOD} samples, high for the first half.</Hint>
      </div>
    </StageFrame>
  );
}

// ── Register and counter ─────────────────────────────────────────────────

interface Capture {
  id: number;
  value: number;
  correct: number;
}

function CounterScene({ picker }: { picker: ReactNode }) {
  const [q, setQ] = useState(0b0101);
  const [period, setPeriod] = useState(MAX_PERIOD);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Capture[]>([]);
  const nextId = useRef(0);
  const setCaption = useSetCaption();
  const need = settleTicks(q);
  const at = sumSettleTicks(q);
  const { correct, stale } = capture(q, period);
  const last = history[history.length - 1];
  const lastWrong = last && last.value !== last.correct;

  useIntroCaption(<>Four D flip-flops on one clock make a 4-bit register. Its output goes through a +1 adder and back into D, so every clock edge
    counts up, as long as the adder has finished before the edge.</>);

  const edge = () => {
    const result = capture(q, period);
    setCaption(captureCaption(q, period), { quiet: true });
    nextId.current += 1;
    setHistory([...history, { id: nextId.current, value: result.captured, correct: result.correct }].slice(-HISTORY));
    setQ(result.captured);
  };

  useInterval(edge, EDGE_MS, running);

  const reset = () => {
    setQ(0);
    setHistory([]);
  };

  const qBits = toBits(q, BITS);
  const sumBits = toBits(correct, BITS);
  const staleIdx = stale.map((i) => BITS - 1 - i);

  return (
    <StageFrame
      height={320}
      stats={
        <Stats>
          <Stat label="Q (stored)" value={bin(q)} sub={`= ${q}`} color="var(--violet)" />
          <Stat label="Adder needs" value={plural(need, 'tick')} sub={`for ${bin(q)} + 1`} />
          <Stat label="Clock period" value={plural(period, 'tick')} color={period < need ? 'var(--bad)' : undefined} sub={period < need ? 'too fast for this value' : 'enough time'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'stored Q (bit = 1)' },
            { color: 'var(--hi)', label: 'adder output bit = 1' },
            { color: 'var(--dim)', label: '0' },
            { color: 'var(--bad)', label: 'not settled by the edge / wrong capture' },
            { color: 'var(--ok)', label: 'what it should have been' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={edge} disabled={running}>Step clock (one edge)</Button>
          <PauseButton paused={!running} onToggle={() => setRunning(!running)} />
          <Button onClick={reset}>Reset to 0000</Button>
        </>,
        <Slider label="Clock period" value={period} min={MIN_PERIOD} max={MAX_PERIOD} onChange={setPeriod} format={(v) => plural(v, 'tick')} key="period" />,
      ]}
    >
      <div className="stage-pad sq">
        <div className="sq-rows">
          <span className="sq-row-label is-stored">Q (register)</span>
          <BitStrip bits={qBits} toneOf={(_, bit): Tone => (bit ? 'violet' : 'dim')} placeValues ariaLabel={`register ${bin(q)}`} size="md" />
          <span className="sq-row-note">4 flip-flops, one clock</span>

          <span className="sq-row-label">Q + 1 → D</span>
          <BitStrip
            bits={sumBits}
            toneOf={(_, bit): Tone => (bit ? 'hi' : 'dim')}
            labelOf={(i) => `t${at[BITS - 1 - i]}`}
            highlight={staleIdx}
            highlightTone="bad"
            ariaLabel={`adder output ${bin(correct)}`}
            size="md"
          />
          <span className="sq-row-note">tN: tick each bit settles{staleIdx.length ? `; ringed bits won't be ready by the edge at ${period}` : ''}</span>

          {last && (
            <>
              <span className={`sq-row-label ${lastWrong ? 'is-bad' : ''}`}>last capture</span>
              <BitStrip
                bits={toBits(last.value, BITS)}
                toneOf={(i, bit): Tone => (toBits(last.correct, BITS)[i] !== bit ? 'bad' : bit ? 'violet' : 'dim')}
                ariaLabel={`captured ${bin(last.value)}`}
                size="md"
              />
              <span className="sq-row-note">{lastWrong ? <>wrong: should be <b className="sq-ok">{bin(last.correct)}</b></> : 'correct'}</span>
            </>
          )}
        </div>
        {history.length > 0 && (
          <ol className="sq-history" aria-label="Recent captures">
            {history.map((h) => (
              <li key={h.id} className={`chip ${h.value === h.correct ? 'tone-violet' : 'tone-bad'}`}>{bin(h.value)}</li>
            ))}
          </ol>
        )}
        <Hint block>
          Ticks are illustrative, the same model as the adders lesson: one tick to form generate and propagate, then one per stage a carry ripples
          through. Real circuits are timed in picoseconds, with margins for setup and hold.
        </Hint>
      </div>
    </StageFrame>
  );
}
