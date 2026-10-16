import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { barsFromHistogram } from '../../core/plot';
import { histogram } from '../../core/stats';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { queueFrames, queueIntro, queueSummary, stormNote } from './captions';
import { initialQueue } from './init';
import {
  ATTEMPTS_RANGE, BASE_RANGE, CAP_RANGE, LONG_RANGE, NET_RANGE, PINNED_QUEUE_SEED, VISIBILITY_RANGE, queueStatsAt, queueSweep, runQueue, type QueueSetup,
} from './queue';
import { QUEUE_LANES, STORM_BIN_MS, STORM_JOBS, STORM_RETRIES, queueBars, queueDomainS, queueLog, stormPeak } from './view';

const PLAY_MS = 130;
const GANTT_MIN_WIDTH = 520;
const seconds = (ms: number) => `${ms / 1000} s`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function QueueScene({ picker }: { picker: ReactNode }) {
  const [setup, setSetup] = useState(initialQueue);
  const patch = (p: Partial<QueueSetup>) => setSetup((s) => ({ ...s, ...p }));
  const run = useMemo(() => runQueue(setup), [setup]);
  const frames = useMemo(() => queueFrames(run, queueSummary(run), queueIntro(run)), [run]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;
  const stats = queueStatsAt(run, now);
  const bars = useMemo(() => queueBars(run), [run]);
  const rows = useMemo(() => queueLog(run, now), [run, now]);
  const storm = useMemo(() => stormPeak(setup), [setup]);
  const lockstep = useMemo(() => stormPeak({ ...setup, jitter: false }), [setup]);
  const withJitter = useMemo(() => stormPeak({ ...setup, jitter: true }), [setup]);
  const stormEnd = Math.max(1, Math.ceil(Math.max(...storm.times) / 1000)) * 1000;
  const hist = useMemo(() => histogram(storm.times, { bins: stormEnd / STORM_BIN_MS, min: 0, max: stormEnd }), [storm, stormEnd]);

  return (
    <StageFrame
      height={540}
      player={player}
      stats={
        <Stats>
          <Stat label="Done" value={stats.done} color="var(--ok)" sub={`of 4 jobs, by ${(now / 1000).toFixed(1)} s`} />
          <Stat label="Runs repeated" value={stats.duplicateRuns} color={stats.duplicateRuns > 0 ? 'var(--orange)' : undefined} sub="a job ran again after it had run" />
          <Stat label="Effects applied twice" value={stats.doubleEffects} color={stats.doubleEffects > 0 ? 'var(--bad)' : undefined} sub="the damage a repeat can do" />
          <Stat label="Retries" value={stats.retries} color={stats.retries > 0 ? 'var(--orange)' : undefined} sub="after a failure" />
          <Stat label="In the dead-letter queue" value={stats.dlq} color={stats.dlq > 0 ? 'var(--violet)' : undefined} sub="attempts used up" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a job running now' },
            { color: 'var(--ok)', label: 'a job that finished' },
            { color: 'var(--bad)', label: 'a run whose effect was applied twice' },
            { color: 'var(--dim)', label: 'a repeat that was a no-op, or a worker that died (dashed)' },
            { color: 'var(--orange)', label: 'a failed run and its retry' },
            { color: 'var(--violet)', label: 'the dead-letter queue and the idempotency key' },
            { color: 'var(--info)', label: 'a job visible again' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Idempotency key" value={setup.idempotent} onChange={(idempotent) => patch({ idempotent })} off="None" on="One per job" />
          <Toggle label="Worker w1" value={setup.killW1} onChange={(killW1) => patch({ killW1 })} off="Stays up" on="Dies at 1 s" />
          <Toggle label="Job 4" value={setup.poison} onChange={(poison) => patch({ poison })} off="Succeeds" on="Always fails" />
        </>,
        <>
          <Slider label="Visibility timeout" value={setup.visibilityMs} min={VISIBILITY_RANGE.min} max={VISIBILITY_RANGE.max} step={VISIBILITY_RANGE.step} format={seconds} onChange={(visibilityMs) => patch({ visibilityMs })} />
          <Slider label="Job 2 takes" value={setup.longJobMs} min={LONG_RANGE.min} max={LONG_RANGE.max} step={LONG_RANGE.step} format={seconds} onChange={(longJobMs) => patch({ longJobMs })} />
        </>,
        <>
          <Slider label="Max attempts" value={setup.maxAttempts} min={ATTEMPTS_RANGE.min} max={ATTEMPTS_RANGE.max} onChange={(maxAttempts) => patch({ maxAttempts })} />
          <Slider label="Backoff base" value={setup.baseMs} min={BASE_RANGE.min} max={BASE_RANGE.max} step={BASE_RANGE.step} format={seconds} onChange={(baseMs) => patch({ baseMs })} />
          <Slider label="Backoff cap" value={setup.capMs} min={CAP_RANGE.min} max={CAP_RANGE.max} step={CAP_RANGE.step} format={seconds} onChange={(capMs) => patch({ capMs })} />
          <Toggle label="Jitter" value={setup.jitter} onChange={(jitter) => patch({ jitter })} off="Off" on="Full jitter" />
        </>,
        <>
          <Slider label="Messages lost" value={setup.loss} min={NET_RANGE.min} max={NET_RANGE.max} step={NET_RANGE.step} format={percent} onChange={(loss) => patch({ loss })} />
          <Slider label="Messages duplicated" value={setup.duplicate} min={NET_RANGE.min} max={NET_RANGE.max} step={NET_RANGE.step} format={percent} onChange={(duplicate) => patch({ duplicate })} />
          <SeedField seed={setup.seed} onSeed={(seed) => patch({ seed })} />
          <ChipButton tone="bad" onClick={() => setSetup(queueSweep(PINNED_QUEUE_SEED, false))}>Load the lowest failing seed ({PINNED_QUEUE_SEED})</ChipButton>
          <Button onClick={() => setSetup(initialQueue())}>Reset</Button>
          <Hint tone="muted">Seed {PINNED_QUEUE_SEED} is the lowest of 200 seeded schedules that applies an effect twice without a key.</Hint>
        </>,
      ]}
    >
      <div className="js-stage stage-pad">
        <Box>
          <SectionTitle hint="seconds; the queue lane marks visible-again, retry and dead-letter moments">Workers and the queue</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Worker timeline: scroll sideways to see all of it">
            <GanttLanes lanes={QUEUE_LANES} bars={barsAt(bars, now / 1000)} domain={[0, queueDomainS(run)]} now={now / 1000} unit=" s" axis size="md" labelWidth={84} labelMinPx={26} ariaLabel="Runs of each job on the two workers, with the queue's visible-again, retry and dead-letter moments" />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle>What the queue and the effects store logged</SectionTitle>
          <LogStream label="Queue and effects store events" rows={rows} maxHeight={150} live="off" empty="Nothing has happened yet." />
        </Box>
        <Box>
          <SectionTitle hint={`${STORM_JOBS} jobs fail together, ${STORM_RETRIES} retries each, this backoff`}>Retries after a shared failure</SectionTitle>
          <Plot2D
            x={{ domain: [0, stormEnd], label: 'time of the retry (ms)', ticks: 4 }}
            y={{ domain: [0, Math.max(STORM_JOBS, lockstep.peak)], label: 'retries in a quarter second', ticks: 3 }}
            ariaLabel={`Retries over time with ${setup.jitter ? 'full jitter' : 'no jitter'}: at most ${storm.peak} in one quarter second`}
          >
            <Bars bars={barsFromHistogram(hist)} tone={setup.jitter ? 'orange' : 'bad'} />
          </Plot2D>
          <p className="js-note">{stormNote(lockstep.peak, withJitter.peak, STORM_JOBS, setup.jitter)}</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>a queue, two workers and an effects store on the distSim harness; the retry bars use a seeded draw</Provenance>
          <Provenance kind="illustrative">durations, windows and the 30-job storm are made up</Provenance>
          <Provenance kind="from-memory">full jitter, random(0, min(cap, base times 2 to the attempt)), is the name used in an AWS architecture post on retries; verify the name against it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
