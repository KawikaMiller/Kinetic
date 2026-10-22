import { useMemo } from 'react';
import { timeFrames } from '../../core/frames';
import { usePlayer } from '../../core/usePlayer';
import { runIntro, runMilestones, runSummary } from './captions';
import { SIM_MS, type StampedeRun } from './model';

const PLAY_MS = 120;
const FRAME_STEPS = 40;
const HOLD = 2;

/** The stepped story of one run: the clock runs from 0 to the end of the run, with a caption at each milestone the model produced. */
export function useRunPlayer(run: StampedeRun) {
  const frames = useMemo(
    () => timeFrames({ end: SIM_MS, steps: FRAME_STEPS, milestones: runMilestones(run), intro: runIntro(run), summary: runSummary(run), hold: HOLD }),
    [run],
  );
  return usePlayer(frames, { interval: PLAY_MS, autoplay: false });
}
