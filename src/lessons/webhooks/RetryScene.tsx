import { useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { RETRY_ACTORS, retryCaption, retryLadder } from './frames';
import { FEED, POLICY, RETRY_DELAYS_MIN, deliverAll, scheduleEnd } from './model';

const DEFAULT_UP_AT = 20;
const MAX_UP_AT = 180;
/** How wide an attempt is drawn on the minutes axis. */
const TICK_MIN = 2;
const TIMELINE_MIN_W = 480;
const HONEST = 'Simulated provider; the retry schedule is illustrative (real providers document their own, and some retry for days).';

export function RetryScene({ picker }: { picker: ReactNode }) {
  const [upAt, setUpAt] = useState(DEFAULT_UP_AT);
  const all = deliverAll(FEED, upAt);
  useIntroCaption(retryCaption(all, upAt), [upAt]);
  const end = scheduleEnd() + 20;
  const bars: GanttBar[] = [
    ...(upAt > 0 ? [{ id: 'down', lane: 'rx', start: 0, end: upAt, tone: 'bad' as const, kind: 'blocked' as const, label: 'down' }] : []),
    { id: 'up', lane: 'rx', start: upAt, end: end, tone: 'ok', label: 'up' },
    ...all.flatMap((d) => d.attempts.map((a, i) => ({
      id: `${d.event.id}-${i}`, lane: d.event.id, start: a.t, end: a.t + TICK_MIN, tone: a.ok ? ('ok' as const) : ('orange' as const),
    }))),
  ];

  return (
    <StageFrame
      height={520}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'delivery' }, { color: 'var(--orange)', label: 'failed attempt, retried later' }, { color: 'var(--ok)', label: 'delivered / receiver up' },
        { color: 'var(--bad)', label: 'receiver down' },
      ]} />}
      controls={[<>{picker}<Slider label="Receiver comes back at" value={upAt} min={0} max={MAX_UP_AT} step={1} onChange={setUpAt} format={(m) => (m === 0 ? 'never went down' : `minute ${m}`)} /></>]}
    >
      <div className="stage-pad wh">
        <div className="wh-cols">
          <div className="wh-col">
            <SectionTitle weight="regular" hint={FEED[0].id}>The first event's attempts</SectionTitle>
            <SequenceDiagram actors={RETRY_ACTORS(upAt > 0)} messages={retryLadder(all[0])} ariaLabel="Delivery attempts for the first event" />
          </div>
          <div className="wh-col">
            <SectionTitle weight="regular" hint={`waits of ${RETRY_DELAYS_MIN.join(', ')} min`}>Every event, on one clock</SectionTitle>
            <WideRegion minWidth={TIMELINE_MIN_W} label="Retry timeline: scroll sideways to see all of it">
              <GanttLanes
                lanes={[{ id: 'rx', label: 'receiver' }, ...FEED.map((e) => ({ id: e.id, label: e.id }))]} bars={bars} domain={[0, end]} unit=" min" axis
                ariaLabel="Delivery attempts and receiver availability over time" />
            </WideRegion>
          </div>
        </div>
        <SectionTitle weight="regular" hint="an example policy; providers differ">What the provider does with your answer</SectionTitle>
        <table className="data-table wh-policy">
          <thead><tr><th>your endpoint answers</th><th>provider</th><th>note</th></tr></thead>
          <tbody>{POLICY.map((r) => <tr key={r.answer}><td>{r.answer}</td><td>{r.provider}</td><td>{r.note}</td></tr>)}</tbody>
        </table>
        <Hint block>{HONEST} Backoff spaces the retries out so a struggling receiver isn't hammered, and the events arrive late and out of order, which the next scene handles.</Hint>
      </div>
    </StageFrame>
  );
}
