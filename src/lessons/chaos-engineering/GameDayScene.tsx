import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Band, Curve, HLine, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { integer, pctText } from '../../core/format';
import { faultText, gameFallbacks, initialGame, outcomeText, successFloor, type GameState } from './init';
import { FAULT_FROM, FAULT_TO, GAME_ABORT, RUN_TICKS, SWEEP_SEEDS, gameDay, longestBadRun, sweepGameDays, type Experiment } from './model';

const legend = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'observed checkout success', shape: 'line' },
      { color: 'var(--bad)', label: 'the abort threshold', shape: 'line' },
      { color: 'var(--violet)', label: 'the fault window' },
    ]}
  />
);

function RunPlot({ title, e, hint, floor }: { title: string; e: Experiment; hint: string; floor: number }) {
  const points = useMemo(() => e.ticks.map((t, i) => [i + 1, t.success] as [number, number]), [e]);
  return (
    <div className="ce-plot">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <Plot2D x={{ domain: [1, RUN_TICKS], label: 'tick' }} y={{ domain: [floor, 1], label: 'checkout success' }} ariaLabel={`${title}: checkout success per tick`}>
        <Band lo={floor} hi={1} from={FAULT_FROM} to={FAULT_TO} tone="violet" />
        <HLine at={GAME_ABORT.belowShare} tone="bad" />
        <Curve points={points} tone="info" />
      </Plot2D>
    </div>
  );
}

export function GameDayScene({ picker }: { picker: ReactNode }) {
  const [g, setG] = useState<GameState>(initialGame);
  const { seed, recsFallback } = g;
  const fallbacks = useMemo(() => gameFallbacks({ seed, recsFallback }), [seed, recsFallback]);
  const day = useMemo(() => gameDay(seed, fallbacks), [seed, fallbacks]);
  const sweep = useMemo(() => sweepGameDays(fallbacks), [fallbacks]);
  const lowest = sweep.withoutAbort[0];
  const floor = Math.min(successFloor(day.withoutAbort, GAME_ABORT.belowShare), successFloor(day.withAbort, GAME_ABORT.belowShare));
  const rule = `success never below ${pctText(GAME_ABORT.belowShare, 0)} for more than ${GAME_ABORT.w + 1} ticks in a row`;

  return (
    <StageFrame
      height={440}
      intro={`Seed ${g.seed} draws this experiment: ${faultText(day.card.fault, day.card.exposure)}. Without an abort it ${day.brokenWithout ? 'breaks' : 'keeps'} the rule (${rule}); with one it ${day.brokenWith ? 'breaks' : 'keeps'} it.`}
      introKey={`${g.seed}|${g.recsFallback}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Without an abort" value={`${sweep.withoutAbort.length} of ${SWEEP_SEEDS}`} color={sweep.withoutAbort.length > 0 ? 'var(--bad)' : undefined} sub={`seeds that break the rule, sampled over seeds 1 to ${SWEEP_SEEDS}`} />
          <Stat label="With the abort" value={`${sweep.withAbort.length} of ${SWEEP_SEEDS}`} color="var(--ok)" sub={`abort below ${pctText(GAME_ABORT.belowShare, 0)} for ${GAME_ABORT.w} ticks`} />
          <Stat label="This seed's cost" value={`${integer(day.withoutAbort.failedTotal)} to ${integer(day.withAbort.failedTotal)}`} sub="failed requests without and with the abort" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="recs edge" value={g.recsFallback} onChange={(recsFallback) => setG((x) => ({ ...x, recsFallback }))} off="No fallback (the flaw)" on="Has a fallback" />
        </>,
        <>
          <SeedField seed={g.seed} onSeed={(seed) => setG((x) => ({ ...x, seed }))} />
          {lowest !== undefined && <ChipButton tone="bad" onClick={() => setG((x) => ({ ...x, seed: lowest }))}>Load the lowest failing seed ({lowest})</ChipButton>}
          <Button onClick={() => setG(initialGame())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ce-stage stage-pad">
        <Box>
          <SectionTitle hint={`drawn from seed ${g.seed}: target ${day.card.fault.target}, ${faultText(day.card.fault, day.card.exposure)}`}>The same experiment, twice</SectionTitle>
          <div className="ce-pair">
            <RunPlot title="No abort condition" floor={floor} e={day.withoutAbort} hint={`${outcomeText(day.withoutAbort, day.card)}; longest bad run ${longestBadRun(day.withoutAbort.ticks, GAME_ABORT.belowShare)} ticks`} />
            <RunPlot title="With the abort" floor={floor} e={day.withAbort} hint={`${outcomeText(day.withAbort, day.card)}; longest bad run ${longestBadRun(day.withAbort.ticks, GAME_ABORT.belowShare)} ticks`} />
          </div>
        </Box>
        <p className="ce-note">
          Rule 0: {rule}. The sweep counts seeds on which it breaks. Turning the fallback on drops the count without abort but not to zero: other services still hurt. Sampled over {SWEEP_SEEDS} seeds, with target, fault and exposure drawn from the seed.
        </p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={g.seed}>the experiment, its target, its size and its exposure are all drawn from the seed</Provenance>
          <Provenance kind="illustrative">thresholds and instance counts are made up</Provenance>
          <Provenance kind="from-memory">the practice was popularised by a streaming company's chaos tooling and published principles; verify against the published Principles of Chaos Engineering page before attributing it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
