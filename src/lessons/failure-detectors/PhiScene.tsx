import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal, integer, power } from '../../core/format';
import { initialPhi, type PhiState } from './init';
import { HEARTBEAT_MS, JITTER, PHI, PHI_DISPLAY_CAP, SWEEP_SEEDS, TIMEOUT, WINDOW, phiAt, phiReadout } from './model';

const PLOT_T_MAX = 600;
const PERCENT = 100;

const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'phi, the model\'s suspicion after the last heartbeat', shape: 'line' },
      { color: 'var(--dim)', label: 'the threshold, and the fixed timeout for comparison', shape: 'line' },
      { color: 'var(--violet)', label: 'the implied timeout where phi meets the threshold', shape: 'line' },
    ]}
  />
);

const oneIn = (p: number): string => `1 in ${integer(1 / p)}`;

export function PhiScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<PhiState>(initialPhi);
  const set = (p: Partial<PhiState>) => setS((x) => ({ ...x, ...p }));
  const r = useMemo(() => phiReadout(s.seed, s.jitterMs, s.phi), [s.seed, s.jitterMs, s.phi]);
  const share = r.gaps === 0 ? 0 : r.exceeded / r.gaps;

  return (
    <StageFrame
      height={520}
      intro={`M keeps the last ${WINDOW} gaps between heartbeats, fits a normal curve (mean ${decimal(r.mu, 1)} ms, spread ${decimal(r.sigma, 1)} ms) and reports phi: the number of nines in the chance that the next one is this late. A threshold of ${s.phi} waits ${decimal(r.timeoutMs, 0)} ms.`}
      introKey={`${s.seed}|${s.jitterMs}|${s.phi}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Implied timeout" value={`${decimal(r.timeoutMs, 0)} ms`} color="var(--violet)" sub={`mean + spread x z, from phi = ${s.phi}`} />
          <Stat label="Model says" value={`1 in ${power(s.phi, 10)}`} sub="chance a gap beats the timeout, if gaps were normal" />
          <Stat label="This jitter's gaps" value={oneIn(r.actual)} color="var(--bad)" sub="closed form for the gaps the simulation makes" />
          <Stat label="Measured" value={`${r.exceeded} of ${r.gaps}`} sub={`gaps over the timeout, sampled over ${SWEEP_SEEDS} seeds (${decimal(share * PERCENT, 2)}%)`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Threshold phi" value={s.phi} min={PHI.min} max={PHI.max} step={PHI.step} onChange={(phi) => set({ phi })} />
          <Slider label="Jitter (mean extra delay)" value={s.jitterMs} min={JITTER.min} max={JITTER.max} step={JITTER.step} format={(v) => `${v} ms`} onChange={(jitterMs) => set({ jitterMs })} />
        </>,
        <>
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
          <Button onClick={() => setS(initialPhi())}>Reset</Button>
        </>,
      ]}
    >
      <div className="fd-stage stage-pad">
        <Box>
          <SectionTitle hint="time since the last heartbeat arrived">phi as the silence grows</SectionTitle>
          <Plot2D x={{ domain: [0, PLOT_T_MAX], label: 'time since the last heartbeat (ms)' }} y={{ domain: [0, PHI_DISPLAY_CAP], label: 'phi (shown up to 16)' }} ariaLabel="Phi against the time since the last heartbeat, with the threshold and the implied timeout">
            <Curve fn={(t) => phiAt(t, r.mu, r.sigma)} tone="hi" />
            <HLine at={s.phi} label={`threshold ${s.phi}`} tone="dim" />
            <VLine at={r.timeoutMs} label={`${decimal(r.timeoutMs, 0)} ms`} tone="violet" />
            <VLine at={TIMEOUT.default} label="fixed 185" tone="dim" />
          </Plot2D>
          <p className="fd-note">The timeout moves when the jitter moves; a fixed timeout does not. Try jitter {JITTER.min} ms and {JITTER.max} ms.</p>
        </Box>
        <Hint tone="muted" block>
          Phi is the model's statement, not a promise: real gaps are not normal. Here a gap is {HEARTBEAT_MS} ms plus the difference of two exponential delays, which has a heavier tail than a normal curve, so the chance a gap beats the timeout is far above one in {power(s.phi, 10)}.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>the gaps come from the heartbeat simulation on distSim</Provenance>
          <Provenance kind="toy">a normal fitted to a window of gaps; real detectors differ in the details</Provenance>
          <Provenance kind="from-memory">the phi accrual detector is from a 2004 paper by Hayashibara and colleagues, and Cassandra and Akka are said to use variants of it; verify authors, year and both claims</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
