import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { integer, pctText } from '../../core/format';
import { gridShape, initialSpread, meanText, spreadCaption, type SpreadState } from './init';
import {
  BROKEN_SPREAD, BROKEN_SPREAD_SEED, CLUSTER_SIZES, FANOUT, HORIZON_ROUNDS, LOSS, MODES, SWEEP_SEEDS, dieApplies, expectedCurve, leftOut, runSpread, sweepSpread,
  type Mode, type SpreadSetup,
} from './model';

const MODE_OPTIONS = MODES.map((m) => ({ value: m, label: m }));
const SIZE_OPTIONS = CLUSTER_SIZES.map((n) => ({ value: n, label: String(n) }));

const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'a node that knows the rumour' },
      { color: 'var(--dim)', label: 'a node that does not yet' },
      { color: 'var(--bad)', label: 'a node left out at the horizon' },
      { color: 'var(--info)', label: 'the expectation (a model, not a run)', shape: 'line' },
    ]}
  />
);

export function SpreadScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<SpreadState>(initialSpread);
  const { setup, round } = s;
  const patch = (p: Partial<SpreadSetup>) => setS({ setup: { ...setup, ...p }, round: 0 });
  const run = useMemo(() => runSpread(setup), [setup]);
  const lastRound = run.counts.length - 1;
  const at = Math.min(round, lastRound);
  const finished = at === lastRound;
  const missing = finished && run.completeAt === null;
  const out = useMemo(() => new Set(leftOut(run)), [run]);
  const deferred = useDeferredValue(setup);
  const { n: sweepN, f: sweepF, mode: sweepMode, die: sweepDie, loss: sweepLoss } = deferred;
  const sweep = useMemo(() => sweepSpread({ n: sweepN, f: sweepF, mode: sweepMode, die: sweepDie, loss: sweepLoss }), [sweepN, sweepF, sweepMode, sweepDie, sweepLoss]);
  const mean = useMemo(() => expectedCurve(setup, HORIZON_ROUNDS), [setup]);
  const expectedPoints = useMemo(() => mean.map((u, r) => [r, setup.n - u] as [number, number]), [mean, setup.n]);
  const actual = useMemo(() => run.counts.slice(0, at + 1).map((c, r) => ({ x: r, y: c, tone: 'hi' as const })), [run, at]);
  const actualLine = useMemo(() => actual.map((p) => [p.x, p.y] as [number, number]), [actual]);
  const { rows, cols } = gridShape(setup.n);
  const caption = spreadCaption(run, at);

  return (
    <StageFrame
      height={640}
      intro={caption}
      introKey={`${setup.n}|${setup.f}|${setup.mode}|${setup.die}|${setup.loss}|${setup.seed}|${at}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Know the rumour" value={`${run.counts[at]} of ${setup.n}`} color={missing ? 'var(--bad)' : undefined} sub={`after round ${at}`} />
          <Stat label="Messages sent" value={integer(run.messages[at])} sub="the cost of getting there" />
          <Stat label="Rounds to cover everyone" value={run.completeAt === null ? (finished ? `not by round ${HORIZON_ROUNDS}` : 'not yet') : run.completeAt} color={missing ? 'var(--bad)' : undefined} sub={`this seed (${setup.seed})`} />
          <Stat label={`Measured over ${SWEEP_SEEDS} seeds`} value={meanText(sweep.meanRounds)} color={sweep.failed > 0 ? 'var(--bad)' : undefined} sub={[`mean rounds, sampled over seeds 1 to ${SWEEP_SEEDS}`, `fails to cover everyone by round ${HORIZON_ROUNDS} on ${sweep.failed} of ${SWEEP_SEEDS} seeds`]} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Nodes n" value={setup.n} onChange={(n) => patch({ n })} options={SIZE_OPTIONS} />
          <Segmented label="Mode" value={setup.mode} onChange={(mode: Mode) => patch({ mode })} options={MODE_OPTIONS} />
        </>,
        <>
          <Slider label="Fanout f" value={setup.f} min={FANOUT.min} max={FANOUT.max} onChange={(f) => patch({ f })} />
          <Slider label="Messages lost" value={setup.loss} min={LOSS.min} max={LOSS.max} step={LOSS.step} format={(v) => pctText(v, 0)} onChange={(loss) => patch({ loss })} />
          {dieApplies(setup.mode) && <Toggle label="Stop after one round (infect and die)" value={setup.die} onChange={(die) => patch({ die })} off="Keep gossiping" on="Push once, then stop" />}
        </>,
        <>
          <Button variant="primary" softDisabled={finished} onClick={() => setS({ ...s, round: Math.min(lastRound, at + 1) })}>Step one round</Button>
          <Button softDisabled={finished} onClick={() => setS({ ...s, round: lastRound })}>Run to the end</Button>
          <SeedField seed={setup.seed} onSeed={(seed) => patch({ seed })} />
          <ChipButton tone="bad" onClick={() => setS({ setup: { ...BROKEN_SPREAD, seed: BROKEN_SPREAD_SEED }, round: 0 })}>Load the lowest failing seed ({BROKEN_SPREAD_SEED})</ChipButton>
          <Button onClick={() => setS(initialSpread())}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <Box>
          <SectionTitle hint={`one cell per node, seed ${setup.seed}; each round all messages land before the next tick`}>Who knows</SectionTitle>
          <CellGrid
            rows={rows}
            cols={cols}
            size={setup.n > 64 ? 'sm' : 'md'}
            ariaLabel={`${run.counts[at]} of ${setup.n} nodes know the rumour after round ${at}`}
            cell={(r, c) => {
              const i = r * cols + c;
              if (i >= setup.n) return { text: '', tone: 'muted', fill: 'none' };
              const known = run.informed[at][i];
              if (known) return { text: setup.n <= 64 ? String(i) : '', tone: 'hi', fill: 'solid' };
              return { text: setup.n <= 64 ? String(i) : '', tone: missing && out.has(i) ? 'bad' : 'dim', fill: 'tint' };
            }}
          />
        </Box>
        <Box>
          <SectionTitle hint="informed nodes after each round; dashed is the exact recursion for the expected count">Spread over rounds</SectionTitle>
          <Plot2D x={{ domain: [0, HORIZON_ROUNDS], label: 'round' }} y={{ domain: [0, setup.n], label: 'nodes that know' }} ariaLabel="Informed nodes after each round, with the expected curve">
            <Curve points={expectedPoints} tone="info" dashed />
            {actualLine.length > 1 && <Curve points={actualLine} tone="hi" />}
            <Points data={actual} />
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>nodes on the distSim harness, one round every 100 ms, every message landing within the round</Provenance>
          <Provenance kind="illustrative">the round length and cluster sizes are made up; the expectation curve is an exact recursion (a model), the mean is sampled over {SWEEP_SEEDS} seeds</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
