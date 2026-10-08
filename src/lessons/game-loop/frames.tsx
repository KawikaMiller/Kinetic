import type { ReactNode } from 'react';
import { DT, HIT_HALF, MAX_FRAME, SAFETY_STEPS, START, type LoopMode } from './sim';

const ms = (s: number) => `${Math.round(s * 1000)} ms`;
const STEP_UNITS = Math.round(Math.abs(START.vx) * DT);
/** 1/60 s doesn't round to a whole number of ms, so it is written as a fraction. */
export const DT_LABEL = '1/60 s (16.7 ms)';
const ZONE = 2 * HIT_HALF;

export const MODE_LABEL: Record<LoopMode, string> = {
  variable: 'variable dt',
  fixed: 'fixed step',
  interpolated: 'fixed step + interpolation',
};

export function modeCaption(mode: LoopMode): ReactNode {
  if (mode === 'variable') {
    return <>Variable dt: every frame moves the ball by velocity × that frame's time, so a long frame means one long jump. Turn up the lag spike and watch the violet wall.</>;
  }
  if (mode === 'fixed') {
    return <>Fixed step: frame time goes into an accumulator, and physics runs in steps of exactly {DT_LABEL} ({STEP_UNITS} units across at this speed) while there's enough in it. The ball is drawn at the newest step.</>;
  }
  return <>Fixed step + interpolation: the same {DT_LABEL} steps, but the ball is drawn between the last two steps, by how much time is left in the accumulator. The dim outline is the newest physics step it trails.</>;
}

/** The ball jumped the thin wall in one step. */
export function tunnelCaption(frameDt: number, dx: number): ReactNode {
  return (
    <><span className="hl bad">Tunnelled.</span> One {ms(frameDt)} frame moved the ball {Math.round(dx)} units in a single step, more than the {ZONE}-unit zone where it touches the thin wall, so the collision check never saw it.</>
  );
}

/** A long frame under a fixed step: many small steps instead of one big one. */
export function catchUpCaption(frameDt: number, steps: number, dropped: number): ReactNode {
  return (
    <>A {ms(frameDt)} frame: the fixed loop ran {steps} updates to catch up, each moving the ball only {STEP_UNITS} units, so none of them can skip past the {ZONE}-unit wall zone.
      {dropped > 0 ? <> The {ms(MAX_FRAME)} cap dropped the other {ms(dropped)}: the game paused for a moment instead of jumping ahead.</> : null}</>
  );
}

export function spiralCaption(): ReactNode {
  return (
    <><span className="hl bad">Spiral of death.</span> Each update costs more real time than the {DT_LABEL} it simulates, so every frame owes more updates than the last.
      The lesson stops at {SAFETY_STEPS} per frame so your tab survives; a real game would keep climbing. Turn the max frame time back on.</>
  );
}

export function slowMotionCaption(): ReactNode {
  return <>Updates cost more than they simulate, but the {ms(MAX_FRAME)} cap stops the debt growing: the game runs in slow motion instead of freezing.</>;
}

export function machinesCaption(mode: LoopMode): ReactNode {
  if (mode === 'variable') {
    return <>Variable dt: the 30 Hz ball takes bigger steps than the 144 Hz one, so gravity and the bounces come out differently, and the paths drift apart. The gap stat measures them at the moments both draw a frame.</>;
  }
  const label = MODE_LABEL[mode];
  return <>{label[0].toUpperCase() + label.slice(1)}: both displays run the same {DT_LABEL} updates in the same order, so their states match at every step, however different their frame rates. The gap stat compares them step by step.</>;
}

/** After the max-frame-time toggle: replaces any spiral or slow-motion caption it made untrue. */
export function capCaption(capFrame: boolean): ReactNode {
  return capFrame
    ? <>Max frame time {ms(MAX_FRAME)}: a frame never simulates more than {ms(MAX_FRAME)}, and any backlog beyond that is dropped, so the game slows down instead of spiralling.</>
    : <>No max frame time: every millisecond of a long frame has to be simulated, however many updates that takes (the lesson stops at {SAFETY_STEPS} per frame).</>;
}

/** After the update-cost slider: whether one update now costs more real time than it simulates. */
export function costCaption(costMs: number): ReactNode {
  if (costMs === 0) return <>Updates are free again: the loop can catch up with any backlog.</>;
  return costMs > DT * 1000
    ? <>Each update now costs {costMs} ms of real time, more than the {DT_LABEL} it simulates: the loop falls further behind every frame unless the frame time is capped.</>
    : <>Each update now costs {costMs} ms of real time, less than the {DT_LABEL} it simulates, so the loop can still keep up.</>;
}
