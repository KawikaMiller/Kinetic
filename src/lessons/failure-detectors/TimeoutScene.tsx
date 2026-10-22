import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { CLOSED_FORM_NOTE, initialTimeout, timeoutCaption, type TimeoutState } from './init';
import { Lane } from './Lane';
import {
  BROKEN_SEED, CLOSED_FORM_MAX_JITTER, JITTER, PHI, SCENE_RUN_MS, SWEEP_SEEDS, SWEEP_TIMEOUTS, TIMEOUT, accuracyMessage, detectionMean, detectionTime,
  expectedFalseInRun, falsePerMinute, falseSuspicions, measurePoint, runDetector, setupFor, waitAfterArrival, type DetectorRule, type RunKind,
} from './model';

const RULES: { value: DetectorRule; label: string }[] = [
  { value: 'fixed', label: 'fixed timeout' },
  { value: 'phi', label: 'phi accrual' },
];
const PLOT_FALSE_Y: [number, number] = [0.01, 1000];
const PLOT_DETECT_Y: [number, number] = [0, 700];

const legend = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'a heartbeat arriving at M', shape: 'line' },
      { color: 'var(--bad)', label: 'M suspects a peer that is alive' },
      { color: 'var(--ok)', label: 'M suspects a peer that is down or paused' },
      { color: 'var(--violet)', label: 'P paused (alive, so a suspicion there is not counted as false)' },
    ]}
  />
);

export function TimeoutScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<TimeoutState>(initialTimeout);
  const { controls, ran, dots } = s;
  const patch = (p: Partial<typeof controls>) => setS((x) => ({ ...x, controls: { ...x.controls, ...p } }));
  const run = (kind: RunKind) => setS((x) => ({ ...x, ran: kind }));
  const d = useMemo(() => (ran === null ? null : runDetector(setupFor(controls, ran), SCENE_RUN_MS)), [controls, ran]);
  const falseCount = d === null ? null : falseSuspicions(d).length;
  const took = d === null ? null : detectionTime(d);
  const broken = d === null ? null : accuracyMessage(d);
  const fixed = controls.rule === 'fixed';
  const waitMs = d === null ? controls.timeoutMs : waitAfterArrival(controls, d.monitor.gaps);
  const dotsHere = dots !== null && dots.jitterMs === controls.jitterMs ? dots.points : null;
  const falseDots = useMemo(() => (dotsHere ?? []).filter((p) => p.falsePerMin > 0).map((p) => ({ x: p.timeoutMs, y: p.falsePerMin, tone: 'info' as const })), [dotsHere]);
  const detectDots = useMemo(() => (dotsHere ?? []).map((p) => ({ x: p.timeoutMs, y: p.detectionMs, tone: 'info' as const })), [dotsHere]);
  const measure = () => setS((x) => ({ ...x, dots: { jitterMs: x.controls.jitterMs, points: SWEEP_TIMEOUTS.map((t) => measurePoint(x.controls, t)) } }));
  const caption = timeoutCaption(s, falseCount);

  return (
    <StageFrame
      height={620}
      intro={caption}
      introKey={`${ran}|${controls.rule}|${controls.timeoutMs}|${controls.jitterMs}|${controls.phi}|${controls.seed}|${falseCount}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="False suspicions" value={falseCount ?? '–'} color={falseCount ? 'var(--bad)' : undefined} sub={fixed ? `closed form expects ${decimal(expectedFalseInRun(controls.timeoutMs, controls.jitterMs, SCENE_RUN_MS), 2)} per 10 s` : 'a live peer suspected'} />
          <Stat label="Detection time" value={took === null ? '–' : `${Math.round(took)} ms`} color={took === null ? undefined : 'var(--ok)'} sub={fixed ? `closed form: ${decimal(detectionMean(controls.timeoutMs, controls.jitterMs), 0)} ms on average` : 'crash to a lasting suspicion'} />
          <Stat label={fixed ? 'M waits' : 'Implied timeout'} value={`${decimal(waitMs, 0)} ms`} sub={fixed ? 'fixed, whatever the jitter' : 'moves when the jitter moves'} />
          <Stat label="Rule 0 (accuracy)" value={d === null ? 'not run' : broken === null ? 'holds in this run' : 'broken'} color={broken === null ? undefined : 'var(--bad)'} sub={broken ?? 'a live peer is not suspected'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Rule" value={controls.rule} onChange={(rule) => patch({ rule })} options={RULES} />
        </>,
        <>
          <Slider label={fixed ? 'Timeout T' : 'Warm-up timeout T'} value={controls.timeoutMs} min={TIMEOUT.min} max={TIMEOUT.max} step={TIMEOUT.step} format={(v) => `${v} ms`} onChange={(timeoutMs) => patch({ timeoutMs })} />
          <Slider label="Jitter (mean extra delay)" value={controls.jitterMs} min={JITTER.min} max={JITTER.max} step={JITTER.step} format={(v) => `${v} ms`} onChange={(jitterMs) => patch({ jitterMs })} />
          {!fixed && <Slider label="Threshold phi" value={controls.phi} min={PHI.min} max={PHI.max} step={PHI.step} onChange={(phi) => patch({ phi })} />}
        </>,
        <>
          <Button variant="primary" onClick={() => run('quiet')}>Run 10 s</Button>
          <Button onClick={() => run('crash')}>Crash P at about 5 s</Button>
          <Button onClick={() => run('pause')}>Pause P 5.0 to 5.6 s</Button>
          <SeedField seed={controls.seed} onSeed={(seed) => patch({ seed })} />
          <ChipButton tone="bad" onClick={() => patch({ seed: BROKEN_SEED, timeoutMs: TIMEOUT.default, jitterMs: JITTER.default, rule: 'fixed' })}>Load the lowest failing seed ({BROKEN_SEED})</ChipButton>
          <Button onClick={() => setS(initialTimeout())}>Reset</Button>
        </>,
      ]}
    >
      <div className="fd-stage stage-pad">
        <Box>
          <SectionTitle hint="a tick is a heartbeat arriving; a bar is M suspecting P">One run, seed {controls.seed}</SectionTitle>
          {d === null ? <Hint tone="muted" block>Nothing has run yet. Press a button below.</Hint> : <Lane d={d} from={0} to={SCENE_RUN_MS} label={`Heartbeats and suspicions over ${SCENE_RUN_MS / 1000} seconds`} />}
          {controls.jitterMs > CLOSED_FORM_MAX_JITTER && fixed && <Hint tone="muted" block>Above {CLOSED_FORM_MAX_JITTER} ms of jitter the delay is cut at 300 ms often enough that the closed form is approximate here.</Hint>}
        </Box>
        {fixed && (
          <Box>
            <SectionTitle hint={`closed form for jitter ${controls.jitterMs} ms; dots sampled over ${SWEEP_SEEDS} seeded 60 s runs`}>The trade-off</SectionTitle>
            <div className="fd-plots">
              <div className="fd-plot">
                <Plot2D x={{ domain: [TIMEOUT.min, TIMEOUT.max], label: 'timeout T (ms)' }} y={{ domain: PLOT_FALSE_Y, log: true, label: 'false suspicions per minute' }} ariaLabel="False suspicions per minute against the timeout, closed form with measured dots">
                  <Curve fn={(t) => falsePerMinute(t, controls.jitterMs)} tone="bad" />
                  <Points data={falseDots} />
                  <VLine at={controls.timeoutMs} label={`T ${controls.timeoutMs}`} tone="hi" />
                  <HLine at={1} label="1 a minute" tone="dim" />
                </Plot2D>
              </div>
              <div className="fd-plot">
                <Plot2D x={{ domain: [TIMEOUT.min, TIMEOUT.max], label: 'timeout T (ms)' }} y={{ domain: PLOT_DETECT_Y, label: 'detection time (ms)' }} ariaLabel="Mean detection time against the timeout, closed form with measured dots">
                  <Curve fn={(t) => detectionMean(t, controls.jitterMs)} tone="ok" />
                  <Points data={detectDots} />
                  <VLine at={controls.timeoutMs} label={`T ${controls.timeoutMs}`} tone="hi" />
                </Plot2D>
              </div>
            </div>
            <p className="fd-note">{CLOSED_FORM_NOTE} Dots at zero are not drawn on a log axis.</p>
            <Button onClick={measure}>Measure {SWEEP_SEEDS} runs at each T (about 2 s)</Button>
            {dots !== null && dotsHere === null && <Hint tone="muted">These dots were measured at {dots.jitterMs} ms of jitter. Measure again for {controls.jitterMs} ms.</Hint>}
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={controls.seed}>one monitor and one peer on the distSim harness; the heartbeat period, the delay shape and every threshold are made up</Provenance>
          <Provenance kind="illustrative">a fixed timeout is the simplest rule; no real system's default is shown</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
