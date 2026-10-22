import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { quorumCaption } from './captions';
import { F_RANGE, MAX_NODES, nodeRange, quorumOverlap } from './quorums';

export function QuorumScene({ picker }: { picker: ReactNode }) {
  const [f, setF] = useState<number>(F_RANGE.default);
  const [nRaw, setN] = useState(3 * F_RANGE.default + 1);
  const range = nodeRange(f);
  const n = Math.min(Math.max(nRaw, range.min), range.max);
  const overlap = useMemo(() => quorumOverlap(n, f), [n, f]);
  const { example } = overlap;

  return (
    <StageFrame
      height={400}
      intro={quorumCaption(overlap)}
      introKey={`${n}|${f}`}
      stats={
        <Stats>
          <Stat label="Quorum size" value={overlap.quorumSize} sub={`n - f = ${n} - ${f}`} />
          <Stat label="Smallest overlap" value={overlap.smallestOverlap} color={overlap.loyalWitness ? 'var(--ok)' : 'var(--bad)'} sub={`n - 2f = ${n - 2 * f}, over ${integer(overlap.pairs)} pairs`} />
          <Stat label="A loyal node in every overlap" value={overlap.loyalWitness ? 'yes' : 'no'} color={overlap.loyalWitness ? 'var(--ok)' : 'var(--bad)'} sub={`at most ${f} traitor${f === 1 ? '' : 's'}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'the nodes two quorums share' }, { color: 'var(--info)', label: 'one quorum' }, { color: 'var(--violet)', label: 'the other quorum' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Traitors f" value={f} min={F_RANGE.min} max={F_RANGE.max} onChange={(v) => { setF(v); setN(3 * v + 1); }} />
          <Slider label="Nodes n" value={n} min={range.min} max={range.max} format={(v) => (v === 3 * f ? `${v} = 3f` : v === 3 * f + 1 ? `${v} = 3f + 1` : String(v))} onChange={setN} />
        </>,
      ]}
    >
      <div className="bz-stage stage-pad">
        <Box>
          <SectionTitle hint="a pair of quorums that share the fewest nodes">{integer(overlap.quorums)} quorums of size {overlap.quorumSize}: the tightest pair</SectionTitle>
          <div className="bz-nodes">
            {Array.from({ length: n }, (_, i) => {
              const a = example.a.includes(i);
              const b = example.b.includes(i);
              const shared = a && b;
              return (
                <span key={i} className={`bz-node ${shared ? 'is-shared' : a ? 'is-a' : b ? 'is-b' : ''}`} aria-label={`node ${i + 1}: ${shared ? 'in both quorums' : a ? 'in the first quorum' : b ? 'in the second quorum' : 'in neither'}`}>{i + 1}</span>
              );
            })}
          </div>
          <Hint block>
            {overlap.loyalWitness
              ? `Two quorums share at least ${overlap.smallestOverlap} nodes, more than the ${f} possible traitor${f === 1 ? '' : 's'}, so at least one shared node is loyal and the two quorums cannot be told different stories.`
              : `Two quorums can share just ${overlap.smallestOverlap} nodes, and with ${f} possible traitor${f === 1 ? '' : 's'} all of them may be traitors: each quorum can then be told a different story.`}
          </Hint>
        </Box>
        <Hint block>
          Exhaustive: all {integer(overlap.pairs)} pairs of quorums of size n - f among n = {n} nodes were compared (the enumeration is capped at n = {MAX_NODES}). The smallest overlap n - 2f is the pigeonhole count; the enumeration checks it.
        </Hint>
        <ProvenanceRow>
          <ClaimLabel kind="theorem">n of at least 3f + 1 is needed to tolerate f traitors: argued, not run here</ClaimLabel>
          <Provenance kind="toy">node counts only: no messages in this scene</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
