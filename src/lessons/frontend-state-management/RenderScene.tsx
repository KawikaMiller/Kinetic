import { memo, useEffect, useState, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { actionCaption, renderIntro } from './captions';
import { createBus, createTally, expectedKey, useTallyKey, type ActionBus, type RenderTally } from './counts';
import {
  COMPONENTS, EFFECT_FOR, IDS, INITIAL, LABEL, PRODUCTS, SIGNAL_EDGES, childrenOf, createSignalCart, outcome, ownerOf, reduce,
  type Action, type Approach, type CompId, type Outcome, type SignalNodeId, type SignalRun, type State,
} from './model';
import { ContextTree, LiftedTree, RealTreeProviders, StoreTree } from './RealTree';

const APPROACH_OPTIONS: { value: Approach; label: string }[] = [
  { value: 'lifted', label: 'Lifted state' },
  { value: 'context', label: 'Context' },
  { value: 'store', label: 'Store + selectors' },
  { value: 'signals', label: 'Signals' },
];

const TREE_W = 520;
const TREE_H = 200;
const NODE_W = 64;
const NODE_H = 38;
const SHORT: Record<CompId, string> = {
  app: 'App', header: 'Header', badge: 'Badge', theme: 'Theme', list: 'List', card0: 'Mug', card1: 'Pen', card2: 'Lamp', card3: 'Book', sidebar: 'Sidebar', summary: 'Summary',
};

type Counts = Record<CompId, number>;
const zero = (): Counts => Object.fromEntries(IDS.map((id) => [id, 0])) as Counts;

interface Last {
  action: Action;
  react: Outcome | null;
  signals: SignalRun | null;
}

const OWNER_NOTE: Record<Approach, string> = {
  lifted: 'App owns the state and passes it down as props',
  context: 'App owns the state and puts it in one context object',
  store: 'The store owns the state, outside the tree',
  signals: 'Signals own the state, outside the tree',
};

function markFor(id: CompId, approach: Approach, last: Last | null): TreeNodeMark | null {
  if (!last) return null;
  if (approach === 'signals') return last.signals!.effects.some((e) => EFFECT_FOR[e] === id) ? { tone: 'hi', fill: 'solid' } : { tone: 'dim', fill: 'tint' };
  const kind = last.react!.kinds.get(id);
  if (kind === 'needed') return { tone: 'hi', fill: 'solid' };
  if (kind === 'wasted') return { tone: 'orange', fill: 'tint' };
  return { tone: 'dim', fill: 'tint' };
}

const SIGNAL_LABEL: Record<SignalNodeId, string> = {
  q0: 'qty mug', q1: 'qty pen', q2: 'qty lamp', q3: 'qty book', theme: 'theme', count: 'count', total: 'total',
  'e-badge': 'badge', 'e-card0': 'mug card', 'e-card1': 'pen card', 'e-card2': 'lamp card', 'e-card3': 'book card', 'e-summary': 'summary', 'e-theme': 'toggle',
};
const SIGNAL_NODES: GraphNode<SignalNodeId>[] = (Object.keys(SIGNAL_LABEL) as SignalNodeId[]).map((id) => ({ id, label: SIGNAL_LABEL[id], shape: 'box' }));
const SIGNAL_GRAPH_EDGES: GraphEdge<SignalNodeId>[] = SIGNAL_EDGES;
const SIGNAL_WRITTEN = (a: Action): SignalNodeId => (a.type === 'theme' ? 'theme' : (`q${a.product}` as SignalNodeId));

function SignalGraph({ last }: { last: Last | null }) {
  const run = last?.signals;
  return (
    <WideRegion minWidth={440} label="Signals dependency graph: scroll sideways to see all of it">
      <GraphView
        nodes={SIGNAL_NODES}
        edges={SIGNAL_GRAPH_EDGES}
        directed
        layout="layered"
        spacing={{ direction: 'right', layerGap: 130, nodeGap: 34, padMain: 50, padCross: 24 }}
        box={{ w: 84, h: 26, rx: 8 }}
        className="fs-graph"
        ariaLabel="Signals dependency graph: quantity and theme signals feed count and total, which feed text bindings"
        nodeMark={(id) => {
          if (!last || !run) return null;
          if (id === SIGNAL_WRITTEN(last.action)) return { tone: 'violet', fill: 'solid' };
          if (run.effects.includes(id)) return { tone: 'hi', fill: 'solid' };
          if (run.computeds.includes(id)) return { tone: 'hi', fill: 'tint' };
          return { tone: 'dim', fill: 'tint' };
        }}
        edgeMark={(e) => (run && run.effects.includes(e.to) && (run.computeds.includes(e.from) || e.from === SIGNAL_WRITTEN(last.action)) ? { tone: 'hi', width: 3 } : null)}
      />
    </WideRegion>
  );
}

function ModelTree({ approach, last, renders, writes }: { approach: Approach; last: Last | null; renders: Counts; writes: Counts }) {
  const owner = ownerOf(approach);
  return (
    <WideRegion minWidth={440} label="Component tree: scroll sideways to see all of it">
      <TreeSvg
        shape={{ root: 'app' as CompId, children: childrenOf }}
        layout="tidy"
        width={TREE_W}
        height={TREE_H}
        pad={NODE_W / 2 + 8}
        top={32}
        levelGap={64}
        className="fs-tree"
        nodeClass={() => 'fs-node'}
        nodeMark={(id) => markFor(id, approach, last)}
        renderNode={(id) => (
          <>
            {id === owner && <rect className="fs-owner" x={-NODE_W / 2 - 4} y={-NODE_H / 2 - 4} width={NODE_W + 8} height={NODE_H + 8} rx={11} />}
            <rect className="fs-node-box" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} />
            <text className="fs-node-name" y={-3} textAnchor="middle">{SHORT[id]}</text>
            <text className="fs-node-count" y={11} textAnchor="middle">{`×${renders[id]}${approach === 'signals' && writes[id] ? ` ✎${writes[id]}` : ''}`}</text>
          </>
        )}
        ariaLabel={`Component tree: ${COMPONENTS.map((c) => LABEL[c.id]).join(', ')}`}
      />
    </WideRegion>
  );
}

function RealCheck({ tally, expected }: { tally: RenderTally; expected: string | null }) {
  const key = useTallyKey(tally);
  if (expected === null) return <p className="fs-check empty-note">press an action to compare</p>;
  const ok = key === expected;
  return (
    <p className={`fs-check ${ok ? 'is-ok' : 'is-bad'}`} role="status">
      {ok ? 'Real React matches the model: the same components rendered, once each.' : `Real React differs from the model. Real: ${key || 'nothing'}. Model: ${expected || 'nothing'}.`}
    </p>
  );
}

/** Memoised on purpose: the scene re-renders on every action, and the real tree must only render for what the action does to it. */
const RealTrees = memo(function RealTrees({ approach, memoOn, tally, bus }: { approach: Exclude<Approach, 'signals'>; memoOn: boolean; tally: RenderTally; bus: ActionBus }) {
  // The tree's own mount renders are not an action's: zero the counts once everything under here has mounted.
  useEffect(() => {
    tally.reset();
  }, [tally]);
  return (
    <RealTreeProviders tally={tally} bus={bus}>
      {approach === 'lifted' ? <LiftedTree memoOn={memoOn} /> : approach === 'context' ? <ContextTree /> : <StoreTree />}
    </RealTreeProviders>
  );
});

function RealPanel({ approach, memoOn, tally, bus, expected }: { approach: Exclude<Approach, 'signals'>; memoOn: boolean; tally: RenderTally; bus: ActionBus; expected: string | null }) {
  return (
    <Box className="fs-real" role="region" aria-label="Real React tree">
      <SectionTitle hint="the same tree in real React">Real React</SectionTitle>
      <RealTrees approach={approach} memoOn={memoOn} tally={tally} bus={bus} />
      <RealCheck tally={tally} expected={expected} />
    </Box>
  );
}

export function RenderScene({ picker }: { picker: ReactNode }) {
  const [approach, setApproach] = useState<Approach>('lifted');
  const [memoOn, setMemoOn] = useState(true);
  const [state, setState] = useState<State>(INITIAL);
  const [last, setLast] = useState<Last | null>(null);
  const [renders, setRenders] = useState<Counts>(zero);
  const [writes, setWrites] = useState<Counts>(zero);
  const [expected, setExpected] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [signalCart, setSignalCart] = useState(createSignalCart);
  const [tally] = useState(createTally);
  const [bus] = useState(createBus);
  const setCaption = useSetCaption();
  useIntroCaption(renderIntro);

  const reset = () => {
    setState(INITIAL);
    setLast(null);
    setRenders(zero());
    setWrites(zero());
    setExpected(null);
    setSignalCart(createSignalCart());
    setGeneration((g) => g + 1);
  };
  const choose = (a: Approach) => {
    setApproach(a);
    reset();
    setCaption(renderIntro);
  };
  const toggleMemo = (on: boolean) => {
    setMemoOn(on);
    reset();
    setCaption(renderIntro);
  };

  const act = (action: Action) => {
    const after = reduce(state, action);
    const signals = signalCart.apply(action);
    const react = approach === 'signals' ? null : outcome(approach, memoOn, state, after);
    setState(after);
    setLast({ action, react, signals: approach === 'signals' ? signals : null });
    if (react) {
      setRenders((prev) => ({ ...prev, ...Object.fromEntries(react.rendered.map((id) => [id, prev[id] + 1])) }));
      setExpected(expectedKey(react.rendered));
      tally.reset();
      bus.send(action);
    } else {
      setWrites((prev) => ({ ...prev, ...Object.fromEntries(signals.effects.flatMap((e) => (EFFECT_FOR[e] ? [[EFFECT_FOR[e], prev[EFFECT_FOR[e]!] + 1]] : []))) }));
    }
    setCaption(actionCaption(approach, memoOn, action, react, approach === 'signals' ? signals : null));
  };

  const rendered = last?.react?.rendered ?? [];
  const wasted = rendered.filter((id) => last?.react?.kinds.get(id) === 'wasted').length;

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Re-rendered by last action" value={last ? `${rendered.length} of ${IDS.length}` : '–'} color={last ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label="Of those, wasted" value={last ? (approach === 'signals' ? 'none ran' : wasted) : '–'} color={wasted ? 'var(--orange)' : 'var(--muted)'} />
          {approach === 'signals' && <Stat label="Bindings run" value={last ? last.signals!.effects.length : '–'} color="var(--hi)" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: approach === 'signals' ? 'binding ran' : 're-rendered, and needed to' },
            { color: 'var(--orange)', label: 're-rendered, identical output' },
            { color: 'var(--dim)', label: 'did not re-render' },
            { color: 'var(--violet)', label: 'owns the state' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Share state with" value={approach} onChange={choose} options={APPROACH_OPTIONS} />
          {approach === 'lifted' && <Toggle label="Components in memo" value={memoOn} onChange={toggleMemo} off="off" on="on" />}
        </>,
        <>
          <ControlGroup label="Do">
            {PRODUCTS.map((p, i) => (
              <ChipButton key={p.name} tone="info" onClick={() => act({ type: 'add', product: i })}>
                Add {p.name}
              </ChipButton>
            ))}
            <ChipButton tone="violet" onClick={() => act({ type: 'theme' })}>Toggle theme</ChipButton>
          </ControlGroup>
          <Button onClick={() => { reset(); setCaption(renderIntro); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="fs stage-pad">
        <div className={`fs-grid ${approach === 'signals' ? 'is-wide' : ''}`}>
          <div className="fs-left">
            <p className="fs-owner-note"><i className="fs-owner-swatch" />{OWNER_NOTE[approach]}</p>
            <ModelTree approach={approach} last={last} renders={renders} writes={writes} />
            <Hint block>
              {approach === 'signals'
                ? '×n is how many times a component function re-ran (it never does here); ✎n is how many times its text binding ran. Signals here are this lesson’s own small tested library, not a real framework.'
                : '×n is how many times each component re-rendered since the last reset. Components that only forward props to their children count as wasted here: they re-ran and drew the same. The tree on the left is a model; the counts in the real panel come from real React renders.'}
            </Hint>
          </div>
          <div className="fs-right">
            {approach === 'signals' ? (
              <Box className="fs-real" role="region" aria-label="Signals dependency graph">
                <SectionTitle hint="values → what reads them">Dependency graph</SectionTitle>
                <SignalGraph last={last} />
                <p className="fs-check empty-note">A write marks what depends on it; each binding then pulls fresh values, and a computed recomputes only if an input changed.</p>
              </Box>
            ) : (
              <RealPanel key={`${approach}-${memoOn}-${generation}`} approach={approach} memoOn={memoOn} tally={tally} bus={bus} expected={expected} />
            )}
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
