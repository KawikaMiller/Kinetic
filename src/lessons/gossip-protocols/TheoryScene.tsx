import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { MEASURE_SIZES, THEORY_SIZES, initialTheory, type TheoryState } from './init';
import { MODES, SWEEP_SEEDS, defaultSpread, expectedCurve, meanRounds, pushReference, roundsBelow, type Mode } from './model';

const CURVE_ROUNDS = 20;
const MODE_TONE = { push: 'amber', pull: 'pink', 'push-pull': 'sky' } as const;
const SIZE_OPTIONS = THEORY_SIZES.map((n) => ({ value: n, label: String(n) }));
const MIN_PLOTTED = 0.01;

const legend = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'push', shape: 'line' },
      { color: 'var(--pink)', label: 'pull', shape: 'line' },
      { color: 'var(--sky)', label: 'push-pull', shape: 'line' },
      { color: 'var(--info)', label: 'measured mean rounds (sampled)' },
      { color: 'var(--dim)', label: 'log2 n + ln n', shape: 'line' },
    ]}
  />
);

const curveFor = (n: number, mode: Mode): [number, number][] =>
  expectedCurve({ ...defaultSpread(), n, mode }, CURVE_ROUNDS).map((u, r) => [r, Math.max(MIN_PLOTTED, u)]);

export function TheoryScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<TheoryState>(initialTheory);
  const curves = useMemo(() => MODES.map((mode) => ({ mode, points: curveFor(s.n, mode) })), [s.n]);
  const table = useMemo(() => MODES.map((mode) => ({ mode, rounds: THEORY_SIZES.map((n) => roundsBelow({ ...defaultSpread(), n, mode })) })), []);
  const measure = () => setS((x) => ({ ...x, measured: MEASURE_SIZES.map((n) => ({ n, mean: meanRounds({ ...defaultSpread(), n }) })) }));
  const dots = useMemo(() => (s.measured ?? []).map((m) => ({ x: m.n, y: m.mean, tone: 'info' as const })), [s.measured]);
  const push = table[0].rounds;
  const pushPull = table[2].rounds;

  return (
    <StageFrame
      height={720}
      intro={`The end game decides the winner: with few nodes left uninformed, push rarely hits them, pull asks them to find an informed node, and push-pull does both. At n = ${s.n} the expectation falls below half a node after ${roundsBelow({ ...defaultSpread(), n: s.n, mode: 'push' })} rounds of push and ${roundsBelow({ ...defaultSpread(), n: s.n, mode: 'push-pull' })} of push-pull.`}
      introKey={`${s.n}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Push, n = 16, 64, 256" value={push.join(', ')} sub="rounds until the expected uninformed count is below 0.5" />
          <Stat label="Push-pull, same sizes" value={pushPull.join(', ')} sub="exact recursion, not a run" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Nodes n" value={s.n} onChange={(n) => setS((x) => ({ ...x, n }))} options={SIZE_OPTIONS} />
          <Button onClick={measure}>Measure mean rounds, {SWEEP_SEEDS} seeds per size (about 2 s)</Button>
          <Button onClick={() => setS(initialTheory())}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <Box>
          <SectionTitle hint={`fanout 1, n = ${s.n}; the exact one-step recursion applied round after round`}>Expected uninformed nodes</SectionTitle>
          <Plot2D x={{ domain: [0, CURVE_ROUNDS], label: 'round' }} y={{ domain: [MIN_PLOTTED, s.n], log: true, label: 'expected uninformed (log)' }} ariaLabel="Expected number of uninformed nodes per round for push, pull and push-pull">
            {curves.map((c) => <Curve key={c.mode} points={c.points} tone={MODE_TONE[c.mode]} />)}
          </Plot2D>
          <table className="data-table gp-table">
            <thead>
              <tr><th>Rounds until expected uninformed &lt; 0.5</th>{THEORY_SIZES.map((n) => <th key={n}>n = {n}</th>)}</tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.mode}>
                  <th scope="row" className="keep-case">{r.mode}</th>
                  {r.rounds.map((v, i) => <td key={THEORY_SIZES[i]}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Box>
          <SectionTitle hint="push, fanout 1: measured mean rounds to cover everyone against the reference">Why log n</SectionTitle>
          <Plot2D x={{ domain: [8, 256], log: true, label: 'nodes n' }} y={{ domain: [0, 18], label: 'rounds' }} ariaLabel="Measured mean rounds against the number of nodes, with the reference log2 n plus ln n">
            <Curve fn={(n) => pushReference(n)} tone="dim" />
            <Points data={dots} />
          </Plot2D>
          <p className="gp-note">
            {s.measured === null
              ? 'Press Measure to run the seeded simulation at each size.'
              : `Measured minus reference: ${s.measured.map((m) => `${decimal(m.mean - pushReference(m.n), 2)} at n = ${m.n}`).join(', ')}. The offset is a constant, shown and not hidden.`}
          </p>
          <ClaimLabel kind="research">the log2 n + ln n form for push gossip is a known result (Pittel, 1987), quoted from memory; verify before relying on it</ClaimLabel>
          <p className="gp-note">
            Gossip decides what to send; a digest exchange that decides what to repair is <Link to="/lesson/merkle-trees">Merkle trees</Link>.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={1}>the dots are seeded runs of the distSim spread on seeds 1 to {SWEEP_SEEDS}</Provenance>
          <Provenance kind="from-memory">epidemic replication goes back to a 1987 paper by Demers and colleagues; verify the attribution</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
