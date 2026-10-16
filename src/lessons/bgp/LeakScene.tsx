import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { AsMap } from './AsMap';
import { GRAPH, LEAKER, ORIGIN, asName, capacityOf, edgeId } from './asgraph';
import { finalRound, linkLoads, pathLinks, propagate } from './bgp';
import { leakIntro, pathText } from './captions';
import { baseConfig, initialLeak } from './init';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: "the link each AS sends through (its chosen next hop)" },
      { color: 'var(--bad)', label: 'a link carrying more flows than it fits' },
      { color: 'var(--violet)', label: 'solid link: customer to provider (arrow at the provider); dashed link: peers', shape: 'line' },
    ]}
  />
);

export function LeakScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialLeak);
  const run = useMemo(() => propagate(baseConfig({ policy: st.policy })), [st.policy]);
  const last = finalRound(run);
  const loads = linkLoads({ graph: GRAPH }, last.best);
  const tree = new Set(GRAPH.ases.flatMap((a) => pathLinks(a, last.best[a]).slice(0, 1)).map(([x, y]) => edgeId(x, y)));
  const thin = GRAPH.edges.filter((e) => e.a === LEAKER || e.b === LEAKER);
  const over = new Set(thin.filter((e) => (loads.get(edgeId(e.a, e.b)) ?? 0) > capacityOf(e.a, e.b)).map((e) => edgeId(e.a, e.b)));
  const flows = thin.reduce((n, e) => n + (loads.get(edgeId(e.a, e.b)) ?? 0), 0);

  return (
    <StageFrame
      height={600}
      legend={LEGEND}
      intro={leakIntro(st.policy, last.best)}
      introKey={st.policy}
      stats={
        <Stats>
          <Stat label={`${asName(64499)} sends through`} value={last.best[64499] ? asName(last.best[64499]!.path[0]) : 'nobody'} sub={`AS_PATH ${pathText(last.best[64499]?.path ?? [])}`} />
          <Stat label={`Flows over ${asName(LEAKER)}'s links`} value={flows} color={over.size > 0 ? 'var(--bad)' : undefined} sub="one flow per AS toward the prefix, counted on the two thin access links" />
          <Stat label="Thin links over capacity" value={over.size} color={over.size > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${thin.length}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Export policy" value={st.policy === 'leak'} off="valley-free (everyone)" on={`leak: ${asName(LEAKER)} exports everything`} onChange={(on) => setSt({ policy: on ? 'leak' : 'valley-free' })} />
          <Button onClick={() => setSt(initialLeak())}>Reset</Button>
        </>,
      ]}
    >
      <div className="bgp-stage stage-pad">
        <Box>
          <SectionTitle hint={`${asName(ORIGIN)}'s prefix; ${asName(LEAKER)} is the small AS with two providers`}>Who sends through whom</SectionTitle>
          <AsMap
            edgeMark={(e) => {
              const id = edgeId(e.a, e.b);
              if (over.has(id)) return { tone: 'bad', dashed: e.kind === 'p2p', width: 5 };
              if (tree.has(id)) return { tone: 'hi', dashed: e.kind === 'p2p', width: 5 };
              return null;
            }}
            nodeMark={(a) => (a === LEAKER ? { tone: 'violet', fill: 'tint' } : a === ORIGIN ? { tone: 'ok', fill: 'solid' } : null)}
            ariaLabel="Chosen next hops toward the prefix; the two thin access links of the small multihomed AS are marked when overloaded"
          />
        </Box>
        <Box>
          <SectionTitle hint="a flow is one AS's traffic toward the prefix; capacities are made up">The two thin access links</SectionTitle>
          <div className="bgp-bars">
            {thin.map((e) => {
              const id = edgeId(e.a, e.b);
              const load = loads.get(id) ?? 0;
              const cap = capacityOf(e.a, e.b);
              return (
                <div key={id} className="bgp-bar-row">
                  <span className="bgp-bar-name">
                    {e.a} to {e.b}
                  </span>
                  <Bar value={Math.min(load, cap)} max={cap} tone={load > cap ? 'bad' : 'ok'} ariaLabel={`${load} flows on a link that carries ${cap}`} />
                  <span className={load > cap ? 'bgp-bar-text is-over' : 'bgp-bar-text'}>
                    {load} {load === 1 ? 'flow' : 'flows'} on a link that carries {cap}
                  </span>
                </div>
              );
            })}
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">eight made-up ASes; no real incident is modelled or named</Provenance>
          <Provenance kind="illustrative">link capacities and one flow per AS are made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
