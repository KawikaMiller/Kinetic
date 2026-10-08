import type { ReactNode } from 'react';
import { BACKGROUND_BUDGET_S, type BackgroundRun } from './constraints';
import { EVENT_LABEL, SAVE_CALLBACK, callbackLine, type EventId, type Phone, type Rule, type StateId, type Strategy } from './model';

export const lifecycleIntro = (
  <>
    Type a draft in the phone, then press events. The state machine shows the real state names of the platform you pick, and the log shows the callbacks that ran. Try Home, then Low memory, then Return.
  </>
);

export const constraintsIntro = (
  <>
    A phone is not a server: the network drops, background work is cut off, and waking up to check for news costs battery. Play with each of the three.
  </>
);

const SOURCE: Record<Exclude<Strategy, 'none'>, string> = { state: 'the saved state', persist: 'disk' };

/** Where the typed draft lives right now, in the words of the chosen strategy. */
export function typedCaption(draft: string, strategy: Strategy): ReactNode {
  if (!draft) return <>The draft is empty. Type something, then leave the app.</>;
  const where = {
    none: 'in memory only, nothing has been written down',
    state: 'in memory, and written down only when the app is told it is leaving',
    persist: 'in memory and written to disk on every keystroke',
  }[strategy];
  return <>The draft is “{draft}”, {where}.</>;
}

/** What one event did: the states passed, the callbacks, and what happened to the draft. */
export function eventCaption(from: StateId, event: EventId, rule: Rule, after: Phone, strategy: Strategy): ReactNode {
  const moved = rule.to === from ? <>{EVENT_LABEL[event]}: the app stays {from}. </> : <>{EVENT_LABEL[event]}: {from} to {rule.to}. </>;
  const killed = rule.drops && !rule.restores;
  const save = SAVE_CALLBACK[after.platform];
  const ignored = rule.callbacks.includes(save) && strategy === 'none';
  const calls = rule.callbacks.length ? (
    <>
      Callbacks, in order: <code>{callbackLine(rule)}</code>.{' '}
      {ignored && <>The app writes nothing down in <code>{save}</code>.{' '}</>}
    </>
  ) : killed ? (
    <><span className="hl bad">No callback ran.</span> The app was not told. </>
  ) : (
    <>No callback ran. </>
  );
  let draft: ReactNode = null;
  if (killed) draft = <> The process is gone, and so is the draft that was in memory.</>;
  else if (rule.restores && after.lost) draft = <> <span className="hl bad wrap">Not restored: “{after.lost}” is gone.</span></>;
  else if (rule.restores && after.draft) draft = <> <span className="hl ok wrap">Restored “{after.draft}” from {SOURCE[strategy as Exclude<Strategy, 'none'>]}.</span></>;
  else if (rule.restores) draft = <> There was no draft to restore.</>;
  else if (after.draft) draft = <> The draft, “{after.draft}”, is still in memory, untouched.</>;
  return <>{moved}{calls}{rule.note}{draft}</>;
}

export function backgroundCaption(run: BackgroundRun, work: number, checkpointed: boolean): ReactNode {
  if (run.finished) return <>The task needs {work} s and the budget is {BACKGROUND_BUDGET_S} s, so it <span className="hl ok">finished</span> in time.</>;
  return checkpointed ? (
    <>The task needs {work} s; the budget is {BACKGROUND_BUDGET_S} s. The OS <span className="hl bad">cut it off</span> after {run.done} s, but progress was checkpointed, so only the last {run.remaining} s are left to do later.</>
  ) : (
    <>The task needs {work} s; the budget is {BACKGROUND_BUDGET_S} s. The OS <span className="hl bad">cut it off</span> after {run.done} s and nothing was saved, so all {run.redo} s of work are done again next time.</>
  );
}
