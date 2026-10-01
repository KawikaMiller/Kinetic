import { useCallback, useMemo, useState } from 'react';
import { ByteGrid } from '../components/ByteGrid';
import { CellGrid } from '../components/CellGrid';
import { GraphView } from '../components/GraphView';
import { Arrow, Bars, Curve, Heat, HLine, Plot2D, Points, Polygon, VLine, type Point } from '../components/Plot2D';
import { SectionTitle } from '../components/Panel';
import { TreeSvg } from '../components/TreeSvg';
import { Button } from '../components/ui';
import { createDisjointSet } from '../core/disjointSet';
import { sieve } from '../core/numberTheory';
import { barsFromHistogram } from '../core/plot';
import { mulberry32, randInt } from '../core/random';
import { mean } from '../core/sim';
import { collisionProbability, histogram } from '../core/stats';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 2 shared kit, rendered at the bottom of DevKit (#/dev/kit). */
export function DevKitTier2() {
  return (
    <>
      <SectionTitle>Tier 2 kit</SectionTitle>
      <Section title="CellGrid · Sieve of Eratosthenes to 100 (click a cell; arrows move)">
        <SieveDemo />
      </Section>
      <Section title="CellGrid · canvas mode: 1,000 people, 10 test positive">
        <CrowdDemo />
      </Section>
      <Section title="ByteGrid · an Ethernet header with fields and ASCII">
        <BytesDemo />
      </Section>
      <Section title="TreeSvg forest · union-find sets merging">
        <ForestDemo />
      </Section>
      <Section title="GraphView · state machine (start arrow, accepting state, self-loop, a⇄b pair); feed it a string">
        <AutomatonDemo />
      </Section>
      <Section title="GraphView · layered top-down with boxes (Tab in, arrows move, Enter marks) and a circle layout">
        <div className="devkit-plots">
          <LayeredDemo />
          <CircleDemo />
        </div>
      </Section>
      <Section title="Plot2D · Curve, VLine, HLine, Bars (birthday paradox; two dice)">
        <div className="devkit-plots">
          <BirthdayPlot />
          <DicePlot />
        </div>
      </Section>
      <Section title="Plot2D · log y axis; drag the vectors or the centroids (or focus one, then arrow keys)">
        <div className="devkit-plots">
          <LogPlot />
          <VectorPlot />
          <RegionsPlot />
        </div>
      </Section>
    </>
  );
}

function SieveDemo() {
  const { passes } = useMemo(() => sieve(100), []);
  const [pass, setPass] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const crossedBy = useMemo(() => {
    const m = new Map<number, number>();
    passes.slice(0, pass).forEach((p, k) => p.crossed.forEach((n) => m.set(n, k)));
    return m;
  }, [passes, pass]);
  const done = pass >= passes.length;
  return (
    <div>
      <CellGrid
        rows={10}
        cols={10}
        size="md"
        ariaLabel="Numbers 1 to 100"
        cell={(r, c) => {
          const n = r * 10 + c + 1;
          if (n === 1 || crossedBy.has(n)) return { text: n, fill: 'none' };
          const k = passes.findIndex((p) => p.prime === n);
          if (k >= 0 && k === pass - 1) return { text: n, tone: 'hi', fill: 'solid' };
          return done || (k >= 0 && k < pass) ? { text: n, tone: 'ok', fill: 'tint' } : { text: n };
        }}
        cellAriaLabel={(r, c) => {
          const n = r * 10 + c + 1;
          return `${n}${crossedBy.has(n) ? ', crossed out' : ''}`;
        }}
        onCellClick={(r, c) => setPicked(r * 10 + c + 1)}
        highlight={picked ? [{ r: Math.floor((picked - 1) / 10), c: (picked - 1) % 10, tone: 'info' }] : []}
      />
      <p className="muted">
        <Button onClick={() => setPass((p) => Math.min(passes.length, p + 1))} disabled={done}>
          Next prime
        </Button>{' '}
        <Button onClick={() => setPass(0)}>Reset</Button> pass {pass}/{passes.length}
        {picked ? ` · picked ${picked}` : ''}
      </p>
    </div>
  );
}

function CrowdDemo() {
  const sick = useMemo(() => {
    const rnd = mulberry32(7);
    const s = new Set<number>();
    while (s.size < 10) s.add(Math.floor(rnd() * 1000));
    return s;
  }, []);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div>
      <CellGrid
        rows={25}
        cols={40}
        size="xs"
        ariaLabel="1,000 people"
        cell={(r, c) => (sick.has(r * 40 + c) ? { tone: 'bad', fill: 'solid' } : { tone: 'info', fill: 'tint', intensity: 0.25 })}
        cellAriaLabel={(r, c) => `person ${r * 40 + c + 1}${sick.has(r * 40 + c) ? ', has the condition' : ''}`}
        onCellClick={(r, c) => setPicked(r * 40 + c + 1)}
      />
      <p className="muted">{picked ? `picked person ${picked}` : 'click or Tab in and use the arrow keys'}</p>
    </div>
  );
}

function BytesDemo() {
  // dst MAC, src MAC, EtherType 0x0800 (IPv4), then the start of an IPv4 header.
  const bytes = [
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02, 0x42, 0xac, 0x11, 0x00, 0x02, 0x08, 0x00, 0x45, 0x00, 0x00, 0x3c, 0x1c, 0x46,
    0x40, 0x00, 0x40, 0x06, 0x48, 0x54, 0x54, 0x50,
  ];
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <ByteGrid
      bytes={bytes}
      ascii
      ariaLabel="Frame bytes"
      fields={[
        { from: 0, to: 5, tone: 'info', label: 'destination MAC' },
        { from: 6, to: 11, tone: 'violet', label: 'source MAC' },
        { from: 12, to: 13, tone: 'orange', label: 'EtherType (IPv4)' },
      ]}
      highlight={picked !== null ? [{ i: picked, tone: 'hi' }] : []}
      onByteClick={setPicked}
    />
  );
}

function ForestDemo() {
  const n = 8;
  const [steps, setSteps] = useState(0);
  const unions: [number, number][] = [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [0, 7]];
  const dsu = createDisjointSet(n, { compress: false });
  unions.slice(0, steps).forEach(([a, b]) => dsu.union(a, b));
  const parent = dsu.parents();
  const roots = parent.flatMap((p, i) => (p === i ? [i] : []));
  return (
    <div style={{ maxWidth: 420 }}>
      <TreeSvg
        shape={{ root: null, roots, children: (id: number) => parent.flatMap((p, i) => (p === id && i !== id ? [i] : [])) }}
        width={420}
        height={180}
        label={(id) => id}
        nodeMark={(id) => (parent[id] === id ? { tone: 'info', fill: 'tint' } : null)}
        ariaLabel="Union-find forest"
      />
      <p className="muted">
        <Button onClick={() => setSteps((s) => Math.min(unions.length, s + 1))} disabled={steps >= unions.length}>
          Next union
        </Button>{' '}
        <Button onClick={() => setSteps(0)}>Reset</Button> {dsu.count} sets
      </p>
    </div>
  );
}

function BirthdayPlot() {
  return (
    <Plot2D x={{ domain: [1, 80], label: 'people in the room' }} y={{ domain: [0, 1], label: 'P(shared birthday)' }} ariaLabel="Birthday collision probability">
      <HLine at={0.5} label="50%" tone="dim" />
      <VLine at={23} label="n = 23" />
      <Curve fn={(n) => collisionProbability(Math.round(n), 365).p} tone="info" />
    </Plot2D>
  );
}

function DicePlot() {
  const sums = useMemo(() => {
    const rnd = mulberry32(3);
    return Array.from({ length: 1000 }, () => randInt(1, 6, rnd) + randInt(1, 6, rnd));
  }, []);
  const bars = barsFromHistogram(histogram(sums, { bins: 11, min: 1.5, max: 12.5 }));
  const avg = mean(sums);
  return (
    <Plot2D x={{ domain: [1.5, 12.5], label: 'sum of two dice', ticks: 11 }} y={{ domain: [0, 200], label: 'rolls' }} ariaLabel="Histogram of 1,000 two-dice sums">
      <Bars bars={bars} tone="violet" />
      <VLine at={avg} label={`mean ${avg.toFixed(2)}`} tone="hi" />
    </Plot2D>
  );
}

function LogPlot() {
  // Trial division needs about √N steps: for d digits, 10^(d/2). At 10⁹ steps a second:
  const seconds = (digits: number) => 10 ** (digits / 2) / 1e9;
  return (
    <Plot2D x={{ domain: [1, 60], label: 'digits in N' }} y={{ domain: [1e-9, 1e21], log: true, label: 'seconds', ticks: 6 }} ariaLabel="Trial division time on a log axis">
      <HLine at={3.15e7} label="1 year" tone="dim" />
      <Curve fn={(d) => (d <= 30 ? seconds(d) : NaN)} tone="info" />
      <Curve fn={(d) => (d >= 30 ? seconds(d) : NaN)} tone="info" dashed />
    </Plot2D>
  );
}

function VectorPlot() {
  const [v, setV] = useState<Point[]>([[3, 1], [1, 2]]);
  const [a, b] = v;
  const sum: Point = [a[0] + b[0], a[1] + b[1]];
  return (
    <Plot2D x={{ domain: [-1, 5] }} y={{ domain: [-1, 4] }} ariaLabel="Vector addition">
      <Polygon points={[[0, 0], a, sum, b]} tone="violet" dashed />
      <Arrow to={sum} tone="hi" label="a + b" />
      <Arrow to={a} tone="info" label="a" />
      <Arrow to={b} tone="ok" label="b" />
      <Points
        data={[{ x: a[0], y: a[1], tone: 'info' }, { x: b[0], y: b[1], tone: 'ok' }]}
        onDrag={(i, p) => setV((old) => old.map((q, k) => (k === i ? p : q)))}
        pointLabel={(i) => (i ? 'vector b' : 'vector a')}
      />
    </Plot2D>
  );
}

function RegionsPlot() {
  const [c, setC] = useState<Point[]>([[0.3, 0.35], [0.7, 0.65]]);
  const data = useMemo(() => {
    const rnd = mulberry32(11);
    return Array.from({ length: 40 }, (_, i) => {
      const blob = i % 2;
      const cx = blob ? 0.7 : 0.3;
      return { x: cx + (rnd() - 0.5) * 0.45, y: cx + (rnd() - 0.5) * 0.45, tone: blob ? ('violet' as const) : ('info' as const), hollow: i >= 30 };
    });
  }, []);
  const nearest = useCallback((x: number, y: number) => (Math.hypot(x - c[0][0], y - c[0][1]) <= Math.hypot(x - c[1][0], y - c[1][1]) ? 0 : 1), [c]);
  const region = useCallback((x: number, y: number) => ({ tone: nearest(x, y) ? ('violet' as const) : ('info' as const), intensity: 0.3 }), [nearest]);
  return (
    <Plot2D x={{ domain: [0, 1], label: 'feature 1' }} y={{ domain: [0, 1], label: 'feature 2' }} ariaLabel="Nearest-centroid regions">
      <Heat fn={region} resolution={48} />
      <Points data={data} r={3.5} />
      <Points
        data={c.map(([x, y], i) => ({ x, y, tone: i ? 'violet' : 'info' }))}
        r={6}
        onDrag={(i, p) => setC((old) => old.map((q, k) => (k === i ? p : q)))}
        pointLabel={(i) => `centroid ${i ? 'B' : 'A'}`}
      />
    </Plot2D>
  );
}

/** Accepts binary strings ending in 01. */
const DFA = {
  nodes: [
    { id: 'q0', label: 'q0', at: { x: 90, y: 90 } },
    { id: 'q1', label: 'q1', at: { x: 260, y: 170 } },
    { id: 'q2', label: 'q2', at: { x: 430, y: 90 }, accept: true },
  ],
  edges: [
    { from: 'q0', to: 'q0', label: '1' },
    { from: 'q0', to: 'q1', label: '0' },
    { from: 'q1', to: 'q1', label: '0' },
    { from: 'q1', to: 'q2', label: '1' },
    { from: 'q2', to: 'q1', label: '0' },
    { from: 'q2', to: 'q0', label: '1' },
  ],
};

function AutomatonDemo() {
  const input = '1001';
  const [pos, setPos] = useState(0);
  const states = [...input].reduce<string[]>((path, ch) => {
    const from = path[path.length - 1];
    return [...path, DFA.edges.find((e) => e.from === from && e.label === ch)!.to];
  }, ['q0']);
  const here = states[pos];
  const taken = pos > 0 ? { from: states[pos - 1], to: here, label: input[pos - 1] } : null;
  return (
    <div style={{ maxWidth: 500 }}>
      <GraphView
        nodes={DFA.nodes}
        edges={DFA.edges}
        directed
        width={500}
        height={220}
        startNode="q0"
        nodeMark={(id) => (id === here ? { tone: pos === input.length ? (DFA.nodes.find((n) => n.id === id)?.accept ? 'ok' : 'bad') : 'hi', fill: 'solid' } : null)}
        edgeMark={(e) => (taken && e.from === taken.from && e.to === taken.to && e.label === taken.label ? { tone: 'hi', width: 3.5 } : null)}
        ariaLabel="DFA for strings ending in 01"
      />
      <p className="muted">
        <Button onClick={() => setPos((p) => Math.min(input.length, p + 1))} disabled={pos >= input.length}>
          Read next symbol
        </Button>{' '}
        <Button onClick={() => setPos(0)}>Reset</Button> <span className="mono">{input.slice(0, pos)}<b>{input.slice(pos)}</b></span> · in {here}
      </p>
    </div>
  );
}

function LayeredDemo() {
  const tasks = ['parse', 'lex', 'types', 'lint', 'emit', 'bundle', 'test'];
  const deps: [string, string][] = [['lex', 'parse'], ['parse', 'types'], ['parse', 'lint'], ['types', 'emit'], ['emit', 'bundle'], ['types', 'test'], ['lint', 'test']];
  const [done, setDone] = useState<string[]>([]);
  const ready = (t: string) => !done.includes(t) && deps.every(([a, b]) => b !== t || done.includes(a));
  return (
    <div style={{ flex: '0 1 356px' }}>
      <GraphView
        nodes={tasks.map((t) => ({ id: t, label: t, shape: 'box' }))}
        edges={deps.map(([from, to]) => ({ from, to }))}
        directed
        layout="layered"
        spacing={{ direction: 'down', layerGap: 70, nodeGap: 100, padMain: 30, padCross: 54 }}
        box={{ w: 84, h: 34 }}
        edgeStyle="curve"
        arrowSize={5}
        nodeMark={(t) => (done.includes(t) ? { tone: 'ok', fill: 'tint' } : ready(t) ? { tone: 'hi', fill: 'tint' } : null)}
        onNodeClick={(t) => ready(t) && setDone((d) => [...d, t])}
        nodeAriaLabel={(t) => `${t}${done.includes(t) ? ', done' : ready(t) ? ', ready: press to run' : ', waiting'}`}
        ariaLabel="Build tasks"
      />
      <p className="muted">
        run the ready (yellow) tasks in any order · {done.length}/{tasks.length} <Button onClick={() => setDone([])}>Reset</Button>
      </p>
    </div>
  );
}

function CircleDemo() {
  const n = 6;
  const nodes = Array.from({ length: n }, (_, i) => ({ id: i, label: 'ABCDEF'[i] }));
  const edges = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [1, 4]].map(([from, to]) => ({ from, to, weight: from + to }));
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div style={{ flex: '0 1 300px' }}>
      <GraphView
        nodes={nodes}
        edges={edges}
        layout="circle"
        width={300}
        height={260}
        nodeColor={(id) => (id < 3 ? 'var(--info)' : 'var(--violet)')}
        edgeMark={(_, i) => (i === picked ? { tone: 'hi', width: 4 } : null)}
        onEdgeClick={(_, i) => setPicked(i)}
        onNodeClick={() => setPicked(null)}
        ariaLabel="Weighted graph on a circle"
      />
      <p className="muted">{picked === null ? 'click an edge (or Tab in, arrows, Enter)' : `edge ${'ABCDEF'[edges[picked].from]}—${'ABCDEF'[edges[picked].to]}, weight ${edges[picked].weight}`}</p>
    </div>
  );
}
