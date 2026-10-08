import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { BACKGROUND_BUDGET_S, runInBackground } from './constraints';
import { backgroundCaption, CONSTRAINTS_INTRO, eventCaption, LIFECYCLE_INTRO, typedCaption } from './captions';
import { EVENTS, TABLES, edit, fire, initialPhone, type Platform, type Strategy } from './model';

const STRATEGIES: Strategy[] = ['none', 'state', 'persist'];

describe('lifecycle captions', () => {
  it('read cleanly for every rule, on every platform and strategy', () => {
    for (const platform of ['android', 'ios'] as Platform[]) {
      for (const strategy of STRATEGIES) {
        for (const [state, events] of Object.entries(TABLES[platform])) {
          for (const event of EVENTS[platform]) {
            const rule = events?.[event];
            if (!rule) continue;
            const before = { ...edit(initialPhone(platform), 'hi', strategy), state: state as never };
            const after = fire(before, event, strategy)!;
            expectCaption(eventCaption(state as never, event, rule, after, strategy));
          }
        }
      }
    }
    for (const node of [LIFECYCLE_INTRO, CONSTRAINTS_INTRO, typedCaption('', 'none'), typedCaption('hi', 'persist')]) expectCaption(node);
  });

  it('says the draft is gone after a kill, and the process was never told', () => {
    const typed = edit(initialPhone('android'), 'hi', 'none');
    const stopped = fire(typed, 'home', 'none')!;
    const killed = fire(stopped, 'lowmem', 'none')!;
    const text = captionText(eventCaption('Stopped', 'lowmem', TABLES.android.Stopped!.lowmem!, killed, 'none'));
    expect(text).toContain('No callback ran.');
    expect(text).toContain('The process is gone, and so is the draft');
  });

  it('says when the save callback ran and the app wrote nothing in it, and stays quiet when it does save', () => {
    const typed = edit(initialPhone('android'), 'hi', 'none');
    const rule = TABLES.android.Resumed!.home!;
    expect(captionText(eventCaption('Resumed', 'home', rule, fire(typed, 'home', 'none')!, 'none'))).toContain('The app writes nothing down in onSaveInstanceState.');
    const saving = edit(initialPhone('android'), 'hi', 'state');
    expect(captionText(eventCaption('Resumed', 'home', rule, fire(saving, 'home', 'state')!, 'state'))).not.toContain('writes nothing down');
  });

  it('on return says what came back, and from where, or what did not', () => {
    const run = (strategy: Strategy) => {
      let p = edit(initialPhone('android'), 'hi', strategy);
      p = fire(fire(p, 'home', strategy)!, 'lowmem', strategy)!;
      const after = fire(p, 'return', strategy)!;
      return captionText(eventCaption('Destroyed', 'return', TABLES.android.Destroyed!.return!, after, strategy));
    };
    expect(run('none')).toContain('Not restored: “hi” is gone.');
    expect(run('state')).toContain('Restored “hi” from the saved state.');
    expect(run('persist')).toContain('Restored “hi” from disk.');
  });

  it('a state that was never left says nothing was restored, because nothing was lost', () => {
    const p = edit(initialPhone('ios'), 'hi', 'none');
    const text = captionText(eventCaption('Active', 'rotate', TABLES.ios.Active!.rotate!, fire(p, 'rotate', 'none')!, 'none'));
    expect(text).toContain('the app stays Active');
    expect(text).toContain('still in memory, untouched');
  });
});

describe('background caption', () => {
  it('states the numbers the run produced', () => {
    expect(captionText(expectCaption(backgroundCaption(runInBackground(20, false), 20, false)))).toContain('finished');
    const cut = captionText(expectCaption(backgroundCaption(runInBackground(45, false), 45, false)));
    expect(cut).toContain(`after ${BACKGROUND_BUDGET_S} s`);
    expect(cut).toContain(`all ${BACKGROUND_BUDGET_S} s of work are done again`);
    expect(captionText(expectCaption(backgroundCaption(runInBackground(45, true), 45, true)))).toContain('only the last 15 s are left');
  });
});
