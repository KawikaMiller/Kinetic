import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { folkloreCaption } from './captions';
import { ACTIVE, COHORTS, CYCLE_DAYS, LOGS, POPULATION_SEED, SIGNUPS, WINDOWS, checks, measured, population, type Design } from './folklore';
import { OPENING } from './opening';

/** Scene 4: "most features are rarely or never used": design the measurement, and see what the design decides. */
export function FolkloreScene({ picker }: { picker: ReactNode }) {
  const [design, setDesign] = useState<Design>(OPENING.folklore.design);
  const people = useMemo(() => population(), []);
  const checkList = checks(design);
  const share = measured(people, design);
  const log = LOGS.find((l) => l.value === design.log)!;
  const cohort = COHORTS.find((c) => c.value === design.cohort)!;

  return (
    <StageFrame
      height={560}
      intro={folkloreCaption(people, design, checkList)}
      introKey={[design.log, design.window, design.cohort]}
      stats={
        <Stats>
          <Stat label="Reported as using it" value={`${Math.round(share * 100)}%`} color="var(--hi)" sub={`of ${cohort.value === 'signups' ? SIGNUPS : ACTIVE} accounts counted`} />
          <Stat label="Choices that change the count" value={`${checkList.filter((c) => !c.ok).length} of ${checkList.length}`} color={checkList.every((c) => c.ok) ? 'var(--ok)' : 'var(--orange)'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a choice that counts what the feature is for' }, { color: 'var(--orange)', label: 'a choice that changes what is counted' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Log" options={LOGS.map((l) => ({ value: l.value, label: l.label }))} value={design.log} onChange={(l) => setDesign({ ...design, log: l })} />
        </>,
        <>
          <Segmented label="Window" options={WINDOWS} value={design.window} onChange={(w) => setDesign({ ...design, window: w })} />
          <Segmented label="Users" options={COHORTS.map((c) => ({ value: c.value, label: c.label }))} value={design.cohort} onChange={(c) => setDesign({ ...design, cohort: c })} />
        </>,
      ]}
    >
      <div className="pt-stage stage-pad">
        <blockquote className="pt-claim">&quot;Most features are rarely or never used.&quot; <ClaimLabel kind="view">a popular claim with a hard-to-trace source (from memory): treat it as folklore until you find the data</ClaimLabel></blockquote>
        <p className="pt-note">
          Your product has a monthly usage report ({CYCLE_DAYS}-day cycle). Design the measurement that would settle the claim for it. This design counts {log.counts} among {cohort.counts}, over {design.window} days. The data covers a single cycle, so a window longer than {CYCLE_DAYS} days gives the same answer as {CYCLE_DAYS}.
        </p>
        <ul className="pt-checks">
          {checkList.map((c, i) => <li key={i} className={c.ok ? 'pt-check-ok' : 'pt-check-flag'}>{c.ok ? 'Matches the reference design: ' : 'Changes the count: '}{c.text}</li>)}
        </ul>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={POPULATION_SEED}>{SIGNUPS} invented accounts, {ACTIVE} of them still active</Provenance>
          <Provenance kind="invented">the product, the feature and the usage rates are invented; no real usage statistic is shown</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
