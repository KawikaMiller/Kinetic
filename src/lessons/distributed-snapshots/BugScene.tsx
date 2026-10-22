import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { bugCaption, verdictWords } from './captions';
import { bugSeedFor, followSeed } from './demoSeeds';
import { DEFAULT_OPTIONS, DROP_SHARE, SEED_RANGE, SEEDS_TOTAL, runSeed, type Method } from './sim';
import { TOTAL_TOKENS } from './snapshot';

const METHODS = [
  { value: 'markers' as const, label: 'Markers' },
  { value: 'naive' as const, label: 'Naive cut' },
];

export function BugScene({ picker }: { picker: ReactNode }) {
  const [bug, setBug] = useState(true);
  const [method, setMethod] = useState<Method>('markers');
  const [seed, setSeed] = useState(bugSeedFor('markers'));
  const changeMethod = (next: Method) => {
    setSeed(followSeed(seed, method, next, bugSeedFor));
    setMethod(next);
  };
  const options = useMemo(() => ({ ...DEFAULT_OPTIONS, method, bug }), [method, bug]);
  const { result } = useMemo(() => runSeed(options, seed), [options, seed]);
  const across = useMemo(() => {
    let shortfalls = 0;
    let equal = 0;
    for (let s = SEED_RANGE.from; s < SEED_RANGE.to; s++) {
      const r = runSeed(options, s).result;
      if (r.difference < 0) shortfalls++;
      if (r.difference < 0 && -r.difference === r.lostInCut) equal++;
    }
    return { shortfalls, equal };
  }, [options]);

  return (
    <StageFrame
      height={400}
      intro={bugCaption({ bug, method, result })}
      introKey={`${bug}|${method}|${seed}`}
      stats={
        <Stats>
          <Stat label="Recorded total" value={`${result.total} of ${TOTAL_TOKENS}`} color={result.conservation ? 'var(--ok)' : 'var(--bad)'} sub={`${result.states} in states, ${result.channels} in channels`} />
          <Stat label="Closure" value={result.closure.closed ? 'holds' : 'broken'} color={result.closure.closed ? 'var(--ok)' : 'var(--bad)'} sub="vector clocks over the trace" />
          <Stat label="Tokens C dropped inside the cut" value={result.lostInCut} sub="known to the simulation, never to the algorithm" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a check that holds' }, { color: 'var(--bad)', label: 'a shortfall or a broken check' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label={`C silently drops ${Math.round(DROP_SHARE * 100)}% of the transfers it receives`} value={bug} onChange={setBug} />
          <Segmented label="Method" options={METHODS} value={method} onChange={changeMethod} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ds-stage stage-pad">
        <Box>
          <SectionTitle hint="busy transfers, FIFO channels, initiator A at 100 ms (naive: 100, 80, 120 ms)">One seeded run</SectionTitle>
          <div className="ds-line">{verdictWords(result)}</div>
          {bug && method === 'markers' && (
            <Hint block>
              Over seeds {SEED_RANGE.from} to {SEED_RANGE.to - 1}: the record fell short on {across.shortfalls} of {SEEDS_TOTAL}, and on {across.equal} of them the shortfall equalled the tokens C dropped inside the cut. Sampled, not exhaustive.
            </Hint>
          )}
          {bug && method === 'naive' && <Hint block>With a naive cut the shortfall mixes tokens in flight with the tokens C dropped, so the learner cannot tell the bug from the recording artefact.</Hint>}
        </Box>
        <Hint block>A consistent snapshot is a tool for stable properties, such as a termination or a deadlock that stays true once it starts. Detecting them is named here and not built.</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded run on distSim; the bug is a modelled fault</Provenance>
          <Provenance kind="illustrative">the 5% drop and the token amounts are made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
