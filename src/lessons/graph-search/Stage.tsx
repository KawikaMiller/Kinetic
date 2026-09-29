import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { PRESETS, type PresetId, type World } from './presets';
import {
  ALGOS, ALGO_NAMES, COLS, MUD_COST, N, ROWS, runSearch, xy,
  type Algo, type Cell, type DsEntry, type Trace,
} from './search';
import './styles.css';

type Brush = 'wall' | 'mud' | 'erase';

interface GFrame extends Frame {
  step: number;
  current: number | null;
  frontier: number[];
  ds: DsEntry[];
  dsSize: number;
  showPath: boolean;
}

const INTRO: Record<Algo, ReactNode> = {
  bfs: (
    <>
      <b>BFS</b> explores in rings: everything 1 step away, then 2, then 3… Next up always comes from the front of a{' '}
      <span className="hl info">queue</span>.
    </>
  ),
  dfs: (
    <>
      <b>DFS</b> picks a corridor and dives as deep as it can, backtracking only at dead ends. It runs on a{' '}
      <span className="hl info">stack</span>.
    </>
  ),
  dijkstra: (
    <>
      <b>Dijkstra</b> always expands the <i>cheapest</i> cell found so far, using a{' '}
      <span className="hl info">priority queue</span>. Mud costs {MUD_COST}.
    </>
  ),
  astar: (
    <>
      <b>A*</b> is Dijkstra plus a hunch: priority = <span className="hl">cost so far</span> +{' '}
      <span className="hl violet">distance left to the goal</span>.
    </>
  ),
};

const MILESTONE: Record<Algo, ReactNode> = {
  bfs: <>See the diamond? Every cell on the edge of the ripple is the <b>same number of steps</b> from the start.</>,
  dfs: <>See it snake? It commits to one direction and only backtracks when it hits a wall.</>,
  dijkstra: <>The wave spreads by <b>cost</b>, not steps. It slows to a crawl in mud and races around it.</>,
  astar: <>The search leans toward the goal. Cells that point the right way get explored first.</>,
};

const hasMud = (grid: Cell[], path: number[]) => path.some((c) => grid[c] === 2);

function summary(all: Record<Algo, Trace>, algo: Algo, grid: Cell[]): ReactNode {
  const t = all[algo];
  if (!t.path) {
    return (
      <>
        No path: the goal is walled off. {ALGO_NAMES[algo]} had to check all <b>{t.visits.length}</b> reachable cells to
        prove it.
      </>
    );
  }
  const steps = t.path.length - 1;
  const bfsSteps = all.bfs.path!.length - 1;
  switch (algo) {
    case 'bfs':
      return hasMud(grid, t.path) && t.cost > all.dijkstra.cost ? (
        <>
          Fewest steps: <span className="hl ok">{steps}</span>. But BFS can't see weights, so it plowed straight through mud:
          cost <span className="hl bad">{t.cost}</span> (cheapest is {all.dijkstra.cost}).
        </>
      ) : (
        <>
          Found in <b>{t.visits.length}</b> visits. On an unweighted grid BFS's path is <b>guaranteed</b> shortest:{' '}
          <span className="hl ok">{steps} steps</span>.
        </>
      );
    case 'dfs':
      return steps > bfsSteps ? (
        <>
          DFS found <i>a</i> path: <span className="hl bad">{steps} steps</span> when the shortest is {bfsSteps}. Cheap to
          write, zero shortest-path guarantee.
        </>
      ) : (
        <>
          DFS happened to find a shortest path ({steps} steps). That's luck, not a guarantee. Try the maze.
        </>
      );
    case 'dijkstra':
      return (
        <>
          Cheapest path: cost <span className="hl ok">{t.cost}</span>. Dijkstra never settles a cell until it knows its
          cheapest cost{all.bfs.cost > t.cost ? <>. BFS's path would cost {all.bfs.cost}</> : null}.
        </>
      );
    case 'astar':
      return (
        <>
          Same optimal cost (<span className="hl ok">{t.cost}</span>) but only <b>{t.visits.length}</b> cells visited vs.
          Dijkstra's {all.dijkstra.visits.length}. The heuristic points the way.
        </>
      );
  }
}

function buildFrames(all: Record<Algo, Trace>, algo: Algo, world: World): GFrame[] {
  const t = all[algo];
  const frames: GFrame[] = [
    {
      step: 0, current: null, frontier: [world.start], ds: [{ cell: world.start, pri: 0 }], dsSize: 1, showPath: false,
      say: INTRO[algo],
    },
  ];
  t.visits.forEach((cell, k) => {
    frames.push({
      step: k + 1, current: cell, ...t.snaps[k], showPath: false,
      say: k === Math.min(14, Math.floor(t.visits.length / 3)) ? MILESTONE[algo] : undefined,
    });
  });
  const last = frames[frames.length - 1];
  frames.push({ ...last, current: null, showPath: true, say: summary(all, algo, world.grid), hold: 4 });
  return frames;
}

const coord = (i: number) => xy(i).join(',');

export function Stage() {
  const [world, setWorld] = useState<World>(() => PRESETS.walls.make());
  const [algo, setAlgo] = useState<Algo>('bfs');
  const [brush, setBrush] = useState<Brush>('wall');

  const all = useMemo(() => {
    const out = {} as Record<Algo, Trace>;
    for (const a of ALGOS) out[a] = runSearch(world.grid, world.start, world.goal, a);
    return out;
  }, [world]);
  const trace = all[algo];
  const frames = useMemo(() => buildFrames(all, algo, world), [all, algo, world]);
  // Editing the board rewinds without autoplay; picking an algo or preset plays.
  const player = usePlayer(frames, { interval: 55, autoplayOnChange: false });
  const { frame } = player;

  const pendingPlay = useRef(false);
  const play = player.play;
  useEffect(() => {
    if (!pendingPlay.current) return;
    pendingPlay.current = false;
    play();
  }, [frames, play]);

  const chooseAlgo = (a: Algo) => {
    pendingPlay.current = true;
    setAlgo(a);
  };
  const loadPreset = (p: PresetId) => {
    pendingPlay.current = true;
    setWorld(PRESETS[p].make());
  };

  // ── Drawing on the board ────────────────────────────────────────────
  const drag = useRef<null | { mode: 'start' | 'goal' | 'paint'; value: Cell }>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const cellAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]');
    return el && boardRef.current?.contains(el) ? Number(el.dataset.i) : null;
  };

  const paint = (i: number, value: Cell) =>
    setWorld((w) =>
      i === w.start || i === w.goal || w.grid[i] === value ? w : { ...w, grid: w.grid.map((c, j) => (j === i ? value : c)) },
    );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = cellAt(e);
    if (i === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (i === world.start) drag.current = { mode: 'start', value: 0 };
    else if (i === world.goal) drag.current = { mode: 'goal', value: 0 };
    else {
      const cur = world.grid[i];
      const value: Cell = brush === 'wall' ? (cur === 1 ? 0 : 1) : brush === 'mud' ? (cur === 2 ? 0 : 2) : 0;
      drag.current = { mode: 'paint', value };
      paint(i, value);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const i = cellAt(e);
    if (i === null) return;
    const { mode } = d;
    if (mode === 'paint') paint(i, d.value);
    else
      setWorld((w) => {
        const other = mode === 'start' ? w.goal : w.start;
        if (i === other || w.grid[i] === 1 || w[mode] === i) return w;
        return { ...w, [mode]: i };
      });
  };

  const endDrag = () => {
    drag.current = null;
  };

  // ── Derived render state ───────────────────────────────────────────
  const order = useMemo(() => {
    const o = new Int32Array(N).fill(-1);
    trace.visits.forEach((c, k) => (o[c] = k));
    return o;
  }, [trace]);
  const frontierSet = useMemo(() => new Set(frame.frontier), [frame.frontier]);
  const path = frame.showPath ? trace.path : null;
  const pathSet = useMemo(() => new Set(path ?? []), [path]);
  const pathPoints = path?.map((c) => xy(c).map((v) => v + 0.5).join(',')).join(' ');

  const pct = (i: number) => {
    const [x, y] = xy(i);
    return { left: `${(x / COLS) * 100}%`, top: `${(y / ROWS) * 100}%` };
  };

  return (
    <StageFrame
      player={player}
      height={0}
      stats={
        <Stats>
          <Stat label="Visited" value={frame.step} color="var(--violet)" />
          <Stat label="Frontier" value={frame.dsSize} color="var(--info)" />
          <Stat label="Path steps" value={path ? path.length - 1 : '—'} color="var(--ok)" />
          <Stat label="Path cost" value={path ? trace.cost : '—'} color="var(--ok)" sub={`mud costs ${MUD_COST}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'rgb(76 201 240 / 0.55)', label: 'frontier' },
            { color: 'var(--violet)', label: 'visited' },
            { color: 'var(--hi)', label: 'current' },
            { color: 'var(--ok)', label: 'path' },
            { color: '#4a5370', label: 'wall' },
            { color: '#6b4a1c', label: 'mud' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Algorithm"
            value={algo}
            onChange={chooseAlgo}
            options={ALGOS.map((a) => ({ value: a, label: ALGO_NAMES[a] }))}
          />
          <Segmented
            label="Brush"
            value={brush}
            onChange={setBrush}
            options={[
              { value: 'wall', label: '▦ Wall' },
              { value: 'mud', label: `≋ Mud ×${MUD_COST}` },
              { value: 'erase', label: '⌫ Erase' },
            ]}
          />
          <div className="gs-presets">
            {(Object.keys(PRESETS) as PresetId[]).map((p) => (
              <Button key={p} onClick={() => loadPreset(p)}>
                {PRESETS[p].label}
              </Button>
            ))}
          </div>
          <span className="gs-hint">Drag on the grid to paint · drag S / G to move them</span>
        </Controls>
      }
    >
      <div className="gs">
        <div
          ref={boardRef}
          className="gs-board"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="gs-grid">
            {world.grid.map((c, i) => {
              let cls = 'gs-cell';
              if (c === 1) cls += ' wall';
              else if (c === 2) cls += ' mud';
              let style: CSSProperties | undefined;
              if (c !== 1) {
                const o = order[i];
                if (pathSet.has(i)) cls += ' path';
                else if (i === frame.current) cls += ' current';
                else if (frontierSet.has(i)) cls += ' frontier';
                else if (o >= 0 && o < frame.step) {
                  cls += ' visited';
                  const age = (frame.step - 1 - o) / 70;
                  style = { '--v': (0.2 + 0.6 * Math.max(0, 1 - age)).toFixed(3) } as CSSProperties;
                }
              }
              if (i === world.start || i === world.goal) cls += ' grab';
              return <div key={i} data-i={i} className={cls} style={style} />;
            })}
          </div>

          <svg className="gs-path" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none" aria-hidden="true">
            {pathPoints && (
              <motion.polyline
                key={pathPoints}
                points={pathPoints}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: 'easeInOut' }}
              />
            )}
          </svg>

          {(['start', 'goal'] as const).map((m) => (
            <motion.div
              key={m}
              className={`gs-marker gs-${m}`}
              initial={false}
              animate={pct(world[m])}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              style={{ width: `${100 / COLS}%`, height: `${100 / ROWS}%` }}
            >
              <span>{m === 'start' ? 'S' : 'G'}</span>
            </motion.div>
          ))}
        </div>

        <aside className="gs-side">
          <DsPanel algo={algo} ds={frame.ds} size={frame.dsSize} />
          <Scoreboard all={all} algo={algo} onPick={chooseAlgo} />
        </aside>
      </div>
    </StageFrame>
  );
}

const DS_INFO: Record<Algo, { title: string; sub: string }> = {
  bfs: { title: 'Queue', sub: 'FIFO · top leaves next' },
  dfs: { title: 'Stack', sub: 'LIFO · top pops next' },
  dijkstra: { title: 'Priority queue', sub: 'lowest cost pops next' },
  astar: { title: 'Priority queue', sub: 'lowest cost + guess pops next' },
};

function DsPanel({ algo, ds, size }: { algo: Algo; ds: DsEntry[]; size: number }) {
  const info = DS_INFO[algo];
  return (
    <div className="gs-panel">
      <div className="gs-panel-head">
        <b>{info.title}</b>
        <span>{info.sub}</span>
      </div>
      <div className="gs-ds">
        {/* Frames tick every ~55ms, so chips just slide in via CSS rather than animating exits. */}
        {ds.map((e, k) => (
          <div key={e.cell} className={`gs-chip ${k === 0 ? 'next' : ''}`}>
            <span className="gs-chip-dot" />
            <span className="mono">({coord(e.cell)})</span>
            {e.pri !== undefined && <span className="gs-chip-pri">{e.pri}</span>}
          </div>
        ))}
        {size > ds.length && <div className="gs-more">+{size - ds.length} more</div>}
        {size === 0 && <div className="gs-more">empty</div>}
      </div>
    </div>
  );
}

function Scoreboard({ all, algo, onPick }: { all: Record<Algo, Trace>; algo: Algo; onPick: (a: Algo) => void }) {
  const maxVisits = Math.max(...ALGOS.map((a) => all[a].visits.length), 1);
  const found = ALGOS.filter((a) => all[a].path);
  const best = found.length ? Math.min(...found.map((a) => all[a].cost)) : 0;
  return (
    <div className="gs-panel">
      <div className="gs-panel-head">
        <b>Same board, all four</b>
        <span>cells visited · path cost</span>
      </div>
      <div className="gs-score">
        {ALGOS.map((a) => {
          const t = all[a];
          const optimal = t.path && t.cost === best;
          return (
            <button key={a} type="button" className={`gs-score-row ${a === algo ? 'on' : ''}`} onClick={() => onPick(a)}>
              <span className="gs-score-name">{ALGO_NAMES[a]}</span>
              <span className="gs-score-bar">
                <motion.i initial={false} animate={{ width: `${(t.visits.length / maxVisits) * 100}%` }} />
              </span>
              <span className="gs-score-num">{t.visits.length}</span>
              <span className={`gs-score-cost ${t.path ? (optimal ? 'ok' : 'bad') : ''}`}>
                {t.path ? `${t.cost}${optimal ? ' ✓' : ' ✗'}` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
