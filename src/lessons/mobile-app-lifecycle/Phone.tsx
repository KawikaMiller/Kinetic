import { motion } from 'motion/react';
import { TextField } from '../../components/ui';
import { useShake } from '../../core/useShake';
import { canType, isDead, type Phone as PhoneState, type StateId } from './model';

export const DRAFT_MAX = 24;
const SIGNAL_BARS = 4;
const LAUNCHER_ICONS = 5;

/** What the screen shows for each lifecycle state, from the learner's side of the glass. */
type Screen = 'app' | 'covered' | 'home' | 'frozen' | 'dead';
const SCREEN_OF: Record<StateId, Screen> = {
  Created: 'app', Started: 'app', Resumed: 'app', Paused: 'covered', Stopped: 'home', Destroyed: 'dead',
  'Not running': 'dead', Inactive: 'covered', Active: 'app', Background: 'home', Suspended: 'frozen',
};

/** What covers the app while it is Paused (Android) or Inactive (iOS). */
const COVER: Record<PhoneState['platform'], { title: string; note: string }> = {
  android: { title: 'Permission dialog', note: 'The app is still visible behind it' },
  ios: { title: 'Incoming call', note: 'The app is still on screen behind it' },
};

const HOME_NOTE: Record<Screen, string> = {
  app: '',
  covered: '',
  home: 'Out of sight, still in memory',
  frozen: 'Frozen in memory, running no code',
  dead: 'Process killed: nothing of it is left',
};

function StatusBar({ online }: { online: boolean }) {
  return (
    <div className="mal-status" aria-hidden>
      <span>9:41</span>
      <span className={`mal-signal ${online ? '' : 'is-off'}`}>
        {Array.from({ length: SIGNAL_BARS }, (_, i) => <i key={i} style={{ height: 4 + i * 3 }} />)}
      </span>
    </div>
  );
}

/** A phone: the foreground app with its draft, the launcher once the app has left, and what is left of the app after a kill. */
export function PhoneMock({
  phone, landscape, online, noun, onDraft,
}: {
  phone: PhoneState;
  landscape: boolean;
  online: boolean;
  /** "activity" on Android, "scene" on iOS. */
  noun: string;
  onDraft: (text: string) => void;
}) {
  const screen = SCREEN_OF[phone.state];
  const { shake } = useShake();
  const showsApp = screen === 'app' || screen === 'covered';
  return (
    <div className={`mal-phone ${landscape ? 'is-landscape' : ''}`} role="group" aria-label={`Phone, app ${phone.state}`}>
      <StatusBar online={online} />
      {showsApp ? (
        <div className="mal-app">
          <div className="mal-app-head">
            <b>Message</b>
            <span className="mal-instance">{noun} #{phone.instance}</span>
          </div>
          <TextField
            ariaLabel="Draft message" value={phone.draft} onChange={onDraft} maxLength={DRAFT_MAX} width="100%" spellCheck={false}
            placeholder="Type a draft…" disabled={!canType(phone)} className="mal-draft"
          />
          <motion.p key={phone.steps} className="mal-lost" animate={shake(phone.lost !== '')} aria-live="polite">
            {phone.lost ? <>Draft lost: <s>{phone.lost}</s></> : ''}
          </motion.p>
          {screen === 'covered' && <div className="mal-call"><b>{COVER[phone.platform].title}</b><span>{COVER[phone.platform].note}</span></div>}
        </div>
      ) : (
        <div className="mal-home">
          <div className="mal-launcher" aria-hidden>
            {Array.from({ length: LAUNCHER_ICONS }, (_, i) => <i key={i} />)}
            <i className={`mal-app-icon is-${screen}`} />
          </div>
          <p className={`mal-home-note is-${screen}`} role="status">{HOME_NOTE[screen]}</p>
        </div>
      )}
      {isDead(phone) && <span className="mal-dead-tag">process killed</span>}
    </div>
  );
}
