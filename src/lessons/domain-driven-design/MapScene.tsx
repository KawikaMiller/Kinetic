import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphEdgeMark, type GraphNode } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { mapCaption } from './captions';
import {
  ALL_IN_ONE, CONTEXTS, CUSTOMER_MEANINGS, IDENTITY_KEY, NODE_BOX, PARTS, RELATIONSHIPS, REGION, START_STATE, SUGGESTED, VIEW, contextOf, identityLinks, layout,
  patternCost, regionX, resolveEdges, statsOf, type ConceptId, type Context, type EdgeKind, type MapState, type NodeId,
} from './contextMap';

const MAP_MIN_WIDTH = 560;
const CONTEXT_TONE: Record<Context, Tone> = { billing: 'amber', fulfilment: 'sky', support: 'pink' };
const EDGE_WIDTH = { base: 1.5, perWeight: 0.5 } as const;
const IDENTITY_EDGE_WIDTH = 1.5;
const KIND_TONE: Record<EdgeKind, GraphEdgeMark['tone'] | null> = { pending: null, inside: 'ok', raw: 'bad', internals: 'orange', translated: 'violet' };
const KIND_WORD: Record<EdgeKind, string> = {
  pending: 'not placed yet',
  inside: 'inside one context',
  raw: 'crosses a boundary',
  internals: 'crosses a boundary by reaching into the other side\'s own objects: direct dependence on another context\'s internals',
  translated: 'crosses a boundary through the customer id, translated',
};
const isPart = (n: NodeId) => (PARTS as readonly string[]).includes(n);

type Selection = { kind: 'node'; id: NodeId } | { kind: 'edge'; index: number } | null;

export function MapScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [state, setState] = useState<MapState>(START_STATE);
  const [selected, setSelected] = useState<Selection>(null);

  const stats = statsOf(state);
  const resolved = useMemo(() => resolveEdges(state), [state]);
  const nodes = useMemo(() => layout(state), [state]);
  const caption = useMemo(() => mapCaption(state), [state]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const assign = (id: ConceptId, ctx: Context | null) =>
    setState((s) => {
      const next = { ...s.assign };
      if (ctx) next[id] = ctx;
      else delete next[id];
      return { ...s, assign: next };
    });
  const onKey = (e: KeyboardEvent) => {
    if (selected?.kind !== 'node' || isPart(selected.id)) return;
    const ctx = CONTEXTS.find((c) => c.key === e.key);
    if (ctx) assign(selected.id as ConceptId, ctx.id);
    else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') assign(selected.id as ConceptId, null);
    else return;
    e.preventDefault();
  };

  const graphNodes: GraphNode<NodeId>[] = nodes.map((n) => ({ id: n.id, label: n.id, at: n.at, shape: 'box' }));
  const graphEdges: GraphEdge<NodeId>[] = [
    ...resolved.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.kind === 'translated' && !state.patterns[e.index] ? 'translated' : state.patterns[e.index] ? RELATIONSHIPS.find((r) => r.id === state.patterns[e.index])!.label : undefined,
    })),
    ...identityLinks(state).map(([a, b]) => ({ from: a, to: b, label: IDENTITY_KEY })),
  ];
  const edgeMark = (_: GraphEdge<NodeId>, index: number): GraphEdgeMark | null => {
    if (index >= resolved.length) return { tone: 'dim', dashed: true, width: IDENTITY_EDGE_WIDTH };
    const e = resolved[index];
    const tone = KIND_TONE[e.kind];
    const picked = selected?.kind === 'edge' && selected.index === index;
    return { tone: picked ? 'hi' : (tone ?? 'dim'), dashed: e.kind === 'translated', width: EDGE_WIDTH.base + e.weight * EDGE_WIDTH.perWeight };
  };

  const pickedEdge = selected?.kind === 'edge' ? resolved[selected.index] : null;
  const selectedConcept = selected?.kind === 'node' && !isPart(selected.id) ? (selected.id as ConceptId) : null;
  const pooled = nodes.some((n) => !contextOf(n.id, state.assign));

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            ...CONTEXTS.map((c) => ({ color: `var(--${CONTEXT_TONE[c.id]})`, label: c.label })),
            { color: 'var(--ok)', label: 'edge inside a context' },
            { color: 'var(--bad)', label: 'crosses, keeps an id' },
            { color: 'var(--orange)', label: 'reaches into another context\'s objects' },
            { color: 'var(--violet)', label: 'translated, dashed' },
            { color: 'var(--muted)', label: 'not placed' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Crossing a boundary" value={stats.crossing} color={stats.crossing ? 'var(--bad)' : 'var(--ok)'} sub={[`${stats.raw} raw`, `${stats.translated} translated`]} />
          <Stat label="Inside a context" value={stats.cohesion === null ? '–' : `${Math.round(stats.cohesion * 100)}%`} sub={`${stats.inside} of ${stats.placed} placed edges`} />
          <Stat label="One name, several meanings" value={stats.unsplitMeanings.length ? stats.unsplitMeanings.join(', ') : 'none'} color={stats.unsplitMeanings.length ? 'var(--orange)' : 'var(--ok)'} />
          <Stat label="Relationship upkeep, invented" value={patternCost(state.patterns)} sub={`${Object.keys(state.patterns).length} edges labelled`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <div className="ddd-chips" role="group" aria-label="Starting points">
            <ChipButton tone="info" onClick={() => { setState((s) => ({ ...s, assign: SUGGESTED })); }}>Suggested placement</ChipButton>
            <ChipButton tone="info" onClick={() => { setState((s) => ({ ...s, assign: ALL_IN_ONE })); }}>Everything in one context</ChipButton>
            <ChipButton tone="info" onClick={() => { setState(START_STATE); setSelected(null); }}>Clear</ChipButton>
          </div>
          <Toggle label="Customer" value={state.split} onChange={(split) => setState((s) => ({ ...s, split }))} off="one shared model" on="split into three" />
        </>,
        <div key="assign" className="ddd-chips" role="group" aria-label="Put the selected concept in a context">
          {CONTEXTS.map((c) => (
            <ChipButton key={c.id} tone={CONTEXT_TONE[c.id]} disabled={!selectedConcept} onClick={() => selectedConcept && assign(selectedConcept, c.id)}>{`${c.key} ${c.label}`}</ChipButton>
          ))}
          <ChipButton tone="dim" disabled={!selectedConcept} onClick={() => selectedConcept && assign(selectedConcept, null)}>0 Unplace</ChipButton>
        </div>,
        pickedEdge && pickedEdge.kind !== 'inside' && pickedEdge.kind !== 'pending' ? (
          <div key="pattern" className="ddd-chips" role="group" aria-label="Relationship pattern for the selected edge">
            {RELATIONSHIPS.map((r) => (
              <ChipButton
                key={r.id}
                tone="violet"
                on={state.patterns[pickedEdge.index] === r.id}
                onClick={() => setState((s) => ({ ...s, patterns: { ...s.patterns, [pickedEdge.index]: r.id } }))}
              >
                {r.label}
              </ChipButton>
            ))}
          </div>
        ) : (
          <p key="pattern-hint" className="ddd-hint muted">Select a crossing edge to give it a relationship pattern.</p>
        ),
      ]}
    >
      <div className="stage-pad ddd">
        <div onKeyDown={onKey}>
          <WideRegion minWidth={MAP_MIN_WIDTH} label="Context map: scroll sideways to see all of it">
            <GraphView
              nodes={graphNodes}
              edges={graphEdges}
              layout="fixed"
              width={VIEW.width}
              height={VIEW.height}
              box={NODE_BOX}
              labelHalo
              underlay={
                <>
                  {CONTEXTS.map((c) => (
                    <g key={c.id} className={`ddd-region tone-${CONTEXT_TONE[c.id]}`}>
                      <rect x={regionX(c.id)} y={REGION.top} width={REGION.width} height={REGION.bottom - REGION.top} rx={12} className="ddd-region-box" />
                      <text x={regionX(c.id) + 12} y={REGION.top + 20} className="ddd-region-name">{c.label}</text>
                    </g>
                  ))}
                  {pooled && <text x={12} y={16} className="ddd-pool-name">Not placed yet</text>}
                </>
              }
              nodeMark={(id) => {
                if (selected?.kind === 'node' && selected.id === id) return { tone: 'hi', fill: 'solid' };
                const ctx = contextOf(id, state.assign);
                return { tone: ctx ? CONTEXT_TONE[ctx] : 'muted', fill: 'tint' };
              }}
              edgeMark={edgeMark}
              onNodeClick={(id) => setSelected({ kind: 'node', id })}
              onEdgeClick={(_, index) => index < resolved.length && setSelected({ kind: 'edge', index })}
              nodeAriaLabel={(id) => `${id}, ${contextOf(id, state.assign) ?? 'not placed'}`}
              edgeAriaLabel={(_, index) => (index < resolved.length ? `${resolved[index].from} to ${resolved[index].to}: ${KIND_WORD[resolved[index].kind]}` : 'customer id link')}
              ariaLabel="Nine concepts of a shop, the usage between them, and the context each is placed in"
            />
          </WideRegion>
        </div>

        <Box className="ddd-card">
          <SectionTitle weight="regular" hint="select a concept or an edge">What you selected</SectionTitle>
          {selected === null && <p className="muted">Click a concept (or reach it with the arrow keys) and press 1, 2 or 3 to place it. Click an edge to see what it is.</p>}
          {selected?.kind === 'node' && (
            <>
              <p><b>{selected.id}</b>: {contextOf(selected.id, state.assign) ? `in ${CONTEXTS.find((c) => c.id === contextOf(selected.id, state.assign))!.label}` : 'not placed yet'}.</p>
              {selected.id === 'Customer' && !state.split && (
                <ul className="ddd-meanings">{PARTS.map((p) => <li key={p}>{CUSTOMER_MEANINGS[p]}</li>)}</ul>
              )}
              {isPart(selected.id) && <p className="muted">{CUSTOMER_MEANINGS[selected.id as keyof typeof CUSTOMER_MEANINGS]}. It shares only the customer id with the other two.</p>}
            </>
          )}
          {pickedEdge && (
            <>
              <p><b>{pickedEdge.from} and {pickedEdge.to}</b> (used {pickedEdge.weight} on a scale of 5): {KIND_WORD[pickedEdge.kind]}.</p>
              {state.patterns[pickedEdge.index] && <p className="muted">{RELATIONSHIPS.find((r) => r.id === state.patterns[pickedEdge.index])!.consequence}</p>}
            </>
          )}
        </Box>
        <div className="ddd-chips">
          <Provenance kind="illustrative">an invented shop and a toy map</Provenance>
          <Provenance kind="from-memory">the relationship patterns are recalled from Evans, 2003; check the book</Provenance>
        </div>
        <Hint block>
          The suggested placement is one reasonable answer, not the answer: it has the fewest edges crossing a boundary under the rule that each context holds two to five of the other concepts. Dragging has a keyboard twin: select, then press 1 to 3.
        </Hint>
      </div>
    </StageFrame>
  );
}
