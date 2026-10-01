import { motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import { useLoop } from '../../core/hooks';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { COMPLEXITIES, complexity, fmtOpsCount, fmtTime, type CxId } from './complexities';
import './styles.css';

type Scale = 'linear' | 'log';

interface TourFrame extends Frame {
  n: number;
  focus: CxId | null;
  scale?: Scale;
}

const N_MAX = 32;
const N2 = complexity('n2');

const TOUR: TourFrame[] = [
  { n: 1, focus: null, scale: 'linear', say: <>At <b>n = 1</b> everything costs about the same. Differences only show up as n grows. Press play.</> },
  { n: 4, focus: 'c1', say: <><span className="hl ok">O(1)</span> is flat: same cost for 1 item or 1 billion. Think array index.</> },
  { n: 8, focus: 'log', say: <><span className="hl info">O(log n)</span> barely rises. Doubling n adds just <b>one</b> step. Binary search lives here.</> },
  { n: 12, focus: 'n', say: <><span className="hl violet">O(n)</span> is a straight line: look at every item once.</> },
  { n: 16, focus: 'nlogn', say: <><span className="hl bo-amber">O(n log n)</span> is a bit steeper. The best general-purpose sorts sit here.</> },
  { n: 20, focus: 'n2', say: <><span className="hl bo-orange">O(n²)</span>: every item vs every other item. It's already shot off the top.</> },
  { n: 24, focus: 'exp', say: <><span className="hl bad">O(2ⁿ)</span>: each extra item <b>doubles</b> the work. n = 24 is already 16 million ops.</> },
  { n: 32, focus: null, scale: 'log', hold: 2, say: <>Log scale squashes the y-axis so all six fit. Even squashed, 2ⁿ is a wall. Now race them →</> },
];

export function Stage() {
  const player = usePlayer(TOUR, { interval: 2400 });
  const setCaption = useSetCaption();
  const [override, setOverride] = useState<{ n: number; at: number } | null>(null);
  const [scaleOverride, setScaleOverride] = useState<{ scale: Scale; at: number } | null>(null);
  const [hidden, setHidden] = useState<Set<CxId>>(new Set());
  const [bigN, setBigN] = useState<3 | 6 | 9>(6);

  // The tour drives n and scale until the learner grabs a control on this frame.
  const frameScale = TOUR.slice(0, player.index + 1).reduce<Scale>((s, f) => f.scale ?? s, 'linear');
  const n = override && override.at === player.index ? override.n : player.frame.n;
  const scale = scaleOverride && scaleOverride.at === player.index ? scaleOverride.scale : frameScale;
  const focus = override?.at === player.index ? null : player.frame.focus;

  const onN = (v: number) => {
    player.pause();
    setOverride({ n: v, at: player.index });
    const sq = v * v;
    setCaption(
      <>
        At <b>n = {v}</b>: O(n) does <span className="hl violet">{v}</span> ops, O(n²) does{' '}
        <span className="hl bo-orange">{sq.toLocaleString()}</span>, O(2ⁿ) does{' '}
        <span className="hl bad">{Math.pow(2, v).toLocaleString()}</span>.
      </>,
    );
  };

  const toggle = (id: CxId) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <StageFrame minWidth={580}
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="n" value={n} color="var(--text)" />
          <Stat label="O(n²) ops" value={(n * n).toLocaleString()} color={N2.color} />
          <Stat label="O(2ⁿ) ops" value={Math.pow(2, n).toLocaleString()} color="var(--bad)" />
        </Stats>
      }
      legend={
        <div className="bo-chips">
          {COMPLEXITIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`bo-chip ${hidden.has(c.id) ? 'off' : ''}`}
              style={{ '--c': c.color } as CSSProperties}
              onClick={() => toggle(c.id)}
              title={`${hidden.has(c.id) ? 'Show' : 'Hide'} ${c.label}: ${c.example}`}
            >
              <i />
              {c.label}
            </button>
          ))}
        </div>
      }
      controls={
        <Controls>
          <Slider label="Input size n" value={n} min={1} max={N_MAX} onChange={onN} />
          <Segmented
            label="Y axis"
            value={scale}
            onChange={(s) => setScaleOverride({ scale: s, at: player.index })}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'log', label: 'Log' },
            ]}
          />
          <Hint block>
            Each curve is drawn with a constant of 1: real code has constants, which Big-O deliberately ignores. The race
            runs at {RATE} ops/s so you can watch it; a real CPU does billions.
          </Hint>
        </Controls>
      }
    >
      <div className="bo">
        <div className="bo-panel bo-chart-panel">
          <div className="bo-panel-head">
            Operations vs input size
            <span className="bo-sub">{scale === 'log' ? 'log scale: each gridline is 100× the last' : 'linear scale, clipped at 100 ops'}</span>
          </div>
          <Chart n={n} scale={scale} hidden={hidden} focus={focus} />
        </div>
        <div className="bo-panel">
          <Race key={n} n={n} hidden={hidden} />
        </div>
        <div className="bo-panel bo-real">
          <div className="bo-panel-head">
            If 1 operation = 1 µs, and n =
            {/* the visible sentence names the choice; give the radio group the same name */}
            <div role="group" aria-label="Input size n for the 1 µs readout">
              <Segmented
                value={bigN}
                onChange={setBigN}
                options={[
                  { value: 3, label: '1,000' },
                  { value: 6, label: '1 million' },
                  { value: 9, label: '1 billion' },
                ]}
              />
            </div>
          </div>
          <RealWorld n={Math.pow(10, bigN)} hidden={hidden} />
        </div>
      </div>
    </StageFrame>
  );
}

/* ─── Growth chart ─────────────────────────────────────────────────── */

const W = 620;
const H = 300;
const PL = 52;
const PR = 14;
const PT = 16;
const PB = 30;
const Y_LIN = 100;
const Y_LOG = 10; // 10^10

const xOf = (n: number) => PL + ((n - 1) / (N_MAX - 1)) * (W - PL - PR);
const yOf = (v: number, scale: Scale) =>
  scale === 'linear'
    ? PT + (1 - v / Y_LIN) * (H - PT - PB)
    : PT + (1 - Math.log10(Math.max(1, v)) / Y_LOG) * (H - PT - PB);

function curvePath(f: (n: number) => number, scale: Scale) {
  let d = '';
  let prev: [number, number] | null = null;
  for (let n = 1; n <= N_MAX + 1e-9; n += 0.1) {
    const v = f(n);
    if (scale === 'linear' && v > Y_LIN) {
      if (prev) {
        // interpolate to where the curve crosses the top edge
        const [pn, pv] = prev;
        const t = (Y_LIN - pv) / (v - pv);
        d += ` L${xOf(pn + t * (n - pn)).toFixed(1)},${yOf(Y_LIN, scale).toFixed(1)}`;
      }
      break;
    }
    d += `${d ? ' L' : 'M'}${xOf(n).toFixed(1)},${yOf(v, scale).toFixed(1)}`;
    prev = [n, v];
  }
  return d;
}

/** The "n →" axis label sits between the 16 and 24 ticks, clear of the 32 at the end. */
const AXIS_LABEL_AT = 20;

const LOG_TICKS = [
  [0, '1'], [2, '100'], [4, '10K'], [6, '1M'], [8, '100M'], [10, '10B'],
] as const;

function Chart({ n, scale, hidden, focus }: { n: number; scale: Scale; hidden: Set<CxId>; focus: CxId | null }) {
  const paths = useMemo(
    () => Object.fromEntries(COMPLEXITIES.map((c) => [c.id, curvePath(c.f, scale)])),
    [scale],
  );
  const visible = COMPLEXITIES.filter((c) => !hidden.has(c.id));
  const offChart = visible.filter((c) => scale === 'linear' && c.f(n) > Y_LIN);

  return (
    <svg className="bo-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Growth of each complexity class">
      {/* grid */}
      {scale === 'linear'
        ? [0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={yOf(v, scale)} y2={yOf(v, scale)} className="bo-grid" />
              <text x={PL - 8} y={yOf(v, scale) + 4} className="bo-tick" textAnchor="end">{v}</text>
            </g>
          ))
        : LOG_TICKS.map(([p, label]) => (
            <g key={p}>
              <line x1={PL} x2={W - PR} y1={yOf(10 ** p, scale)} y2={yOf(10 ** p, scale)} className="bo-grid" />
              <text x={PL - 8} y={yOf(10 ** p, scale) + 4} className="bo-tick" textAnchor="end">{label}</text>
            </g>
          ))}
      {[1, 8, 16, 24, 32].map((v) => (
        <text key={v} x={xOf(v)} y={H - 8} className="bo-tick" textAnchor="middle">{v}</text>
      ))}
      <text x={xOf(AXIS_LABEL_AT)} y={H - 8} className="bo-tick bo-axis-label" textAnchor="middle">n →</text>

      {/* curves: redraw on scale change */}
      {visible.map((c) => (
        <motion.path
          key={c.id + scale}
          d={paths[c.id]}
          fill="none"
          stroke={c.color}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            strokeWidth: focus === c.id ? 4.5 : 2.5,
            opacity: focus && focus !== c.id ? 0.18 : 1,
          }}
          transition={{ pathLength: { duration: 0.9, ease: 'easeOut' }, default: { duration: 0.3 } }}
        />
      ))}

      {/* n marker */}
      <motion.line
        y1={PT}
        y2={H - PB}
        className="bo-marker"
        initial={false}
        animate={{ x1: xOf(n), x2: xOf(n) }}
        transition={SPRING.soft}
      />
      {visible
        .filter((c) => !offChart.includes(c))
        .map((c) => (
          <motion.circle
            key={c.id}
            r={5}
            fill={c.color}
            className="bo-dot"
            initial={false}
            animate={{ cx: xOf(n), cy: yOf(c.f(n), scale), opacity: focus && focus !== c.id ? 0.25 : 1 }}
            transition={SPRING.soft}
          />
        ))}
      {offChart.map((c, i) => (
        <motion.text
          key={c.id}
          className="bo-off"
          fill={c.color}
          textAnchor={n > 24 ? 'end' : 'start'}
          initial={false}
          animate={{ x: xOf(n) + (n > 24 ? -8 : 8), y: PT + 12 + i * 15 }}
          transition={SPRING.soft}
        >
          ↑ {c.label} = {Math.round(c.f(n)).toLocaleString()}
        </motion.text>
      ))}
    </svg>
  );
}

/* ─── Operations race ──────────────────────────────────────────────── */

const RATE = 40; // ops per second, the same for everyone

function fmtSeconds(s: number) {
  return s <= 0 ? '0 s' : fmtTime(Math.log10(s) + 6);
}

function Race({ n, hidden }: { n: number; hidden: Set<CxId> }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rows = COMPLEXITIES.filter((c) => !hidden.has(c.id)).map((c) => ({ c, ops: Math.max(1, Math.ceil(c.f(n))) }));
  const allDone = rows.every((r) => elapsed * RATE >= r.ops);

  useLoop((dt) => {
    setElapsed((e) => e + dt);
    if (allDone) setRunning(false);
  }, running);

  return (
    <>
      <div className="bo-panel-head">
        Operations race at n = {n}
        <span className="bo-sub">everyone does {RATE} ops/sec</span>
      </div>
      <div className="bo-race">
        {rows.map(({ c, ops }) => {
          const done = Math.min(ops, Math.floor(elapsed * RATE));
          const finished = done >= ops;
          return (
            <div key={c.id} className={`bo-lane ${finished ? 'finished' : ''}`} style={{ '--c': c.color } as CSSProperties}>
              <span className="bo-lane-label">{c.label}</span>
              <div className="bo-lane-track">
                <div className="bo-lane-fill" style={{ width: `${(done / ops) * 100}%` }} />
              </div>
              <span className="bo-lane-count">
                {finished ? `✓ ${fmtSeconds(ops / RATE)}` : elapsed > 0 ? `ETA ${fmtSeconds((ops - done) / RATE)}` : `${ops.toLocaleString()} ${ops === 1 ? 'op' : 'ops'}`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="bo-race-actions">
        <Button variant="primary" onClick={() => setRunning((r) => !r)} disabled={allDone && elapsed > 0}>
          {running ? 'Pause race' : elapsed > 0 ? 'Resume' : 'Start race'}
        </Button>
        <Button
          onClick={() => {
            setRunning(false);
            setElapsed(0);
          }}
        >
          Reset
        </Button>
        <span className="bo-clock">{elapsed.toFixed(1)} s</span>
      </div>
    </>
  );
}

/* ─── Real-world readout ───────────────────────────────────────────── */

function RealWorld({ n, hidden }: { n: number; hidden: Set<CxId> }) {
  const rows = COMPLEXITIES.filter((c) => !hidden.has(c.id));
  return (
    <div className="bo-real-grid">
      {rows.map((c, i) => {
        const l = c.log10(n);
        const slow = l - 6 > 1; // > 10 seconds
        return (
          <motion.div
            key={c.id + n}
            className={`bo-real-cell ${slow ? 'slow' : ''}`}
            style={{ '--c': c.color } as CSSProperties}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <span className="bo-real-label">{c.label}</span>
            <span className="bo-real-time">{fmtTime(l)}</span>
            <span className="bo-real-ops">{fmtOpsCount(l)}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
