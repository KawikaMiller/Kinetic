import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { SHAKE, SPRING } from '../../core/motion';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { LIMIT, factorialFrames, fibTree, sumFrames, type StackFrame, type TreeFrame } from './frames';
import './styles.css';

type Mode = 'factorial' | 'sum' | 'fib';
const LIST = [3, 1, 4, 1, 5, 9];

const CODE: Record<Mode, { base: string[]; noBase: string[] }> = {
  factorial: {
    base: ['function factorial(n) {', '  if (n <= 1) return 1;  // base', '  return n * factorial(n - 1);', '}'],
    noBase: ['function factorial(n) {', '  // base case removed!', '  return n * factorial(n - 1);', '}'],
  },
  sum: {
    base: ['function sum(list) {', '  if (list.length === 0) return 0;', '  return list[0] + sum(list.slice(1));', '}'],
    noBase: ['function sum(list) {', '  // base case removed!', '  return list[0] + sum(list.slice(1));', '}'],
  },
  fib: {
    base: ['function fib(n) {', '  if (n <= 1) return n;  // base', '  return fib(n - 1) + fib(n - 2);', '}'],
    noBase: [],
  },
};

export function Stage() {
  const [mode, setMode] = useState<Mode>('factorial');
  const [n, setN] = useState(4);
  const [fibN, setFibN] = useState(5);
  const [len, setLen] = useState(4);
  const [withBase, setWithBase] = useState(true);

  const linear = useMemo(
    () => (mode === 'factorial' ? factorialFrames(n, withBase) : mode === 'sum' ? sumFrames(LIST.slice(0, len), withBase) : null),
    [mode, n, len, withBase],
  );
  const tree = useMemo(() => (mode === 'fib' ? fibTree(fibN) : null), [mode, fibN]);
  const player = usePlayer<Frame>(linear ?? tree!.frames, { interval: mode === 'fib' ? 520 : 1100 });

  const code = withBase || mode === 'fib' ? CODE[mode].base : CODE[mode].noBase;
  const lf = linear ? (player.frame as StackFrame) : null;
  const tf = tree ? (player.frame as TreeFrame) : null;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        lf ? (
          <Stats>
            <Stat label="Calls" value={lf.calls} color="var(--hi)" />
            <Stat label="Stack depth" value={lf.stack.length} color={lf.crashed ? 'var(--bad)' : 'var(--info)'} sub={`peak ${lf.maxDepth}`} />
            <Stat label="Result" value={lf.crashed ? '💥' : (lf.result ?? '…')} color={lf.crashed ? 'var(--bad)' : 'var(--ok)'} />
          </Stats>
        ) : (
          <Stats>
            <Stat label="Calls" value={tf!.calls} color="var(--hi)" sub={`of ${tree!.nodes.length}`} />
            <Stat label="Repeated work" value={tf!.repeats} color="var(--bad)" sub="subtrees computed again" />
            <Stat label="fib(n)" value={tf!.values[0] ?? '…'} color="var(--ok)" />
          </Stats>
        )
      }
      legend={
        <Legend
          items={
            lf
              ? [
                  { color: 'var(--hi)', label: 'running now' },
                  { color: 'var(--dim)', label: 'waiting for a callee' },
                  { color: 'var(--ok)', label: 'base case' },
                  { color: 'var(--info)', label: 'return value' },
                  { color: 'var(--bad)', label: 'overflow' },
                ]
              : [
                  { color: 'var(--hi)', label: 'running now', shape: 'dot' },
                  { color: 'var(--violet)', label: 'on the call stack', shape: 'dot' },
                  { color: 'var(--ok)', label: 'returned', shape: 'dot' },
                  { color: 'var(--bad)', label: 'repeated work', shape: 'dot' },
                ]
          }
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Function"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'factorial', label: 'factorial(n)' },
              { value: 'sum', label: 'sum(list)' },
              { value: 'fib', label: 'fib(n) tree' },
            ]}
          />
          {mode === 'factorial' && <Slider label="n" value={n} min={1} max={7} onChange={setN} />}
          {mode === 'sum' && <Slider label="List length" value={len} min={0} max={6} onChange={setLen} />}
          {mode === 'fib' && <Slider label="n" value={fibN} min={2} max={7} onChange={setFibN} />}
          {mode !== 'fib' && (
            <Toggle label="Base case" value={!withBase} onChange={(remove) => setWithBase(!remove)} off="Keep it" on="Remove it 💣" />
          )}
        </Controls>
      }
    >
      <div className={`rc ${mode === 'fib' ? 'rc-fib' : ''}`}>
        <Code lines={code} active={lf?.line ?? (tf ? (tf.current != null ? 3 : null) : null)} />
        {lf && <CallStack frame={lf} />}
        {tree && tf && <FibTree nodes={tree.nodes} leaves={tree.leaves} frame={tf} />}
      </div>
    </StageFrame>
  );
}

function Code({ lines, active }: { lines: string[]; active: number | null }) {
  return (
    <pre className="rc-code" aria-label="Code">
      {lines.map((l, i) => (
        <div key={i} className={`rc-line ${active === i + 1 ? 'on' : ''}`}>
          <span className="rc-ln">{i + 1}</span>
          {l}
        </div>
      ))}
    </pre>
  );
}

function CallStack({ frame }: { frame: StackFrame }) {
  return (
    <div className={`rc-stackwrap ${frame.crashed ? 'is-crashed' : ''}`}>
      <div className="rc-stack-head">
        <span>Call stack</span>
        <span className="rc-limit">
          {frame.stack.length}/{LIMIT} frames shown
        </span>
      </div>
      <div className="rc-stack">
        <AnimatePresence initial={false}>
          {frame.stack.map((f, i) => (
            <motion.div
              key={f.id}
              layout
              className={`rc-frame tone-${f.tone}`}
              initial={{ opacity: 0, y: -24, scale: 0.9 }}
              animate={frame.crashed ? { opacity: 1, y: 0, scale: 1, ...SHAKE } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, transition: { duration: 0.3 } }}
              transition={SPRING.snappy}
            >
              <span className="rc-depth">{i}</span>
              <b>{f.label}</b>
              <span className="rc-note">
                {f.note}
                {f.tone === 'returning' && frame.ret && (
                  <motion.span key={frame.ret.key} className="rc-ret" initial={{ y: -26, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    ↓ {frame.ret.value}
                  </motion.span>
                )}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {frame.stack.length === 0 && frame.result != null && (
          <motion.div className="rc-result" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            = {frame.result}
          </motion.div>
        )}
        {frame.stack.length === 0 && frame.result == null && <p className="rc-empty">empty: nothing running yet</p>}
      </div>
      {frame.crashed && (
        <motion.div className="rc-crash" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
          RangeError: Maximum call stack size exceeded
        </motion.div>
      )}
    </div>
  );
}

// Fibonacci tree geometry (SVG units)
const LEAF_GAP = 64;
const LEVEL_GAP = 72;
const MIN_TREE_W = 360;
const TREE_TOP = 30;
const TREE_BOTTOM_PAD = 20;
/** Bouncier than the presets on purpose: each new call pops into the tree. */
const NODE_POP = { type: 'spring', stiffness: 300, damping: 22 } as const;
/** Width of a "times each call ran" bar per run, in %. */
const COUNT_BAR_PCT = 12;

function FibTree({ nodes, leaves, frame }: { nodes: ReturnType<typeof fibTree>['nodes']; leaves: number; frame: TreeFrame }) {
  const depth = Math.max(...nodes.map((n) => n.depth));
  const W = Math.max(leaves * LEAF_GAP, MIN_TREE_W);
  const H = (depth + 1) * LEVEL_GAP + TREE_BOTTOM_PAD;
  const px = (x: number) => LEAF_GAP / 2 + x * ((W - LEAF_GAP) / Math.max(1, leaves - 1));
  const py = (d: number) => TREE_TOP + d * LEVEL_GAP;
  const counts = Object.entries(frame.counts)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => b[0] - a[0]);

  return (
    <div className="rc-treewrap">
      <svg className="rc-tree" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {nodes.map((nd) => {
          if (nd.parent == null) return null;
          const p = nodes[nd.parent];
          const s = frame.states[nd.id];
          if (s === 'unseen') return null;
          return (
            <line
              key={`e${nd.id}`}
              x1={px(p.x)}
              y1={py(p.depth)}
              x2={px(nd.x)}
              y2={py(nd.depth)}
              className={`rc-edge ${s === 'active' || s === 'waiting' ? 'on-stack' : ''}`}
            />
          );
        })}
        {nodes.map((nd) => {
          const s = frame.states[nd.id];
          if (s === 'unseen') return null;
          const v = frame.values[nd.id];
          const cls = s === 'active' ? 'active' : s === 'waiting' ? 'waiting' : nd.repeat ? 'repeat' : 'done';
          return (
            <motion.g
              key={nd.id}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ originX: `${px(nd.x)}px`, originY: `${py(nd.depth)}px` }}
              transition={NODE_POP}
            >
              <circle cx={px(nd.x)} cy={py(nd.depth)} r={22} className={`rc-node ${cls} ${nd.repeat ? 'is-repeat' : ''}`} />
              <text x={px(nd.x)} y={py(nd.depth) - (v != null ? 3 : -4)} textAnchor="middle" className="rc-nlabel">
                fib({nd.n})
              </text>
              {v != null && (
                <text x={px(nd.x)} y={py(nd.depth) + 12} textAnchor="middle" className="rc-nval">
                  ={v}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
      <div className="rc-counts">
        <span className="rc-counts-title">Times each call ran</span>
        {counts.map(([k, c]) => (
          <div key={k} className="rc-count">
            <span>fib({k})</span>
            <i style={{ width: `${Math.min(100, c * COUNT_BAR_PCT)}%` }} className={c > 1 && k >= 2 ? 'dup' : ''} />
            <b>{c}×</b>
          </div>
        ))}
      </div>
    </div>
  );
}
