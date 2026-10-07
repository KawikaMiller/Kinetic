import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { power } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { percentile } from '../../core/sim';
import { histogram } from '../../core/stats';
import { useInterval } from '../../core/useInterval';
import { BIRTHDAY_FACTS, batchCaption, collisionCaption, idCaption, pigeonCaption } from './frames';
import {
  ID_PRESETS, MAX_BITS, MIN_BITS, MONTHS, birthdayChance, cellDay, chance, count, dayName, firstCollision, guaranteed, halfPoint,
  idCollision, runSizes, spread,
} from './model';
import './styles.css';

type Scene = 'pigeonhole' | 'birthdays' | 'ids';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pigeonhole', label: 'Pigeonhole' },
  { value: 'birthdays', label: 'Birthdays' },
  { value: 'ids', label: 'Random IDs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'birthdays' });
  if (scene === 'pigeonhole') return <PigeonScene picker={picker} />;
  if (scene === 'ids') return <IdScene picker={picker} />;
  return <BirthdayScene picker={picker} />;
}

// ── Pigeonhole ───────────────────────────────────────────────────────

const MAX_PIGEONS = 30;
const MAX_HOLES = 24;

function PigeonScene({ picker }: { picker: ReactNode }) {
  const [pigeons, setPigeons] = useState(13);
  const [holes, setHoles] = useState(12);
  const setCaption = useSetCaption();
  const filled = spread(pigeons, holes);
  const sure = guaranteed(pigeons, holes);

  useIntroCaption(pigeonCaption(13, 12));

  const change = (p: number, h: number) => {
    setPigeons(p);
    setHoles(h);
    setCaption(pigeonCaption(p, h));
  };

  return (
    <StageFrame
      height={280}
      stats={
        <Stats>
          <Stat label="Pigeons n" value={pigeons} />
          <Stat label="Holes m" value={holes} />
          <Stat label="Shared hole guaranteed?" value={sure ? 'yes' : 'no'} color={sure ? 'var(--bad)' : undefined} sub={`n > m is ${sure}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a pigeon', shape: 'dot' },
            { color: 'var(--bad)', label: 'a hole that must hold two' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Pigeons n" value={pigeons} min={1} max={MAX_PIGEONS} onChange={(p) => change(p, holes)} />
          <Slider label="Holes m" value={holes} min={1} max={MAX_HOLES} onChange={(h) => change(pigeons, h)} />
        </>,
      ]}
    >
      <div className="stage-pad bp-pigeons">
        <SectionTitle hint="spread as evenly as possible: the best try at avoiding a double">Holes</SectionTitle>
        <ol className="bp-holes" aria-label={`${holes} holes holding ${pigeons} pigeons`}>
          {filled.map((k, i) => (
            <li key={i} className={k >= 2 ? 'is-double' : ''} aria-label={`hole ${i + 1}: ${k}`}>
              {Array.from({ length: k }, (_, j) => <i key={j} />)}
            </li>
          ))}
        </ol>
        <Hint className="bp-note">{BIRTHDAY_FACTS}</Hint>
      </div>
    </StageFrame>
  );
}

// ── Birthdays ────────────────────────────────────────────────────────

const FIRST_SEED = 1;
/** "Add 1,000 runs" draws from seeds far from the animated ones, so no run is counted twice. */
const BATCH_SEED = 1_000_000;
const BATCH = 1_000;
const ARRIVAL_MS = 260;
/** Ticks to linger on a collision before the next run starts. */
const HOLD_TICKS = 7;
const MAX_PEOPLE_AXIS = 100;
const HIST_BIN = 2;
/** The histogram's y-axis starts at least this tall, so a few runs still get whole-number ticks. */
const MIN_HIST_TOP = 5;

function BirthdayScene({ picker }: { picker: ReactNode }) {
  const [runIndex, setRunIndex] = useState(0);
  const [shown, setShown] = useState(1);
  const [held, setHeld] = useState(0);
  const [sizes, setSizes] = useState<number[]>([]);
  const [batches, setBatches] = useState(0);
  const [paused, setPaused] = useState(false);
  const setCaption = useSetCaption();
  const run = useMemo(() => firstCollision(FIRST_SEED + runIndex), [runIndex]);
  const done = shown === run.days.length;

  useIntroCaption(<>People walk in one at a time with random birthdays. How many before two share one? Most people guess about
    183, half of 365.</>);

  useInterval(() => {
    if (!done) {
      const next = shown + 1;
      setShown(next);
      if (next === run.days.length) {
        setSizes((s) => [...s, next]);
        setCaption(collisionCaption(run, runIndex + 1));
      }
      return;
    }
    if (held < HOLD_TICKS) setHeld(held + 1);
    else {
      setRunIndex(runIndex + 1);
      setShown(1);
      setHeld(0);
    }
  }, ARRIVAL_MS, !paused);

  const addBatch = () => {
    const all = [...sizes, ...runSizes(BATCH_SEED + batches * BATCH, BATCH)];
    setSizes(all);
    setBatches(batches + 1);
    setCaption(batchCaption(all));
  };

  const inRoom = run.days.slice(0, shown);
  const occupied = new Set(inRoom);
  const newest = inRoom[inRoom.length - 1];
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted.length ? percentile(sorted, 0.5) : null;

  const cell = (month: number, date: number): GridCellSpec => {
    const day = cellDay(month, date);
    if (day === null) return { fill: 'none' };
    if (done && day === newest) return { tone: 'bad', fill: 'solid' };
    if (day === newest) return { tone: 'hi', fill: 'solid' };
    if (occupied.has(day)) return { tone: 'info', fill: 'solid' };
    return { tone: 'dim', fill: 'outline' };
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="People in the room" value={shown} color="var(--hi)" />
          <Stat label="Chance of a match by now" value={chance(birthdayChance(shown))} sub="exact" />
          <Stat label="Runs" value={sizes.length.toLocaleString('en-US')} sub={median === null ? 'none finished yet' : `median ${median} people`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a birthday someone has' },
            { color: 'var(--hi)', label: 'newest arrival' },
            { color: 'var(--bad)', label: 'the shared day' },
            { color: 'var(--violet)', label: 'exact chance curve', shape: 'line' },
            { color: 'var(--dim)', label: '50% line, median', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PauseButton paused={paused} onToggle={() => setPaused(!paused)} />
          <Button onClick={addBatch}>Add {BATCH.toLocaleString('en-US')} runs</Button>
        </>,
      ]}
    >
      <div className="stage-pad bp-birthdays">
        <WideRegion minWidth={640} hint="swipe to see the whole year">
          <CellGrid
            rows={12}
            cols={31}
            size="sm"
            gap={2}
            rowLabels={MONTHS}
            cell={cell}
            cellTitle={(m, d) => {
              const day = cellDay(m, d);
              return day === null ? '' : `${dayName(day)}${occupied.has(day) ? ': taken' : ''}`;
            }}
            ariaLabel={`Calendar: ${shown} people, ${occupied.size} different birthdays`}
          />
        </WideRegion>
        <div className="bp-plots">
          <Plot2D
            x={{ domain: [0, MAX_PEOPLE_AXIS], label: 'people in the room' }}
            y={{ domain: [0, 1], label: 'chance of a shared birthday', format: (v) => `${Math.round(v * 100)}%` }}
            ariaLabel={`Exact chance curve; ${shown} people give ${chance(birthdayChance(shown))}`}
          >
            <HLine at={0.5} label="50%" tone="dim" />
            <Curve fn={(x) => birthdayChance(Math.round(x))} tone="violet" />
            <VLine at={shown} label={`${shown}`} tone="hi" />
            <Points data={[{ x: shown, y: birthdayChance(shown), tone: 'hi' }]} />
          </Plot2D>
          <RunHistogram sizes={sizes} median={median} />
        </div>
        <Hint className="bp-note">Birthdays are drawn at random, uniform over 365 days (seeded; real birthdays aren't quite uniform).</Hint>
      </div>
    </StageFrame>
  );
}

function RunHistogram({ sizes, median }: { sizes: number[]; median: number | null }) {
  const h = histogram(sizes, { bins: MAX_PEOPLE_AXIS / HIST_BIN, min: 0, max: MAX_PEOPLE_AXIS });
  const top = Math.max(MIN_HIST_TOP, ...h.counts);
  return (
    <Plot2D
      x={{ domain: [0, MAX_PEOPLE_AXIS], label: 'people at the first match' }}
      y={{ domain: [0, top], label: 'runs' }}
      ariaLabel={`Histogram of ${sizes.length} runs${median === null ? '' : `, median ${median}`}`}
    >
      <Bars bars={barsFromHistogram(h)} tone="info" />
      {median !== null && <VLine at={median} label={`median ${median}`} tone="dim" />}
    </Plot2D>
  );
}

// ── Random IDs ───────────────────────────────────────────────────────

const MAX_EXPONENT = 40;
const EXPONENT_STEP = 0.1;
const MIN_X_DECADES = 6;

function IdScene({ picker }: { picker: ReactNode }) {
  const [bits, setBits] = useState(32);
  const [exponent, setExponent] = useState(4.9);
  const setCaption = useSetCaption();
  const n = Math.round(10 ** exponent);
  const p = idCollision(n, bits);
  const half = halfPoint(bits);
  // Twice the 50% point's decades shows the whole climb; stretch further if the slider is past it.
  const xMax = Math.min(MAX_EXPONENT, Math.max(MIN_X_DECADES, Math.ceil(2 * Math.log10(half)), Math.ceil(exponent) + 1));

  useIntroCaption(idCaption(n, bits));

  const change = (b: number, e: number) => {
    setBits(b);
    setExponent(e);
    setCaption(idCaption(Math.round(10 ** e), b));
  };
  const toHalf = () => change(bits, Math.log10(half));

  return (
    <StageFrame
      height={320}
      stats={
        <Stats>
          <Stat label="Possible IDs" value={power(bits)} sub={count(2 ** bits)} />
          <Stat label="Chance of a repeat" value={chance(p)} color="var(--violet)" />
          <Stat label="50% at about" value={count(half)} sub="≈ 1.1774 × √(possible IDs)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'chance of a repeat', shape: 'line' },
            { color: 'var(--hi)', label: 'IDs you generated', shape: 'line' },
            { color: 'var(--dim)', label: '50% line and the 50% point', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="ID size (bits)" value={bits} min={MIN_BITS} max={MAX_BITS} onChange={(b) => change(b, exponent)} />
          <Slider
            label="IDs generated"
            value={exponent}
            min={0}
            max={MAX_EXPONENT}
            step={EXPONENT_STEP}
            format={(e) => count(Math.round(10 ** e))}
            onChange={(e) => change(bits, e)}
          />
          <Button onClick={toHalf}>Jump to the 50% point</Button>
        </>,
        <ControlGroup key="presets" label="Real IDs">
          {ID_PRESETS.map((preset) => (
            <ChipButton key={preset.label} on={preset.bits === bits} onClick={() => change(preset.bits, exponent)}>{preset.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad bp-ids">
        <Plot2D
          x={{ domain: [0, xMax], label: 'IDs generated', format: (v) => power(v, 10) }}
          y={{ domain: [0, 1], label: 'chance of a repeat', format: (v) => `${Math.round(v * 100)}%` }}
          ariaLabel={`Chance of a repeat among random ${bits}-bit IDs: ${chance(p)} at ${count(n)}`}
        >
          <HLine at={0.5} label="50%" tone="dim" />
          <VLine at={Math.log10(half)} tone="dim" />
          <Curve fn={(e) => idCollision(10 ** e, bits)} tone="violet" />
          <VLine at={exponent} label={count(n)} tone="hi" />
        </Plot2D>
        <Box className="bp-pairs">
          <SectionTitle hint="why it comes so early">Pairs, not people</SectionTitle>
          <p>
            {count(n)} IDs make about {count((n * (n - 1)) / 2)} pairs, and every pair is a chance to collide. That's why the 50% point
            sits near the square root of the space.
          </p>
        </Box>
        <Hint className="bp-note">This assumes truly random IDs. Sequential or badly seeded IDs behave differently.</Hint>
      </div>
    </StageFrame>
  );
}
