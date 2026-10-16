import { timeFrames } from '../../core/frames';
import { edgeIntro, edgeSummary } from './captions';
import type { EdgeInput, EdgeRun } from './edge';

/** The frames of one run: the intro, one captioned frame per event, then the verdict. */
export const edgeFrames = (input: EdgeInput, run: EdgeRun) =>
  timeFrames({
    end: run.events.length,
    steps: 0,
    milestones: run.events.map((e, i) => ({ t: i + 1, say: e.say })),
    intro: edgeIntro(input),
    summary: edgeSummary(run),
    hold: 1,
  });

/** What the handler has read, and the connection's state, at frame `now` (0 is before anything happens). */
export function edgeStateAt(run: EdgeRun, now: number) {
  const event = now === 0 ? null : run.events[Math.min(now, run.events.length) - 1];
  const finished = now >= run.events.length;
  return {
    readSoFar: event?.readSoFar ?? 0,
    reports: run.events.slice(0, now).filter((e) => e.kind === 'report').length,
    finished,
    hung: finished && run.verdict === 'hung',
  };
}

/** The connection stat's word at a frame. */
export const connectionWord = (s: ReturnType<typeof edgeStateAt>) => (s.hung ? 'hung' : s.finished ? 'idle, nothing left' : 'running');
