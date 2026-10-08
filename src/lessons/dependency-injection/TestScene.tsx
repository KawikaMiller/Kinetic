import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { DOUBLES, ORDER_SERVICE, TESTS, type Wiring } from './programs';
import { runTest, type RunOutput } from './run';
import { BOX, GRAPH_MIN_WIDTH, type DiEdge } from './shared';

const WIRINGS: { value: Wiring; label: string }[] = [
  { value: 'hardwired', label: 'new inside the constructor' },
  { value: 'injected', label: 'constructor injection' },
  { value: 'locator', label: 'service locator' },
];

const W = 560;
const H = 270;
const AT: Record<string, { x: number; y: number }> = {
  Test: { x: 280, y: 36 },
  OrderService: { x: 280, y: 134 },
  PostgresRepo: { x: 130, y: 232 },
  SmtpMailer: { x: 430, y: 232 },
  FakeRepo: { x: 100, y: 134 },
  SpyMailer: { x: 460, y: 134 },
  Registry: { x: 280, y: 232 },
};
const LOCATOR_AT: Record<string, { x: number; y: number }> = { ...AT, OrderService: { x: 150, y: 134 }, Registry: { x: 410, y: 134 } };

/** The object graph each wiring builds, as the code reads (model.test checks the `new`s). */
const GRAPHS: Record<Wiring, { nodes: string[]; edges: DiEdge[] }> = {
  hardwired: {
    nodes: ['Test', 'OrderService', 'PostgresRepo', 'SmtpMailer'],
    edges: [
      { from: 'Test', to: 'OrderService', kind: 'plain' },
      { from: 'OrderService', to: 'PostgresRepo', kind: 'new' },
      { from: 'OrderService', to: 'SmtpMailer', kind: 'new' },
    ],
  },
  injected: {
    nodes: ['Test', 'OrderService', 'FakeRepo', 'SpyMailer'],
    edges: [
      { from: 'Test', to: 'OrderService', kind: 'plain' },
      { from: 'Test', to: 'FakeRepo', kind: 'plain' },
      { from: 'Test', to: 'SpyMailer', kind: 'plain' },
      { from: 'OrderService', to: 'FakeRepo', kind: 'injected' },
      { from: 'OrderService', to: 'SpyMailer', kind: 'injected' },
    ],
  },
  locator: {
    nodes: ['Test', 'OrderService', 'Registry', 'PostgresRepo', 'SmtpMailer'],
    edges: [
      { from: 'Test', to: 'OrderService', kind: 'plain' },
      { from: 'OrderService', to: 'Registry', kind: 'hidden' },
      { from: 'Registry', to: 'PostgresRepo', kind: 'new' },
      { from: 'Registry', to: 'SmtpMailer', kind: 'new' },
    ],
  },
};
const DOUBLE_NODES = new Set(['FakeRepo', 'SpyMailer']);

const INTRO: Record<Wiring, string> = {
  hardwired: 'OrderService builds its own PostgresRepo and SmtpMailer with new. A unit test can only get the real ones.',
  injected: 'OrderService asks for a repo and a mailer in its constructor. The test passes in a fake repo and a spy mailer.',
  locator: 'The constructor takes nothing, so it looks easy to test. But place() reaches into a global Registry wired for production.',
};

function verdict(w: Wiring, out: RunOutput): string {
  if (out.passed.every(Boolean)) return 'The test passes with no database and no mail server, and the spy shows exactly one receipt was sent.';
  if (w === 'locator') {
    return 'The test fails on the database even though nothing in the constructor mentions one. To isolate it, the test would have to know to overwrite the global Registry first, and restore it afterwards.';
  }
  return 'The test fails: it cannot swap the database out, so it hits the (simulated) one and gets "connection refused". Switch to constructor injection.';
}

export function TestScene({ picker }: { picker: ReactNode }) {
  const [wiring, setWiring] = useState<Wiring>('hardwired');
  const [result, setResult] = useState<{ wiring: Wiring; out: RunOutput } | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(INTRO.hardwired);

  // A result only stands for the wiring it was run against.
  const out = result?.wiring === wiring ? result.out : null;
  const g = GRAPHS[wiring];
  const at = wiring === 'locator' ? LOCATOR_AT : AT;

  const choose = (w: Wiring) => {
    setWiring(w);
    setCaption(INTRO[w]);
  };
  const run = () => {
    const o = runTest(wiring);
    setResult({ wiring, out: o });
    setCaption(verdict(wiring, o));
  };

  const nodeMark = (id: string): GraphNodeMark | null => {
    if (id === 'OrderService') return { tone: 'hi', fill: 'solid' };
    if (DOUBLE_NODES.has(id)) return { tone: 'sky', fill: 'tint', tint: 30 };
    return null;
  };
  const edgeMark = (_e: unknown, i: number): GraphEdgeMark | null => {
    const k = g.edges[i].kind;
    if (k === 'new') return { tone: 'orange', width: 3 };
    if (k === 'hidden') return { tone: 'orange', width: 3, dashed: true };
    if (k === 'injected') return { tone: 'info', width: 3 };
    return null;
  };
  const passed = out ? out.passed.every(Boolean) : null;
  const fixedInside = g.edges.filter((e) => e.from === 'OrderService' && (e.kind === 'new' || e.kind === 'hidden')).length;

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Unit test" value={passed === null ? 'not run' : passed ? 'pass' : 'fail'} color={passed === null ? 'var(--muted)' : passed ? 'var(--ok)' : 'var(--bad)'} />
          <Stat
            label="Dependencies OrderService fixes itself"
            value={fixedInside}
            color={fixedInside ? 'var(--orange)' : 'var(--ok)'}
            sub="with new, or by a hidden lookup: the test can't swap them"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'class under test', shape: 'square' },
            { color: 'var(--orange)', label: 'hard-wired new (dashed: hidden lookup)', shape: 'line' },
            { color: 'var(--info)', label: 'injected', shape: 'line' },
            { color: 'var(--line-2)', label: 'the test creates', shape: 'line' },
            ...(wiring === 'injected' ? [{ color: 'var(--sky)', label: 'test double', shape: 'square' as const }] : []),
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="OrderService gets its dependencies by" value={wiring} onChange={choose} options={WIRINGS} />
          <Button variant="primary" onClick={run}>
            Run the unit test
          </Button>
        </>,
      ]}
    >
      <div className="di stage-pad">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Object graph: scroll sideways to see all of it">
          <GraphView
            nodes={g.nodes.map((id) => ({ id, at: at[id], shape: 'box' as const }))}
            edges={g.edges}
            directed
            width={W}
            height={H}
            box={BOX}
            arrowSize={6}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            className="di-graph"
            ariaLabel={`Object graph: ${g.edges.map((e) => `${e.from} ${e.kind === 'injected' ? 'is given' : e.kind === 'hidden' ? 'looks up' : 'creates'} ${e.to}`).join('; ')}`}
          />
        </WideRegion>
        <div className="di-code">
          <CodePanel title="OrderService.js" lines={ORDER_SERVICE[wiring]} />
          <div className="di-col">
            <CodePanel title="order.test.js" lines={wiring === 'injected' ? [...DOUBLES, '', ...TESTS.injected] : TESTS[wiring]} />
            <ConsolePanel title="test output" lines={out?.lines ?? []} empty="press Run the unit test" />
          </div>
        </div>
        <Hint block>
          The code really runs, with a ten-line test() and expect() instead of a real framework. The database and mail server are simulated: their classes
          just throw, so "connection refused" is scripted. The kinds of test double (fakes, spies, stubs, mocks) have a lesson of their own.
        </Hint>
      </div>
    </StageFrame>
  );
}
