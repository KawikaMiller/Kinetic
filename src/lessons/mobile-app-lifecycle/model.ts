/**
 * The lifecycle state machines of an Android activity and an iOS scene, as plain data, plus the
 * one rule the lesson teaches: what happens to a half-typed draft on each transition.
 * State and callback names are the platforms' real ones; which events can happen in which state,
 * and the memory pressure that kills a process, are scripted by the lesson.
 */

export type Platform = 'android' | 'ios';

export const ANDROID_STATES = ['Created', 'Started', 'Resumed', 'Paused', 'Stopped', 'Destroyed'] as const;
export const IOS_STATES = ['Not running', 'Inactive', 'Active', 'Background', 'Suspended'] as const;
export type AndroidState = (typeof ANDROID_STATES)[number];
export type IosState = (typeof IOS_STATES)[number];
export type StateId = AndroidState | IosState;

export const STATES: Record<Platform, readonly StateId[]> = { android: ANDROID_STATES, ios: IOS_STATES };
/** Where the lesson opens: the app is on screen and the learner is typing. */
export const FOREGROUND: Record<Platform, StateId> = { android: 'Resumed', ios: 'Active' };
/** States with no running process: nothing of the app is in memory. */
export const DEAD_STATES: readonly StateId[] = ['Destroyed', 'Not running'];

export type EventId = 'call' | 'dialog' | 'home' | 'wait' | 'rotate' | 'lowmem' | 'return';

export const EVENT_LABEL: Record<EventId, string> = {
  call: 'Incoming call',
  dialog: 'Permission dialog',
  home: 'Home button',
  wait: 'Time passes',
  rotate: 'Rotate the screen',
  lowmem: 'Low memory',
  return: 'Return to the app',
};

/** Which buttons a platform has: iOS suspends a backgrounded app after a while, Android has no such state. */
export const EVENTS: Record<Platform, readonly EventId[]> = {
  android: ['dialog', 'home', 'rotate', 'lowmem', 'return'],
  ios: ['call', 'home', 'wait', 'rotate', 'lowmem', 'return'],
};

/**
 * The callback in which an app that wants to keep its draft writes it down before it can be killed.
 * `onSaveInstanceState` runs after `onStop` from Android 9 (API 28); before that it ran before `onStop`.
 */
export const SAVE_CALLBACK: Record<Platform, string> = { android: 'onSaveInstanceState', ios: 'sceneDidEnterBackground' };

export interface Rule {
  to: StateId;
  /** Every state passed through, first = the state the event was pressed in, last = `to`. */
  via: readonly StateId[];
  /** The platform's callbacks, in the order they run. Empty: the OS gives the app no callback. */
  callbacks: readonly string[];
  /** The in-memory copy of the draft is gone after this (the activity is recreated, or the process is killed). */
  drops?: boolean;
  /** A fresh instance starts and reads back whatever the app saved. */
  restores?: boolean;
  /** One line for the log. */
  note: string;
}
type Table = Partial<Record<StateId, Partial<Record<EventId, Rule>>>>;

const ANDROID_TABLE: Table = {
  Resumed: {
    dialog: { to: 'Paused', via: ['Resumed', 'Paused'], callbacks: ['onPause'], note: 'A dialog takes focus but the activity is still visible behind it, so it pauses, not stops. (A full-screen call would hide it and go on to onStop.)' },
    home: {
      to: 'Stopped', via: ['Resumed', 'Paused', 'Stopped'], callbacks: ['onPause', 'onStop', 'onSaveInstanceState'],
      note: 'Home hides the activity. It stays in memory, for now.',
    },
    rotate: {
      to: 'Resumed', via: ['Resumed', 'Paused', 'Stopped', 'Destroyed', 'Created', 'Started', 'Resumed'],
      callbacks: ['onPause', 'onStop', 'onSaveInstanceState', 'onDestroy', 'onCreate', 'onStart', 'onRestoreInstanceState', 'onResume'],
      drops: true, restores: true, note: 'A configuration change destroys the activity and builds a new one (unless the app handles it itself).',
    },
  },
  Paused: {
    home: {
      to: 'Stopped', via: ['Paused', 'Stopped'], callbacks: ['onStop', 'onSaveInstanceState'],
      note: 'Home while the dialog is up: the activity goes the rest of the way to Stopped.',
    },
    return: { to: 'Resumed', via: ['Paused', 'Resumed'], callbacks: ['onResume'], note: 'The dialog is dismissed and the activity has focus again.' },
  },
  Stopped: {
    lowmem: {
      to: 'Destroyed', via: ['Stopped', 'Destroyed'], callbacks: [], drops: true,
      note: 'Memory runs low: the system kills the whole process. onDestroy is not called.',
    },
    return: {
      to: 'Resumed', via: ['Stopped', 'Started', 'Resumed'], callbacks: ['onRestart', 'onStart', 'onResume'],
      note: 'The process was still alive, so the same activity instance comes back, exactly as it was.',
    },
  },
  Destroyed: {
    return: {
      to: 'Resumed', via: ['Destroyed', 'Created', 'Started', 'Resumed'], callbacks: ['onCreate', 'onStart', 'onRestoreInstanceState', 'onResume'], restores: true,
      note: 'A new process and a new activity start. All they get back is what the app saved.',
    },
  },
};

const IOS_TABLE: Table = {
  Active: {
    call: { to: 'Inactive', via: ['Active', 'Inactive'], callbacks: ['sceneWillResignActive'], note: 'The call interrupts the app: it is still on screen, but not receiving events.' },
    home: {
      to: 'Background', via: ['Active', 'Inactive', 'Background'], callbacks: ['sceneWillResignActive', 'sceneDidEnterBackground'],
      note: 'Home moves the app out of sight. It may still run for a moment.',
    },
    rotate: {
      to: 'Active', via: ['Active'], callbacks: ['viewWillTransition(to:with:)'],
      note: 'iOS resizes the same views: the app is not recreated.',
    },
  },
  Inactive: {
    home: { to: 'Background', via: ['Inactive', 'Background'], callbacks: ['sceneDidEnterBackground'], note: 'Home while the call screen is up: the app goes to the background.' },
    return: { to: 'Active', via: ['Inactive', 'Active'], callbacks: ['sceneDidBecomeActive'], note: 'The call ends and the app receives events again.' },
  },
  Background: {
    wait: { to: 'Suspended', via: ['Background', 'Suspended'], callbacks: [], note: 'With no work left to do, iOS freezes the app in memory. No callback tells it.' },
    lowmem: {
      to: 'Not running', via: ['Background', 'Not running'], callbacks: [], drops: true,
      note: 'Memory runs low: the system ends the process. Do not count on any callback.',
    },
    return: {
      to: 'Active', via: ['Background', 'Inactive', 'Active'], callbacks: ['sceneWillEnterForeground', 'sceneDidBecomeActive'],
      note: 'The process was still alive, so the same views come back as they were.',
    },
  },
  Suspended: {
    lowmem: {
      to: 'Not running', via: ['Suspended', 'Not running'], callbacks: [], drops: true,
      note: 'A suspended app runs no code at all, so it cannot be told. It is just removed.',
    },
    return: {
      to: 'Active', via: ['Suspended', 'Background', 'Inactive', 'Active'], callbacks: ['sceneWillEnterForeground', 'sceneDidBecomeActive'],
      note: 'The frozen process thaws and the same views come back as they were.',
    },
  },
  'Not running': {
    return: {
      to: 'Active', via: ['Not running', 'Inactive', 'Active'], callbacks: ['scene(_:willConnectTo:options:)', 'sceneWillEnterForeground', 'sceneDidBecomeActive'], restores: true,
      note: 'A fresh launch. All the app gets back is what it saved.',
    },
  },
};

export const TABLES: Record<Platform, Table> = { android: ANDROID_TABLE, ios: IOS_TABLE };

export interface Link {
  from: StateId;
  to: StateId;
  label?: string;
}

/** The arrows of each platform's lifecycle diagram. Android's arrows carry the callback that takes them; iOS's callbacks are in the log. */
export const LINKS: Record<Platform, readonly Link[]> = {
  android: [
    { from: 'Created', to: 'Started', label: 'onStart' },
    { from: 'Started', to: 'Resumed', label: 'onResume' },
    { from: 'Resumed', to: 'Paused', label: 'onPause' },
    { from: 'Paused', to: 'Resumed', label: 'onResume' },
    { from: 'Paused', to: 'Stopped', label: 'onStop' },
    { from: 'Stopped', to: 'Started', label: 'onRestart' },
    { from: 'Stopped', to: 'Destroyed', label: 'onDestroy / killed' },
    { from: 'Destroyed', to: 'Created', label: 'onCreate' },
  ],
  ios: [
    { from: 'Not running', to: 'Inactive', label: 'launch' },
    { from: 'Inactive', to: 'Active' },
    { from: 'Active', to: 'Inactive' },
    { from: 'Inactive', to: 'Background' },
    { from: 'Background', to: 'Inactive' },
    { from: 'Background', to: 'Suspended' },
    { from: 'Suspended', to: 'Background' },
    { from: 'Background', to: 'Not running', label: 'killed' },
    { from: 'Suspended', to: 'Not running', label: 'killed' },
  ],
};

/** What the app does about its draft. */
export type Strategy = 'none' | 'state' | 'persist';
export const STRATEGY_LABEL: Record<Strategy, string> = {
  none: 'Nothing saved',
  state: 'Save state when leaving',
  persist: 'Persist every keystroke',
};

export interface Phone {
  platform: Platform;
  state: StateId;
  /** The draft in memory; empty while the process is dead. */
  draft: string;
  /** What the app wrote down when it left the screen (the saved-state bundle, the restoration data). */
  saved: string;
  /** What the app wrote to disk on its own. */
  disk: string;
  /** What was in memory when the process was killed, kept only to tell the learner what did not come back. */
  gone: string;
  /** Which activity or scene instance is on screen; a new one is a recreation or a relaunch. */
  instance: number;
  /** Disk writes and saved-state writes so far. */
  writes: number;
  /** Text that was in memory and did not come back on the last restore: the loss the learner should see. */
  lost: string;
  /** Count of events so far, to key a flash on. */
  steps: number;
}

export const initialPhone = (platform: Platform): Phone => ({
  platform, state: FOREGROUND[platform], draft: '', saved: '', disk: '', gone: '', instance: 1, writes: 0, lost: '', steps: 0,
});

export const ruleFor = (phone: Pick<Phone, 'platform' | 'state'>, event: EventId): Rule | null => TABLES[phone.platform][phone.state]?.[event] ?? null;
export const canFire = (phone: Phone, event: EventId): boolean => ruleFor(phone, event) !== null;
export const canType = (phone: Phone): boolean => phone.state === FOREGROUND[phone.platform];
export const isDead = (phone: Phone): boolean => DEAD_STATES.includes(phone.state);

/** Type into the draft. Only the foreground app has a keyboard; with persistence every keystroke is a disk write. */
export function edit(phone: Phone, text: string, strategy: Strategy): Phone {
  if (!canType(phone) || text === phone.draft) return phone;
  return strategy === 'persist' ? { ...phone, draft: text, disk: text, writes: phone.writes + 1 } : { ...phone, draft: text };
}

/** Press an event. Null when the platform cannot do that in this state (the button is disabled). */
export function fire(phone: Phone, event: EventId, strategy: Strategy): Phone | null {
  const rule = ruleFor(phone, event);
  if (!rule) return null;
  const next: Phone = { ...phone, state: rule.to, steps: phone.steps + 1, lost: '' };

  if (rule.callbacks.includes(SAVE_CALLBACK[phone.platform]) && strategy === 'state') {
    next.saved = phone.draft;
    next.writes += 1;
  }
  const inMemory = rule.drops ? phone.draft : phone.gone;
  if (rule.drops) {
    next.draft = '';
    next.gone = phone.draft;
  }
  if (rule.restores) {
    next.instance += 1;
    next.draft = strategy === 'state' ? next.saved : strategy === 'persist' ? next.disk : '';
    next.gone = '';
    if (next.draft !== inMemory) next.lost = inMemory;
  }
  return next;
}

/** The callbacks an event runs, as the log prints them. */
export const callbackLine = (rule: Rule): string => (rule.callbacks.length ? rule.callbacks.join(' → ') : 'no callback');
