import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { leaseCaption, logCaption, lwwCaption } from './captions';
import { signedMs, timeText } from './format';
import { BUG_SEEDS, type Bug } from './bugs';
import { GRACE_MS, HOLDER, LEASE_END_MS, NEXT, believedUntil, runLease } from './lease';
import { runLww, type LwwMsg } from './lww';
import { CAUSAL_CHAIN, REPLIER, SKEW_B_MAX, mergedByStamp, runLog } from './orderLog';
import { SeedField } from '../../components/SeedField';

const BUG_OPTIONS: { value: Bug; label: string }[] = [
  { value: 'lww', label: 'Last write wins' },
  { value: 'lease', label: 'A lease two hold' },
  { value: 'log', label: 'Effect before cause' },
];
const LWW_OFFSET_MAX = 10_000;
const LEASE_OFFSET_MAX = 5000;
const LEASE_DOMAIN: [number, number] = [0, 20_000];
const LEASE_MARGIN = { max: 6000, on: 3500 } as const;
const GANTT_MIN_WIDTH = 440;
const LWW_DEFAULTS = { offsetA: 5000, offsetB: 0 } as const;
const LOG_DEFAULT_OFFSET = -100;

const lwwLabel = (p: LwwMsg): string => (p.type === 'write' ? `write x=${p.value}` : p.type === 'ack' ? 'ack' : `copy x=${p.value}, stamp ${p.stamp}`);

export function BugsScene({ picker }: { picker: ReactNode }) {
  const [bug, setBug] = useState<Bug>('lww');
  const [seeds, setSeeds] = useState<Record<Bug, number>>(BUG_SEEDS);
  const seed = seeds[bug];
  const [offsetA, setOffsetA] = useState<number>(LWW_DEFAULTS.offsetA);
  const [offsetB, setOffsetB] = useState<number>(LWW_DEFAULTS.offsetB);
  const [holderOffset, setHolderOffset] = useState(-3000);
  const [marginOn, setMarginOn] = useState(false);
  const [margin, setMargin] = useState<number>(LEASE_MARGIN.on);
  const [logOffset, setLogOffset] = useState<number>(LOG_DEFAULT_OFFSET);

  const lww = useMemo(() => runLww({ seed, mode: 'raw', offsets: [offsetA, offsetB] }), [seed, offsetA, offsetB]);
  const marginMs = marginOn ? margin : 0;
  const holderClock = { offsetMs: holderOffset, driftPpm: 0 };
  const lease = useMemo(() => runLease({ seed, holderClock: { offsetMs: holderOffset, driftPpm: 0 }, marginMs }), [seed, holderOffset, marginMs]);
  const log = useMemo(() => runLog({ seed, clockB: { offsetMs: logOffset, driftPpm: 0 } }), [seed, logOffset]);

  const winner = lww.finals.A.value === lww.finals.B.value ? lww.finals.A.value : 0;
  const held = winner === 2;
  const believedEnd = believedUntil(holderClock, marginMs);

  useIntroCaption(
    bug === 'lww'
      ? lwwCaption({ stamp1: lww.stamps[1], stamp2: lww.stamps[2], winner, offsetA, offsetB, held })
      : bug === 'lease'
        ? leaseCaption(lease, { offsetMs: holderOffset, marginMs, believedEndMs: believedEnd })
        : logCaption(log.merged, logOffset),
    [bug, lww, lease, log, offsetA, offsetB, holderOffset, marginMs, logOffset],
  );

  const sequence = useMemo(() => toSequence(lww.trace, { actors: [{ id: 'c', label: 'client' }, { id: 'A', label: 'A' }, { id: 'B', label: 'B' }], label: lwwLabel, events: false, times: true }), [lww]);
  const bars: GanttBar[] = lease.beliefs.map((b) => ({
    id: b.node,
    lane: b.node,
    start: b.from,
    end: Math.min(b.to ?? LEASE_DOMAIN[1], LEASE_DOMAIN[1]),
    tone: b.node === HOLDER ? 'amber' : 'sky',
    label: b.node === HOLDER ? 'H believes it holds the lease' : 'N holds the lease',
  }));
  if (lease.overlap) bars.push({ id: 'both', lane: 'both', start: lease.overlap.from, end: Math.min(lease.overlap.to, LEASE_DOMAIN[1]), tone: 'bad', label: 'both' });
  const merged = log.merged;
  const logRows = merged.map((l, i) => {
    const causeIdx = CAUSAL_CHAIN.indexOf(l.text as (typeof CAUSAL_CHAIN)[number]);
    const cause = causeIdx > 0 ? merged.findIndex((m) => m.text === CAUSAL_CHAIN[causeIdx - 1]) : -1;
    return { id: `${l.node}-${l.text}`, at: `${l.stamp.toFixed(1)} ms`, source: l.node, sourceTone: 'info' as const, text: l.text, ...(cause > i ? { tone: 'bad' as const } : {}) };
  });

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          {bug === 'lww' && (
            <>
              <Stat label="Write 1 stamp (A)" value={lww.stamps[1] === undefined ? '–' : `${(lww.stamps[1] / 1000).toFixed(3)} s`} sub={`A's clock ${signedMs(offsetA)}`} />
              <Stat label="Write 2 stamp (B)" value={lww.stamps[2] === undefined ? '–' : `${(lww.stamps[2] / 1000).toFixed(3)} s`} sub={`B's clock ${signedMs(offsetB)}; started after the ack`} />
              <Stat label="Both replicas keep" value={winner === 0 ? 'different values' : `x = ${winner}`} color={held ? 'var(--ok)' : 'var(--bad)'} sub={held ? 'the later write' : 'the earlier write'} />
            </>
          )}
          {bug === 'lease' && (
            <>
              <Stat label="H believes until" value={`${(believedEnd / 1000).toFixed(2)} s`} sub={`lease ends at ${LEASE_END_MS / 1000} s`} />
              <Stat label="N is granted at" value={`${((LEASE_END_MS + GRACE_MS) / 1000).toFixed(1)} s`} sub="plus the message delay" />
              <Stat
                label="Overlap"
                value={lease.overlap ? timeText(lease.overlap.to - lease.overlap.from) : 'none'}
                color={lease.overlap ? 'var(--bad)' : 'var(--ok)'}
                sub="both believe they hold it"
              />
            </>
          )}
          {bug === 'log' && (
            <Stat
              label={`${REPLIER} behind by`}
              value={timeText(-logOffset)}
              color={mergedByStamp(log.lines).map((l) => l.text).join() === CAUSAL_CHAIN.join() ? 'var(--ok)' : 'var(--bad)'}
              sub="the merge keeps or breaks cause before effect"
            />
          )}
        </Stats>
      }
      legend={
        bug === 'lease' ? (
          <Legend items={[{ color: 'var(--amber)', label: 'H believes it holds the lease' }, { color: 'var(--sky)', label: 'N holds it' }, { color: 'var(--bad)', label: 'both believe' }, { color: 'var(--dim)', label: 'lease end (server time)', shape: 'line' }]} />
        ) : (
          <Legend items={[{ color: 'var(--info)', label: 'a message' }, { color: 'var(--bad)', label: bug === 'lww' ? 'the surviving wrong value' : 'an effect sorted before its cause' }, { color: 'var(--ok)', label: 'the later write, or cause before effect' }]} />
        )
      }
      controls={[
        <>
          {picker}
          <Segmented label="Bug" value={bug} onChange={setBug} options={BUG_OPTIONS} />
        </>,
        <>
          {bug === 'lww' && (
            <>
              <Slider label="A's clock offset" value={offsetA} min={-LWW_OFFSET_MAX} max={LWW_OFFSET_MAX} step={100} format={(v) => `${v} ms`} onChange={setOffsetA} />
              <Slider label="B's clock offset" value={offsetB} min={-LWW_OFFSET_MAX} max={LWW_OFFSET_MAX} step={100} format={(v) => `${v} ms`} onChange={setOffsetB} />
            </>
          )}
          {bug === 'lease' && (
            <>
              <Slider label="H's clock offset" value={holderOffset} min={-LEASE_OFFSET_MAX} max={LEASE_OFFSET_MAX} step={100} format={(v) => `${v} ms`} onChange={setHolderOffset} />
              <Toggle label="Safety margin" value={marginOn} onChange={setMarginOn} off="None" on="H stops early" />
              {marginOn && <Slider label="Margin" value={margin} min={0} max={LEASE_MARGIN.max} step={100} format={(v) => `${v} ms`} onChange={setMargin} />}
            </>
          )}
          {bug === 'log' && <Slider label="b's clock offset" value={logOffset} min={-SKEW_B_MAX} max={SKEW_B_MAX} step={10} format={(v) => `${v} ms`} onChange={setLogOffset} />}
          <SeedField key={bug} seed={seed} onSeed={(next) => setSeeds((old) => ({ ...old, [bug]: next }))} />
        </>,
      ]}
    >
      <div className="pc-stage stage-pad">
        {bug === 'lww' && (
          <Box>
            <SectionTitle hint="the replicas stamp with their own clocks">Two writes, the second after the first was acknowledged</SectionTitle>
            <SequenceDiagram actors={[{ id: 'c', label: 'client' }, { id: 'A', label: 'A' }, { id: 'B', label: 'B' }]} messages={sequence.messages} ariaLabel="The two writes and their copies" />
          </Box>
        )}
        {bug === 'lease' && (
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Who believes they hold the lease, against true time: scroll sideways to see all of it">
            <GanttLanes
              lanes={[{ id: HOLDER, label: 'H' }, { id: NEXT, label: 'N' }, { id: 'both', label: 'overlap' }]}
              bars={bars}
              domain={LEASE_DOMAIN}
              markers={[{ at: LEASE_END_MS, label: 'lease ends (server time)', tone: 'dim' }]}
              unit=" ms"
              axis
              size="md"
              labelWidth={64}
              ariaLabel="Who believes they hold the lease, against true time"
            />
          </WideRegion>
        )}
        {bug === 'log' && <LogStream rows={logRows} label="Both nodes' log lines merged by timestamp" live="off" empty="" />}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>
            {bug === 'lease' ? 'a lock server, a holder with its own clock and a second node on distSim' : bug === 'lww' ? 'two replicas and a client on distSim, delay and nothing else' : 'a requester and a replier on distSim'}
          </Provenance>
          <Provenance kind="illustrative">the offsets are chosen by you and larger than a synced clock usually shows, to make the failure visible</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
