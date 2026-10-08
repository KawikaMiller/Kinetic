import { CodePanel } from '../../components/CodePanel';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import type { Engine, GraphRep, RecordGroup } from './engines';

/** The records a store holds, as chips: the ones a step reads or writes take its tone. */
export function RecordGrid({ groups, tones }: { groups: RecordGroup[]; tones: ReadonlyMap<string, Tone> }) {
  return (
    <div className="nm-groups">
      {groups.map((g) => (
        <div key={g.title} className="nm-group">
          <SectionTitle weight="regular" hint={`${g.items.length}`}><span className="keep-case">{g.title}</span></SectionTitle>
          <div className="nm-chips">
            {g.items.map((it) => {
              const t = tones.get(it.id);
              return <span key={it.id} className={`nm-rec ${t ? `tone-${t} is-lit` : ''}`} title={it.id}>{it.label}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** How one order is stored in this model; an embedded sub-document is tinted. */
export function StorageView({ engine, orderId }: { engine: Engine; orderId: number }) {
  const s = engine.storage(orderId);
  const embedded = new Set(s.embedded);
  return (
    <CodePanel
      title={`how order ${orderId} is stored`}
      lines={s.lines}
      gutter="none"
      className="nm-code"
      renderLine={(line, i) => (embedded.has(i) ? <span className="nm-embedded">{line}</span> : line)}
    />
  );
}

// ── The graph model, drawn ────────────────────────────────────────────

const GRAPH_W = 560;
const ROW = 28;
const GRAPH_TOP = 22;
const COL = { customer: 70, order: 280, product: 490 } as const;
const NODE_BOX = { w: 84, h: 22, rx: 6 };
const LABEL_PX = 11;
const GRAPH_MIN_W = minWidthForText(GRAPH_W, LABEL_PX);

export function GraphModel({ rep, tones, showBought }: { rep: GraphRep; tones: ReadonlyMap<string, Tone>; showBought: boolean }) {
  const orders = rep.nodes.filter((n) => n.kind === 'order');
  const height = GRAPH_TOP + orders.length * ROW;
  const orderY = new Map(orders.map((n, i) => [n.id, GRAPH_TOP + i * ROW]));
  const customers = rep.nodes.filter((n) => n.kind === 'customer');
  const products = rep.nodes.filter((n) => n.kind === 'product');
  const at = (n: (typeof rep.nodes)[number]) => {
    if (n.kind === 'order') return { x: COL.order, y: orderY.get(n.id)! };
    if (n.kind === 'customer') return { x: COL.customer, y: GRAPH_TOP + (customers.indexOf(n) + 0.5) * ((height - GRAPH_TOP) / customers.length) };
    return { x: COL.product, y: GRAPH_TOP + (products.indexOf(n) + 0.5) * ((height - GRAPH_TOP) / products.length) };
  };
  const nodes: GraphNode<string>[] = [...customers, ...orders, ...products].map((n) => ({ id: n.id, label: n.label, at: at(n), shape: 'box' }));
  const edges: GraphEdge<string>[] = rep.edges.filter((e) => showBought || e.kind !== 'BOUGHT').map((e) => ({ from: e.from, to: e.to }));
  const lit = (a: string, b: string) => tones.has(a) && tones.has(b);
  return (
    <WideRegion minWidth={GRAPH_MIN_W} label="Graph model: scroll sideways to see all of it">
      <GraphView
        nodes={nodes}
        edges={edges}
        directed
        width={GRAPH_W}
        height={height}
        box={NODE_BOX}
        nodeMark={(id) => {
          const t = tones.get(id);
          return t ? { tone: t, fill: t === 'hi' ? 'solid' : 'tint' } : null;
        }}
        edgeMark={(e) => {
          // A customer-to-product edge is the BOUGHT shortcut: orders are the only other way to reach a product.
          const bought = e.from.startsWith('c:') && e.to.startsWith('p:');
          if (bought) return lit(e.from, e.to) ? { tone: 'info', dashed: true, width: 2.5 } : { tone: 'violet', dashed: true, width: 1.5 };
          return lit(e.from, e.to) ? { tone: 'info', width: 2.5 } : null;
        }}
        className="nm-graph"
        ariaLabel="Graph model: customers place orders, orders contain products"
      />
    </WideRegion>
  );
}
