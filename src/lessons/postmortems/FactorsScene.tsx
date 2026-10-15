import { useEffect, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { factorsCaption } from './captions';
import { FactorTree } from './FactorTree';
import { FACTOR_IDS, KIND_EXPLAIN, KIND_LABEL, KIND_TONE, LEAF_IDS, ROOT, factorOf, revealed } from './tree';

/** A node asked about takes its tag's colour; the impact has no tag. */
const nodeTone = (id: string) => { const kind = factorOf(id).kind; return kind ? KIND_TONE[kind] : 'info'; };

export function FactorsScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const shown = revealed(asked);
  const factorsFound = FACTOR_IDS.filter((id) => shown.has(id)).length;
  const leavesFound = LEAF_IDS.filter((id) => shown.has(id)).length;

  useEffect(() => {
    setCaption(factorsCaption(asked, picked), { quiet: true });
  }, [setCaption, asked, picked]);

  const ask = (id: string) => {
    setAsked((prev) => new Set(prev).add(id));
    setPicked(id);
  };
  const reset = () => {
    setAsked(new Set());
    setPicked(null);
  };
  const detail = picked ? factorOf(picked) : null;

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Factors found" value={`${factorsFound} of ${FACTOR_IDS.length}`} />
          <Stat label="Leaves found" value={`${leavesFound} of ${LEAF_IDS.length}`} sub="ends of a branch: nothing more to ask" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the node you asked about', shape: 'square' },
            { color: 'var(--info)', label: 'revealed, not asked yet', shape: 'square' },
            { color: 'var(--orange)', label: 'trigger', shape: 'square' },
            { color: 'var(--violet)', label: 'contributing factor', shape: 'square' },
            { color: 'var(--amber)', label: 'latent condition', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setAsked(new Set(FACTOR_IDS.concat(ROOT)))}>Ask about everything</Button>
          <Button onClick={reset}>Start over</Button>
        </>,
      ]}
    >
      <div className="pm stage-pad">
        <FactorTree
          ariaLabel="Factors tree: press a factor to ask what made it possible"
          shown={(id) => shown.has(id)}
          onPick={ask}
          mark={(id) => (id === picked ? { tone: 'hi', fill: 'solid' } : asked.has(id) ? { tone: nodeTone(id), fill: 'tint' } : { tone: 'info', fill: 'tint', tint: 8 })}
          edge={(parent) => (asked.has(parent) ? { tone: 'info' } : null)}
        />
        <Box variant="sunken" className="pm-detail">
          <SectionTitle hint="press a node to ask: what made this possible?">Selected factor</SectionTitle>
          {detail ? (
            <>
              <p>{detail.text}</p>
              {detail.kind ? (
                <p>
                  <span className={`chip tone-${KIND_TONE[detail.kind]} pm-tag`}>{KIND_LABEL[detail.kind]}</span> {KIND_EXPLAIN[detail.kind]}
                </p>
              ) : (
                <p>The impact is the question, not a factor: it is what the tree explains.</p>
              )}
              {detail.children.length === 0 && <p>This is the end of this branch: asking again finds nothing more in this invented incident.</p>}
            </>
          ) : (
            <p className="empty-note">Nothing selected yet. Start at the impact.</p>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="invented">an invented incident, authored tree and minutes</Provenance>
          <ClaimLabel kind="view">several contributing factors rather than one root cause is a human-factors view, not a law</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
