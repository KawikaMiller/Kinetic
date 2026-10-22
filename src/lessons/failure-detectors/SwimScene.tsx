import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { toSequence } from '../../core/distSim';
import { integer, pctText } from '../../core/format';
import { initialSwim, swimCaption, swimExactSub } from './init';
import {
  SWIM_HELPERS, SWIM_K, SWIM_LOSS, SWIM_PERIOD_MS, SWIM_END_MS, runSwim, swimEnumerated, swimFalseSuspicions, swimPatternCount, type SwimCut, type SwimMsg, type SwimSetup,
} from './model';

const CUTS: { value: SwimCut; label: string }[] = [
  { value: 'none', label: 'no cut' },
  { value: 'both', label: 'M and B cut both ways' },
  { value: 'm-to-b', label: 'M to B only' },
  { value: 'b-to-m', label: 'B to M only' },
];
const ACTORS = [
  { id: 'M', label: 'M' },
  ...SWIM_HELPERS.map((h) => ({ id: h, label: h })),
  { id: 'B', label: 'B' },
];
const SHOWN_PERIODS = 2;
const SHOWN_UNTIL_MS = SHOWN_PERIODS * SWIM_PERIOD_MS + SWIM_END_MS;

const msgLabel = (p: SwimMsg): string => (p.type === 'ping' && p.origin ? 'ping (for M)' : p.type === 'ack' && p.origin ? 'ack (for M)' : p.type);

const legend = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'a probe or an ack in flight' },
      { color: 'var(--bad)', label: 'a lost message (the arrow stops at a cross)' },
      { color: 'var(--violet)', label: 'the cut between M and B' },
    ]}
  />
);

export function SwimScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<SwimSetup>(initialSwim);
  const set = (p: Partial<SwimSetup>) => setS((x) => ({ ...x, ...p }));
  const result = useMemo(() => runSwim(s), [s]);
  const exact = useMemo(() => swimEnumerated(s.loss, s.k, s.cut), [s.loss, s.k, s.cut]);
  const missed = swimFalseSuspicions(result);
  const sequence = useMemo(() => toSequence(result.cluster.trace.filter((r) => r.t <= SHOWN_UNTIL_MS), { actors: ACTORS, label: msgLabel, events: false }), [result]);

  return (
    <StageFrame
      height={620}
      intro={swimCaption(s, exact)}
      introKey={`${s.seed}|${s.loss}|${s.k}|${s.cut}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Wrongly suspected" value={pctText(exact, 2)} color={exact > 0 ? 'var(--bad)' : 'var(--ok)'} sub={swimExactSub(s, swimPatternCount(s.k))} />
          <Stat label="Measured" value={`${missed} of ${s.periods}`} sub={`periods without an ack, sampled over ${integer(s.periods)} periods (${pctText(missed / s.periods, 2)})`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Messages lost" value={s.loss} min={SWIM_LOSS.min} max={SWIM_LOSS.max} step={SWIM_LOSS.step} format={(v) => pctText(v, 0)} onChange={(loss) => set({ loss })} />
          <Slider label="Helpers asked (k)" value={s.k} min={SWIM_K.min} max={SWIM_K.max} step={SWIM_K.step} onChange={(k) => set({ k })} />
        </>,
        <>
          <Segmented label="Link between M and B" value={s.cut} onChange={(cut) => set({ cut })} options={CUTS} />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
          <Button onClick={() => setS(initialSwim())}>Reset</Button>
        </>,
      ]}
    >
      <div className="fd-stage stage-pad">
        <Box>
          <SectionTitle hint={`the first ${SHOWN_PERIODS} protocol periods of seed ${s.seed}; B is alive throughout`}>Who asked whom</SectionTitle>
          <SequenceDiagram actors={ACTORS} messages={sequence.messages} ariaLabel="Probes, acks and indirect probes between M, the four helpers and B" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>six nodes on the distSim harness, every message lost independently with the chosen chance</Provenance>
          <Provenance kind="from-memory">SWIM is from a 2002 paper by Das, Gupta and Motivala; its suspect-then-confirm step and incarnation numbers are named here, not built; verify against the paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
