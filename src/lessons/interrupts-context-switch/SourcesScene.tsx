import { useState, type ReactNode } from 'react';
import { GanttLanes, type GanttLane } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { GANTT_MIN_W, TimelineLegend } from './common';
import { outcomeText, sourceName } from './frames';
import { fire, sandboxStart, SANDBOX_MAX_EVENTS, SLICE_TICKS, TICK_MS, WAITS_ON, type IrqSource } from './model';
import { toBars } from './view';

const SOURCES: IrqSource[] = ['timer', 'disk', 'network', 'key'];
/** The timeline always shows at least this many ms, so the first events don't fill it. */
const MIN_SPAN_MS = 16;
const LANES: GanttLane[] = [
  { id: 'A', label: 'A · compute' },
  { id: 'B', label: 'B · file read' },
  { id: 'C', label: 'C · shell' },
  { id: 'kernel', label: 'kernel' },
];

export function SourcesScene({ picker }: { picker: ReactNode }) {
  const [world, setWorld] = useState(sandboxStart);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>
      A computes, B waits for a disk read and the shell C waits for a key. Fire interrupts and watch which ones only wake a thread and which take the CPU away (a {TICK_MS} ms tick, a slice of{' '}
      {SLICE_TICKS} ticks).
    </>,
  );
  const full = world.log.length >= SANDBOX_MAX_EVENTS;
  const press = (src: IrqSource) => {
    if (full) return;
    const next = fire(world, src);
    setWorld(next);
    setCaption(<>{outcomeText(next.log[next.log.length - 1])}</>);
  };
  const reset = () => {
    setWorld(sandboxStart());
    setCaption(<>Back to the start: A running, B and C blocked.</>);
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Interrupts" value={world.log.length} color="var(--violet)" />
          <Stat label="Reschedules" value={world.log.filter((o) => o.reschedule).length} />
          <Stat label="Running" value={world.running} color="var(--hi)" sub={`tick ${world.ticks} of ${SLICE_TICKS} used`} />
        </Stats>
      }
      legend={<TimelineLegend />}
      controls={[
        picker,
        <>
          <ControlGroup label="Fire an interrupt" inline>
            {SOURCES.map((s) => (
              <ChipButton key={s} tone="info" size="md" onClick={() => press(s)}>
                {sourceName(s)}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={reset}>Reset</Button>
          {full && <Hint>That's {SANDBOX_MAX_EVENTS} interrupts: Reset to start again.</Hint>}
        </>,
      ]}
    >
      <div className="ics stage-pad">
        <WideRegion minWidth={GANTT_MIN_W} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={LANES}
            bars={toBars(world.segments, world.now, { labels: false })}
            domain={[0, Math.max(MIN_SPAN_MS, world.now)]}
            now={world.now}
            axis
            unit=" ms"
            size="md"
            labelWidth={104}
            ariaLabel="Interrupt timeline"
          />
        </WideRegion>
        <Hint block>
          Simplified: only the timer reschedules here, so a woken thread waits for the next tick (real kernels may preempt at once for a higher-priority thread). Times are illustrative and
          handlers are drawn wider than to scale.
        </Hint>
        <div className="ics-threads">
          {(['A', 'B', 'C'] as const).map((id) => (
            <span key={id} className={`chip tone-${world.states[id] === 'running' ? 'hi' : world.states[id] === 'ready' ? 'dim' : 'muted'}`}>
              {id}: {world.states[id]}
              {world.states[id] === 'blocked' && WAITS_ON[id] ? ` on ${WAITS_ON[id] === 'key' ? 'keyboard' : WAITS_ON[id]}` : ''}
            </span>
          ))}
        </div>
        <ol className="ics-log" aria-label="Interrupt log">
          {world.log.map((o, i) => (
            <li key={i} className={`log-row ${o.reschedule ? 'tone-violet' : 'tone-info'}`}>
              {outcomeText(o)}
            </li>
          ))}
        </ol>
      </div>
    </StageFrame>
  );
}
