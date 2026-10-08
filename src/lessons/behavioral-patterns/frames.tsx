import { plural } from '../../core/format';
import {
  NEW_CARRIER, REASONS, SUBS, STATE_LABEL, addedLines, attachedIds, carrier, describe, editsShippingBody, isDead, nextState, retainedObjects,
  type CarrierId, type Command, type Editor, type EditorAction, type ObserverAction, type ObserverState, type PEvent, type PState, type StrategyMode,
} from './model';

const money = (n: number) => `$${n}`;

// ── Strategy ───────────────────────────────────────────────────────

export function strategyCaption(mode: StrategyMode, id: CarrierId, total: number, added: boolean) {
  const c = carrier(id);
  const price = c.price(total);
  const priced = <>An order of <b>{money(total)}</b> shipped {c.label} costs <span className="hl ok">{money(price)}</span>{c.id === 'freeOver50' && total === 50 ? ' (free means over 50, so exactly 50 still pays)' : ''}.</>;
  if (!added) return <>{priced} {mode === 'switch' ? 'Every carrier is another case in one function.' : 'Each carrier is its own small function, chosen at run time.'}</>;
  const n = addedLines(mode).length;
  return mode === 'switch' ? (
    <>
      Adding {NEW_CARRIER} {editsShippingBody(mode) ? <><span className="hl orange">edits the shipping function itself</span>: {plural(n, 'new line')} inside code that already works, so every existing carrier is at risk.</> : null}{' '}
      {priced}
    </>
  ) : (
    <>
      Adding {NEW_CARRIER} is {plural(n, 'new line')} in the table: <span className="hl ok">shipping itself is untouched</span>. {priced}
    </>
  );
}

// ── Observer ───────────────────────────────────────────────────────

export function observerCaption(st: ObserverState, a: ObserverAction | null) {
  const subs = attachedIds(st);
  const dead = SUBS.filter((s) => isDead(st.subs[s.id]));
  const leak = retainedObjects(st);
  if (a?.type === 'publish' && st.last) {
    const { to, price } = st.last;
    if (to.length === 0) return <>Price <b>{price}</b> is published, but nobody is subscribed: the notify loop has nothing to call.</>;
    return (
      <>
        Price <b>{price}</b> goes out to {plural(to.length, 'subscriber')}: <span className="hl info">{to.join(', ')}</span>.
        {st.last.dead.length ? <> <span className="hl bad">{st.last.dead.join(', ')} is no longer on screen</span> but is still called, because the subject still holds it. Retained objects: {leak}.</> : null}
      </>
    );
  }
  if (a?.type === 'unmount') {
    const id = a.id;
    return st.subs[id].attached ? (
      <>
        The {id} component unmounts but <span className="hl bad">never unsubscribed</span>: the subject still references it, so, while the feed itself lives, it cannot be freed and will keep being called. Publish to see.
      </>
    ) : (
      <>The {id} component unmounts, and the subject holds no reference to it, so nothing keeps it alive and it can be freed.</>
    );
  }
  if (a?.type === 'detach') {
    return (
      <>
        {a.id} is detached: the subject drops its reference and stops calling it.
        {dead.length ? <> Still leaking: {dead.map((d) => d.id).join(', ')}.</> : null}
      </>
    );
  }
  if (a?.type === 'attach') return <>{a.id} subscribes: the subject now holds a reference and will call it on every publish.</>;
  if (dead.length) return <>{dead.map((d) => d.id).join(', ')} is unmounted but still attached: {plural(leak, 'retained object')}. Detach it to stop the leak.</>;
  return <>A price feed (the subject) and three subscribers. {subs.length ? `Subscribed: ${subs.join(', ')}.` : 'Nobody is subscribed.'} Publish a price, or attach and detach.</>;
}

// ── Command ────────────────────────────────────────────────────────

/** `cleared` is how many undone commands the action just ran discarded from the redo stack. */
export function commandCaption(e: Editor, a: EditorAction | null, ran: Command | null, cleared = 0) {
  if (a?.type === 'undo' && e.redo.length) {
    const c = e.redo[e.redo.length - 1];
    return <>Undo pops <b>{describe(c)}</b> off the undo stack, reverses it, and pushes it onto the redo stack. {plural(e.undo.length, 'command')} left to undo.</>;
  }
  if (a?.type === 'redo' && e.undo.length) {
    const c = e.undo[e.undo.length - 1];
    return <>Redo pops <b>{describe(c)}</b> off the redo stack and replays it, pushing it back onto the undo stack.</>;
  }
  if (ran) {
    return (
      <>
        <b>{describe(ran)}</b> runs as a command object and goes on the undo stack.
        {cleared > 0 ? <> It <span className="hl">discards the {plural(cleared, 'undone command')}</span> on the redo stack: a new action starts a different history, so they can no longer be redone.</> : null}
      </>
    );
  }
  return <>An editor whose actions are command objects. Draw, move and delete, then undo and redo. Each command knows how to reverse itself.</>;
}

// ── State ──────────────────────────────────────────────────────────

export function stateCaption(current: PState, last: { event: PEvent; from: PState } | null) {
  if (last) {
    const to = nextState(last.from, last.event);
    if (to === null) return <>Nothing happens: {last.event} while {STATE_LABEL[last.from]} is not a transition, because {REASONS[last.from][last.event]}.</>;
    return <>{STATE_LABEL[last.from]} + {last.event} → <span className="hl">{STATE_LABEL[to]}</span>.</>;
  }
  return <>A media player is exactly one of four states. Press an event; the ones that make no sense while {STATE_LABEL[current]} are greyed, with the reason.</>;
}
