import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram, type SequenceActor } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toSequence, type TraceRow } from '../../core/distSim';
import { SeedField } from '../distributions/SeedField';
import { serviceCaption } from './captions';
import { HistoryGantt } from './HistoryGantt';
import { clientTone, type HistoryBar } from './historyBars';
import { MODEL_NAME, ORDER_MODELS, type OrderModel } from './model';
import {
  BROKEN_SEED, DEFAULT_DESIGN, DESIGNS, REPLICAS, SEARCH_SEEDS, SERVICE_CLIENTS, lowestFailingSeed, runService, writeVersions, type Design, type Msg, type ServiceRun,
} from './service';
import { answeredBy, firstBreakTime, serviceView } from './view';
import { VerdictStats } from './VerdictStats';

const DESIGN_OPTIONS = DESIGNS.map((d) => ({ value: d.id, label: d.label }));
const SEARCHED: readonly OrderModel[] = ['linearizable', 'sequential'];

/** The messages that explain a violation: every request and answer of the operations in the set, and the leader's copy of each write in it. */
function relevantRows(run: ServiceRun, opIds: ReadonlySet<string>, t: number): TraceRow<Msg>[] {
  const versions = writeVersions(run.trace);
  const copies = new Set([...opIds].flatMap((id) => (versions.has(Number(id.slice(2))) ? [versions.get(Number(id.slice(2)))!] : [])));
  return run.trace.filter((row) => {
    const p = row.payload;
    if (row.t > t || !p || (row.kind !== 'send' && row.kind !== 'deliver' && row.kind !== 'drop')) return false;
    return p.type === 'replicate' ? copies.has(p.version) : opIds.has(`op${p.op}`);
  });
}

const messageLabel = (p: Msg): string => {
  if (p.type === 'request') return p.kind === 'write' ? `write x=${p.value}` : 'read x';
  if (p.type === 'reply') return `x=${p.value} (version ${p.version})`;
  return `copy x=${p.value} (version ${p.version})`;
};

const ACTORS: readonly SequenceActor[] = [
  ...SERVICE_CLIENTS.map((c) => ({ id: c, label: c.toUpperCase(), tone: clientTone(c.toUpperCase()) })),
  ...REPLICAS.map((r) => ({ id: r, label: r === 'r1' ? 'r1 (leader)' : r })),
];

export function ServiceScene({ picker }: { picker: ReactNode }) {
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [seed, setSeed] = useState(BROKEN_SEED);
  const [at, setAt] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const run = useMemo(() => runService(design, seed), [design, seed]);
  const t = at === null ? run.end : Math.min(at, run.end);
  const view = useMemo(() => serviceView(run, t), [run, t]);
  const breaks = useMemo(
    () => Object.fromEntries(ORDER_MODELS.map((m) => [m, firstBreakTime(m, run.ops)])) as Record<OrderModel, number | null>,
    [run],
  );
  const earliest = Math.min(...ORDER_MODELS.flatMap((m) => (breaks[m] === null ? [] : [breaks[m]!])));
  const firstBreak = view.explained && breaks[view.explained] !== null ? { model: view.explained, at: breaks[view.explained]! } : null;
  const responses = useMemo(() => [...new Set(run.ops.flatMap((o) => (o.response === null ? [] : [o.response])))].sort((a, b) => a - b), [run]);

  const ringed = view.subset?.map((o) => o.id) ?? [];
  const bars: HistoryBar[] = run.ops.map((o) => {
    const done = o.response !== null && o.response <= t;
    return {
      id: `op${o.op}`,
      client: o.client.toUpperCase(),
      kind: o.kind,
      value: o.value ?? 0,
      start: o.invoke,
      end: o.response ?? run.end,
      ...(o.kind === 'read' && !done ? { label: 'R→…' } : {}),
    };
  });
  const sequence = useMemo(
    () => toSequence(view.subset ? relevantRows(run, new Set(view.subset.map((o) => o.id)), t) : [], { actors: ACTORS, label: messageLabel, events: false, times: true }),
    [run, view.subset, t],
  );

  // Only the lanes the trace uses: fewer lanes keep the diagram's time notes at a readable size on a phone.
  const lanes = useMemo(() => ACTORS.filter((a) => sequence.messages.some((m) => m.from === a.id || m.to === a.id)), [sequence]);

  useIntroCaption(
    serviceCaption({ design, seed, t, end: run.end, answered: answeredBy(run.ops, t), view, firstBreak }),
    [design, seed, t],
  );

  const pick = (next: Design) => {
    setDesign(next);
    setAt(null);
    setNote('');
  };
  const chooseSeed = (next: number) => {
    setSeed(next);
    setAt(null);
    setNote('');
  };
  const search = (model: OrderModel) => {
    const found = lowestFailingSeed(design, model, SEARCH_SEEDS);
    if (found === null) setNote(`No seed below ${SEARCH_SEEDS} makes this design break ${MODEL_NAME[model].toLowerCase()}.`);
    else chooseSeed(found);
  };
  const nextAnswer = responses.find((r) => r > t);

  return (
    <StageFrame
      height={420}
      stats={
        <VerdictStats
          verdicts={view.verdicts}
          subsetSizes={view.explained && view.subset ? { [view.explained]: view.subset.length } : undefined}
        />
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'C1' },
            { color: 'var(--sky)', label: 'C2' },
            { color: 'var(--pink)', label: 'C3' },
            { color: 'var(--ok)', label: 'model holds so far' },
            { color: 'var(--bad)', label: 'model fails' },
            { color: 'var(--hi)', label: 'smallest violating set', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Design" value={design} onChange={pick} options={DESIGN_OPTIONS} />
        </>,
        <>
          <SeedField seed={seed} onSeed={chooseSeed} />
          {SEARCHED.map((m) => (
            <Button key={m} onClick={() => search(m)}>Lowest seed that breaks {m}</Button>
          ))}
        </>,
        <>
          <Slider label="Replay to" value={t} min={0} max={run.end} format={(v) => `${v} ms`} onChange={setAt} />
          <Button disabled={nextAnswer === undefined} onClick={() => setAt(nextAnswer ?? run.end)}>Next answer ▶</Button>
          <Button disabled={!Number.isFinite(earliest)} onClick={() => setAt(earliest)}>Jump to the first break</Button>
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <HistoryGantt bars={bars} domain={[0, Math.max(run.end, 1)]} now={t} ringed={ringed} unit=" ms" ariaLabel={`Recorded history of ${design} on seed ${seed}`} />
        {note && <p className="cm-status" role="status">{note}</p>}
        <Box>
          <SectionTitle hint="only the messages behind the ringed operations">The trace of the violation</SectionTitle>
          {view.subset ? (
            <SequenceDiagram actors={lanes} messages={sequence.messages} ariaLabel="Messages behind the smallest violating set" />
          ) : (
            <Hint tone="muted">Every order model holds on the history up to {t} ms, so there is no violation to trace. Replay further, or try another design or seed.</Hint>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>three replicas and three clients on the distSim harness; delay and duplication, no loss, no timeouts</Provenance>
          <Provenance kind="illustrative">latencies and think times are made up; a real store's lag is different</Provenance>
          <Provenance kind="toy">the same exhaustive checkers as scene 1, run on the recorded history</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
