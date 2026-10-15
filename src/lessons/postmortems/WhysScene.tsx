import { useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { whysCaption } from './captions';
import { FactorTree } from './FactorTree';
import { FACTOR_IDS, LEAF_IDS, ROOT } from './tree';
import { CHAINS, surfaced } from './whys';

export function WhysScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [chainId, setChainId] = useState(CHAINS[0].id);
  const chain = CHAINS.find((c) => c.id === chainId)!;
  const [asked, setAsked] = useState(chain.steps.length);
  const depth = Math.min(asked, chain.steps.length);
  const { factors, leaves } = surfaced(chain, depth);
  const on = new Set<string>([ROOT, ...factors]);

  useEffect(() => {
    setCaption(whysCaption(chain, depth), { quiet: true });
  }, [setCaption, chain, depth]);

  const pick = (id: string) => {
    setChainId(id);
    setAsked(CHAINS.find((c) => c.id === id)!.steps.length);
  };

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Surfaced by the chain" value={`${factors.length} of ${FACTOR_IDS.length}`} sub={`${leaves.length} of ${LEAF_IDS.length} leaves`} />
          <Stat label="Surfaced by the tree" value={`${FACTOR_IDS.length} of ${FACTOR_IDS.length}`} sub={`${LEAF_IDS.length} of ${LEAF_IDS.length} leaves`} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'asked along the chain', shape: 'square' },
            { color: 'var(--dim)', label: 'never reached by the chain (faded)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Chain" value={chainId} onChange={pick} options={CHAINS.map((c) => ({ value: c.id, label: c.label }))} />
          <Slider label="Whys asked" value={depth} min={1} max={chain.steps.length} onChange={setAsked} />
        </>,
      ]}
    >
      <div className="pm stage-pad">
        <ol className="pm-whys">
          {chain.steps.slice(0, depth).map((s, i) => (
            <li key={i}>{s.text}</li>
          ))}
        </ol>
        <FactorTree
          ariaLabel="The same factors tree: the nodes the chain reached are marked, the rest are faded"
          shown={() => true}
          mark={(id) => (on.has(id) ? { tone: 'info', fill: 'tint' } : null)}
          edge={(parent, child) => (on.has(parent) && on.has(child) ? { tone: 'info' } : null)}
          faded={(id) => !on.has(id)}
        />
        <ProvenanceRow>
          <Provenance kind="invented">the same invented incident; the chains are authored, not generated</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
