import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { pctText } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { hideFrames, utilisationSoFar, type HideFrame } from './frames';
import { GANTT_TICKS, HIDE, STALL_CURVES, WARMUP_TICKS, createHideSim, hideSegments, idealUtilisation, steadyUtilisation, warpsToHide, windowTicks, type HideParams } from './model';
import { hidingOpening } from './openings';

const CURVE_TONES = ['sky', 'amber', 'pink'] as const;
const WARP_AXIS = Array.from({ length: HIDE.warps.max }, (_, i) => i + 1);

export function HidingScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState<HideParams>(hidingOpening);
  const sim = useMemo(() => createHideSim(p), [p]);
  const frames = useMemo(() => hideFrames(sim, p), [sim, p]);
  const player = usePlayer<HideFrame>(frames, { interval: 260, autoplayOnChange: false });
  const now = player.frame.now;

  const lanes: GanttLane[] = useMemo(() => Array.from({ length: p.warps }, (_, i) => ({ id: `w${i}`, label: `warp ${i}` })), [p.warps]);
  const plan = useMemo<GanttBar[]>(
    () =>
      hideSegments(sim, GANTT_TICKS).map((seg) => ({
        id: `w${seg.warp}-${seg.start}`,
        lane: `w${seg.warp}`,
        start: seg.start,
        end: seg.end,
        tone: seg.status === 'run' ? 'hi' : seg.status === 'wait' ? 'dim' : 'info',
        kind: seg.status === 'run' ? 'work' : seg.status === 'wait' ? 'wait' : 'blocked',
        label: `warp ${seg.warp}, ${seg.status === 'run' ? 'issuing' : seg.status === 'wait' ? 'ready, slot taken' : 'waiting on memory'}`,
      })),
    [sim],
  );

  const steady = useMemo(() => steadyUtilisation(p), [p]);
  const ideal = idealUtilisation(p);
  const need = warpsToHide(p.compute, p.stall);
  const sweeps = useMemo(
    () => STALL_CURVES.map((stall) => ({ stall, points: WARP_AXIS.map((warps): [number, number] => [warps, steadyUtilisation({ warps, compute: p.compute, stall })]) })),
    [p.compute],
  );
  const so = utilisationSoFar(sim, now);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Busy so far" value={so === null ? '–' : pctText(so, 0)} sub={[`issue slot used in ${Math.floor(now)} ticks`]} />
          <Stat label="Busy in steady state" value={pctText(steady, 0)} color="var(--info)" sub={[`ticks ${WARMUP_TICKS} to ${WARMUP_TICKS + windowTicks(p)} of the run`, `formula min(1, W·c / (c + L)) gives ${pctText(ideal, 0)}`]} />
          <Stat label="Warps to hide the stall" value={need} sub={[`(c + L) / c = (${p.compute} + ${p.stall}) / ${p.compute}, rounded up`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'issuing' },
            { color: 'var(--dim)', label: 'ready, slot taken (hatched)' },
            { color: 'var(--info)', label: 'waiting on memory (dashed)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Warps W" value={p.warps} {...HIDE.warps} onChange={(warps) => setP((c) => ({ ...c, warps }))} />
          <Slider label="Memory stall L" value={p.stall} {...HIDE.stall} format={(v) => `${v} ticks`} onChange={(stall) => setP((c) => ({ ...c, stall }))} />
          <Slider label="Compute burst c" value={p.compute} {...HIDE.compute} format={(v) => `${v} ticks`} onChange={(compute) => setP((c) => ({ ...c, compute }))} />
        </>,
        <>
          <ChipButton tone="info" on={p.warps === Math.min(need, HIDE.warps.max)} onClick={() => setP((c) => ({ ...c, warps: Math.min(warpsToHide(c.compute, c.stall), HIDE.warps.max) }))}>
            enough warps to hide the stall
          </ChipButton>
        </>,
      ]}
    >
      <div className="sg-stage stage-pad">
        <div className="sg-timeline">
        <WideRegion minWidth={480} label="Issue timeline: scroll sideways to see all of it">
          <GanttLanes lanes={lanes} bars={barsAt(plan, now)} domain={[0, GANTT_TICKS]} now={now} axis unit=" t" size="sm" labelWidth={64} labelMinPx={Number.POSITIVE_INFINITY} ariaLabel="Which warp issues in each of the first 60 ticks" />
        </WideRegion>
        </div>
        <Plot2D
          x={{ domain: [1, HIDE.warps.max], label: 'resident warps', ticks: 8 }}
          y={{ domain: [0, 1], label: 'issue slot busy', format: (v) => pctText(v, 0), ticks: 5 }}
          ariaLabel={`Steady-state issue-slot use against the number of warps, for stalls of ${STALL_CURVES.join(', ')} ticks`}
        >
          {sweeps.map((s, i) => (
            <Curve key={s.stall} points={s.points} tone={CURVE_TONES[i]} />
          ))}
          <VLine at={p.warps} label={`W = ${p.warps}`} />
          <Points data={[{ x: p.warps, y: steady, tone: 'info' }]} />
        </Plot2D>
        <Legend items={STALL_CURVES.map((stall, i) => ({ color: `var(--${CURVE_TONES[i]})`, label: `L = ${stall} ticks`, shape: 'line' as const }))} />
        <ProvenanceRow>
          <Provenance kind="toy">warps, stall length and compute burst are made-up tick counts; one issue slot a tick, greedy-then-round-robin scheduling</Provenance>
          <Provenance kind="simulated">the busy figures are measured from the tick sim, not typed; this model has no randomness, so its trace is the same every run</Provenance>
          <Provenance kind="illustrative">a real GPU hides latency with thousands of resident threads, not {HIDE.warps.max} warps; the numbers here only show the shape</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
