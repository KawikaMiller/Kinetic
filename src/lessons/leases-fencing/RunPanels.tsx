import { useMemo } from 'react';
import { GanttLanes, type GanttBar, type GanttMarker } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { toSequence } from '../../core/distSim';
import { secText } from './captions';
import { LEASE_LANES, barsUpTo, domainEndMs, leaseBars, storeRows } from './events';
import { CLIENT_A, CLIENT_B, LOCK, STORE, statsAt, type LeaseRun, type Msg, type Verdict } from './model';

const GANTT_MIN_WIDTH = 520;
/** Bars narrower than this drop their label (it stays the tooltip) instead of showing it clipped: the longest labels are about 200px. */
const LABEL_MIN_PX = 90;
const ACTORS = [
  { id: LOCK, label: 'lock service' },
  { id: CLIENT_A, label: 'client A' },
  { id: CLIENT_B, label: 'client B' },
  { id: STORE, label: 'storage' },
];

const msgLabel = (p: Msg): string => {
  switch (p.type) {
    case 'acquire': return 'acquire';
    case 'grant': return `grant, token ${p.token}`;
    case 'renew': return `renew ${p.token}`;
    case 'renewed': return 'renewed';
    case 'lost': return 'lease lost';
    case 'release': return `release ${p.token}`;
    case 'write': return `write, token ${p.token}`;
    case 'stored': return 'stored';
    case 'rejected': return `rejected: stale token ${p.token} < ${p.highest}`;
  }
};

export const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a valid lease, or a write that is fine (applied, or stale and rejected)' },
      { color: 'var(--dim)', label: 'a lapsed lease its holder still believes in' },
      { color: 'var(--orange)', label: 'a paused client (hatched)' },
      { color: 'var(--bad)', label: 'a stale write that was applied' },
      { color: 'var(--violet)', label: 'a fencing token' },
      { color: 'var(--info)', label: 'a renewal, or a skewed clock' },
    ]}
  />
);

/** The stats row of a lease scene, read from the trace up to `now`. */
export function RunStats({ run, now, verdict }: { run: LeaseRun; now: number; verdict: Verdict | null }) {
  const s = statsAt(run, now);
  const broken = verdict !== null && now >= verdict.time;
  const skew = run.setup.aOffsetMs;
  return (
    <Stats>
      <Stat label="Writes applied" value={s.applied} sub="by the storage server" />
      <Stat
        label="Writes rejected"
        value={s.rejected}
        color={s.refusedNewest > 0 ? 'var(--bad)' : s.rejected > 0 ? 'var(--ok)' : undefined}
        sub={s.refusedNewest > 0 ? `${s.refusedNewest} of them from the newest lease` : 'stale token'}
      />
      <Stat label="Stale writes applied" value={s.staleApplied} color={s.staleApplied > 0 ? 'var(--bad)' : undefined} sub="a newer lease had written first" />
      <Stat label="Highest token applied" value={s.highestToken === 0 ? 'none' : s.highestToken} color={s.highestToken > 0 ? 'var(--hi)' : undefined} sub="what storage remembers" />
      <Stat label="Client A's clock" value={`${skew > 0 ? '+' : ''}${skew / 1000} s`} color={skew !== 0 ? 'var(--info)' : undefined} sub={`and ${run.setup.aDriftPpm} ppm drift`} />
      <Stat
        label="Invariants"
        value={broken ? `${verdict.rule} broken` : 'hold so far'}
        color={broken ? 'var(--bad)' : 'var(--ok)'}
        sub={broken ? verdict.message : `F1, F2 and F3, checked at every step up to ${secText(now)}`}
      />
    </Stats>
  );
}

/** The three views of a run up to `now`: lease bars on a timeline, the message ladder, and what storage logged. */
export function RunPanels({ run, now, verdict }: { run: LeaseRun; now: number; verdict: Verdict | null }) {
  const bars = useMemo(() => leaseBars(run), [run]);
  const sequence = useMemo(() => toSequence(run.cluster.trace.filter((r) => r.t <= now), { actors: ACTORS, label: msgLabel, events: true }), [run, now]);
  const rows = useMemo(() => storeRows(run, now), [run, now]);
  const markers = verdict !== null && now >= verdict.time ? [{ at: verdict.time / 1000, label: `${verdict.rule} broken`, tone: 'bad' as const }] : [];
  return (
    <>
      <Box>
        <SectionTitle hint="seconds of true time; the lock service's clock is the reference">Who holds the lease</SectionTitle>
        <WideGantt run={run} now={now} bars={barsUpTo(bars, now)} markers={markers} />
      </Box>
      <Box>
        <SectionTitle hint="the lock service stands for a replicated store: here it is one box">Messages so far</SectionTitle>
        <SequenceDiagram actors={ACTORS} messages={sequence.messages} ariaLabel="Messages between the lock service, the two clients and the storage server" />
      </Box>
      <Box>
        <SectionTitle>What storage logged</SectionTitle>
        <LogStream label="Writes the storage server handled" rows={rows} maxHeight={130} live="off" empty="No write has reached storage yet." />
      </Box>
    </>
  );
}

function WideGantt({ run, now, bars, markers }: { run: LeaseRun; now: number; bars: GanttBar[]; markers: GanttMarker[] }) {
  return (
    <WideRegion minWidth={GANTT_MIN_WIDTH} label="Lease timeline: scroll sideways to see all of it">
      <GanttLanes lanes={LEASE_LANES} bars={bars} domain={[0, domainEndMs(run) / 1000]} now={now / 1000} markers={markers} unit=" s" axis size="md" labelWidth={84} labelMinPx={LABEL_MIN_PX} ariaLabel="Leases, pauses and writes of the two clients and the storage server" />
    </WideRegion>
  );
}
