import { useState, type ReactNode } from 'react';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { initialMap, mapCaption, radiusRows, setsText, type MapState } from './init';
import { DEFAULT_FALLBACKS, EDGES, SERVICES, checkoutWorks, downSet, type Edge, type Service } from './model';

const NODES = SERVICES.map((id) => ({ id, shape: 'box' as const }));
const GRAPH_MIN_WIDTH = 460;
const GRAPH_EDGES = EDGES.map((e) => ({ from: e.from, to: e.to }));

const legend = (
  <Legend
    items={[
      { color: 'var(--orange)', label: 'the service you killed (a labelled actor)' },
      { color: 'var(--bad)', label: 'a service in the blast radius' },
      { color: 'var(--ok)', label: 'a soft edge with a fallback (dashed)', shape: 'line' },
      { color: 'var(--bad)', label: 'a soft edge with no fallback (dashed)', shape: 'line' },
      { color: 'var(--dim)', label: 'a hard edge (solid)', shape: 'line' },
    ]}
  />
);

export function MapScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<MapState>(initialMap);
  const down = m.killed === null ? new Set<Service>() : downSet([m.killed], m.fallbacks);
  const works = checkoutWorks(down);
  const edgeAt = (i: number): Edge => EDGES[i];
  const nodeMark = (id: Service): GraphNodeMark | null => (id === m.killed ? { tone: 'orange', fill: 'solid' } : down.has(id) ? { tone: 'bad', fill: 'tint' } : null);
  const edgeMark = (_e: unknown, i: number): GraphEdgeMark => {
    const e = edgeAt(i);
    if (!e.soft) return { tone: 'dim' };
    return { tone: m.fallbacks[e.to as 'recs' | 'cache'] ? 'ok' : 'bad', dashed: true };
  };
  const rows = radiusRows(m.fallbacks);

  return (
    <StageFrame
      height={440}
      intro={mapCaption(m)}
      introKey={`${m.killed}|${m.fallbacks.recs}|${m.fallbacks.cache}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Services down" value={m.killed === null ? '–' : `${down.size} of ${SERVICES.length}`} color={down.size > 0 ? 'var(--bad)' : undefined} sub="the fixed point of the dependency rules" />
          <Stat label="Checkout success" value={m.killed === null ? '–' : works ? '100%' : '0%'} color={m.killed === null ? undefined : works ? 'var(--ok)' : 'var(--bad)'} sub="binary in this view: web is up or it is not" />
          <Stat label="Fault sets that leave checkout working" value={setsText(m.fallbacks)} sub="exhaustive: every subset of the seven services" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="recs fallback" value={m.fallbacks.recs} onChange={(recs) => setM((x) => ({ ...x, fallbacks: { ...x.fallbacks, recs } }))} off="None (the flaw)" on="Has a fallback" />
          <Toggle label="cache fallback" value={m.fallbacks.cache} onChange={(cache) => setM((x) => ({ ...x, fallbacks: { ...x.fallbacks, cache } }))} off="None" on="Falls through to db" />
          <Button onClick={() => setM({ ...initialMap(), fallbacks: { ...DEFAULT_FALLBACKS } })}>Reset</Button>
        </>,
      ]}
    >
      <div className="ce-stage stage-pad">
        <Box>
          <SectionTitle hint="click a service to kill all four of its instances; arrows point at what a service depends on">The checkout path</SectionTitle>
          <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Dependency graph: scroll sideways to see all of it">
            <GraphView
              nodes={NODES}
              edges={GRAPH_EDGES}
              directed
              layout="layered"
              box={{ w: 92, h: 40 }}
              spacing={{ layerGap: 130, nodeGap: 54 }}
              nodeMark={nodeMark}
              edgeMark={edgeMark}
              onNodeClick={(id) => setM((x) => ({ ...x, killed: x.killed === id ? null : id }))}
              nodeAriaLabel={(id) => `${id}${id === m.killed ? ', killed' : down.has(id) ? ', down' : ''}`}
              ariaLabel="Seven services and their dependencies: web, api, auth, catalog, db, cache and recs"
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="killing each service in turn, with the fallbacks as set above">Blast radius of each service</SectionTitle>
          <table className="data-table ce-table">
            <thead>
              <tr><th>Service killed</th><th>Services down</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.service} className={r.service === m.killed ? 'is-picked' : ''}>
                  <th scope="row" className="keep-case">{r.service}</th>
                  <td>{r.radius} of {SERVICES.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a made-up seven-service system: instances are interchangeable, with no retries, no health-check ejection and no queueing</Provenance>
          <Provenance kind="illustrative">which edges are soft and which have fallbacks is chosen to show the flaw</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
