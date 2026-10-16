import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { defOf, namesOf, staticCount, successors, type Program } from './ir';
import { loopCaption } from './captions';
import { loopView, type LoopView } from './model';
import { N_MAX, OPENING, X_RANGE } from './opening';
import type { LoopOptions } from './passes';
import { IrCode } from './IrCode';
import { loopProgram } from './programs';

const CFG_MIN_WIDTH = 420;
const CFG_BOX = { w: 118, h: 40 };

const cfgOf = (p: Program) => ({
  nodes: p.blocks.map((b) => ({ id: b.label, shape: 'box' as const, label: `${b.label} (${b.instrs.length})` })),
  edges: p.blocks.flatMap((b) => successors(b).map((to) => ({ from: b.label, to }))),
});

/** Scene 3: a loop with a call in it, and the benchmark that deletes itself. */
export function LoopScene({ picker }: { picker: ReactNode }) {
  const [options, setOptions] = useState<LoopOptions>(OPENING.loop.options);
  const [resultUsed, setResultUsed] = useState(OPENING.loop.resultUsed);
  const [x, setX] = useState(OPENING.loop.x);
  const [n, setN] = useState(OPENING.loop.n);
  const [xDraft, setXDraft] = useState(String(OPENING.loop.x));
  const [nDraft, setNDraft] = useState(String(OPENING.loop.n));
  const [error, setError] = useState<string | null>(null);

  const view = useMemo(() => loopView(options, resultUsed, x, n), [options, resultUsed, x, n]);
  const names = useMemo(() => namesOf(loopProgram(true)), []);
  const cfg = useMemo(() => cfgOf(view.after), [view.after]);
  const hoistedSet = useMemo(() => new Set(view.hoisted), [view.hoisted]);
  const preheader = view.after.blocks.find((b) => b.instrs.some((i) => hoistedSet.has(defOf(i) ?? '')))?.label ?? null;
  const set = (key: keyof LoopOptions) => (v: boolean) => setOptions((o) => ({ ...o, [key]: v }));

  const hoistedLine = (listing: LoopView['afterListing'], program: Program) => (i: number) => {
    for (let b = 0; b < program.blocks.length; b++) {
      for (let k = 0; k < program.blocks[b].instrs.length; k++) {
        if (listing.at(b, k) === i && hoistedSet.has(defOf(program.blocks[b].instrs[k]) ?? '')) return 'co-hoisted';
      }
    }
    return undefined;
  };

  const field = (text: string, set: (v: number) => void, setDraft: (s: string) => void, min: number, max: number, what: string) => {
    setDraft(text);
    const parsed = parseBoundedInt(text, { min, max, messages: { tooSmall: () => `${what} is at least ${min.toLocaleString('en-US')}`, tooBig: () => `${what} is at most ${max.toLocaleString('en-US')}, which keeps the counting instant` } });
    if (parsed.ok) {
      set(parsed.value);
      setError(null);
    } else setError(parsed.error);
  };

  return (
    <StageFrame
      height={560}
      intro={loopCaption(view, options, resultUsed, n)}
      introKey={`${Object.values(options).join()}-${resultUsed}-${x}-${n}`}
      stats={
        <Stats>
          <Stat label="Executed per iteration" value={`${view.perIterationBefore} to ${view.perIterationAfter}`} color="var(--info)" sub="read off the interpreter, phi and branches included" />
          <Stat label={`Executed for n = ${n.toLocaleString('en-US')}`} value={`${view.beforeRun.executed.toLocaleString('en-US')} to ${view.afterRun.executed.toLocaleString('en-US')}`} color="var(--info)" sub={`${staticCount(view.before)} then ${staticCount(view.after)} instructions in the listing`} />
          <Stat label="Zero trips" value={`${view.zeroTripBefore} to ${view.zeroTripAfter}`} color="var(--info)" sub="instructions when n = 0" />
          <Stat label="Same result" value={view.same ? 'yes' : 'no'} color={view.same ? 'var(--ok)' : 'var(--bad)'} sub={`returns ${view.afterRun.value.toLocaleString('en-US')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'removed', shape: 'square' },
            { color: 'var(--ok)', label: 'created or rewritten', shape: 'square' },
            { color: 'var(--violet)', label: 'hoisted out of the loop', shape: 'square' },
            { color: 'var(--orange)', label: 'a refused rewrite, with its reason', shape: 'square' },
            { color: 'var(--info)', label: 'executed-instruction count', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="1. Inline square" value={options.inlining} onChange={set('inlining')} />
          <Toggle label="2. Hoist invariants" value={options.hoisting} onChange={set('hoisting')} />
          <Toggle label="3. Dead-code elimination" value={options.dce} onChange={set('dce')} />
          <Toggle label="4. Delete effect-free loops" value={options.deleteLoops} onChange={set('deleteLoops')} />
        </>,
        <>
          <Toggle label="The benchmark" value={!resultUsed} onChange={(v) => setResultUsed(!v)} off="prints its result" on="ignores its result" />
          <TextField label="x" value={xDraft} onChange={(t) => field(t, setX, setXDraft, X_RANGE.min, X_RANGE.max, 'x')} width={90} spellCheck={false} />
          <TextField label="n" value={nDraft} onChange={(t) => field(t, setN, setNDraft, 0, N_MAX, 'n')} width={110} spellCheck={false} />
          <Hint><span role="status">{error ?? 'Steps run in the order shown, each only when switched on.'}</span></Hint>
        </>,
      ]}
    >
      <div className="co-stage stage-pad">
        <div className="co-two">
          <IrCode title="Before" lines={view.beforeListing.lines} names={names} stateOf={(i) => (view.diff.removed.has(i) ? 'del' : 'idle')} />
          <IrCode
            title="After"
            lines={view.afterListing.lines}
            names={names}
            stateOf={(i) => (view.diff.added.has(i) ? 'add' : 'idle')}
            lineClass={hoistedLine(view.afterListing, view.after)}
          />
        </div>
        {view.blocker && <p className="co-refused" role="note">Refused: {view.blocker}.</p>}
        <WideRegion minWidth={CFG_MIN_WIDTH} label="Control-flow graph: scroll sideways to see all of it">
          <GraphView
            nodes={cfg.nodes}
            edges={cfg.edges}
            directed
            layout="layered"
            spacing={{ direction: 'down', layerGap: 72, nodeGap: 150, padMain: 30, padCross: 70 }}
            box={CFG_BOX}
            nodeMark={(id) => (id === preheader ? { tone: 'violet', fill: 'tint' } : null)}
            ariaLabel={`Control-flow graph of the program after the steps: ${cfg.nodes.map((b) => b.label).join(', ')}`}
          />
        </WideRegion>
        {options.deleteLoops && (
          <p className="co-note">
            <Provenance kind="from-memory">C and C++ let a compiler assume a loop with no effects finishes (C11 6.8.5 and the C++ forward-progress rule); verify against the standards</Provenance>
          </p>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy IR, an interpreter and four toy passes; nothing here was compiled by GCC or LLVM</Provenance>
        <Provenance kind="from-memory">what -O2 does to a benchmark whose result is unused; check it on Compiler Explorer</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
