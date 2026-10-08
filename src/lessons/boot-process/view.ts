import type { GanttBar } from '../../components/GanttLanes';
import type { GraphNodeMark } from '../../components/GraphView';
import type { Tone } from '../../core/tone';
import type { BootResult, UnitRun } from './model';

/** Finished stages alternate two plain category colours, so neighbours stay apart. */
const DONE_TONES: Tone[] = ['sky', 'amber'];

/**
 * Timeline bars at boot time `now`: finished stages in their category colour, the stage in
 * control --hi, a failed one --bad, and (once the boot has stopped) the stages it never
 * reached as a dim dashed plan.
 */
export function stageBars(r: BootResult, now: number, current: number): GanttBar[] {
  const bars: GanttBar[] = [];
  let planAt = 0;
  const failEnd = r.stages.find((s) => s.status === 'failed')?.end ?? Infinity;
  r.stages.forEach((s, i) => {
    if (s.status === 'not-reached') {
      if (now >= failEnd) bars.push({ id: s.info.id, lane: s.info.id, start: planAt, end: planAt + s.info.ms, tone: 'dim', kind: 'blocked' });
      planAt += s.info.ms;
      return;
    }
    planAt = s.end;
    if (s.start > now) return;
    const end = Math.min(s.end, now);
    if (end <= s.start) return;
    const tone: Tone = s.status === 'failed' && now >= s.end ? 'bad' : i === current ? 'hi' : DONE_TONES[i % 2];
    bars.push({ id: s.info.id, lane: s.info.id, start: s.start, end, tone, label: s.status === 'failed' && now >= s.end ? 'failed' : undefined });
  });
  return bars;
}

/** The planned end of the whole boot, for the time axis. */
export const plannedEnd = (r: BootResult) => r.stages.reduce((t, s) => (s.status === 'not-reached' ? t + s.info.ms : s.end), 0);

export type UnitView = 'pending' | 'running' | 'active' | 'failed' | 'skipped';

/** A unit's state at systemd-relative time `t`. */
export function unitView(u: UnitRun, t: number): UnitView {
  if (t < u.start) return 'pending';
  if (u.state === 'dependency-failed') return 'skipped';
  if (t < u.end) return 'running';
  return u.state === 'failed' ? 'failed' : 'active';
}

export const UNIT_MARK: Record<UnitView, GraphNodeMark | null> = {
  pending: null,
  running: { tone: 'hi', fill: 'solid' },
  active: { tone: 'ok', fill: 'tint' },
  failed: { tone: 'orange', fill: 'solid' },
  skipped: { tone: 'dim', fill: 'tint' },
};

/** The stage (index) in which each Secure Boot check happens: firmware → shim in the boot manager, then shim → GRUB and GRUB → kernel in the bootloader. */
export const CHECK_STAGE = [1, 2, 2] as const;
