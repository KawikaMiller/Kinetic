import { useMemo, useState, type CSSProperties } from 'react';
import { ClassifyBoard, type ClassifyCategory, type ClassifyItem } from '../components/ClassifyBoard';
import { SectionTitle } from '../components/Panel';
import { Button, Segmented } from '../components/ui';
import { allSorted, emptyClassify, placementsByCategory } from '../core/classify';
import { autoStep, clauseStatus, clauseText, startDpll, variableName, type Cnf, type Heuristic, type SatEvent } from '../core/sat';
import { christofidesTour, distanceMatrix, doubleTreeTour, heldKarp, primMst, type Point } from '../core/tsp';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 4 kickoff kit, agent C (#/dev/kit): core/sat, core/tsp and ClassifyBoard explore mode. */

// ── core/sat: the DPLL trace, one step at a time ────────────────────────

/** The sat-solvers spec's F2 over a to e. */
const F2: Cnf = { vars: 5, names: ['a', 'b', 'c', 'd', 'e'], clauses: [[-1, 2], [-2, 3], [-3, 4], [-4, -1], [1, 5], [-5, -2]] };
const HEURISTICS = [{ value: 'first' as Heuristic, label: 'First unassigned' }, { value: 'most-occurring' as Heuristic, label: 'Most occurring' }];
const STATUS_COLOUR = { satisfied: 'var(--ok)', falsified: 'var(--bad)', unit: 'var(--hi)', open: 'var(--muted)' } as const;

function describeEvent(cnf: Cnf, e: SatEvent): string {
  switch (e.kind) {
    case 'decide': return `${e.flipped ? 'flip' : 'decide'} ${variableName(cnf, e.var)} = ${e.value ? 'T' : 'F'}`;
    case 'propagate': return `clause ${e.clause + 1} forces ${variableName(cnf, e.var)} = ${e.value ? 'T' : 'F'}`;
    case 'conflict': return `clause ${e.clause + 1} ${clauseText(cnf, cnf.clauses[e.clause])} is falsified`;
    case 'backtrack': return `backtrack to ${variableName(cnf, e.var)}`;
    case 'sat': return `satisfied: ${e.model.map((b, i) => `${variableName(cnf, i + 1)}=${b ? 'T' : 'F'}`).join(' ')}`;
    case 'unsat': return 'unsatisfiable';
  }
}

function DpllDemo() {
  const [heuristic, setHeuristic] = useState<Heuristic>('first');
  const [steps, setSteps] = useState(0);
  const state = useMemo(() => {
    let s = startDpll(F2);
    for (let i = 0; i < steps && s.outcome === 'running'; i++) s = autoStep(s, heuristic);
    return s;
  }, [heuristic, steps]);
  return (
    <>
      <div className="controls">
        <Segmented ariaLabel="Branching rule" options={HEURISTICS} value={heuristic} onChange={(h) => { setHeuristic(h); setSteps(0); }} />
        <Button variant="primary" onClick={() => setSteps(steps + 1)} softDisabled={state.outcome !== 'running'}>Step</Button>
        <Button onClick={() => setSteps(0)}>Reset</Button>
      </div>
      <div className="controls">
        {F2.clauses.map((c, i) => {
          const { status } = clauseStatus(c, state.values);
          return <span key={i} className="chip" style={{ '--c': STATUS_COLOUR[status] } as CSSProperties}>{clauseText(F2, c)}</span>;
        })}
      </div>
      <p className="mono">{state.stats.branches} branches · {state.stats.propagations} propagations · {state.stats.conflicts} conflicts · {state.outcome}</p>
      <ol className="mono">{state.trace.map((e, i) => <li key={i}>{describeEvent(F2, e)}</li>)}</ol>
    </>
  );
}

// ── core/tsp: the spec's 7-point map and three tours ─────────────────────

const M7: Point[] = [
  { x: 1.4, y: 7.2 }, { x: 10, y: 5 }, { x: 6.2, y: 3.2 }, { x: 8.8, y: 0.7 }, { x: 8.1, y: 8.6 }, { x: 6.8, y: 8.7 }, { x: 4.2, y: 2.4 },
];
type TourKind = 'mst' | 'doubling' | 'christofides' | 'optimum';
const TOURS = [
  { value: 'mst' as TourKind, label: 'Spanning tree' },
  { value: 'doubling' as TourKind, label: 'Doubling' },
  { value: 'christofides' as TourKind, label: 'Christofides' },
  { value: 'optimum' as TourKind, label: 'Optimum' },
];
const MAP_W = 340;
const MAP_H = 220;
const MAP_PAD = 24;

function TourDemo() {
  const [kind, setKind] = useState<TourKind>('christofides');
  const model = useMemo(() => {
    const dist = distanceMatrix(M7);
    const mst = primMst(dist);
    const optimum = heldKarp(dist);
    return { mst, doubling: doubleTreeTour(dist), christofides: christofidesTour(dist), optimum };
  }, []);
  const project = (p: Point) => ({ x: MAP_PAD + (p.x / 11) * (MAP_W - 2 * MAP_PAD), y: MAP_H - MAP_PAD - (p.y / 10) * (MAP_H - 2 * MAP_PAD) });
  const edges: readonly (readonly [number, number])[] = kind === 'mst'
    ? model.mst.edges
    : model[kind].tour.map((v, i, tour) => [v, tour[(i + 1) % tour.length]] as const);
  const length = kind === 'mst' ? model.mst.weight : model[kind].length;
  return (
    <>
      <Segmented ariaLabel="Which tour to draw" options={TOURS} value={kind} onChange={setKind} />
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" style={{ maxWidth: MAP_W }} role="img" aria-label={`The 7-point map with the ${kind} drawn`}>
        {edges.map(([a, b]) => {
          const [pa, pb] = [project(M7[a]), project(M7[b])];
          return <line key={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={kind === 'optimum' ? 'var(--ok)' : 'var(--info)'} strokeWidth={2} />;
        })}
        {M7.map((p, i) => {
          const q = project(p);
          return (
            <g key={i}>
              <circle cx={q.x} cy={q.y} r={9} fill="var(--panel)" stroke="var(--hi)" strokeWidth={1.5} />
              <text x={q.x} y={q.y + 4} textAnchor="middle" fontSize={11} fill="var(--text)">{i}</text>
            </g>
          );
        })}
      </svg>
      <p className="mono">
        {kind === 'mst' ? 'tree weight' : `${kind} tour`} {length.toFixed(4)} · optimum {model.optimum.length.toFixed(4)} · ratio {(length / model.optimum.length).toFixed(4)}
        {kind === 'christofides' ? ` · circuit ${model.christofides.circuit.join(' ')}` : ''}
      </p>
    </>
  );
}

// ── ClassifyBoard explore mode ──────────────────────────────────────────

const STAGES: ClassifyCategory[] = [
  { id: 'genesis', label: 'Genesis' },
  { id: 'custom', label: 'Custom-built' },
  { id: 'product', label: 'Product' },
  { id: 'commodity', label: 'Commodity' },
];
const COMPONENTS: ClassifyItem[] = [
  { id: 'email', label: 'Email delivery', explanation: 'An invented component: nothing here is a claim about a real product.' },
  { id: 'search', label: 'Search' },
  { id: 'engine', label: 'The scheduling engine' },
];
const REFERENCE = { email: 'commodity', search: 'product', engine: 'custom' };

function ExploreDemo() {
  const [board, setBoard] = useState(() => emptyClassify(COMPONENTS));
  const groups = placementsByCategory(COMPONENTS, STAGES, board.answers);
  return (
    <>
      <ClassifyBoard mode="explore" items={COMPONENTS} categories={STAGES} reference={REFERENCE} value={board} onChange={setBoard} />
      <p className="mono">
        {STAGES.map((s) => `${s.label}: ${groups[s.id].join(', ') || 'none'}`).join(' · ')}
        {allSorted(COMPONENTS, board.answers) ? ' · all placed' : ''}
      </p>
    </>
  );
}

export function DevKitTier4a() {
  return (
    <>
      <SectionTitle>Tier 4 kit · kickoff round, agent C</SectionTitle>
      <Section title="core/sat · DPLL on the sat-solvers formula F2, one step at a time: clause chips are satisfied (ok), unit (hi), falsified (bad), open (muted)">
        <DpllDemo />
      </Section>
      <Section title="core/tsp · the 7-point map: spanning tree, MST doubling, Christofides (pinned Euler tie-break) and the Held-Karp optimum">
        <TourDemo />
      </Section>
      <Section title="ClassifyBoard mode=explore · no key, no score, no verdict; a reference opens only after every item is placed">
        <ExploreDemo />
      </Section>
    </>
  );
}
