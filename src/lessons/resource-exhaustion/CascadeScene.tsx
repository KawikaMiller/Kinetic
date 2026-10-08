import { type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { GAUGES, NODE_TEXT, firstIncident, formatHours, cascade, loopText, warningHours, type NodeId } from './model';
import { LeakControls } from './LeakControls';
import type { RunState } from './useRunState';

const CASCADE_MIN_WIDTH = 560;
/** Room after the last effect so its bar is wide enough to read, as a share of the last time. */
const TAIL_SHARE = 0.6;
const TAIL_MIN_SECONDS = 20;

const LANE_NAME: Record<NodeId, string> = {
  'enospc-bytes': 'ENOSPC (bytes)', 'enospc-inodes': 'ENOSPC (inodes)', emfile: 'EMFILE', 'pool-timeout': 'Pool timeout', eaddrnotavail: 'EADDRNOTAVAIL', oom: 'OOM kill',
  'log-writes-fail': 'Log writes', 'tmp-fails': 'Temp files', refused: 'Connections', piled: 'Threads', 'outbound-fails': 'Outbound', lost: 'In-flight', errors5xx: '5xx errors',
  health: 'Health check', restart: 'Restart', loop: 'Back again',
};

export function CascadeScene({ picker, run }: { picker: ReactNode; run: RunState }) {
  const incident = firstIncident(run.load);
  const steps = incident ? cascade(incident.gauge) : [];
  const last = steps.length ? steps[steps.length - 1].seconds : 0;
  const domainEnd = last + Math.max(TAIL_MIN_SECONDS, last * TAIL_SHARE);
  const lanes: GanttLane[] = steps.map((s) => ({ id: s.node, label: LANE_NAME[s.node] }));
  const bars: GanttBar[] = steps.map((s, i) => ({
    id: s.node,
    lane: s.node,
    start: s.seconds,
    end: domainEnd,
    tone: i === 0 ? 'bad' : 'orange',
    label: s.node === 'loop' ? 'Back where it started' : NODE_TEXT[s.node],
  }));
  const warn = incident ? warningHours(incident.gauge, run.load) : null;

  useIntroCaption(
    incident ? (
      <>
        <span className="hl bad">{GAUGES[incident.gauge].label}</span> runs out first, at {formatHours(incident.hours)}. Everything orange is a knock-on effect, {last} seconds from start to restart loop.
        {warn !== null && <> An alert at 80% would have fired {formatHours(warn)} earlier.</>}
      </>
    ) : (
      <>
        <span className="hl ok">No limit is reached</span> with these leaks, so there is no cascade. Turn a leak on.
      </>
    ),
    [incident?.gauge, last, warn],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="First failure" value={incident ? GAUGES[incident.gauge].error : 'none'} color={incident ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Effects" value={Math.max(0, steps.length - 1)} color={steps.length > 1 ? 'var(--orange)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the first limit hit', shape: 'square' },
            { color: 'var(--orange)', label: 'downstream effect', shape: 'square' },
          ]}
        />
      }
      controls={[picker, <LeakControls key="leaks" run={run} />]}
    >
      <div className="re stage-pad">
        {incident ? (
          <WideRegion minWidth={CASCADE_MIN_WIDTH} label="Cascade timeline: scroll sideways to see all of it">
            <GanttLanes lanes={lanes} bars={bars} domain={[0, domainEnd]} unit=" s" axis size="md" labelWidth={118} markers={[{ at: 0, label: 'limit hit', tone: 'bad' }]} ariaLabel="Effects of the first limit being hit, in seconds after it" />
          </WideRegion>
        ) : (
          <div className="empty-note">Nothing runs out within the 72-hour run: switch a leak on in the controls.</div>
        )}
        {incident && (
          <p className="re-restart">
            <b>After the restart:</b> {loopText(incident.gauge, run.load)}.
          </p>
        )}
        <Hint block>
          Simulated: the order follows the dependency rules in the model (a log write fails before a health check that writes a log can fail); the delays are illustrative, and your health checks and timeouts will differ. A restart
          clears a leaked descriptor, connection or byte of memory, but not a full disk, and it does nothing for the traffic that fills the ports.
        </Hint>
      </div>
    </StageFrame>
  );
}
