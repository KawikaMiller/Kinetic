import { describe, expect, it } from 'vitest';
import {
  EVENTS, FOREGROUND, LINKS, STATES, TABLES, canFire, callbackLine, edit, fire, initialPhone, isDead, ruleFor,
  type EventId, type Phone, type Platform, type StateId, type Strategy,
} from './model';

const PLATFORMS: Platform[] = ['android', 'ios'];
const STRATEGIES: Strategy[] = ['none', 'state', 'persist'];

/** The state names each platform documents (Activity lifecycle; UIKit app states), typed out by hand. */
const DOCUMENTED_STATES: Record<Platform, string[]> = {
  android: ['Created', 'Started', 'Resumed', 'Paused', 'Stopped', 'Destroyed'],
  ios: ['Not running', 'Inactive', 'Active', 'Background', 'Suspended'],
};

/** What each callback means for the state, from the platform docs: the state the callback leaves the app in (or null when it moves nothing). */
const CALLBACK_STATE: Record<Platform, Record<string, StateId | null>> = {
  android: {
    onCreate: 'Created', onStart: 'Started', onResume: 'Resumed', onPause: 'Paused', onStop: 'Stopped', onDestroy: 'Destroyed',
    onRestart: null, onSaveInstanceState: null, onRestoreInstanceState: null,
  },
  ios: {
    'scene(_:willConnectTo:options:)': 'Inactive', sceneWillEnterForeground: 'Inactive', sceneDidBecomeActive: 'Active',
    sceneWillResignActive: 'Inactive', sceneDidEnterBackground: 'Background', 'viewWillTransition(to:with:)': null,
  },
};

describe('the transition tables', () => {
  it('use exactly the states each platform documents', () => {
    for (const p of PLATFORMS) expect([...STATES[p]]).toEqual(DOCUMENTED_STATES[p]);
  });

  it('every rule starts where it is filed, ends at its target and walks only arrows of the diagram', () => {
    for (const p of PLATFORMS) {
      const arrows = new Set(LINKS[p].map((l) => `${l.from}>${l.to}`));
      for (const [from, events] of Object.entries(TABLES[p])) {
        for (const [event, rule] of Object.entries(events)) {
          const where = `${p} ${from} ${event}`;
          expect(rule!.via[0], where).toBe(from);
          expect(rule!.via[rule!.via.length - 1], where).toBe(rule!.to);
          for (let i = 1; i < rule!.via.length; i++) expect(arrows.has(`${rule!.via[i - 1]}>${rule!.via[i]}`), `${where}: ${rule!.via[i - 1]} to ${rule!.via[i]}`).toBe(true);
        }
      }
    }
  });

  it('the states the callbacks announce, in order, are a subsequence of the path the rule walks (a callback never names a state the path skips)', () => {
    for (const p of PLATFORMS) {
      for (const [from, events] of Object.entries(TABLES[p])) {
        for (const [event, rule] of Object.entries(events)) {
          const announced = rule!.callbacks.map((c) => {
            expect(c in CALLBACK_STATE[p], `${p} ${c} is a known callback`).toBe(true);
            return CALLBACK_STATE[p][c];
          }).filter((s): s is StateId => s !== null);
          let at = 1;
          for (const s of announced) {
            const found = rule!.via.indexOf(s, at);
            expect(found, `${p} ${from} ${event}: ${s} announced but not on the path`).toBeGreaterThan(-1);
            at = found;
          }
          if (announced.length) expect(announced[announced.length - 1], `${p} ${from} ${event} ends in the state it announces`).toBe(rule!.to);
        }
      }
    }
  });

  it('pins the callback order the platforms document for the main sequences', () => {
    const run = (p: Platform, from: StateId, e: EventId) => callbackLine(ruleFor({ platform: p, state: from }, e)!);
    expect(run('android', 'Resumed', 'dialog')).toBe('onPause');
    expect(run('android', 'Resumed', 'home')).toBe('onPause → onStop → onSaveInstanceState');
    expect(run('android', 'Stopped', 'return')).toBe('onRestart → onStart → onResume');
    expect(run('android', 'Destroyed', 'return')).toBe('onCreate → onStart → onRestoreInstanceState → onResume');
    expect(run('android', 'Resumed', 'rotate')).toBe('onPause → onStop → onSaveInstanceState → onDestroy → onCreate → onStart → onRestoreInstanceState → onResume');
    expect(run('ios', 'Active', 'call')).toBe('sceneWillResignActive');
    expect(run('ios', 'Active', 'home')).toBe('sceneWillResignActive → sceneDidEnterBackground');
    expect(run('ios', 'Background', 'return')).toBe('sceneWillEnterForeground → sceneDidBecomeActive');
    expect(run('ios', 'Not running', 'return')).toBe('scene(_:willConnectTo:options:) → sceneWillEnterForeground → sceneDidBecomeActive');
  });

  it('only a dialog pauses an Android activity; a call is an iOS Inactive, never an Android event', () => {
    expect(ruleFor({ platform: 'android', state: 'Resumed' }, 'dialog')!.to).toBe('Paused');
    expect(ruleFor({ platform: 'android', state: 'Resumed' }, 'call')).toBeNull();
    expect(EVENTS.android).not.toContain('call');
    expect(EVENTS.ios).not.toContain('dialog');
  });

  it('a kill, and an iOS suspend, run no callback at all', () => {
    expect(ruleFor({ platform: 'android', state: 'Stopped' }, 'lowmem')!.callbacks).toEqual([]);
    expect(ruleFor({ platform: 'ios', state: 'Background' }, 'lowmem')!.callbacks).toEqual([]);
    expect(ruleFor({ platform: 'ios', state: 'Suspended' }, 'lowmem')!.callbacks).toEqual([]);
    expect(ruleFor({ platform: 'ios', state: 'Background' }, 'wait')!.callbacks).toEqual([]);
  });

  it('enables exactly these events in every state, and disables the rest', () => {
    const expected: Record<Platform, Record<string, EventId[]>> = {
      android: {
        Created: [], Started: [], Resumed: ['dialog', 'home', 'rotate'], Paused: ['home', 'return'], Stopped: ['lowmem', 'return'], Destroyed: ['return'],
      },
      ios: {
        'Not running': ['return'], Inactive: ['home', 'return'], Active: ['call', 'home', 'rotate'], Background: ['wait', 'lowmem', 'return'], Suspended: ['lowmem', 'return'],
      },
    };
    for (const p of PLATFORMS) {
      for (const state of STATES[p]) {
        const enabled = EVENTS[p].filter((e) => canFire({ ...initialPhone(p), state }, e));
        expect(enabled, `${p} ${state}`).toEqual(expected[p][state]);
      }
    }
  });

  it('every state a rule leads to is one the diagram has, and a Resumed or Active app can always be reached again', () => {
    for (const p of PLATFORMS) {
      const reach = new Set<StateId>([FOREGROUND[p]]);
      const queue: StateId[] = [FOREGROUND[p]];
      while (queue.length) {
        const s = queue.shift()!;
        for (const rule of Object.values(TABLES[p][s] ?? {})) if (!reach.has(rule.to)) { reach.add(rule.to); queue.push(rule.to); }
      }
      const live = [...reach];
      // From every reachable state some sequence of events returns to the foreground (so nothing is a trap).
      for (const s of live) {
        const seen = new Set<StateId>([s]);
        const q: StateId[] = [s];
        while (q.length) {
          const x = q.shift()!;
          for (const rule of Object.values(TABLES[p][x] ?? {})) if (!seen.has(rule.to)) { seen.add(rule.to); q.push(rule.to); }
        }
        expect(seen.has(FOREGROUND[p]), `${p} ${s}`).toBe(true);
      }
    }
  });
});

describe('rotation', () => {
  it('recreates the activity on Android only', () => {
    const android = fire(initialPhone('android'), 'rotate', 'none')!;
    expect(android.instance).toBe(2);
    expect(android.state).toBe('Resumed');
    const ios = fire(initialPhone('ios'), 'rotate', 'none')!;
    expect(ios.instance).toBe(1);
    expect(ios.state).toBe('Active');
  });

  it('loses an unsaved draft on Android and keeps it on iOS', () => {
    const typed = (p: Platform) => edit(initialPhone(p), 'hello', 'none');
    expect(fire(typed('android'), 'rotate', 'none')!.draft).toBe('');
    expect(fire(typed('android'), 'rotate', 'none')!.lost).toBe('hello');
    expect(fire(typed('ios'), 'rotate', 'none')!.draft).toBe('hello');
    expect(fire(typed('ios'), 'rotate', 'none')!.lost).toBe('');
  });
});

describe('the draft', () => {
  const typed = (p: Platform, s: Strategy) => edit(initialPhone(p), 'hi', s);
  const go = (phone: Phone, s: Strategy, ...events: EventId[]) => events.reduce<Phone>((acc, e) => fire(acc, e, s)!, phone);

  it('survives home, kill, return only when the app saved it or persisted it', () => {
    const results = {} as Record<string, string>;
    for (const p of PLATFORMS) {
      for (const s of STRATEGIES) {
        const events: EventId[] = ['home', 'lowmem', 'return'];
        results[`${p}/${s}`] = go(typed(p, s), s, ...events).draft;
      }
    }
    expect(results).toEqual({
      'android/none': '', 'android/state': 'hi', 'android/persist': 'hi',
      'ios/none': '', 'ios/state': 'hi', 'ios/persist': 'hi',
    });
  });

  it('flags what did not come back, and only that', () => {
    const lost = go(typed('android', 'none'), 'none', 'home', 'lowmem', 'return');
    expect(lost.lost).toBe('hi');
    expect(lost.state).toBe('Resumed');
    expect(lost.instance).toBe(2);
    expect(go(typed('android', 'state'), 'state', 'home', 'lowmem', 'return').lost).toBe('');
  });

  it('comes back untouched when the process was not killed, whatever was saved', () => {
    for (const s of STRATEGIES) {
      expect(go(typed('android', s), s, 'home', 'return').draft).toBe('hi');
      expect(go(typed('ios', s), s, 'home', 'wait', 'return').draft).toBe('hi');
      expect(go(typed('android', s), s, 'dialog', 'return').draft).toBe('hi');
    }
  });

  it('is not in memory while the process is dead', () => {
    const dead = go(typed('ios', 'persist'), 'persist', 'home', 'wait', 'lowmem');
    expect(isDead(dead)).toBe(true);
    expect(dead.draft).toBe('');
    expect(dead.disk).toBe('hi');
  });

  it('can only be typed in the foreground', () => {
    const hidden = go(typed('android', 'none'), 'none', 'home');
    expect(edit(hidden, 'changed', 'none')).toBe(hidden);
    const covered = go(typed('ios', 'none'), 'none', 'call');
    expect(edit(covered, 'changed', 'none').draft).toBe('hi');
  });

  it('writes once per leaving with saved state, once per keystroke when persisting, never when nothing is saved', () => {
    let state = initialPhone('android');
    for (const t of ['h', 'hi', 'hi!']) state = edit(state, t, 'state');
    expect(state.writes).toBe(0);
    state = go(state, 'state', 'home', 'return', 'home');
    expect(state.writes).toBe(2);

    let persist = initialPhone('android');
    for (const t of ['h', 'hi', 'hi!']) persist = edit(persist, t, 'persist');
    expect(persist.writes).toBe(3);
    expect(go(persist, 'persist', 'home', 'return').writes).toBe(3);

    let none = initialPhone('ios');
    none = go(edit(none, 'x', 'none'), 'none', 'home', 'return');
    expect(none.writes).toBe(0);
  });
});

describe('every event sequence up to length 4', () => {
  type Op = 'type' | EventId;
  const OPS: Op[] = ['type', 'call', 'dialog', 'home', 'wait', 'rotate', 'lowmem', 'return'];

  function* sequences(max: number): Generator<Op[]> {
    function* grow(prefix: Op[]): Generator<Op[]> {
      yield prefix;
      if (prefix.length === max) return;
      for (const op of OPS) yield* grow([...prefix, op]);
    }
    yield* grow([]);
  }

  /**
   * The claim, not the mechanism: whatever the app holds in memory is gone when the process dies
   * (or, on Android, when the activity is rebuilt) and comes back only if the strategy kept it.
   * The model only says whether an event was accepted; `memory`, `kept` and `dead` are the claim's own bookkeeping.
   */
  it('keeps the draft exactly when the strategy saved it, on both platforms and every strategy', () => {
    let checked = 0;
    for (const platform of PLATFORMS) {
      for (const strategy of STRATEGIES) {
        for (const ops of sequences(4)) {
          let phone = initialPhone(platform);
          let memory = '';
          let kept = '';
          let dead = false;
          for (const op of ops) {
            if (op === 'type') {
              if (phone.state !== FOREGROUND[platform]) continue;
              phone = edit(phone, `${phone.draft}x`, strategy);
              memory += 'x';
              continue;
            }
            const next = fire(phone, op, strategy);
            if (!next) continue;
            if (op === 'lowmem' || (op === 'rotate' && platform === 'android')) {
              kept = strategy === 'none' ? '' : memory;
              memory = '';
              dead = true;
            }
            if (dead && next.state === FOREGROUND[platform]) {
              memory = kept;
              dead = false;
            }
            phone = next;
          }
          expect(phone.draft, `${platform} ${strategy} ${ops.join(' > ')}`).toBe(dead ? '' : memory);
          checked++;
        }
      }
    }
    expect(checked).toBe(2 * 3 * (1 + 8 + 64 + 512 + 4096));
  });
});
