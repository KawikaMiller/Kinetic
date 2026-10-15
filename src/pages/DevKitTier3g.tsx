import { SectionTitle } from '../components/Panel';
import { Button, Hint } from '../components/ui';
import { canonicalCodes, kraftSum } from '../core/huffman';
import { eigen2x2, powerIteration, svdSmall } from '../core/linalg';
import { condense, stronglyConnectedComponents, type Arc } from '../core/scc';
import type { Result } from '../core/result';
import { useGraphEdits } from '../core/useGraphEdits';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 3 to 4, agent G (#/dev/kit). */

const SYMMETRIC = [[2, 1], [1, 2]];
const ROTATION = [[0, -1], [1, 0]];
const SHEAR = [[1, 1], [0, 1]];
const STRIPES = [[1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 1, 0]];
const RFC_LENGTHS = [3, 3, 3, 3, 3, 2, 4, 4];
const MAX_EDGES = 4;
const CHAIN_NODES = 5;
/** A small chain: 0 and 1 leak into the closed class {2, 3}; 4 is absorbing. */
const CHAIN_EDGES: Arc[] = [[0, 1], [1, 0], [1, 2], [2, 3], [3, 2], [0, 4], [4, 4]];
const POWER_STEPS = 5;
const DIGITS = 3;

const show = (xs: readonly number[]) => `(${xs.map((x) => x.toFixed(DIGITS)).join(', ')})`;

function LinalgDemo() {
  const power = powerIteration(SYMMETRIC, { iters: POWER_STEPS, start: [1, 0] });
  const eigen = eigen2x2(SYMMETRIC);
  const rotation = eigen2x2(ROTATION);
  return (
    <>
      <p className="mono">power iteration on [[2,1],[1,2]] from (1, 0): {power.map((p) => show(p.v)).join(' → ')} · lambda {power.at(-1)!.lambda.toFixed(DIGITS)}</p>
      <p className="mono">eigen2x2 symmetric: {eigen?.kind === 'real' ? `${eigen.values.join(' and ')}, first vector ${show(eigen.vectors[0])}` : 'n/a'}</p>
      <p className="mono">eigen2x2 rotation: {rotation?.kind === 'complex' ? `${rotation.values[0].re} ± ${rotation.values[0].im}i` : 'n/a'} · shear: {eigen2x2(SHEAR) === null ? 'null (defective)' : 'found'}</p>
      <p className="mono">svdSmall of the 4 x 4 stripes image: singular values {show(svdSmall(STRIPES).s)}</p>
    </>
  );
}

function HuffmanDemo() {
  const codes = canonicalCodes(RFC_LENGTHS);
  return (
    <p className="mono">
      lengths {RFC_LENGTHS.join(',')} for A..H, Kraft sum {kraftSum(RFC_LENGTHS)} → {codes.map((c, i) => `${String.fromCharCode(65 + i)}=${c}`).join(' ')}
    </p>
  );
}

interface EdgeList {
  edges: string[];
}
const EDGE_PRESETS = [
  { id: 'path', label: 'a path', edges: ['a-b', 'b-c'] },
  { id: 'star', label: 'a star', edges: ['a-b', 'a-c', 'a-d'] },
] as const;
type EdgePresetId = (typeof EDGE_PRESETS)[number]['id'];
const NEXT_EDGES = ['c-d', 'a-d', 'b-d'];

function addNextEdge(g: EdgeList): Result<EdgeList> {
  if (g.edges.length >= MAX_EDGES) return { ok: false, error: `At most ${MAX_EDGES} edges here: the drawing stays readable.` };
  const edge = NEXT_EDGES.find((e) => !g.edges.includes(e));
  return edge ? { ok: true, value: { edges: [...g.edges, edge] } } : { ok: false, error: 'Every edge already exists.' };
}

function SccDemo() {
  const { components, comp } = stronglyConnectedComponents(CHAIN_NODES, CHAIN_EDGES);
  const leaving = condense(CHAIN_EDGES, comp, components.length).edges;
  const closed = components.filter((_, i) => !leaving.some(([from]) => from === i));
  return (
    <p className="mono">
      classes {components.map((c) => `{${c.join(',')}}`).join(' ')} · closed (nothing leaves): {closed.map((c) => `{${c.join(',')}}`).join(' ')}
    </p>
  );
}

function GraphEditsDemo() {
  const edits = useGraphEdits<EdgeList, EdgePresetId>({
    presets: EDGE_PRESETS,
    initial: 'path',
    graphOf: (id) => ({ edges: [...EDGE_PRESETS.find((p) => p.id === id)!.edges] }),
    edgeCount: (g) => g.edges.length,
  });
  return (
    <div className="devkit-row">
      {EDGE_PRESETS.map((p) => (
        <Button key={p.id} onClick={() => edits.load(p.id)}>Load {p.label}</Button>
      ))}
      <Button onClick={() => edits.edit(addNextEdge(edits.graph), (g) => `Added ${g.edges[g.edges.length - 1]}.`)}>Add an edge</Button>
      <Button onClick={() => edits.undoAdded((g, keep) => ({ edges: g.edges.slice(0, Math.max(keep, g.edges.length - 1)) }), 'Removed the last edge you added.')} disabled={edits.added === 0}>Undo</Button>
      <span className="mono">{edits.graph.edges.join(' ')} · {edits.added} added</span>
      <Hint tone="muted">{edits.note || 'Add edges until the bound refuses; Undo never removes a preset edge.'}</Hint>
    </div>
  );
}

export function DevKitTier3g() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 3 to 4 round, agent G</SectionTitle>
      <Section title="core/linalg · power iteration with every iterate, closed-form 2 x 2 eigen (real, complex, defective), small SVD">
        <LinalgDemo />
      </Section>
      <Section title="core/huffman · canonical codes from code lengths (the RFC 1951 example)">
        <HuffmanDemo />
      </Section>
      <Section title="core/useGraphEdits · preset load, an edit that is refused at the bound, undo of added edges only">
        <GraphEditsDemo />
      </Section>
      <Section title="core/scc · components of a small chain and the closed classes (what a Markov chain settles into)">
        <SccDemo />
      </Section>
    </>
  );
}
