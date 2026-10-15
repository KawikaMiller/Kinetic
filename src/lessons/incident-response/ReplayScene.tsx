import { useMemo, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { timeFrames } from '../../core/frames';
import { isEnding, type Walk } from '../../core/scenario';
import { usePlayer } from '../../core/usePlayer';
import { LANES, readouts, timelineBars } from './bars';
import { momentCaption, replayIntro, replaySummary } from './captions';
import { incidentLog } from './logs';
import { ACK_MIN, CAUSE_LABEL, DETECT_MIN, SAMPLE_PATH, SCENARIOS, choiceIdsOf, timelineOf, type Cause, type Timeline } from './model';

const STEP_MS = 520;
const HOLD = 2;
/** Narrowest width where the five lanes and their instant labels stay readable. */
const GANTT_MIN_W = 520;
const LABEL_W = 96;
/** Bar text stays the tooltip and name: bars here are too thin for it. */
const NO_BAR_TEXT = Number.POSITIVE_INFINITY;

/** One frame per minute, each with a caption that is true at that minute, and a held frame for every event. */
function replayFrames(tl: Timeline) {
  const events = new Set<number>([DETECT_MIN, ACK_MIN, ...tl.segments.flatMap((s) => [s.start, s.end])]);
  const frames = timeFrames({
    end: tl.end,
    steps: tl.end,
    milestones: [...events].filter((t) => t > 0 && t < tl.end).map((t) => ({ t, say: momentCaption(tl, t) })),
    intro: replayIntro(tl),
    summary: replaySummary(tl),
    hold: HOLD,
  });
  return frames.map((f) => (f.say === undefined ? { ...f, say: momentCaption(tl, f.now), quiet: true } : f));
}

const minutes = (t: number | null) => (t === null ? 'not yet' : `minute ${t}`);

export function ReplayScene({ picker, cause, walk }: { picker: ReactNode; cause: Cause; walk: Walk }) {
  const finished = isEnding(SCENARIOS[cause], walk.at);
  const tl = useMemo(() => timelineOf(cause, finished ? choiceIdsOf(walk) : SAMPLE_PATH[cause]), [cause, finished, walk]);
  const frames = useMemo(() => replayFrames(tl), [tl]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;
  const out = readouts(tl, now);
  const bars = barsAt(timelineBars(tl, now), now);
  const log = useMemo(() => incidentLog(cause, tl), [cause, tl]);

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Detected" value={minutes(out.detect)} sub="onset to the alert" />
          <Stat label="Acknowledged" value={minutes(out.acknowledge)} sub="onset to the page being acked" />
          <Stat label="Mitigated" value={minutes(out.mitigate)} sub="onset to the first drop in errors" color={out.mitigate === null ? undefined : 'var(--ok)'} />
          <Stat label="Resolved" value={minutes(out.resolve)} sub="onset to zero errors" color={out.resolve === null ? undefined : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'failing before anyone knew', shape: 'square' },
            { color: 'var(--hi)', label: 'an action in progress', shape: 'square' },
            { color: 'var(--ok)', label: 'it worked', shape: 'square' },
            { color: 'var(--orange)', label: 'did nothing for this cause', shape: 'square' },
            { color: 'var(--info)', label: 'the page, a finding, a status update', shape: 'square' },
          ]}
        />
      }
      controls={[<>{picker}</>]}
    >
      <div className="ir stage-pad">
        <Hint block>
          {finished ? 'Replaying your own path' : 'Your story has not reached an ending, so this replays a sample path'} for <b>{CAUSE_LABEL[cause].toLowerCase()}</b>. Definitions of detect, acknowledge, mitigate and resolve
          vary by organisation; these are the ones used here.
        </Hint>
        <WideRegion minWidth={GANTT_MIN_W} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={LANES}
            bars={bars}
            domain={[0, tl.end]}
            now={now}
            unit=" min"
            axis
            labelWidth={LABEL_W}
            labelMinPx={NO_BAR_TEXT}
            ariaLabel={`Incident timeline to minute ${now}`}
          />
        </WideRegion>
        <LogStream label="Incident log" rows={log.filter((r) => r.minute <= now)} maxHeight={190} follow live="off" empty="Nothing logged yet." />
        <ProvenanceRow>
          <Provenance kind="illustrative">invented incident, invented log lines and numbers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
