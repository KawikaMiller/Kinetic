import { motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { ALGOS, buildFrames, makeBars, type AlgoId, type Bar, type Preset, type SortFrame } from './algorithms';
import './styles.css';

const ALGO_IDS = Object.keys(ALGOS) as AlgoId[];
type Mode = 'single' | 'race';

interface RaceFrame extends Frame {
  t: number;
}

export function Stage() {
  const [n, setN] = useState(20);
  const [preset, setPreset] = useState<Preset>('random');
  const [items, setItems] = useState<Bar[]>(() => makeBars(20, 'random'));
  const [algo, setAlgo] = useState<AlgoId>('bubble');
  const [mode, setMode] = useState<Mode>('single');

  const frames = useMemo(() => buildFrames(items, algo), [items, algo]);
  const race = useMemo(
    () => (mode === 'race' ? ALGO_IDS.map((id) => ({ id, frames: buildFrames(items, id) })) : null),
    [items, mode],
  );
  const raceFrames = useMemo(() => (race ? buildRaceFrames(race) : null), [race]);

  const player = usePlayer<Frame>(raceFrames ?? frames, { interval: raceFrames ? 90 : 170 });
  const stepMs = (raceFrames ? 90 : 170) / player.speed;

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
            <Stat label={info.writeLabel} value={frame.writes} color="var(--violet)" />
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

function buildRaceFrames(race: { id: AlgoId; frames: SortFrame[] }[]): RaceFrame[] {
  const len = Math.max(...race.map((r) => r.frames.length));
  const ranked = [...race].sort((a, b) => a.frames.length - b.frames.length);
  const out: RaceFrame[] = [];
  for (let t = 0; t < len; t++) {
    const finishing = ranked.filter((r) => r.frames.length - 1 === t);
    let say;
    if (t === 0) say = <>Same input, five algorithms, one step each per tick. Who finishes first?</>;
    else if (finishing.length) {
      say = (
        <>
          {finishing.map((f) => (
            <span key={f.id}>
              <b>{ALGOS[f.id].name}</b> finishes <span className="hl ok">#{ranked.indexOf(f) + 1}</span> with{' '}
              {f.frames[f.frames.length - 1].comparisons} comparisons.{' '}
            </span>
          ))}
        </>
      );
    }
    out.push({ t, say });
  }
  const worst = race.find((r) => r.id === 'selection')!.frames.at(-1)!.comparisons;
  const best = Math.min(...race.map((r) => r.frames.at(-1)!.comparisons));
  out[out.length - 1] = {
    t: len - 1,
    hold: 2,
    say: (
      <>
        O(n²) sorts compare roughly every pair (<span className="hl bad">{worst}</span> for selection). The best did{' '}
        <span className="hl ok">{best}</span>. That gap explodes as n grows.
      </>
    ),
  };
  return out;
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
          {!compact && n <= 24 && <span>{bar.v}</span>}
        </motion.div>
      ))}
    </div>
  );
}

function Race({ race, t, n, max, stepMs }: { race: { id: AlgoId; frames: SortFrame[] }[]; t: number; n: number; max: number; stepMs: number }) {
  const ranked = [...race].sort((a, b) => a.frames.length - b.frames.length);
  return (
    <div className="so-race">
      {race.map((r) => {
        const f = r.frames[Math.min(t, r.frames.length - 1)];
        const finished = t >= r.frames.length - 1;
        const rank = ranked.findIndex((x) => x.frames.length === r.frames.length) + 1;
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
                <b>{f.writes}</b> {info.writeLabel.toLowerCase()}
              </span>
            </footer>
          </div>
        );
      })}
    </div>
  );
}
