import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Hint, PauseButton, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { ms } from '../../core/format';
import { useElementSize, useLoop } from '../../core/hooks';
import { useInterval } from '../../core/useInterval';
import { LONG_FRAME_MS, frameStats } from './model';

const BOX = 40;
/** One trip across, in ms. */
const TRIP_MS = 2200;
/** The main-thread stress burns this long in every animation frame. */
const STRESS_MS = 45;
/** How many recent frames the sparkline keeps. */
const KEEP = 90;
/** The sparkline's scale never drops below this, so a smooth run stays flat at the bottom. */
const SPARK_MIN_MAX_MS = 100;
/** A 60 Hz display's frame budget, for the reference line. */
const FRAME_60HZ_MS = 1000 / 60;
const VIEW_EVERY_MS = 250;

/** Block the main thread for `duration` ms: a fixed, lesson-authored loop (no input reaches it). */
function busyWait(duration: number) {
  const end = performance.now() + duration;
  while (performance.now() < end) {
    // spin: this is the point
  }
}

const CALM = <>Both boxes make the same trip. The top one is animated with <code>left</code>, which typically needs layout on the main thread every frame. The bottom one
  uses <code>transform</code>, which the compositor can typically run on its own. The sparkline is the real time between animation frames on this device.</>;
const STRESSED = <>Stress is on: this page now holds the main thread for {STRESS_MS} ms in every frame, and the sparkline shows the long frames. The <code>left</code> box
  typically stutters because it needs the main thread. The <code>transform</code> box typically keeps gliding because the compositor does not need the main thread. That is
  Chromium behaviour; engines differ.</>;

/** The same trip two ways, with real frame times. */
export function AnimateScene({ picker }: { picker: ReactNode }) {
  const [running, setRunning] = useState(true);
  const [stress, setStress] = useState(false);
  const [trackRef, { width }] = useElementSize<HTMLDivElement>();
  const leftBox = useRef<HTMLDivElement>(null);
  const moveBox = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const deltas = useRef<number[]>([]);
  const [shown, setShown] = useState<number[]>([]);
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(stress ? STRESSED : CALM);
  }, [stress, setCaption]);

  // Web Animations rather than CSS keyframes: the reduced-motion rule in global.css would still them, and the motion is the lesson.
  useEffect(() => {
    if (width <= 0) return;
    const travel = Math.max(0, width - BOX);
    const timing: KeyframeAnimationOptions = { duration: TRIP_MS, iterations: Infinity, direction: 'alternate', easing: 'linear' };
    const made = [
      leftBox.current?.animate([{ left: '0px' }, { left: `${travel}px` }], timing),
      moveBox.current?.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${travel}px)` }], timing),
    ].filter((a): a is Animation => a !== undefined);
    animations.current = made;
    return () => made.forEach((a) => a.cancel());
  }, [width]);

  useEffect(() => {
    for (const a of animations.current) {
      if (running) a.play();
      else a.pause();
    }
  }, [running, width]);

  useLoop(
    (dt) => {
      if (stress) busyWait(STRESS_MS);
      deltas.current.push(dt * 1000);
      if (deltas.current.length > KEEP) deltas.current.shift();
    },
    running,
    { maxDt: Infinity },
  );
  useInterval(() => setShown([...deltas.current]), VIEW_EVERY_MS, running);

  const stats = frameStats(shown);
  return (
    <StageFrame
      height={380}
      controls={[
        <>
          {picker}
          <PauseButton paused={!running} onToggle={() => setRunning((r) => !r)} />
          <Toggle label="Main thread" value={stress} onChange={setStress} off="Idle" on={`Stressed (${STRESS_MS} ms per frame)`} />
        </>,
      ]}
    >
      <div className="stage-pad bp">
        <div className="bp-anim-track" ref={trackRef}>
          <span className="bp-anim-label">
            animated with <code>left</code>: layout on the main thread, every frame
          </span>
          <div className="bp-anim-lane">
            <div className="bp-anim-box is-left" ref={leftBox} />
          </div>
          <span className="bp-anim-label">
            animated with <code>transform</code>: typically run by the compositor
          </span>
          <div className="bp-anim-lane">
            <div className="bp-anim-box is-move" ref={moveBox} />
          </div>
        </div>
        <SectionTitle weight="regular" hint={`time between the last ${KEEP} animation frames; dashed line = a 60 Hz frame (${ms(FRAME_60HZ_MS)})`}>Frame times on this device</SectionTitle>
        <div className="bp-spark">
          <Sparkline values={shown} width={320} height={52} cap={KEEP} align="left" minMax={SPARK_MIN_MAX_MS} refLine={FRAME_60HZ_MS} color="var(--info)" className="bp-spark-line" />
        </div>
        <Stats>
          <Stat label="Last frame" value={shown.length ? ms(stats.last) : 'waiting'} />
          <Stat label={`Worst of ${KEEP}`} value={shown.length ? ms(stats.worst) : 'waiting'} color={stats.worst > LONG_FRAME_MS ? 'var(--bad)' : undefined} />
          <Stat label={`Frames over ${LONG_FRAME_MS} ms`} value={stats.longFrames} color={stats.longFrames ? 'var(--bad)' : undefined} />
        </Stats>
        <Hint block>
          Real animation, real frame times, so they depend on your device and display (a 120 Hz screen has a smaller frame budget). The sparkline measures the main thread;
          a compositor-driven animation can keep moving even when it stalls.
        </Hint>
      </div>
    </StageFrame>
  );
}
