import { motion } from 'motion/react';
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { PRESETS, type PresetId, type World } from './presets';
import { ALGOS, ALGO_NAMES, COLS, MUD_COST, N, ROWS, runSearch, xy, type Algo, type Cell, type Trace } from './search';
import { DsPanel, Scoreboard } from './SidePanels';
import './styles.css';

type Brush = 'wall' | 'mud' | 'erase';

/** No minimum stage height: the board sizes itself from its aspect ratio. */
const FIT_CONTENT = 0;
/** One visited cell per frame, so the search plays as a fast sweep. */
const FRAME_MS = 55;
/** Visited cells fade from bright to dim over this many later visits, so the wave's edge stands out. */
const FADE_OVER = 70;
const MARKER_SPRING = { type: 'spring', stiffness: 500, damping: 34 } as const;
/** Terrain colours for the legend. Not semantic tokens: walls and mud are this lesson's own materials. */
const WALL_SWATCH = '#4a5370'; // allow-color: maze wall material (matches .gs-cell.wall)
const MUD_SWATCH = '#6b4a1c'; // allow-color: mud material (matches .gs-cell.mud)

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
  const player = usePlayer(frames, { interval: FRAME_MS, autoplayOnChange: false });
  const { frame } = player;

  const chooseAlgo = (a: Algo) => {
    if (a === algo) {
      player.restart();
      return;
    }
    player.queueNext({ play: true });
    setAlgo(a);
  };
  const loadPreset = (p: PresetId) => {
    player.queueNext({ play: true });
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

  const cellPos = (i: number) => {
    const [x, y] = xy(i);
    return { left: `${(x / COLS) * 100}%`, top: `${(y / ROWS) * 100}%` };
  };

  return (
    <StageFrame
      player={player}
      height={FIT_CONTENT}
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
            { color: 'color-mix(in srgb, var(--info) 55%, transparent)', label: 'frontier' },
            { color: 'var(--violet)', label: 'visited' },
            { color: 'var(--hi)', label: 'current' },
            { color: 'var(--ok)', label: 'path' },
            { color: WALL_SWATCH, label: 'wall' },
            { color: MUD_SWATCH, label: 'mud' },
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
          <ControlGroup>
            {(Object.keys(PRESETS) as PresetId[]).map((p) => (
              <Button key={p} onClick={() => loadPreset(p)}>
                {PRESETS[p].label}
              </Button>
            ))}
          </ControlGroup>
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
                  const age = (frame.step - 1 - o) / FADE_OVER;
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
              animate={cellPos(world[m])}
              transition={MARKER_SPRING}
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
