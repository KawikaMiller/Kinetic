import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import { STEAL_PERIOD, type BusMode, type Instant, type Plan, type Segment } from './transfer';

export const LANES: GanttLane[] = [
  { id: 'cpu', label: 'CPU' },
  { id: 'bus', label: 'Bus' },
  { id: 'device', label: 'Device' },
];

const barOf = (s: Segment, i: number, bus: BusMode): GanttBar => {
  const id = `${s.lane}-${s.kind}-${i}`;
  const base = { id, lane: s.lane, start: s.start, end: s.end };
  switch (s.kind) {
    case 'spin': return { ...base, tone: 'hi', label: 'poll' };
    case 'copy': return { ...base, tone: 'hi', label: 'copy' };
    case 'setup': return { ...base, tone: 'hi', label: 'setup' };
    case 'irq': return { ...base, tone: 'pink', label: 'irq' };
    case 'job': return { ...base, tone: 'ok', label: s.jobTicks !== undefined && s.jobTicks < s.end - s.start ? `job at 1/${STEAL_PERIOD} speed` : 'job' };
    case 'stalled': return { ...base, tone: 'orange', kind: 'blocked', label: 'job stalled' };
    case 'bus': return bus === 'burst'
      ? { ...base, tone: 'info', label: 'device holds the bus' }
      : { ...base, tone: 'info', kind: 'wait', label: `device takes 1 cycle in ${STEAL_PERIOD}` };
    case 'cpu-bus': return { ...base, tone: 'muted', label: 'CPU copies over the bus' };
    case 'ready': return { ...base, tone: 'dim', kind: 'blocked', label: 'device getting the block ready' };
  }
};

const instantOf = (x: Instant, i: number): GanttBar => ({
  id: `${x.lane}-${x.kind}-${i}`, lane: x.lane, start: x.at, end: x.at, tone: x.kind === 'irq' ? 'pink' : 'violet', label: x.kind === 'irq' ? 'interrupt' : 'regs written',
});

/** The plan as Gantt bars: segments, then the zero-length instants (the register write and the interrupt). */
export const ganttBars = (p: Plan, bus: BusMode): GanttBar[] => [...p.segments.map((s, i) => barOf(s, i, bus)), ...p.instants.map(instantOf)];
