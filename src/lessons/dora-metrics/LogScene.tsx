import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SortTh } from '../../components/SortTh';
import { StageFrame } from '../../components/StageFrame';
import { useSortedRows } from '../../components/useSortedRows';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { SeedField } from '../distributions/SeedField';
import { sig } from '../distributions/fmt';
import { hours, logCaption, logClock, minutes, perWeek } from './frames';
import {
  DEFINITIONS_DEFAULT, FAILURE_DEFS, FAILURE_NAME, HOURS_PER_WEEK, LEAD_STARTS, LEAD_START_NAME, LOG_SEED, LOG_START, LOG_WEEKS, RESTORE_ENDS, RESTORE_END_NAME, isFailure,
  leadStartOf, leadTimeLabel, logMetrics, makeLog, weekOf, type Definitions, type Deployment,
} from './model';

const LEAD_OPTIONS = LEAD_STARTS.map((s) => ({ value: s, label: LEAD_START_NAME[s] }));
const FAILURE_OPTIONS = FAILURE_DEFS.map((f) => ({ value: f, label: FAILURE_NAME[f] }));
const RESTORE_OPTIONS = RESTORE_ENDS.map((e) => ({ value: e, label: RESTORE_END_NAME[e] }));
const WEEK_OPTIONS = Array.from({ length: LOG_WEEKS }, (_, w) => ({ value: w, label: `week ${w + 1}` }));
const MIN_INSTANT_PX = 3;

interface Row {
  d: Deployment;
  lead: number;
  failed: boolean;
  restore: number | null;
}

export function LogScene({ picker }: { picker: ReactNode }) {
  const [defs, setDefs] = useState<Definitions>(DEFINITIONS_DEFAULT);
  const [week, setWeek] = useState(0);
  const [seed, setSeed] = useState(LOG_SEED);
  const log = useMemo(() => makeLog(seed), [seed]);
  const m = useMemo(() => logMetrics(log, defs), [log, defs]);

  useIntroCaption(logCaption(m, defs), [m, defs]);

  const rows: Row[] = useMemo(
    () =>
      log.map((d) => {
        const failed = isFailure(d, defs.failure);
        return { d, lead: d.deployAt - leadStartOf(d, defs.leadStart), failed, restore: failed ? (defs.restoreEnd === 'restored' ? d.restoredMin! : d.fixHours! * 60) : null };
      }),
    [log, defs],
  );
  const { sorted, headerProps } = useSortedRows(rows, {
    id: (r) => r.d.id,
    commit: (r) => r.d.commitAt,
    merge: (r) => r.d.mergeAt,
    deploy: (r) => r.d.deployAt,
    lead: (r) => r.lead,
    outcome: (r) => r.d.outcome,
    restore: (r) => r.restore ?? -1,
  });

  const lanes: GanttLane[] = [{ id: 'deploys', label: 'deploys' }, { id: 'restore', label: 'time to restore' }];
  const inWeek = weekOf(log, week);
  const bars: GanttBar[] = inWeek.flatMap((d): GanttBar[] => {
    const failed = isFailure(d, defs.failure);
    const tone: Tone = !failed ? 'ok' : d.outcome === 'rollback' ? 'orange' : 'bad';
    const restoreHours = (defs.restoreEnd === 'restored' ? d.restoredMin! / 60 : d.fixHours!);
    return [
      { id: `d${d.id}`, lane: 'deploys', start: d.deployAt, end: d.deployAt, tone, label: failed ? `#${d.id} ${d.outcome === 'rollback' ? 'rollback' : 'failed'}` : undefined },
      ...(failed ? [{ id: `r${d.id}`, lane: 'restore', start: d.deployAt, end: d.deployAt + restoreHours, tone, minPx: MIN_INSTANT_PX, label: `#${d.id} restored after ${minutes(restoreHours * 60)}` }] : []),
    ];
  });

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Deployment frequency" value={perWeek(m.deploymentsPerWeek)} sub={[`${log.length} deployments in ${LOG_WEEKS} weeks`]} />
          <Stat label="Lead time" value={hours(m.leadMedian)} sub={['median, calendar hours', `mean ${hours(m.leadMean)}`, leadTimeLabel(defs.leadStart)]} />
          <Stat label="Change failure rate" value={`${sig(m.failureRate * 100, 3)}%`} color={m.failures ? 'var(--bad)' : undefined} sub={[`${m.failures} of ${log.length}`, `failure: ${FAILURE_NAME[defs.failure]}`]} />
          <Stat label="Time to restore" value={m.restoreMedian === null ? '–' : minutes(m.restoreMedian)} sub={m.restoreMedian === null ? ['no failures, so no time to restore'] : ['median', `mean ${minutes(m.restoreMean!)}`, `ends at ${RESTORE_END_NAME[defs.restoreEnd]}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a deploy that did not fail (a tick)' },
            { color: 'var(--bad)', label: 'a failed deploy' },
            { color: 'var(--orange)', label: 'a rollback' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Lead time starts at" value={defs.leadStart} onChange={(leadStart) => setDefs((d) => ({ ...d, leadStart }))} options={LEAD_OPTIONS} />
        </>,
        <>
          <Segmented label="A failure is" value={defs.failure} onChange={(failure) => setDefs((d) => ({ ...d, failure }))} options={FAILURE_OPTIONS} />
          <Segmented label="Restore time ends at" value={defs.restoreEnd} onChange={(restoreEnd) => setDefs((d) => ({ ...d, restoreEnd }))} options={RESTORE_OPTIONS} />
        </>,
        <>
          <Segmented label="Week shown" value={week} onChange={setWeek} options={WEEK_OPTIONS} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="dm-stage stage-pad">
        <div className="dm-claims">
          <ClaimLabel kind="research">the four measures are DORA&apos;s; the definitions you pick change every number</ClaimLabel>
        </div>
        <Box className="dm-lanes">
          <SectionTitle hint={`${inWeek.length} deployments this week, UTC`}>Deployments in week {week + 1}</SectionTitle>
          <WideRegion minWidth={520} label="Deployment timeline: scroll sideways to see the whole week">
            <GanttLanes
              lanes={lanes}
              bars={bars}
              domain={[week * HOURS_PER_WEEK, (week + 1) * HOURS_PER_WEEK]}
              axis={{ calendar: { start: LOG_START, unit: 'day' } }}
              hideEmptyLanes
              size="sm"
              labelWidth={110}
              labelMinPx={Number.POSITIVE_INFINITY}
              ariaLabel={`Deployments in week ${week + 1}`}
            />
          </WideRegion>
        </Box>
        <Box className="dm-log">
          <SectionTitle hint="sort any column; failures are tinted">The deployment log</SectionTitle>
          <div className="dm-log-scroll">
            <table className="data-table dm-table">
              <thead>
                <tr>
                  <SortTh {...headerProps('id')}>#</SortTh>
                  <SortTh {...headerProps('commit')}>first commit</SortTh>
                  <SortTh {...headerProps('merge')}>merged</SortTh>
                  <SortTh {...headerProps('deploy')}>deployed</SortTh>
                  <SortTh {...headerProps('lead')}>lead time</SortTh>
                  <SortTh {...headerProps('outcome')}>outcome</SortTh>
                  <SortTh {...headerProps('restore')}>restore</SortTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.d.id} className={r.failed ? 'dm-failed' : ''}>
                    <td>{r.d.id}</td>
                    <td>{logClock(r.d.commitAt)}</td>
                    <td>{logClock(r.d.mergeAt)}</td>
                    <td>{logClock(r.d.deployAt)}</td>
                    <td>{hours(r.lead)}</td>
                    <td>{r.d.outcome}{r.d.incident ? ' · incident' : ''}</td>
                    <td>{r.restore === null ? '–' : minutes(r.restore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded log of 50 deployments over 4 weeks, with planted failures so that every definition gives a different number</Provenance>
          <Provenance kind="illustrative">every time in the log is made up; the calendar is UTC, a fixed zone</Provenance>
          <Provenance kind="from-memory">the metric definitions and their renaming: check dora.dev for the current ones</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="dm-banner">
          Lead time can start at the first commit, when the pull request opens or at the merge; a failure can be a rollback, a rollback or a quick hotfix, or anything linked to an incident;
          restoring can end when service is back or when the fix is deployed. Each choice is a defensible definition and each changes the number, so compare a team with its own past, with
          the definition written down, never with another team&apos;s dashboard.
        </Hint>
      </div>
    </StageFrame>
  );
}
