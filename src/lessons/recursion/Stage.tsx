import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { CallStackPanel, type CallFrame, type CallFrameState } from '../../components/CallStackPanel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Controls, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import {
  LIMIT, factorialFrames, fibTree, sumFrames, type FNode, type StackFrame, type Tone as StackTone, type TreeFrame,
} from './frames';
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
      minWidth={500}
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

const STATE_OF: Record<StackTone, CallFrameState> = {
  active: 'running',
  waiting: 'waiting',
  base: 'ok',
  returning: 'returning',
  crash: 'error',
};

function CallStack({ frame }: { frame: StackFrame }) {
  // The model keeps the stack outermost-first; the panel takes it top-first.
  const frames: CallFrame[] = [...frame.stack].reverse().map((f) => ({
    id: f.id,
    name: f.label,
    state: STATE_OF[f.tone],
    detail: (
      <>
        {f.note}
        {f.tone === 'returning' && frame.ret && (
          <motion.span key={frame.ret.key} className="rc-ret" initial={{ y: -26, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            ↓ {frame.ret.value}
          </motion.span>
        )}
      </>
    ),
  }));

  return (
    <CallStackPanel
      frames={frames}
      meta={`${frame.stack.length}/${LIMIT} frames shown`}
      alarm={frame.crashed}
      empty={
        frame.result != null ? (
          <motion.div className="rc-result" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            = {frame.result}
          </motion.div>
        ) : (
          <p className="rc-empty">empty: nothing running yet</p>
        )
      }
      overlay={
        frame.crashed && (
          <motion.div className="rc-crash" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            RangeError: Maximum call stack size exceeded
          </motion.div>
        )
      }
    />
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
const NODE_ENTER_SCALE = 0.3;
const ON_STACK_EDGE_W = 3;

/** Each call's child calls, in the order they were made (fib(n-1) then fib(n-2)). */
function childrenOf(nodes: FNode[]): number[][] {
  const kids = nodes.map((): number[] => []);
  for (const nd of nodes) if (nd.parent != null) kids[nd.parent].push(nd.id);
  return kids;
}
/** Width of a "times each call ran" bar per run, in %. */
const COUNT_BAR_PCT = 12;

function FibTree({ nodes, leaves, frame }: { nodes: FNode[]; leaves: number; frame: TreeFrame }) {
  const depth = Math.max(...nodes.map((n) => n.depth));
  const W = Math.max(leaves * LEAF_GAP, MIN_TREE_W);
  const H = (depth + 1) * LEVEL_GAP + TREE_BOTTOM_PAD;
  const kids = useMemo(() => childrenOf(nodes), [nodes]);
  const shape: TreeShape<number> = { root: 0, children: (id) => kids[id] };
  const onStack = (id: number) => frame.states[id] === 'active' || frame.states[id] === 'waiting';
  const counts = Object.entries(frame.counts)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => b[0] - a[0]);

  const renderNode = (id: number) => {
    const nd = nodes[id];
    const s = frame.states[id];
    const v = frame.values[id];
    const cls = s === 'active' ? 'active' : s === 'waiting' ? 'waiting' : nd.repeat ? 'repeat' : 'done';
    return (
      <>
        <circle r={22} className={`rc-node ${cls} ${nd.repeat ? 'is-repeat' : ''}`} />
        <text y={v != null ? -3 : 4} textAnchor="middle" className="rc-nlabel">
          fib({nd.n})
        </text>
        {v != null && (
          <text y={12} textAnchor="middle" className="rc-nval">
            ={v}
          </text>
        )}
      </>
    );
  };

  return (
    <div className="rc-treewrap">
      <TreeSvg
        shape={shape}
        layout="tidy"
        width={W}
        height={H}
        pad={LEAF_GAP / 2}
        top={TREE_TOP}
        levelGap={LEVEL_GAP}
        className="rc-tree"
        renderNode={renderNode}
        hidden={(id) => frame.states[id] === 'unseen'}
        edgeMark={(_, child) => (onStack(child) ? { tone: 'violet' } : null)}
        markedEdgeWidth={ON_STACK_EDGE_W}
        enterScale={NODE_ENTER_SCALE}
        transition={NODE_POP}
      />
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
