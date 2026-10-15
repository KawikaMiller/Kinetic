import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane, type GanttMarker } from '../../components/GanttLanes';
import { MetricMeter } from '../../components/MetricMeter';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { hedgeFrames, msText, sampleSelectionNote, timelineEnd } from './frames';
import {
  CORRELATION_RANGE, HEDGE_BACKEND, HEDGE_DEFAULT, HEDGE_DELAY_RANGE, P99_TARGET_MS, REPLICA_CHOICES, hedgeReport, hedgeRun, hedgedShare, p95DelayMs, thirdCopyEffect, type Hedge,
  type HedgedRequest,
} from './model';
import { pctText } from '../../core/format';
import { SeedField } from '../../components/SeedField';

const STEP_MS = 420;
const METER_MAX = 400;
const REPLICA_OPTIONS = REPLICA_CHOICES.map((r) => ({ value: r, label: r === 1 ? '1 (no hedge)' : `${r} copies` }));
const COPY_NAME = (j: number) => (j === 0 ? 'first' : `copy ${j + 1}`);

/** The bars of the sample requests at `now`: a copy runs until its reply or until the winner cancels it. */
function sampleBars(samples: readonly HedgedRequest[], now: number): GanttBar[] {
  const planned = samples.flatMap((r, i) =>
    r.sentAt.map((start, j): GanttBar => {
      const done = now >= r.latency;
      const tone = done ? (j === r.winner ? 'ok' : 'dim') : j === 0 ? 'info' : 'violet';
      return {
        id: `r${i}c${j}`,
        lane: `r${i}c${j}`,
        start,
        end: Math.min(r.replyAt[j], r.latency),
        tone,
        kind: done && j !== r.winner ? 'blocked' : 'work',
        label: `request ${i + 1}, ${j === 0 ? 'first copy' : `copy ${j + 1}`}${done && j !== r.winner ? ', cancelled' : ''}`,
      };
    }),
  );
  return barsAt(planned, now);
}

export function HedgeScene({ picker }: { picker: ReactNode }) {
  const [hedge, setHedge] = useState<Hedge>(HEDGE_DEFAULT);
  const [seed, setSeed] = useState(1);
  const run = useMemo(() => hedgeRun(HEDGE_BACKEND, hedge, seed), [hedge, seed]);
  const report = useMemo(() => hedgeReport(HEDGE_BACKEND, hedge, run), [hedge, run]);
  const frames = useMemo(() => hedgeFrames(run.samples, hedge, report), [run, hedge, report]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;
  const end = timelineEnd(run.samples);
  const p95 = p95DelayMs(HEDGE_BACKEND);
  const third = hedge.replicas === 3 ? thirdCopyEffect(HEDGE_BACKEND, hedge) : null;

  const lanes: GanttLane[] = run.samples.flatMap((_, i) =>
    Array.from({ length: hedge.replicas }, (__, j) => ({ id: `r${i}c${j}`, label: `req ${i + 1} · ${COPY_NAME(j)}` })),
  );
  const markers: GanttMarker[] = Array.from({ length: hedge.replicas - 1 }, (_, k) => ({
    at: (k + 1) * hedge.delay,
    label: k === 0 ? `hedge after ${hedge.delay} ms` : `${k + 1}× delay`,
    tone: 'violet',
  }));

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="p99 without hedging" value={msText(report.plainP99)} color="var(--info)" sub={['exact', `the run reads ${msText(report.plainP99Sim)}`]} />
          <Stat label="p99 with hedging" value={msText(report.hedgedP99)} color="var(--violet)" sub={['from the survival formula', `the run reads ${msText(report.hedgedP99Sim)}`]} />
          <Stat
            label="Extra load"
            value={pctText(report.extra, 1)}
            color="var(--orange)"
            sub={[hedge.replicas === 1 ? 'no second copy is ever sent' : `${pctText(report.extraSim, 1)} in the run`, 'requests sent beyond the first copy']}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'first copy' },
            { color: 'var(--violet)', label: 'hedge copy' },
            { color: 'var(--ok)', label: 'winner' },
            { color: 'var(--dim)', label: 'cancelled (dashed)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Copies" value={hedge.replicas} onChange={(replicas) => setHedge((h) => ({ ...h, replicas }))} options={REPLICA_OPTIONS} />
          <ChipButton tone="violet" on={hedge.delay === p95} onClick={() => setHedge((h) => ({ ...h, delay: p95 }))}>
            delay = p95 of one call ({p95} ms)
          </ChipButton>
        </>,
        <>
          <Slider label="Hedge delay" value={hedge.delay} {...HEDGE_DELAY_RANGE} format={(v) => `${v} ms`} onChange={(delay) => setHedge((h) => ({ ...h, delay }))} />
          <Slider
            label="Shared fate"
            value={hedge.correlation}
            {...CORRELATION_RANGE}
            format={(v) => pctText(v, 0)}
            onChange={(correlation) => setHedge((h) => ({ ...h, correlation }))}
          />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="tl-stage stage-pad">
        <Box className="tl-onerequest">
          <SectionTitle hint="six seeded requests, chosen as the note below says; press play">The first replies win</SectionTitle>
          <WideRegion minWidth={480} label="Hedged requests: scroll sideways to see all of the timeline">
            <GanttLanes
              lanes={lanes}
              bars={sampleBars(run.samples, now)}
              domain={[0, end]}
              now={now}
              markers={markers}
              unit=" ms"
              axis
              size="sm"
              labelWidth={124}
              labelMinPx={Number.POSITIVE_INFINITY}
              ariaLabel="Six sample requests with their hedged copies"
            />
          </WideRegion>
          <Hint tone="muted" block>{sampleSelectionNote(run.samples, hedgedShare(run))}</Hint>
        </Box>
        <MetricMeter
          label={`Hedged p99 against a ${P99_TARGET_MS} ms target`}
          value={report.hedgedP99}
          max={METER_MAX}
          format={msText}
          bands={[
            { upTo: P99_TARGET_MS, tone: 'ok', label: 'within target', tick: { label: `target ${P99_TARGET_MS} ms`, tone: 'dim' } },
            { upTo: METER_MAX, tone: 'bad', label: 'over target' },
          ]}
          className="tl-meter"
        />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>100,000 seeded requests, one backend model (log-normal, 1% slow, ×10)</Provenance>
          <Provenance kind="illustrative">latencies and the {P99_TARGET_MS} ms target are made up</Provenance>
          <Provenance kind="from-memory">hedged requests and the roughly 5% extra load at a p95 delay: The Tail at Scale (Dean and Barroso, 2013), verify before quoting</Provenance>
        </ProvenanceRow>
        {third && (
          <Hint tone="muted" className="tl-note">
            The third copy goes out at {third.goesOutAt} ms, when {pctText(third.stillWaiting, 1)} of requests are still waiting, so it moves the hedged p99 from {msText(third.p99Without)} to {msText(third.p99With)}.
          </Hint>
        )}
        <Hint tone="muted" className="tl-note">
          Copies are independent unless shared fate says otherwise: with that probability every copy of a request has the first copy&apos;s latency, as when one rack or one
          dependency is slow. At 100% hedging only adds load. With one copy the delay and shared fate do nothing.
        </Hint>
      </div>
    </StageFrame>
  );
}
