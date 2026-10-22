import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { Lane } from './Lane';
import { DECIDE, crashPauseCaption, initialCrashPause, ms, type CrashPauseState } from './init';
import { BROKEN_SEED, CRASH_AT_MS, PAUSE, judge, twinRuns, type Guess } from './model';

const LANE_FROM_MS = 4_000;
const LANE_MIN_TO_MS = 8_000;
const SHOWN_ARRIVALS = 4;

const legend = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'a heartbeat arriving at M', shape: 'line' },
      { color: 'var(--violet)', label: 'P paused (alive)' },
      { color: 'var(--ok)', label: 'M suspects a peer that is down or paused' },
      { color: 'var(--bad)', label: 'M suspects a peer that is alive' },
    ]}
  />
);

const lastArrivals = (arrivals: readonly number[], at: number): string =>
  arrivals.filter((t) => t <= at).slice(-SHOWN_ARRIVALS).map((t) => Math.round(t)).join(', ');

export function CrashPauseScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<CrashPauseState>(initialCrashPause);
  const set = (p: Partial<CrashPauseState>) => setS((x) => ({ ...x, ...p }));
  const twin = useMemo(() => twinRuns(s.seed, s.pauseMs), [s.seed, s.pauseMs]);
  const to = Math.max(LANE_MIN_TO_MS, CRASH_AT_MS + s.pauseMs + 1_500);
  const parts = twin.partsAt;
  const verdict = s.answered === null ? null : judge(twin, s.answered.decideAt, s.answered.guess);
  const answer = (guess: Guess) => set({ answered: { guess, decideAt: s.decideAt } });
  const caption = crashPauseCaption(twin, s);

  return (
    <StageFrame
      height={560}
      intro={caption}
      introKey={`${s.seed}|${s.pauseMs}|${s.answered?.guess}|${s.answered?.decideAt}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="The runs part at" value={parts === null ? 'never' : ms(parts)} color="var(--violet)" sub={`first heartbeat after the pause: 5,000 + ${s.pauseMs} + its delay`} />
          <Stat label="Decide at" value={ms(s.decideAt)} sub={parts !== null && s.decideAt < parts ? 'M sees the same list in both runs' : 'the two lists differ now'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Pause length D" value={s.pauseMs} min={PAUSE.min} max={PAUSE.max} step={PAUSE.step} format={ms} onChange={(pauseMs) => set({ pauseMs, answered: null })} />
          <Slider label="Decide at" value={s.decideAt} min={DECIDE.min} max={DECIDE.max} step={DECIDE.step} format={ms} onChange={(decideAt) => set({ decideAt })} />
        </>,
        <>
          <Button variant="primary" onClick={() => answer('crashed')}>Say crashed</Button>
          <Button variant="primary" onClick={() => answer('paused')}>Say paused</Button>
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed, answered: null })} />
          <ChipButton tone="info" onClick={() => set({ seed: BROKEN_SEED })}>Seed {BROKEN_SEED}</ChipButton>
          <Button onClick={() => setS(initialCrashPause())}>Reset</Button>
        </>,
      ]}
    >
      <div className="fd-stage stage-pad">
        <Box>
          <SectionTitle hint="same seed, same network; only what happens to P differs">What M saw</SectionTitle>
          <div className="fd-pair">
            <div>
              <div className="fd-pair-title">Run A: P crashes at 5.0 s</div>
              <Lane d={twin.crash} from={LANE_FROM_MS} to={to} mark={parts === null ? undefined : { at: parts, label: 'runs part' }} decide={s.decideAt} label="Run A, heartbeats and suspicions with P crashing at 5 seconds" />
              <p className="fd-note">Heartbeats by {ms(s.decideAt)}: ...{lastArrivals(twin.crash.monitor.arrivals, s.decideAt)}</p>
            </div>
            <div>
              <div className="fd-pair-title">Run B: P paused for {s.pauseMs} ms from 5.0 s</div>
              <Lane d={twin.pause} from={LANE_FROM_MS} to={to} mark={parts === null ? undefined : { at: parts, label: 'runs part' }} decide={s.decideAt} label={`Run B, heartbeats and suspicions with P paused for ${s.pauseMs} milliseconds`} />
              <p className="fd-note">Heartbeats by {ms(s.decideAt)}: ...{lastArrivals(twin.pause.monitor.arrivals, s.decideAt)}</p>
            </div>
          </div>
          <p className="fd-note">
            Identical up to t = {parts === null ? 'the end of the run' : ms(parts)}: checked for these two runs (the lists are compared item by item). That is a fact about this pair of runs, not the general result.{' '}
            <ClaimLabel kind="theorem">In a fully asynchronous system no detector can both always suspect a crashed node and never suspect a live one</ClaimLabel>
          </p>
        </Box>
        {verdict !== null && (
          <Box>
            <SectionTitle hint={`you said "${s.answered?.guess}" at ${ms(s.answered?.decideAt ?? 0)}`}>The verdict</SectionTitle>
            <p className={`fd-verdict ${verdict.indistinguishable ? 'is-guess' : ''}`}>{verdict.text}</p>
            <p className="fd-note">{verdict.scope}</p>
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>two runs of the same monitor and peer; the crash, the pause and every delay are produced by the harness</Provenance>
          <Provenance kind="from-memory">the completeness and accuracy vocabulary is Chandra and Toueg, 1996; verify against the paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
