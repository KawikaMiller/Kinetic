import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { barLabelPx } from '../../core/gantt';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { bytes } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { hddFrames, msText, rateText } from './frames';
import { HEAD_START, RANDOM_QUEUE, rotationMs, RPM, SECTOR_BYTES, SECTORS_PER_TRACK, sectorMs, seekDistance, sequentialQueue, serveQueue, TRACKS, type ServedRequest } from './hdd';

const STEP_MS = 1500;
const SPIN_S = 1.1;
/** Platter drawing, in SVG units. */
const W = 440;
const H = 290;
const CX = 150;
const CY = 145;
const R_OUT = 128;
const R_IN = 34;
const PIVOT = { x: 400, y: 262 };
/** The platter's smallest text is 11px. */
const PLATTER_MIN_W = minWidthForText(W, 11);

type Workload = 'sequential' | 'random';

const trackRadius = (track: number) => R_OUT - 6 - (track / (TRACKS - 1)) * (R_OUT - 6 - R_IN - 8);
/** Where a sector sits on the platter before it turns: sector s is centred at -(s + ½) / S of a turn. */
const sectorAngle = (sector: number) => (-(sector + 0.5) / SECTORS_PER_TRACK) * 360;

function arcPath(r: number, fromDeg: number, toDeg: number) {
  const p = (deg: number) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];
  const [x1, y1] = p(fromDeg);
  const [x2, y2] = p(toDeg);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

const PHASE_TONE = { seek: 'amber', rotate: 'sky', transfer: 'pink' } as const;

function toBars(served: readonly ServedRequest[], upto: number): GanttBar[] {
  return served.slice(0, upto).flatMap((s, i) => [
    { id: `${i}-s`, lane: 'disk', start: s.start, end: s.seekEnd, tone: PHASE_TONE.seek, label: 'seek' },
    { id: `${i}-r`, lane: 'disk', start: s.seekEnd, end: s.rotateEnd, tone: PHASE_TONE.rotate, label: 'rotation' },
    { id: `${i}-t`, lane: 'disk', start: s.rotateEnd, end: s.end, tone: PHASE_TONE.transfer, label: 'transfer' },
  ]).filter((b) => b.end > b.start);
}

export function HddScene({ picker }: { picker: ReactNode }) {
  const [workload, setWorkload] = useState<Workload>('random');
  const [elevator, setElevator] = useState(false);
  const queue = useMemo(() => (workload === 'random' ? RANDOM_QUEUE : sequentialQueue()), [workload]);
  const run = useMemo(() => serveQueue(queue, HEAD_START, elevator ? 'elevator' : 'fcfs'), [queue, elevator]);
  const fcfsTracks = seekDistance(queue, HEAD_START);
  const frames = useMemo(() => hddFrames(run, fcfsTracks), [run, fcfsTracks]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { upto, current } = player.frame;

  const last = upto > 0 ? run.served[upto - 1] : null;
  const now = last ? last.end : 0;
  // Show the platter mid-read: the sector being read sits centred under the head.
  const shownTime = last ? last.rotateEnd + sectorMs(RPM) / 2 : 0;
  const spin = (shownTime / rotationMs(RPM)) * 360;
  const headTrack = last ? last.req.track : HEAD_START;
  const headX = CX + trackRadius(headTrack);
  const arm = last ? run.served.slice(0, upto).reduce((s, x) => s + x.distance, 0) : 0;
  const currentSet = new Set(current.map((i) => run.served[i].req.id));
  const doneSet = new Set(run.served.slice(0, upto).map((s) => s.req.id));

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Elapsed" value={msText(now)} sub="illustrative" />
          <Stat label="Reads / s" value={upto ? rateText((upto * 1000) / now) : '–'} />
          <Stat label="Throughput" value={upto ? `${bytes((upto * SECTOR_BYTES * 1000) / now, { base: 1000 })}/s` : '–'} />
          <Stat label="Arm travel" value={`${arm} tracks`} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'sector being read' },
            { color: 'var(--muted)', label: 'queued / read sectors (grey)' },
            { color: 'var(--info)', label: 'arm and head', shape: 'line' },
            { color: 'var(--amber)', label: 'seek' },
            { color: 'var(--sky)', label: 'rotation wait' },
            { color: 'var(--pink)', label: 'transfer' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented
            label="Workload"
            value={workload}
            onChange={setWorkload}
            options={[
              { value: 'random', label: 'Random reads' },
              { value: 'sequential', label: 'Sequential reads' },
            ]}
          />
          <Toggle label="Queue order" value={elevator} onChange={setElevator} off="Arrival (FCFS)" on="Elevator (LOOK)" />
        </>,
      ]}
    >
      <div className="sd stage-pad">
        <div className="sd-hdd">
          <WideRegion minWidth={PLATTER_MIN_W} label="Platter: scroll sideways to see all of it">
            <svg viewBox={`0 0 ${W} ${H}`} className="sd-platter" role="img" aria-label={`Platter and arm, head on track ${headTrack}`}>
              <motion.g initial={{ rotate: 0 }} animate={{ rotate: spin }} transition={{ duration: SPIN_S, ease: 'easeInOut' }}>
                <circle cx={CX} cy={CY} r={R_OUT} className="sd-disc" />
                {[0, 250, 500, 750, 999].map((t) => (
                  <circle key={t} cx={CX} cy={CY} r={trackRadius(t)} className="sd-track" />
                ))}
                {Array.from({ length: 16 }, (_, k) => {
                  const a = (k / 16) * 2 * Math.PI;
                  return <line key={k} x1={CX + R_IN * Math.cos(a)} y1={CY + R_IN * Math.sin(a)} x2={CX + R_OUT * Math.cos(a)} y2={CY + R_OUT * Math.sin(a)} className="sd-spoke" />;
                })}
                {queue.map((q) => {
                  const r = trackRadius(q.track);
                  const a = sectorAngle(q.sector);
                  const half = (180 / SECTORS_PER_TRACK) * 1.6;
                  const cls = currentSet.has(q.id) ? 'is-now' : doneSet.has(q.id) ? 'is-done' : 'is-queued';
                  return <path key={q.id} d={arcPath(r, a - half, a + half)} className={`sd-sector ${cls}`} />;
                })}
                <circle cx={CX} cy={CY} r={R_IN - 6} className="sd-spindle" />
              </motion.g>
              <text x={CX} y={CY + 4} className="sd-rpm">
                {RPM.toLocaleString('en-US')} rpm
              </text>
              <motion.line x1={PIVOT.x} y1={PIVOT.y} initial={{ x2: CX + trackRadius(HEAD_START), y2: CY }} animate={{ x2: headX, y2: CY }} transition={{ duration: 0.6 }} className="sd-arm" />
              <motion.rect initial={{ x: CX + trackRadius(HEAD_START) - 6 }} animate={{ x: headX - 6 }} y={CY - 9} width={12} height={18} rx={3} transition={{ duration: 0.6 }} className="sd-head" />
              <circle cx={PIVOT.x} cy={PIVOT.y} r={9} className="sd-pivot" />
              <text x={CX + R_OUT + 12} y={CY - 10} className="sd-label">
                head · track {headTrack}
              </text>
              <text x={8} y={H - 8} className="sd-label">
                toy geometry: {TRACKS.toLocaleString('en-US')} tracks × {SECTORS_PER_TRACK} sectors
              </text>
            </svg>
          </WideRegion>
          <ol className="sd-queue" aria-label="Request queue in service order">
            {run.served.map((s, i) => (
              <li key={s.req.id} className={currentSet.has(s.req.id) ? 'is-now' : i < upto ? 'is-done' : ''}>
                <span>track {s.req.track}</span>
                <span>sector {s.req.sector}</span>
              </li>
            ))}
          </ol>
        </div>
        <WideRegion minWidth={320} label="Timeline: scroll sideways to see all of it">
          <GanttLanes lanes={[{ id: 'disk', label: 'disk' }]} bars={toBars(run.served, upto)} domain={[0, run.total]} now={now} axis unit=" ms" size="md" labelWidth={52} labelMinPx={barLabelPx('rotation')} ariaLabel={`Disk time up to ${msText(now)}`} />
        </WideRegion>
        <Hint block>
          Toy drive with illustrative seek times (1 ms to the next track, 16 ms across the disk); the rotation maths is exact for {RPM.toLocaleString('en-US')} rpm. Each read is one
          4 KiB sector.
        </Hint>
      </div>
    </StageFrame>
  );
}
