import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { sampledCaption } from './captions';
import { sampledText } from './checkText';
import { COMMANDER, generalName, orderName } from './om';
import { OM2_TRAITORS, RULE_NAMES, SEED_RANGE, SEEDS_TOTAL, runOmSeed, sweepOm } from './omNodes';

const SIZES = [{ value: 6, label: '6 generals (below 3f + 1)' }, { value: 7, label: '7 generals (3f + 1)' }];

export function SampledScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(6);
  const sweeps = useMemo(() => ({ 6: sweepOm(6, 2, OM2_TRAITORS), 7: sweepOm(7, 2, OM2_TRAITORS) }), []);
  const sweep = n === 6 ? sweeps[6] : sweeps[7];
  const [seed, setSeed] = useState(sweeps[6].lowestFailing ?? SEED_RANGE.from);
  const run = useMemo(() => runOmSeed(n, 2, OM2_TRAITORS, seed), [n, seed]);

  const choose = (next: number) => {
    setN(next);
    setSeed((next === 6 ? sweeps[6] : sweeps[7]).lowestFailing ?? SEED_RANGE.from);
  };

  return (
    <StageFrame
      height={420}
      intro={sampledCaption({ n, seed, run, failing: sweep.failing.length, seeds: SEEDS_TOTAL, lowest: sweep.lowestFailing })}
      introKey={`${n}|${seed}`}
      stats={
        <Stats>
          <Stat label={`IC1 and IC2 at ${n} generals`} value={sweep.failing.length === 0 ? `held on ${SEEDS_TOTAL} of ${SEEDS_TOTAL}` : `failed on ${sweep.failing.length} of ${SEEDS_TOTAL}`} color={sweep.failing.length === 0 ? 'var(--ok)' : 'var(--bad)'} sub="sampled, not exhaustive" />
          <Stat label="Lowest failing seed" value={sweep.lowestFailing ?? 'none'} sub={sweep.message ?? 'no failing seed in 1 to 200'} />
          <Stat label="Messages in this run" value={run.messages} sub="OM(2): 6 + 6 x 5 + 6 x 5 x 4 at 7 generals" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'a traitor' }, { color: 'var(--ok)', label: 'a rule that held' }, { color: 'var(--bad)', label: 'a rule that broke' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Generals" options={SIZES} value={n} onChange={choose} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="bz-stage stage-pad">
        <Box>
          <SectionTitle hint={`OM(2), ${OM2_TRAITORS} traitors drawn from the seed, random lies`}>One seeded run</SectionTitle>
          <div className="bz-line">Traitors: <b className="mono">{[...run.setup.traitors].map(generalName).join(', ')}</b>{run.setup.traitors.has(COMMANDER) ? '' : <>; the loyal commander orders <b className="mono">{orderName(run.setup.order)}</b></>}.</div>
          <div className="bz-line">Decisions: {run.decisions.map((d, i) => (i === COMMANDER ? null : <span key={i} className={`chip ${run.setup.traitors.has(i) ? 'tone-orange' : 'tone-info'}`}>{generalName(i)} {d ?? '–'}</span>))}</div>
          <div className="bz-verdict">{run.broken ? <span className="chip tone-bad">{run.broken}</span> : <span className="chip tone-ok">IC1 and IC2 held in this run</span>}</div>
        </Box>
        <Hint block>
          {sweep.failing.length === 0
            ? sampledText(SEEDS_TOTAL, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1)
            : `IC1 or IC2 failed on ${sweep.failing.length} of ${SEEDS_TOTAL} seeds (${SEED_RANGE.from} to ${SEED_RANGE.to - 1}), lowest failing seed ${sweep.lowestFailing}, first broken rule ${sweep.rule === null ? 'none' : RULE_NAMES[sweep.rule]}; sampled, not exhaustive`}.
          The enumeration at this size is too large to run here, so this scene never says it holds for all lies.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>OM(2) on distSim: each traitor is a node that sends seeded random bits</Provenance>
          <Provenance kind="toy">reliable synchronous channels, a tie goes to retreat</Provenance>
          <ClaimLabel kind="theorem">with f traitors, 3f + 1 generals suffice for oral messages and fewer do not: argued, not run here</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
