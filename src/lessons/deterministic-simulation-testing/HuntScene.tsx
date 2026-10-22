import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { integer, pctText } from '../../core/format';
import { BookingDiagram } from './BookingDiagram';
import { huntCaption, initialHunt, selectedSeed, type HuntState } from './init';
import { HUNT_N, LOSS, WINDOW, defaultBooking, failureProbability, hunt, runBooking } from './model';

const SHOWN_FAILURES = 12;

const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a booking one replica granted' },
      { color: 'var(--bad)', label: 'both replicas granted (the rule broke)' },
      { color: 'var(--info)', label: 'a replicate message' },
      { color: 'var(--dim)', label: 'a booking that was refused' },
      { color: 'var(--hi)', label: 'a trace hash that matches the previous replay' },
    ]}
  />
);

export function HuntScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<HuntState>(initialHunt);
  const patch = (p: Partial<HuntState>) => setS((x) => ({ ...x, ...p, selected: null, replays: [null, null] }));
  const base = useMemo(() => ({ ...defaultBooking(), windowMs: s.windowMs, loss: s.loss }), [s.windowMs, s.loss]);
  const h = useMemo(() => (s.ran ? hunt(base, s.start, s.n) : null), [s.ran, base, s.start, s.n]);
  const chosen = selectedSeed(s, h);
  const run = useMemo(() => (chosen === null ? null : runBooking({ ...base, seed: chosen })), [base, chosen]);
  const exact = failureProbability(s.windowMs, s.loss);
  const hashes = run === null ? [] : [run.hash, ...s.replays.filter((x): x is string => x !== null)];
  const replay = (slot: 0 | 1) => run !== null && setS((x) => ({ ...x, replays: x.replays.map((r, i) => (i === slot ? runBooking({ ...base, seed: run.setup.seed }).hash : r)) }));

  return (
    <StageFrame
      height={640}
      intro={huntCaption(s, h)}
      introKey={`${s.windowMs}|${s.loss}|${s.n}|${s.start}|${s.ran}|${h?.failures.length}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="First failing seed" value={h === null ? '–' : h.failures[0] ?? 'none'} color={h?.failures.length ? 'var(--bad)' : undefined} sub={h?.triesToFirst ? `after ${h.triesToFirst} seeds tried` : 'seeds tried until the first failure'} />
          <Stat label="Failures" value={h === null ? '–' : `${h.failures.length} of ${integer(h.count)}`} sub={[`sampled over seeds ${s.start} to ${s.start + s.n - 1}`, `exact chance per seed: ${pctText(exact, 1)}`]} />
          <Stat label="Distinct traces" value={h === null ? '–' : integer(h.distinct)} sub="measured: how many different runs the seeds made" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Request window W" value={s.windowMs} min={WINDOW.min} max={WINDOW.max} step={WINDOW.step} format={(v) => `${v} ms`} onChange={(windowMs) => patch({ windowMs })} />
          <Slider label="Messages lost" value={s.loss} min={LOSS.min} max={LOSS.max} step={LOSS.step} format={(v) => pctText(v, 0)} onChange={(loss) => patch({ loss })} />
          <Slider label="Seeds N" value={s.n} min={HUNT_N.min} max={HUNT_N.max} step={HUNT_N.step} format={integer} onChange={(n) => patch({ n })} />
        </>,
        <>
          <SeedField seed={s.start} label="Start seed" onSeed={(start) => patch({ start })} />
          <Button variant="primary" onClick={() => setS((x) => ({ ...x, ran: true, selected: null, replays: [null, null] }))}>Hunt</Button>
          <Button softDisabled={run === null} onClick={() => replay(0)}>Replay seed</Button>
          <Button softDisabled={run === null || s.replays[0] === null} onClick={() => replay(1)}>Replay again</Button>
          <Button onClick={() => setS(initialHunt())}>Reset</Button>
        </>,
      ]}
    >
      <div className="dst-stage stage-pad">
        {h !== null && h.failures.length > 0 && (
          <Box>
            <SectionTitle hint={`the first ${Math.min(SHOWN_FAILURES, h.failures.length)} of ${h.failures.length} failing seeds; pick one`}>Failing seeds</SectionTitle>
            <div className="dst-chips">
              {h.failures.slice(0, SHOWN_FAILURES).map((seed) => (
                <ChipButton key={seed} tone="bad" on={chosen === seed} onClick={() => setS((x) => ({ ...x, selected: seed, replays: [null, null] }))}>{seed}</ChipButton>
              ))}
            </div>
          </Box>
        )}
        {h !== null && h.failures.length === 0 && <Hint tone="muted" block>{integer(h.count)} schedules passed. Not "no failure exists": the schedules not tried may still fail.</Hint>}
        {run !== null && (
          <Box>
            <SectionTitle hint={`seed ${run.setup.seed}: ${run.failed ? run.message : 'the rule held'}`}>The schedule this seed made</SectionTitle>
            <BookingDiagram run={run} />
            <div className="dst-hashes">
              {hashes.map((hash, i) => (
                <span key={i} className={`dst-hash ${i > 0 && hash === hashes[i - 1] ? 'is-same' : i > 0 ? 'is-diff' : ''}`}>
                  {i === 0 ? 'hunt' : i === 1 ? 'replay' : 'replay again'}: <code>{hash}</code>
                </span>
              ))}
            </div>
          </Box>
        )}
        <p className="dst-note">
          Related: a failing seed plays the part of a property-based test's counterexample, for a whole schedule (<Link to="/lesson/property-based-testing">property-based testing</Link>), and a replayable failure is the cure for <Link to="/lesson/flaky-tests">flaky tests</Link>.
        </p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.start}>two replicas on the distSim harness; the seed sets the request times, the link delays and the loss</Provenance>
          <Provenance kind="toy">a deliberately small bug, not a real booking system</Provenance>
          <Provenance kind="from-memory">FoundationDB's simulation testing is the best-known industrial example of this approach; verify before relying on that, and nothing here claims how it works inside</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
