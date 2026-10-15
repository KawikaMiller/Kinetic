import { useState, type ReactNode } from 'react';
import { LogStream } from '../../components/LogStream';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { DAY, SAMPLES, daysFromStart, daysLeft, failedSoFar, formatInZone, formatUtc, handshake, servedAt, type Scenario, type TimelineEvent } from './model';
import { Timeline } from './Timeline';

const SLIDER_STEP_DAYS = 0.25;
const LOG_MAX_HEIGHT_PX = 190;
const ZONES = [
  { label: 'Los Angeles', zone: 'America/Los_Angeles' },
  { label: 'Tokyo', zone: 'Asia/Tokyo' },
] as const;

/** "14 Sep, 17:00": the wall-clock time in a zone, without the year. */
const wallClock = (t: number, zone: string) => formatInZone(t, zone).replace(/ \d{4}/, '');

const EVENT_TONE: Record<TimelineEvent['kind'], Tone> = { issued: 'ok', 'attempt-failed': 'orange', alert: 'hi', expired: 'bad', reminder: 'hi', note: 'violet' };

/**
 * The shared stage of the manual, ACME and gotcha scenes: today's readout, the timeline with its
 * handshake strip, a log of what has happened up to today, and the scene's own controls.
 */
export function ScenarioView({
  picker, scenario, initialDay, controls, tail, hint,
}: {
  picker: ReactNode;
  scenario: Scenario;
  initialDay: number;
  controls?: ReactNode;
  /** What this scene adds to the caption about today. */
  tail?: ReactNode;
  hint: ReactNode;
}) {
  const domainDays = daysFromStart(scenario, scenario.end);
  const [day, setDay] = useState(initialDay);
  const now = scenario.start + day * DAY;
  const served = servedAt(scenario.served, now);
  const typical = scenario.clients[0];
  const verdict = handshake(scenario.served, typical, now);
  const left = served ? daysLeft(served.chain[0], now) : 0;

  useIntroCaption(
    <>
      Today is <b>{formatUtc(now)}</b>.{' '}
      {verdict.ok ? (
        <>
          A typical client connects: the certificate the server presents has <span className="hl ok">{Math.floor(left)} days left</span>.
        </>
      ) : (
        <>
          A typical client is refused: <span className="hl bad wrap">{verdict.reason}</span>.
        </>
      )}{' '}
      {tail}
    </>,
    [now, verdict.ok, left, tail],
  );

  const log = scenario.events.filter((e) => e.t <= now).reverse();
  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Today (UTC)" value={formatUtc(now).replace(' UTC', '')} sub={ZONES.map((z) => `${z.label} ${wallClock(now, z.zone)}`).join(' · ')} />
          {scenario.clients.map((c) => {
            const now1 = handshake(scenario.served, c, now);
            const failed = failedSoFar(scenario, c, now);
            return <Stat key={c.id} label={c.label} value={now1.ok ? 'connects' : 'refused'} color={now1.ok ? 'var(--ok)' : 'var(--bad)'} sub={`${failed} of ${SAMPLES} sampled handshakes failed so far`} />;
          })}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'valid certificate · handshake ok', shape: 'square' },
            { color: 'var(--hi)', label: 'renewal window · alert', shape: 'square' },
            { color: 'var(--orange)', label: 'failed renewal try', shape: 'square' },
            { color: 'var(--bad)', label: 'expired · handshake fails', shape: 'square' },
            { color: 'var(--violet)', label: 'renewed, not loaded', shape: 'square' },
          ]}
        />
      }
      controls={[picker, <Slider key="day" label="Today" value={day} min={0} max={domainDays} step={SLIDER_STEP_DAYS} onChange={setDay} format={(v) => formatUtc(scenario.start + v * DAY).replace(' UTC', '')} />, ...(controls ? [controls] : [])]}
    >
      <div className="cl stage-pad">
        <Timeline scenario={scenario} now={now} />
        <LogStream
          className="cl-log"
          label="What has happened up to today"
          maxHeight={LOG_MAX_HEIGHT_PX}
          empty="Nothing yet."
          rows={log.map((e, i) => ({ id: `${e.t}-${i}`, at: formatUtc(e.t).replace(' UTC', ''), tone: EVENT_TONE[e.kind], text: e.text }))}
        />
        <Hint block>
          {hint} The strip samples {SAMPLES} moments, so a short outage can fall between two cells; the readout for Today is exact.
        </Hint>
      </div>
    </StageFrame>
  );
}
