import type { ReactNode } from 'react';
import type { Frame } from './types';

/** One moment on a time axis; a lesson's own frame type extends this. */
export interface TimedFrame extends Frame {
  /** Time shown, in the lesson's unit. */
  now: number;
}

export interface TimeMilestone {
  t: number;
  say: ReactNode;
}

/**
 * The frames of a lesson whose Stage is a clock: the intro at 0, `steps` evenly spaced plain
 * frames up to `end` (they keep the previous caption), a captioned frame at every milestone
 * (held for `hold`), then the summary at `end`. Where a plain frame and a milestone share a
 * time, the plain frame comes first; a milestone past `end` is clamped to it.
 */
export function timeFrames({ end, steps, milestones, intro, summary, hold }: {
  end: number;
  steps: number;
  milestones: readonly TimeMilestone[];
  intro: ReactNode;
  summary: ReactNode;
  hold: number;
}): TimedFrame[] {
  const plain = Array.from({ length: steps }, (_, i) => ({ t: ((i + 1) * end) / steps, say: undefined as ReactNode }));
  const frames: TimedFrame[] = [{ now: 0, say: intro }];
  for (const m of [...plain, ...milestones].sort((a, b) => a.t - b.t)) {
    frames.push(m.say === undefined ? { now: m.t } : { now: Math.min(m.t, end), say: m.say, hold });
  }
  frames.push({ now: end, say: summary, hold });
  return frames;
}
