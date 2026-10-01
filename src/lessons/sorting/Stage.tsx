import { motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, buildRaceFrames } from './algorithms';
import { ALGO_IDS, ALGOS, makeBars, racePlaces, raceSteps, type AlgoId, type Bar, type Preset, type SortFrame } from './model';
import './styles.css';

type Mode = 'single' | 'race';

const INITIAL_BARS = 20;
/** Base ms per frame: the race has 5× the work per tick, so it steps faster. */
const SINGLE_STEP_MS = 170;
const RACE_STEP_MS = 90;
/** Values are only labelled on bars when there's room. */
const MAX_LABELLED_BARS = 24;

export function Stage() {
  const [n, setN] = useState(INITIAL_BARS);
  const [preset, setPreset] = useState<Preset>('random');
  const [items, setItems] = useState<Bar[]>(() => makeBars(INITIAL_BARS, 'random'));
  const [algo, setAlgo] = useState<AlgoId>('bubble');
  const [mode, setMode] = useState<Mode>('single');

  const frames = useMemo(() => buildFrames(items, algo), [items, algo]);
  const race = useMemo(
    () => (mode === 'race' ? ALGO_IDS.map((id) => ({ id, frames: raceSteps(buildFrames(items, id)) })) : null),
    [items, mode],
  );
  const raceFrames = useMemo(() => (race ? buildRaceFrames(race) : null), [race]);

  const baseStepMs = raceFrames ? RACE_STEP_MS : SINGLE_STEP_MS;
  const player = usePlayer<Frame>(raceFrames ?? frames, { interval: baseStepMs });
  const stepMs = baseStepMs / player.speed;

  const regen = (size = n, p = preset) => setItems(makeBars(size, p));
  const max = Math.max(...items.map((b) => b.v));

  const frame = frames[Math.min(player.index, frames.length - 1)];
  const info = ALGOS[algo];

  return (
    <StageFrame
      player={player}
      height={mode === 'race' ? 300 : 400}
      stats={
        mode === 'single' ? (
          <Stats>
            <Stat label="Comparisons" value={frame.comparisons} color="var(--hi)" />
            <Stat label="Writes" value={frame.writes} color="var(--violet)" sub={algo === 'merge' ? 'one per item placed' : 'a swap writes 2'} />
            <Stat label="Complexity" value={info.big} color={info.big === 'O(n²)' ? 'var(--bad)' : 'var(--ok)'} sub={info.note} />
          </Stats>
        ) : (
          <Stats>
            <Stat label="Bars" value={n} />
            <Stat label="Step" value={player.index} color="var(--hi)" sub="same pace for everyone" />
          </Stats>
        )
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparing' },
            { color: 'var(--violet)', label: 'moving' },
            { color: 'var(--info)', label: 'pivot / current min' },
            { color: 'var(--ok)', label: 'in final place' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: 'One algorithm' },
              { value: 'race', label: 'Race all 5' },
            ]}
          />
          {mode === 'single' && (
            <Segmented
              label="Algorithm"
              value={algo}
              onChange={setAlgo}
              options={ALGO_IDS.map((id) => ({ value: id, label: ALGOS[id].name }))}
            />
          )}
          <Segmented
            label="Input"
            value={preset}
            onChange={(p) => {
              setPreset(p);
              regen(n, p);
            }}
            options={[
              { value: 'random', label: 'Random' },
              { value: 'nearly', label: 'Nearly sorted' },
              { value: 'reversed', label: 'Reversed' },
              { value: 'few', label: 'Few unique' },
            ]}
          />
          <Slider
            label="Bars"
            value={n}
            min={8}
            max={48}
            onChange={(v) => {
              setN(v);
              regen(v);
            }}
          />
          <Button onClick={() => regen()}>Shuffle</Button>
          {mode === 'race' && (
            <Hint block>
              One tick is one comparison or one array write, for every algorithm: a swap writes two slots, so it costs two
              ticks, and a merge pays one per item it places. The narration doesn't cost ticks.
            </Hint>
          )}
          {mode === 'single' && algo === 'merge' && (
            <Hint block>
              Drawn as an in-place merge so every bar stays visible. A real merge copies into an O(n) buffer; Writes counts
              those copies.
            </Hint>
          )}
        </Controls>
      }
    >
      {mode === 'single' ? (
        <div className="so-single">
          <Bars frame={frame} n={items.length} max={max} stepMs={stepMs} />
        </div>
      ) : (
        race && <Race race={race} t={player.index} n={items.length} max={max} stepMs={stepMs} />
      )}
    </StageFrame>
  );
}

function barState(f: SortFrame, i: number, sorted: Set<number>) {
  if (f.a === i || f.b === i) {
    if (f.kind === 'compare') return 'cmp';
    if (f.kind === 'swap' || f.kind === 'write') return 'move';
    if (f.kind === 'mark') return sorted.has(i) ? 'done lock' : 'pivot';
  }
  if (f.pivot === i) return 'pivot';
  if (sorted.has(i)) return 'done';
  if (f.range && (i < f.range[0] || i > f.range[1])) return 'outside';
  return '';
}

function Bars({ frame, n, max, stepMs, compact = false }: { frame: SortFrame; n: number; max: number; stepMs: number; compact?: boolean }) {
  const sorted = new Set(frame.sorted);
  // Render in stable id order so each bar is the same DOM node as it moves.
  const placed = frame.order.map((bar, i) => ({ bar, i })).sort((x, y) => x.bar.id - y.bar.id);
  const duration = Math.min(0.28, Math.max(0.05, stepMs / 1000));

  return (
    <div className={`so-bars ${compact ? 'compact' : ''}`}>
      {frame.range && (
        <motion.div
          className="so-range"
          initial={false}
          animate={{ left: `${(frame.range[0] / n) * 100}%`, width: `${((frame.range[1] - frame.range[0] + 1) / n) * 100}%` }}
          transition={{ duration: 0.2 }}
        />
      )}
      {placed.map(({ bar, i }) => (
        <motion.div
          key={bar.id}
          className={`so-bar ${barState(frame, i, sorted)}`}
          style={{ width: `calc(${100 / n}% - ${compact ? 1 : 3}px)`, height: `${(bar.v / max) * 100}%` }}
          initial={false}
          animate={{ left: `${(i / n) * 100}%` }}
          transition={{ duration, ease: 'easeInOut' }}
        >
          {!compact && n <= MAX_LABELLED_BARS && <span>{bar.v}</span>}
        </motion.div>
      ))}
    </div>
  );
}

function Race({ race, t, n, max, stepMs }: { race: { id: AlgoId; frames: SortFrame[] }[]; t: number; n: number; max: number; stepMs: number }) {
  const places = racePlaces(race.map((r) => r.frames.length));
  return (
    <div className="so-race">
      {race.map((r, k) => {
        const f = r.frames[Math.min(t, r.frames.length - 1)];
        const finished = t >= r.frames.length - 1;
        const rank = places[k];
        const info = ALGOS[r.id];
        return (
          <div key={r.id} className={`so-mini ${finished ? 'finished' : ''}`} style={{ '--c': info.big === 'O(n²)' ? 'var(--bad)' : 'var(--ok)' } as CSSProperties}>
            <header>
              <b>{info.name}</b>
              <span className="so-mini-big">{info.big}</span>
              {finished && (
                <motion.span className="so-rank" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                  #{rank}
                </motion.span>
              )}
            </header>
            <Bars frame={f} n={n} max={max} stepMs={stepMs} compact />
            <footer>
              <span>
                <b>{f.comparisons}</b> cmp
              </span>
              <span>
                <b>{f.writes}</b> writes
              </span>
            </footer>
          </div>
        );
      })}
    </div>
  );
}
