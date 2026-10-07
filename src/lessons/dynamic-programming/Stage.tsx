import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { fibFrames, lcsFrames, type FibFrame, type LcsFrame } from './frames';
import { memoCalls, naiveCalls, type Style } from './model';
import './styles.css';

type Problem = 'fib' | 'lcs';
/** Dependency arrowheads: small, with the tip right at the line's end. */
const ARROW = { size: 6, refX: 9 };
const PAIRS = [
  ['ABCBDAB', 'BDCABA'],
  ['STONE', 'LONGEST'],
  ['DYNAMIC', 'PROGRAM'],
] as const;

export function Stage() {
  const [problem, setProblem] = useState<Problem>('fib');
  const [style, setStyle] = useState<Style>('topdown');
  const [n, setN] = useState(7);
  const [pair, setPair] = useState(0);

  const [a, b] = PAIRS[pair];
  const frames = useMemo<Frame[]>(
    () => (problem === 'fib' ? fibFrames(n, style) : lcsFrames(a, b, style)),
    [problem, n, style, a, b],
  );
  const player = usePlayer(frames, { interval: problem === 'fib' ? 750 : 380 });
  const ff = problem === 'fib' ? (player.frame as FibFrame) : null;
  const lf = problem === 'lcs' ? (player.frame as LcsFrame) : null;

  return (
    <StageFrame minWidth={590}
      player={player}
      height={470}
      stats={
        ff ? (
          <Stats>
            {style === 'topdown' ? (
              <Stat label="Calls" value={ff.calls} color="var(--ok)" sub={`${ff.hits} cache hits`} />
            ) : (
              <Stat label="Cells filled" value={ff.calls} color="var(--ok)" sub="no recursion" />
            )}
            <Stat label="Naive calls" value={naiveCalls(n).toLocaleString()} color="var(--bad)" sub={`for fib(${n})`} />
            <Stat label="fib(n)" value={ff.memo[n] ?? '…'} color="var(--hi)" />
          </Stats>
        ) : (
          <Stats>
            <Stat label="Cells computed" value={lf!.computed} color="var(--hi)" sub={`of ${a.length * b.length}`} />
            <Stat label="Cache hits" value={style === 'topdown' ? lf!.hits : '—'} color="var(--info)" />
            <Stat label="LCS" value={lf!.answer || '…'} color="var(--ok)" />
          </Stats>
        )
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'computing now' },
            { color: 'var(--violet)', label: 'waiting on recursion' },
            { color: 'var(--info)', label: 'cache hit' },
            { color: 'var(--ok)', label: problem === 'lcs' ? 'answer path' : 'saved' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Problem"
            value={problem}
            onChange={setProblem}
            options={[
              { value: 'fib', label: 'Fibonacci' },
              { value: 'lcs', label: 'Longest common subsequence' },
            ]}
          />
          <Segmented
            label="Approach"
            value={style}
            onChange={setStyle}
            options={[
              { value: 'topdown', label: 'Top-down (memo)' },
              { value: 'bottomup', label: 'Bottom-up (table)' },
            ]}
          />
          {problem === 'fib' ? (
            <Slider label="n" value={n} min={3} max={12} onChange={setN} />
          ) : (
            <Segmented
              label="Strings"
              value={pair}
              onChange={setPair}
              options={PAIRS.map(([x, y], i) => ({ value: i, label: `${x} / ${y}` }))}
            />
          )}
          <Hint block>
            {problem === 'lcs'
              ? 'When up and left tie, both the fill and the walk back go up, so you see one longest common subsequence; there can be others of the same length.'
              : `${style === 'topdown' ? 'Calls counts every call to fib, cache hits included.' : 'Cells filled counts every table entry written, base cases included.'} n stops at 12 here; the chart shows how calls grow up to 30.`}
          </Hint>
        </Controls>
      }
    >
      {ff && <FibView frame={ff} n={n} />}
      {lf && <LcsView frame={lf} a={a} b={b} />}
    </StageFrame>
  );
}

function FibView({ frame, n }: { frame: FibFrame; n: number }) {
  return (
    <div className="dp-fib">
      <SectionTitle weight="regular">memo[k] = fib(k)</SectionTitle>
      <div className="dp-memo">
        <svg className="dp-memo-arrows" viewBox={`0 0 ${(n + 1) * 100} 90`} preserveAspectRatio="none" aria-hidden="true">
          {frame.deps.map((d) => {
            const k = frame.memo.findIndex((_, i) => frame.state[i] === 'active');
            if (k < 0) return null;
            const x1 = (k + 0.5) * 100;
            const x2 = (d + 0.5) * 100;
            return (
              <motion.path
                key={`${k}-${d}`}
                d={`M ${x1} 88 C ${x1} ${30 - (k - d) * 12}, ${x2} ${30 - (k - d) * 12}, ${x2} 88`}
                className="dp-arrow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            );
          })}
        </svg>
        <div className="dp-memo-cells" style={{ gridTemplateColumns: `repeat(${n + 1}, 1fr)` }}>
          {frame.memo.map((v, k) => (
            <div key={k} className={`dp-mcell st-${frame.state[k]}`}>
              <span className="dp-k">{k}</span>
              <motion.b key={v ?? 'x'} initial={{ scale: v != null ? 1.6 : 1, opacity: v != null ? 0 : 1 }} animate={{ scale: 1, opacity: 1 }}>
                {v ?? '·'}
              </motion.b>
            </div>
          ))}
        </div>
      </div>
      <div className="dp-stack">
        <SectionTitle weight="regular">call stack</SectionTitle>
        {frame.stack.length ? (
          frame.stack.map((k, i) => (
            <span key={i} className={`dp-stack-chip ${i === frame.stack.length - 1 ? 'top' : ''}`}>
              fib({k})
            </span>
          ))
        ) : (
          <span className="muted">(empty)</span>
        )}
      </div>
      <CallsChart n={n} />
    </div>
  );
}

// "Calls needed" chart geometry (SVG units)
const CHART_MAX_N = 30;
const CHART_W = 600;
const CHART_H = 150;
const CHART_X_PAD = 30;
const CHART_Y_PAD = 20;

function CallsChart({ n }: { n: number }) {
  const W = CHART_W;
  const H = CHART_H;
  const MAXN = CHART_MAX_N;
  const ymax = Math.log10(naiveCalls(MAXN));
  const x = (k: number) => CHART_X_PAD + ((k - 1) / (MAXN - 1)) * (W - CHART_X_PAD * 2);
  const y = (calls: number) => H - CHART_Y_PAD - (Math.log10(calls) / ymax) * (H - CHART_Y_PAD * 2);
  const naive = Array.from({ length: MAXN }, (_, i) => `${x(i + 1)},${y(naiveCalls(i + 1))}`).join(' ');
  const memo = Array.from({ length: MAXN }, (_, i) => `${x(i + 1)},${y(memoCalls(i + 1))}`).join(' ');
  return (
    <div className="dp-chart">
      <SectionTitle weight="regular">calls needed for fib(n), log scale</SectionTitle>
      <svg viewBox={`0 0 ${W} ${H}`} className="dp-chart-svg">
        {[1, 3, 5].map((p) => (
          <g key={p}>
            <line x1={CHART_X_PAD} x2={W - CHART_X_PAD} y1={y(10 ** p)} y2={y(10 ** p)} className="dp-grid" />
            <text x={CHART_X_PAD - 4} y={y(10 ** p) + 4} textAnchor="end" className="dp-axis">
              10{p === 1 ? '' : <tspan dy={-6} fontSize={8}>{p}</tspan>}
            </text>
          </g>
        ))}
        <polyline points={naive} className="dp-line naive" />
        <polyline points={memo} className="dp-line memo" />
        <line x1={x(n)} x2={x(n)} y1={10} y2={H - CHART_Y_PAD} className="dp-marker" />
        <text x={W - CHART_X_PAD} y={y(naiveCalls(MAXN)) + 14} textAnchor="end" className="dp-lbl naive">
          naive: {naiveCalls(MAXN).toLocaleString()} at n={MAXN}
        </text>
        <text x={W - CHART_X_PAD} y={y(memoCalls(MAXN)) - 8} textAnchor="end" className="dp-lbl memo">
          memoized: {memoCalls(MAXN)} at n={MAXN}
        </text>
        <text x={x(n)} y={H - 5} textAnchor="middle" className="dp-axis">
          n={n}
        </text>
      </svg>
    </div>
  );
}

const CS = 40;

function LcsView({ frame, a, b }: { frame: LcsFrame; a: string; b: string }) {
  const m = a.length;
  const n = b.length;
  const cx = (j: number) => (j + 1.5) * CS;
  const cy = (i: number) => (i + 1.5) * CS;
  const head = useArrowMarker('var(--hi)', ARROW);
  const dimHead = useArrowMarker('var(--faint)', ARROW);
  return (
    <div className="dp-lcs">
      <div className="dp-grid-wrap" style={{ width: (n + 2) * CS, height: (m + 2) * CS }}>
        <div className="dp-table" style={{ gridTemplateColumns: `repeat(${n + 2}, ${CS}px)`, gridTemplateRows: `repeat(${m + 2}, ${CS}px)` }}>
          <div className="dp-h" />
          <div className="dp-h dim">∅</div>
          {b.split('').map((ch, j) => (
            <div key={`b${j}`} className={`dp-h ${frame.cur && frame.cur[1] === j + 1 ? 'on' : ''}`}>
              {ch}
            </div>
          ))}
          {Array.from({ length: m + 1 }, (_, i) => (
            <Row key={i} i={i} a={a} frame={frame} n={n} />
          ))}
        </div>
        <svg className="dp-overlay" width={(n + 2) * CS} height={(m + 2) * CS} aria-hidden="true">
          {head.def}
          {dimHead.def}
          {frame.cur &&
            frame.deps.map(([i, j]) => {
              const chosen = frame.chosen && frame.chosen[0] === i && frame.chosen[1] === j;
              const [ci, cj] = frame.cur!;
              // value flows FROM the dependency INTO the current cell
              const x1 = cx(j);
              const y1 = cy(i);
              const x2 = cx(cj);
              const y2 = cy(ci);
              return (
                <line
                  key={`${i}-${j}`}
                  x1={x1 + (x2 - x1) * 0.2}
                  y1={y1 + (y2 - y1) * 0.2}
                  x2={x1 + (x2 - x1) * 0.72}
                  y2={y1 + (y2 - y1) * 0.72}
                  className={`dp-dep ${chosen ? 'chosen' : ''}`}
                  markerEnd={chosen ? head.url : dimHead.url}
                />
              );
            })}
        </svg>
      </div>
      <div className="dp-answer">
        <SectionTitle weight="regular">answer so far</SectionTitle>
        <div className="dp-letters">
          {frame.answer.split('').map((ch, i) => (
            <motion.span key={`${i}${ch}`} className="dp-letter" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
              {ch}
            </motion.span>
          ))}
          {!frame.answer && <span className="muted">(fills in during the walk back)</span>}
        </div>
      </div>
    </div>
  );
}

function Row({ i, a, frame, n }: { i: number; a: string; frame: LcsFrame; n: number }) {
  return (
    <>
      <div className={`dp-h ${i === 0 ? 'dim' : ''} ${frame.cur && frame.cur[0] === i && i > 0 ? 'on' : ''}`}>{i === 0 ? '∅' : a[i - 1]}</div>
      {Array.from({ length: n + 1 }, (_, j) => {
        const st = frame.state[i][j];
        const v = frame.dp[i][j];
        const isCur = frame.cur && frame.cur[0] === i && frame.cur[1] === j;
        const isDep = frame.deps.some(([di, dj]) => di === i && dj === j);
        const isChosen = frame.chosen && frame.chosen[0] === i && frame.chosen[1] === j;
        return (
          <div key={j} className={`dp-cell st-${st} ${isCur ? 'cur' : ''} ${isDep ? (isChosen ? 'dep chosen' : 'dep') : ''}`}>
            {v ?? ''}
          </div>
        );
      })}
    </>
  );
}
