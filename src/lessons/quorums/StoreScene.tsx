import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { SeedField } from '../distributions/SeedField';
import { storeCaption } from './captions';
import { STAND_INS, homesOf, type StoreMsg } from './store';
import { DEFAULT_STORE, HORIZON_MS, SCHEDULES, SEARCH_SEEDS, STORE_N, lowestBrokenSeed, runStore, setupFor, type Schedule, type StoreControls } from './storeView';

const SCHEDULE_OPTIONS = SCHEDULES.map((s) => ({ value: s.id, label: s.label }));
const DOMAIN_NOTE: Record<Schedule, string> = {
  inflight: 'Version 1 reaches A at 5 ms and B and C at 50 ms. One read hears A and C, a later one hears B and C.',
  sloppy: 'The writer side {W, A, S1, S2} is cut off from {X, B, C} until 300 ms.',
  seeded: 'Three writes and six reads at seeded times, seeded delays.',
};
const ACTORS = ['client', 'W', 'X', 'Y', ...homesOf(STORE_N), ...STAND_INS].map((id) => ({ id, label: id }));

const messageLabel = (p: StoreMsg): string => {
  switch (p.type) {
    case 'write': return `write v${p.version}`;
    case 'read': return 'read';
    case 'store': return p.hintFor ? `store v${p.version} (hint for ${p.hintFor})` : `store v${p.version}`;
    case 'stored': return 'stored';
    case 'fetch': return 'fetch';
    case 'value': return `v${p.version}`;
    case 'repair': return `repair v${p.version}`;
  }
};

export function StoreScene({ picker }: { picker: ReactNode }) {
  const [c, setC] = useState<StoreControls>(DEFAULT_STORE);
  const [at, setAt] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const set = (patch: Partial<StoreControls>) => {
    setC((old) => ({ ...old, ...patch }));
    setAt(null);
    setNote('');
  };
  const horizon = HORIZON_MS[c.schedule];
  const run = useMemo(() => runStore(setupFor(c), horizon), [c, horizon]);
  const t = at === null ? horizon : Math.min(at, horizon);
  const frame = [...run.frames].reverse().find((f) => f.t <= t) ?? run.frames[0];
  const sequence = useMemo(
    () => toSequence(run.cluster.trace.filter((r) => r.t <= t), { actors: ACTORS, label: messageLabel, events: false, times: true }),
    [run, t],
  );

  useIntroCaption(storeCaption({ schedule: c.schedule, run, w: c.w, r: c.r, sloppy: c.sloppy, t }), [run, t]);

  const sloppyApplies = c.schedule !== 'inflight';
  const find = () => {
    const found = lowestBrokenSeed(c, SEARCH_SEEDS);
    if (found === null) setNote(`No seed below ${SEARCH_SEEDS} breaks the invariant with these settings.`);
    else set({ schedule: 'seeded', seed: found });
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Acknowledged-write invariant" value={run.invariant ? '✗ broken' : '✓ holds'} color={run.invariant ? 'var(--bad)' : 'var(--ok)'} sub={run.invariant ?? 'a read after an acknowledged write never goes behind it'} />
          <Stat label="Linearizable" value={run.linearizable ? '✗ no' : '✓ yes'} color={run.linearizable ? 'var(--bad)' : 'var(--ok)'} sub="the same checker as the consistency lesson" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a replica with the newest version' },
            { color: 'var(--orange)', label: 'a stale replica' },
            { color: 'var(--amber)', label: 'a stand-in node' },
            { color: 'var(--dim)', label: 'a partition cut', shape: 'line' },
            { color: 'var(--cell-dead)', label: 'a crashed replica' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Schedule" value={c.schedule} onChange={(schedule) => set({ schedule })} options={SCHEDULE_OPTIONS} />
        </>,
        <>
          <Slider label="Write quorum W" value={c.w} min={1} max={STORE_N} onChange={(w) => set({ w })} />
          <Slider label="Read quorum R" value={c.r} min={1} max={STORE_N} onChange={(r) => set({ r })} />
          <Toggle label="Read repair" value={c.repair} onChange={(repair) => set({ repair })} />
          {sloppyApplies && <Toggle label="Sloppy quorum" value={c.sloppy} onChange={(sloppy) => set({ sloppy })} off="Strict" on="Sloppy" />}
        </>,
        <>
          {c.schedule === 'seeded' && (
            <>
              <SeedField seed={c.seed} onSeed={(seed) => set({ seed })} />
              <Toggle label="Faults" value={c.faults} onChange={(faults) => set({ faults })} off="Delay only" on="Loss, duplication, partition, crash" />
            </>
          )}
          <Button onClick={find}>Lowest seed that breaks it</Button>
          <Slider label="Replay to" value={t} min={0} max={horizon} format={(v) => `${v} ms`} onChange={setAt} />
        </>,
      ]}
    >
      <div className="qr-stage stage-pad">
        <Hint tone="muted">{DOMAIN_NOTE[c.schedule]}</Hint>
        <div className="qr-replicas" role="group" aria-label={`Replica versions at ${t} ms`}>
          {[...homesOf(STORE_N), ...(c.sloppy && sloppyApplies ? STAND_INS : [])].map((id) => {
            const f = frame.replicas[id];
            const newest = Math.max(...homesOf(STORE_N).map((h) => frame.replicas[h].version));
            const stale = homesOf(STORE_N).includes(id) && f.version < newest;
            const hint = Object.entries(f.hints).map(([home, v]) => `hint v${v} for ${home}`).join(', ');
            return (
              <div key={id} className={`qr-replica qr-static ${!f.up ? 'is-down' : stale ? 'is-stale' : homesOf(STORE_N).includes(id) && newest > 0 ? 'is-newest' : ''} ${STAND_INS.includes(id as (typeof STAND_INS)[number]) ? 'is-standin' : ''}`}>
                <b>{id}</b>
                <span className="qr-version">v{f.version}</span>
                <span className="qr-member">{!f.up ? 'down' : hint}</span>
              </div>
            );
          })}
        </div>
        <Box>
          <SectionTitle>The operations</SectionTitle>
          <table className="data-table qr-ops">
            <thead>
              <tr><th scope="col">Operation</th><th scope="col">Sent</th><th scope="col">Answered</th><th scope="col">Result</th></tr>
            </thead>
            <tbody>
              {run.ops.filter((o) => o.invoke <= t).map((o) => {
                const done = o.response !== null && o.response <= t;
                return (
                  <tr key={o.op}>
                    <td>{o.kind === 'write' ? `write v${o.value}` : 'read'} via {o.node}</td>
                    <td>{o.invoke} ms</td>
                    <td>{done ? `${o.response} ms` : '…'}</td>
                    <td>{!done ? 'waiting' : o.outcome === 'refused' ? 'no quorum' : o.kind === 'write' ? 'acknowledged' : `v${o.value}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <Box>
          <SectionTitle hint="every message so far">The messages</SectionTitle>
          <SequenceDiagram actors={ACTORS.filter((a) => sloppyApplies || !STAND_INS.includes(a.id as (typeof STAND_INS)[number]))} messages={sequence.messages} ariaLabel="Writes, reads and their replies" />
        </Box>
        {note && <p className="qr-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={c.schedule === 'seeded' ? c.seed : undefined}>
            {c.schedule === 'seeded' ? 'three replicas, a writer and readers on distSim' : 'a hand-built schedule on distSim with fixed delays'}; one writer, no conflict handling
          </Provenance>
          <Provenance kind="from-memory">hinted handoff and read repair are Dynamo-style details; check the Dynamo paper, and real stores' defaults are not shown</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
