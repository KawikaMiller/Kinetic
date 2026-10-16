import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { minWidthForText } from '../../core/scale';
import { replicationCaption } from './captions';
import {
  BROKERS, BROKEN_CONFIG, BROKEN_SEED, HORIZON_MS, SAFE_CONFIG, SEED_COUNT, SCRIPTED_CRASH_AT, UNCLEAN_CONFIG, type Acks, type MinIsr, type ReplConfig, type ScriptedFault,
} from './replication';
import {
  DEFAULT_REPL, cellFor, effectiveConfig, frameAt, liveLeader, lowestBrokenSeed, messageLabel, pinnedSeed, runRepl, storyRows, tapeColumns,
  type ReplControls,
} from './replView';

const ACK_OPTIONS: { value: Acks; label: string }[] = [{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 'all', label: 'all' }];
const MIN_ISR_OPTIONS: { value: MinIsr; label: string }[] = [{ value: 1, label: '1' }, { value: 2, label: '2' }];
const SCHEDULE_OPTIONS = [{ value: 'scripted' as const, label: 'Hand-built' }, { value: 'seeded' as const, label: 'Seeded run' }];
const FAULT_LABEL: Record<ScriptedFault, string> = {
  'crash-leader': `Crash the leader at ${SCRIPTED_CRASH_AT} ms`,
  'slow-b2': 'Slow follower b2',
  'slow-b3': 'Slow follower b3',
};
const SCRIPTED_FAULTS = Object.keys(FAULT_LABEL) as ScriptedFault[];
const LANES = [
  { id: 'producer', label: 'producer' },
  { id: 'b1', label: 'b1' },
  { id: 'b2', label: 'b2' },
  { id: 'b3', label: 'b3' },
  { id: 'ctl', label: 'controller' },
];
const ROWS = [...BROKERS, 'lost'] as const;
const CELL_FONT = 10;

const sameConfig = (a: ReplConfig, b: ReplConfig) => a.acks === b.acks && effectiveConfig(a).minIsr === effectiveConfig(b).minIsr && a.unclean === b.unclean;

export function ReplicationScene({ picker }: { picker: ReactNode }) {
  const [c, setC] = useState<ReplControls>(DEFAULT_REPL);
  const [following, setFollowing] = useState(true);
  const [at, setAt] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const phone = useMediaQuery(PHONE_QUERY);

  const set = (patch: Partial<ReplControls>) => {
    setC((old) => {
      const next = { ...old, ...patch };
      const reseeds = following && !('seed' in patch) && next.schedule === 'seeded';
      return reseeds ? { ...next, seed: pinnedSeed(next.config, next.seededFaults) } : next;
    });
    setAt(null);
    setNote('');
  };
  const preset = (patch: Partial<ReplControls>, seeded: boolean) => {
    setFollowing(true);
    setC((old) => {
      const next = { ...old, ...patch, schedule: seeded ? ('seeded' as const) : ('scripted' as const) };
      return seeded ? { ...next, seed: pinnedSeed(next.config, next.seededFaults) } : next;
    });
    setAt(null);
    setNote('');
  };

  const run = useMemo(() => runRepl(c), [c]);
  const t = at === null ? HORIZON_MS : Math.min(at, HORIZON_MS);
  const frame = frameAt(run, t);
  const leader = liveLeader(frame);
  const verdict = run.verdict;
  const config = effectiveConfig(c.config);
  const lostIds = new Set(frame.lost.map((l) => l.id));
  const missingIds = new Set(frame.missing.map((l) => l.id));
  const finalFrame = run.frames[run.frames.length - 1];
  const sentCount = finalFrame.records.filter((r) => r.fate === 'sent').length;
  const cols = tapeColumns(frame);

  useIntroCaption(replicationCaption({ config, run, t }), [run, t]);

  const sequence = useMemo(() => {
    const rows = storyRows(run.cluster.trace, t);
    const used = new Set(rows.flatMap((r) => [r.from, r.to, r.node]));
    return toSequence(rows, { actors: LANES.filter((l) => used.has(l.id)), label: messageLabel, events: true, times: !phone });
  }, [run, t, phone]);

  const findSeed = () => {
    const found = lowestBrokenSeed(config, c.seededFaults);
    if (found === null) setNote(`No seed below ${SEED_COUNT} breaks these settings.`);
    else {
      setFollowing(true);
      set({ schedule: 'seeded', seed: found });
    }
  };

  const gridShape = {
    rows: ROWS.length,
    cols,
    size: 'sm' as const,
    rowLabels: ['b1', 'b2', 'b3', 'lost'],
    colLabels: Array.from({ length: cols }, (_, i) => i),
    rowDecor: (r: number) => {
      if (r === 3) {
        if (frame.missing.length > 0) return { tone: 'bad' as const, label: 'sent, missing from the leader' };
        return frame.lost.length > 0 ? { tone: 'bad' as const, label: 'acknowledged, missing' } : { tone: 'dim' as const, label: 'none lost' };
      }
      const b = BROKERS[r];
      if (!frame.brokers[b].up) return { tone: 'bad' as const, label: 'down' };
      if (frame.leader === b) return { tone: 'violet' as const, label: 'leader' };
      return frame.isr.includes(b) ? { tone: 'muted' as const, label: 'in ISR' } : { tone: 'dim' as const, label: 'out of ISR' };
    },
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          {config.acks === 0 ? (
            <Stat
              label="Sent, never confirmed"
              value={finalFrame.missing.length > 0 ? `✗ ${finalFrame.missing.length} of ${sentCount} missing` : `✓ ${sentCount} of ${sentCount} on the leader`}
              color={finalFrame.missing.length > 0 ? 'var(--bad)' : 'var(--ok)'}
              sub={finalFrame.missing.length > 0 ? 'the leader in office lacks them; the producer was told nothing' : `the leader in office holds every record sent, through ${HORIZON_MS} ms`}
            />
          ) : (
            <Stat label="Acknowledged writes" value={verdict.ok ? '✓ none lost' : '✗ lost'} color={verdict.ok ? 'var(--ok)' : 'var(--bad)'} sub={verdict.ok ? `through all ${HORIZON_MS} ms` : `first at ${Math.round(verdict.time)} ms, event ${verdict.step}`} />
          )}
          <Stat label="High watermark" value={leader ? leader.hwm : '–'} color="var(--hi)" sub={leader ? 'what the leader says every ISR member holds' : 'no live leader'} />
          <Stat label="In-sync set" value={frame.isr.length} sub={frame.isr.join(', ') || 'empty'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'committed: below the high watermark', shape: 'square' },
            { color: 'var(--hi)', label: 'in flight: above it (dashed line = the watermark)', shape: 'square' },
            { color: 'var(--bad)', label: 'an acknowledged record the leader lacks, or a refused write', shape: 'square' },
            { color: 'var(--dim)', label: 'a copy the leader does not hold, or a replica out of the ISR', shape: 'square' },
            { color: 'var(--violet)', label: 'the leader (rail)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Schedule" value={c.schedule} onChange={(schedule) => set({ schedule })} options={SCHEDULE_OPTIONS} />
          <ChipButton tone="bad" onClick={() => preset({ config: BROKEN_CONFIG, faults: ['crash-leader'] }, true)}>Broken: acks=1 (unclean too)</ChipButton>
          <ChipButton tone="ok" onClick={() => preset({ config: SAFE_CONFIG, faults: ['crash-leader'] }, false)}>Safe: acks=all, min.insync 2</ChipButton>
          <ChipButton tone="orange" onClick={() => preset({ config: UNCLEAN_CONFIG, faults: ['crash-leader', 'slow-b2', 'slow-b3'] }, false)}>Committed data lost</ChipButton>
        </>,
        <>
          <Segmented label="acks" value={c.config.acks} onChange={(acks) => set({ config: { ...c.config, acks } })} options={ACK_OPTIONS} />
          <Segmented label="min.insync.replicas" value={config.minIsr} onChange={(minIsr) => set({ config: { ...c.config, minIsr } })} options={MIN_ISR_OPTIONS} />
          <Toggle label="Election" value={c.config.unclean} onChange={(unclean) => set({ config: { ...c.config, unclean } })} off="Clean" on="Unclean" />
          {config.acks !== 'all' && <Hint>min.insync.replicas only matters for acks=all</Hint>}
          {config.acks === 'all' && (
            <Hint>
              With min.insync.replicas 1 the in-sync set can shrink to the leader alone, so an acknowledged record may sit on one broker. Every disk survives in this model, so such a record waits for its broker (unavailable, not lost); a broker that lost its disk would take it along, which 2 prevents by refusing writes instead (from memory, check the Kafka docs).
            </Hint>
          )}
          {c.schedule === 'seeded' && c.seed === BROKEN_SEED && config.acks === 1 && !verdict.ok && (
            <Hint>On seed {BROKEN_SEED} acks=1 alone is enough: the elected broker was in the in-sync set, so a clean election fails here too. Unclean election plays no part on this seed.</Hint>
          )}
        </>,
        c.schedule === 'scripted' ? (
          <>
            {SCRIPTED_FAULTS.map((f) => (
              <ChipButton key={f} tone="orange" on={c.faults.includes(f)} onClick={() => set({ faults: c.faults.includes(f) ? c.faults.filter((x) => x !== f) : [...c.faults, f] })}>
                {FAULT_LABEL[f]}
              </ChipButton>
            ))}
          </>
        ) : (
          <>
            <SeedField seed={c.seed} onSeed={(seed) => { setFollowing(false); set({ seed }); }} />
            <Toggle label="Faults" value={c.seededFaults} onChange={(seededFaults) => set({ seededFaults })} off="Delay only" on="Loss, duplication, crashes, stalls, cuts" />
            <Button onClick={findSeed}>Lowest seed that breaks it</Button>
          </>
        ),
        <>
          <Slider label="Replay to" value={t} min={0} max={HORIZON_MS} format={(v) => `${v} ms`} onChange={setAt} />
          {!verdict.ok && <Button onClick={() => setAt(Math.ceil(verdict.time))}>Go to the violation</Button>}
        </>,
      ]}
    >
      <div className="kp-stage stage-pad">
        <Box>
          <SectionTitle hint="one partition, three replicas; the number above a cell is its offset">Replicas</SectionTitle>
          <WideRegion minWidth={minWidthForText(cellGridFrame(gridShape).width, CELL_FONT)} label="Replica logs: scroll sideways to see all of it">
            <CellGrid
              {...gridShape}
              cell={(r, col) => {
                if (r === 3) {
                  const l = frame.lost.find((x) => x.offset === col);
                  return l ? { tone: 'bad', fill: 'solid', text: `r${l.id}` } : { fill: 'none' };
                }
                const b = frame.brokers[BROKERS[r]];
                const id = b.log[col];
                return id === undefined ? { fill: 'none' } : cellFor(id, col, leader, lostIds);
              }}
              overlay={({ at: pos, cell, gap }) => {
                if (!leader) return null;
                const x = pos(0, Math.max(0, leader.hwm - 1)).x + (leader.hwm === 0 ? -gap / 2 : cell + gap / 2);
                return <line className="kp-hwm" x1={x} x2={x} y1={pos(0, 0).y - 3} y2={pos(2, 0).y + cell + 3} />;
              }}
              cellTitle={(r, col) => {
                if (r === 3) return '';
                const id = frame.brokers[BROKERS[r]].log[col];
                return id === undefined ? '' : `${BROKERS[r]}, offset ${col}: record r${id}`;
              }}
              ariaLabel={`Logs of the three replicas at ${t} ms; high watermark ${leader ? leader.hwm : 'unknown'}`}
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="what the producer was told">Records</SectionTitle>
          <table className="data-table kp-records">
            <thead>
              <tr><th scope="col">Record</th><th scope="col">Sent</th><th scope="col">The producer was told</th></tr>
            </thead>
            <tbody>
              {frame.records.map((r) => (
                <tr key={r.id} className={lostIds.has(r.id) || missingIds.has(r.id) ? 'is-lost' : ''}>
                  <td>r{r.id}</td>
                  <td>{Math.round(r.at)} ms</td>
                  <td>
                    {r.fate === 'acked' && `acknowledged at ${Math.round(r.ackedAt ?? 0)} ms, offset ${r.offset}${lostIds.has(r.id) ? ': now missing from the leader' : ''}`}
                    {r.fate === 'refused' && `refused: ${r.reason}`}
                    {r.fate === 'failed' && `failed: ${r.reason}`}
                    {r.fate === 'sent' && `nothing (acks=0: no reply is ever sent)${missingIds.has(r.id) ? ': and it is missing from the leader' : ''}`}
                    {r.fate === 'open' && 'waiting'}
                  </td>
                </tr>
              ))}
              {frame.records.length === 0 && <tr><td colSpan={3} className="empty-note">No record sent yet.</td></tr>}
            </tbody>
          </table>
        </Box>
        <Box>
          <SectionTitle hint="produces, acknowledgements, data and truncations; heartbeats and empty fetches left out">The messages</SectionTitle>
          <SequenceDiagram actors={sequence.actors} messages={sequence.messages} ariaLabel="Messages between the producer, the brokers and the controller" />
        </Box>
        {note && <p className="kp-status" role="status">{note}</p>}
        <ProvenanceRow>
          {c.schedule === 'seeded' ? (
            <Provenance kind="simulated" seed={c.seed}>{c.seed === BROKEN_SEED && sameConfig(c.config, BROKEN_CONFIG) ? 'the lowest seed that breaks the broken settings; ' : ''}three brokers, a controller and a producer on a seeded fault schedule</Provenance>
          ) : (
            <Provenance kind="scripted">a hand-built schedule on the same simulator: fixed delays, no loss, the same under every seed</Provenance>
          )}
          <Provenance kind="toy">one partition, a controller that never fails, disks that survive a crash, a producer that never retries and always sends once; broker names and timings are not Kafka's</Provenance>
          <Provenance kind="from-memory">in recent Kafka versions acks=all with an idempotent producer is the client default, min.insync.replicas defaults to 1 and unclean election is off by default (check the Kafka docs for your version)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
