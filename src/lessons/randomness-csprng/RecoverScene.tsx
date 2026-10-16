import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { recoverCaption } from './captions';
import { OPENING } from './opening';
import { MAX_OUTPUTS, NEXT_COUNT, STATES, candidates, outputsFrom, predictNext } from './recovery';
import { SeedInput } from './SeedInput';

/** Scene 3: read a toy generator's outputs one at a time and count the states that still fit. */
export function RecoverScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(OPENING.recover.seed);
  const [revealed, setRevealed] = useState(OPENING.recover.revealed);
  const outputs = useMemo(() => outputsFrom(seed, MAX_OUTPUTS + NEXT_COUNT), [seed]);
  const counts = useMemo(() => Array.from({ length: MAX_OUTPUTS }, (_, i) => candidates(outputs.slice(0, i + 1)).length), [outputs]);
  const left = revealed === 0 ? STATES : counts[revealed - 1];
  const predicted = useMemo(() => (left === 1 ? predictNext(outputs.slice(0, revealed)) : null), [left, outputs, revealed]);
  const real = outputs.slice(revealed, revealed + NEXT_COUNT);

  return (
    <StageFrame
      height={680}
      intro={recoverCaption(revealed, counts, predicted !== null)}
      introKey={`${seed}|${revealed}`}
      stats={
        <Stats>
          <Stat label="States still possible" value={integer(left)} color={left === 1 ? 'var(--hi)' : 'var(--info)'} sub={`of ${integer(STATES)}`}>
            <Bar value={left} max={STATES} tone={left === 1 ? 'hi' : 'info'} ariaLabel={`${integer(left)} of ${integer(STATES)} states still possible`} />
          </Stat>
          <Stat label="Outputs seen" value={`${revealed} of ${MAX_OUTPUTS}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'states still consistent with what was seen', shape: 'square' }, { color: 'var(--hi)', label: 'the one true state', shape: 'square' }, { color: 'var(--ok)', label: 'prediction matches the real output', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <SeedInput seed={seed} onSeed={(s) => { setSeed(s); setRevealed(0); }} label="Hidden seed" />
          <Button softDisabled={revealed >= MAX_OUTPUTS} onClick={() => setRevealed((r) => Math.min(MAX_OUTPUTS, r + 1))}>Reveal the next output</Button>
          <Button onClick={() => setRevealed(0)}>Reset</Button>
        </>,
      ]}
    >
      <div className="rn-stage stage-pad">
        <p className="rn-note">The generator is a 16-bit LCG whose output is the top 4 bits of its state: 16 possible outputs, 65,536 possible states. The solver below is a brute force over those 65,536 states, built for this toy. It is not a method for anything real, and the lesson offers no step for any real generator.</p>
        <Box className="rn-panel">
          <SectionTitle hint="states that fit, after each output">What has been seen</SectionTitle>
          <table className="data-table rn-table">
            <thead><tr><th>Output</th><th>Value</th><th>States still possible</th></tr></thead>
            <tbody>
              {outputs.slice(0, revealed).map((o, i) => (
                <tr key={i}><td>{i + 1}</td><td>{o}</td><td>{integer(counts[i])}</td></tr>
              ))}
              {revealed === 0 && <tr><td colSpan={3}>nothing revealed yet</td></tr>}
            </tbody>
          </table>
        </Box>
        {predicted && (
          <Box className="rn-panel">
            <SectionTitle hint={`the next ${NEXT_COUNT} outputs`}>Predicted against real</SectionTitle>
            <p className="rn-mono" style={{ color: 'var(--hi)' }}>predicted {predicted.join(' ')}</p>
            <p className="rn-mono" style={{ color: predicted.join() === real.join() ? 'var(--ok)' : 'var(--bad)' }}>real      {real.join(' ')}</p>
          </Box>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a 16-bit generator built for this page: its state is small enough to search completely</Provenance>
        <Provenance kind="real">the counts come from a real brute-force pass over all 65,536 states, not from a formula</Provenance>
        <ClaimLabel kind="practice">a generator whose state can be inferred from its output is not secret, however random it looks</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
