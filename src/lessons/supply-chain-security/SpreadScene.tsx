import { useMemo, useState, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { POLICY_LABEL, spreadCaption, spreadNumbers } from './captions';
import { ancestorsOf } from './graph';
import { INSTALL_DAY, initialSpread } from './opening';
import { ALL_NODES, COMPROMISED_PACKAGE, COMPROMISED_VERSION, PACKAGE_NAMES, SERVICE_NAMES, edges } from './registry';
import { adjacency, type Policy } from './resolve';

const GRAPH_MIN_WIDTH = 640;
const BOX = { w: 88, h: 28 } as const;
const SPACING = { direction: 'right', layerGap: 104, nodeGap: 38, padMain: 54, padCross: 26 } as const;
const POLICIES: { value: Policy; label: string }[] = [
  { value: 'ranges', label: POLICY_LABEL.ranges },
  { value: 'lockfile', label: POLICY_LABEL.lockfile },
  { value: 'exact', label: POLICY_LABEL.exact },
];

/** Scene 1: a compromised release at the bottom of the tree, and who picks it up under each policy. */
export function SpreadScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialSpread);
  const { policy, lockWhen } = state;
  const { installs, affected } = spreadNumbers(policy, lockWhen);
  const chain = useMemo(() => new Set([COMPROMISED_PACKAGE, ...ancestorsOf(adjacency(), COMPROMISED_PACKAGE)]), []);
  const nodes = useMemo<GraphNode<string>[]>(() => ALL_NODES.map((id) => ({ id, label: id, shape: 'box' })), []);
  const links = useMemo<GraphEdge<string>[]>(() => edges().map((e) => ({ from: e.from, to: e.to })), []);
  const hit = new Set([...affected.services, ...affected.packages]);

  return (
    <StageFrame
      height={470}
      intro={spreadCaption(policy, lockWhen)}
      introKey={[policy, lockWhen]}
      stats={
        <Stats>
          <Stat label="Services affected" value={`${affected.services.length} of ${SERVICE_NAMES.length}`} color={affected.services.length ? 'var(--bad)' : 'var(--ok)'} sub={`install on day ${INSTALL_DAY}`} />
          <Stat label="Packages affected" value={`${affected.packages.length} of ${PACKAGE_NAMES.length}`} color={affected.packages.length ? 'var(--bad)' : 'var(--ok)'} sub={`run ${COMPROMISED_PACKAGE}@${COMPROMISED_VERSION} or depend on it`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: `runs ${COMPROMISED_PACKAGE}@${COMPROMISED_VERSION}`, shape: 'square' },
            { color: 'var(--ok)', label: 'depends on it, but held back', shape: 'square' },
            { color: 'var(--dim)', label: 'does not depend on it', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<Policy> label="Policy" value={policy} onChange={(v) => setState((s) => ({ ...s, policy: v }))} options={POLICIES} />
          <Toggle label="Lockfile written" value={lockWhen === 'after'} onChange={(v) => setState((s) => ({ ...s, lockWhen: v ? 'after' : 'before' }))} off="Before the bad release" on="After it" />
          <Hint tone="muted">used by the lockfile policy only</Hint>
        </>,
      ]}
    >
      <div className="sc-stage stage-pad">
        <div className="sc-block">
          <SectionTitle>Fifteen invented packages and three invented services</SectionTitle>
          <WideRegion minWidth={GRAPH_MIN_WIDTH}>
            <GraphView
              nodes={nodes}
              edges={links}
              directed
              layout="layered"
              edgeStyle="curve"
              spacing={SPACING}
              box={BOX}
              nodeMark={(id) => {
                if (hit.has(id)) return { tone: 'bad', fill: id === COMPROMISED_PACKAGE ? 'solid' : 'tint' };
                return chain.has(id) || SERVICE_NAMES.includes(id) ? { tone: 'ok', fill: 'tint' } : { tone: 'dim', fill: 'tint', tint: 6 };
              }}
              edgeMark={(e) => (hit.has(e.from) && (hit.has(e.to) || e.to === COMPROMISED_PACKAGE) ? { tone: 'bad', width: 3 } : null)}
              ariaLabel={`Dependency graph: ${affected.services.length} of ${SERVICE_NAMES.length} services and ${affected.packages.length} packages run ${COMPROMISED_PACKAGE}@${COMPROMISED_VERSION}`}
            />
          </WideRegion>
        </div>
        <div className="sc-block">
          <SectionTitle>What each service installs for {COMPROMISED_PACKAGE}</SectionTitle>
          <div className="sc-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Installs</th>
                </tr>
              </thead>
              <tbody>
                {SERVICE_NAMES.map((s) => {
                  const v = installs.get(s)?.get(COMPROMISED_PACKAGE);
                  return (
                    <tr key={s}>
                      <td>{s}</td>
                      <td style={{ color: v === COMPROMISED_VERSION ? 'var(--bad)' : 'var(--ok)' }}>
                        {COMPROMISED_PACKAGE}@{v}
                        {v === COMPROMISED_VERSION ? ' (the compromised release)' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="sc-note">No package here contains anything: the compromise is a flag on one version number in the model.</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">a fictional registry and services; nothing is fetched, installed or run</Provenance>
        <Provenance kind="from-memory">caret, tilde and pre-release rules follow npm (node-semver) as remembered: verify against its documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
