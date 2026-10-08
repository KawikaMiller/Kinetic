import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { toneFor, type Tone } from '../../core/tone';
import { eventCaption, LIFECYCLE_INTRO, typedCaption } from './captions';
import { Machine } from './Machine';
import {
  EVENT_LABEL, EVENTS, STRATEGY_LABEL, callbackLine, canFire, edit, fire, initialPhone, ruleFor,
  type EventId, type Phone, type Platform, type Rule, type Strategy,
} from './model';
import { DRAFT_MAX, PhoneMock } from './Phone';

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'android', label: 'Android activity' },
  { value: 'ios', label: 'iOS app' },
];
const STRATEGY_OPTIONS = (Object.keys(STRATEGY_LABEL) as Strategy[]).map((value) => ({ value, label: STRATEGY_LABEL[value] }));
const LOG_LINES = 8;
const NOUN: Record<Platform, string> = { android: 'activity', ios: 'scene' };
/** Saves (disk or saved state) at which the meter reads as costly. */
const WRITES_WARN = 8;
const WRITES_BAD = 20;
const WRITES_MAX = 40;

interface LogEntry {
  id: number;
  title: string;
  calls: string;
  tone: Tone;
}
interface Session {
  platform: Platform;
  phone: Phone;
  log: LogEntry[];
  last: Rule | null;
  landscape: boolean;
}
const fresh = (platform: Platform): Session => ({ platform, phone: initialPhone(platform), log: [], last: null, landscape: false });

function toneOfEvent(rule: Rule, after: Phone): Tone {
  if (rule.drops && !rule.restores) return 'bad';
  if (rule.restores) return after.lost ? 'bad' : after.draft ? 'ok' : 'info';
  return 'info';
}

export function LifecycleScene({ picker }: { picker: ReactNode }) {
  const [session, setSession] = useState<Session>(() => fresh('android'));
  const [strategy, setStrategy] = useState<Strategy>('none');
  const setCaption = useSetCaption();
  useIntroCaption(LIFECYCLE_INTRO);
  const { platform, phone, log, last, landscape } = session;

  const press = (event: EventId) => {
    const rule = ruleFor(phone, event);
    const next = fire(phone, event, strategy);
    if (!rule || !next) return;
    const entry: LogEntry = {
      id: next.steps, title: `${EVENT_LABEL[event]}: ${phone.state} → ${next.state}`, calls: callbackLine(rule), tone: toneOfEvent(rule, next),
    };
    setSession({ ...session, phone: next, last: rule, log: [entry, ...log].slice(0, LOG_LINES), landscape: event === 'rotate' ? !landscape : landscape });
    setCaption(eventCaption(phone.state, event, rule, next, strategy));
  };
  const type = (text: string) => {
    const next = edit(phone, text, strategy);
    setSession({ ...session, phone: next });
    setCaption(typedCaption(next.draft, strategy), { quiet: true });
  };
  const restart = (to: Platform) => {
    setSession(fresh(to));
    setCaption(LIFECYCLE_INTRO);
  };

  return (
    <StageFrame
      height={470}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the current state' },
            { color: 'var(--info)', label: 'passed through by the last event' },
            { color: 'var(--bad)', label: 'killed, or a draft that was lost' },
            { color: 'var(--ok)', label: 'a draft that came back' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="State" value={phone.state} />
          <Stat label={`${NOUN[platform]} instance`} value={`#${phone.instance}`} />
          <Stat label="Saves" value={phone.writes}>
            <Bar value={phone.writes} max={WRITES_MAX} tone={toneFor(phone.writes, { warn: WRITES_WARN, bad: WRITES_BAD })} ariaLabel={`${phone.writes} saves`} />
          </Stat>
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Platform" value={platform} onChange={restart} options={PLATFORM_OPTIONS} />
          <Segmented label="The app saves" value={strategy} onChange={setStrategy} options={STRATEGY_OPTIONS} />
        </>,
        <>
          {EVENTS[platform].map((e) => (
            <Button key={e} onClick={() => press(e)} disabled={!canFire(phone, e)}>{EVENT_LABEL[e]}</Button>
          ))}
          <Button onClick={() => restart(platform)}>Reset</Button>
        </>,
      ]}
    >
      <div className="mal stage-pad">
        <div className="mal-grid">
          <div className="mal-left">
            <PhoneMock phone={phone} landscape={landscape} online noun={NOUN[platform]} onDraft={type} />
            <Hint block>Draft limit {DRAFT_MAX} characters. {strategy === 'none' ? 'The draft lives only in memory.' : 'The app writes the draft down, so a system kill in the background is survivable.'}</Hint>
          </div>
          <div className="mal-right">
            <Machine platform={platform} phone={phone} last={last} />
            <SectionTitle hint="newest first">Callbacks that ran</SectionTitle>
            <ul className="mal-log" aria-label="Callbacks that ran">
              {log.length === 0 && <li className="empty-note">press an event</li>}
              {log.map((l) => (
                <li key={l.id} className={`log-row tone-${l.tone}`}>
                  <b>{l.title}</b>
                  <span className="mal-calls">{l.calls}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Hint block>
          Simulated phone. State and callback names are the real Android and iOS ones; timing and memory pressure are scripted. The draft is a plain variable the app owns, not a text view that saves itself.
        </Hint>
      </div>
    </StageFrame>
  );
}
