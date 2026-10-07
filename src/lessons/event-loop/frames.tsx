import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { simulate, type ElStep, type Note, type Snippet } from './sim';

export { SNIPPETS } from './sim';

export interface ElFrame extends Frame, ElStep {}

/** Seconds to linger on the closing output order. */
const DONE_HOLD = 2;

const hl = (s: string, c = '') => <span className={`hl ${c}`}>{s}</span>;

export function caption(note: Note): ReactNode {
  switch (note.kind) {
    case 'intro':
      return <>The whole script is itself the first <b>macrotask</b>. Press play to watch the event loop run it.</>;
    case 'script-start':
      return <>The script goes onto the <b>call stack</b> and runs top to bottom.</>;
    case 'log':
      return <>console.log prints {hl(note.text, 'ok')} immediately: it's plain synchronous code.</>;
    case 'timeout':
      return <>setTimeout hands the callback to the browser's <b>timer</b> and moves on. JavaScript never waits, even for 0 ms.</>;
    case 'then':
      return <>The promise is already resolved, so {hl('.then', 'violet')}'s callback goes straight into the <b>microtask</b> queue. It can't run yet: the stack is busy.</>;
    case 'resolve':
      return <>resolve() marks the promise fulfilled. Nothing runs yet; callbacks are always async.</>;
    case 'executor':
      return <>Surprise: the function passed to {hl('new Promise')} runs <b>right now</b>, synchronously.</>;
    case 'executor-then':
      return <>.then is attached to an already-resolved promise, so its callback joins the <b>microtask</b> queue.</>;
    case 'call-async':
      return <>Calling an async function runs its body <b>synchronously</b>, right up to the first await.</>;
    case 'await':
      return <>{hl('await')} pauses {note.fn}: the rest of the function is queued as a <b>microtask</b>, and {note.fn}() returns a promise to the caller.</>;
    case 'script-end':
      return <>Script finished. The call stack is <b>empty</b>, and only now can the event loop pick what runs next.</>;
    case 'timers-expire':
      return <>The 0 ms timers have expired, so the browser moves their callbacks into the <b>macrotask</b> queue. They still have to wait their turn.</>;
    case 'run-micro':
      return <>Stack is empty → run <b>every</b> microtask before anything else: {hl(note.label, 'violet')}.{note.more ? ' More are still waiting.' : ''}</>;
    case 'run-macro':
      return <>Microtask queue empty → take <b>one</b> macrotask: {hl(note.label, 'info')}.</>;
    case 'done':
      return (
        <>
          Done. Output order: {note.out.map((o, i) => <span key={i}>{i ? ' → ' : ''}{hl(o, 'ok')}</span>)}. Rule: sync code, then{' '}
          <b>all</b> microtasks, then one macrotask, repeat.
        </>
      );
  }
}

export function buildFrames(snippet: Snippet): ElFrame[] {
  return simulate(snippet).map((s) => ({ ...s, say: caption(s.note), hold: s.note.kind === 'done' ? DONE_HOLD : undefined }));
}
