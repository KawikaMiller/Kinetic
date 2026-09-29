import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

/** A tiny model of the JS statements we need, each pointing at a line of code. */
export type Stmt =
  | { k: 'log'; line: number; text: string }
  | { k: 'timeout'; line: number; label: string; body: Stmt[] }
  | { k: 'then'; line: number; label: string; body: Stmt[] }
  | { k: 'executor'; line: number; body: Stmt[]; then: { line: number; label: string; body: Stmt[] } }
  | { k: 'resolve'; line: number }
  | { k: 'callAsync'; line: number; fn: string; body: Stmt[] }
  | { k: 'await'; line: number };

interface Task {
  label: string;
  body: Stmt[];
}

export interface Snippet {
  id: string;
  name: string;
  code: string[];
  program: Stmt[];
}

export const SNIPPETS: Snippet[] = [
  {
    id: 'classic',
    name: 'Promise vs timeout',
    code: [
      "console.log('A');",
      "setTimeout(() => console.log('B'), 0);",
      "Promise.resolve().then(() => console.log('C'));",
      "console.log('D');",
    ],
    program: [
      { k: 'log', line: 0, text: 'A' },
      { k: 'timeout', line: 1, label: 'timeout → B', body: [{ k: 'log', line: 1, text: 'B' }] },
      { k: 'then', line: 2, label: 'then → C', body: [{ k: 'log', line: 2, text: 'C' }] },
      { k: 'log', line: 3, text: 'D' },
    ],
  },
  {
    id: 'await',
    name: 'async / await',
    code: [
      'async function brew() {',
      "  console.log('1 start');",
      '  await null;',
      "  console.log('3 after await');",
      '}',
      "console.log('0 script');",
      'brew();',
      "console.log('2 script end');",
    ],
    program: [
      { k: 'log', line: 5, text: '0 script' },
      {
        k: 'callAsync', line: 6, fn: 'brew',
        body: [{ k: 'log', line: 1, text: '1 start' }, { k: 'await', line: 2 }, { k: 'log', line: 3, text: '3 after await' }],
      },
      { k: 'log', line: 7, text: '2 script end' },
    ],
  },
  {
    id: 'nested',
    name: 'Nested queues',
    code: [
      'setTimeout(() => {',
      "  console.log('T1');",
      "  Promise.resolve().then(() => console.log('P3'));",
      '}, 0);',
      "setTimeout(() => console.log('T2'), 0);",
      'Promise.resolve().then(() => {',
      "  console.log('P1');",
      "  Promise.resolve().then(() => console.log('P2'));",
      '});',
      "console.log('sync');",
    ],
    program: [
      {
        k: 'timeout', line: 0, label: 'timer #1',
        body: [{ k: 'log', line: 1, text: 'T1' }, { k: 'then', line: 2, label: 'then → P3', body: [{ k: 'log', line: 2, text: 'P3' }] }],
      },
      { k: 'timeout', line: 4, label: 'timer #2', body: [{ k: 'log', line: 4, text: 'T2' }] },
      {
        k: 'then', line: 5, label: 'then → P1',
        body: [{ k: 'log', line: 6, text: 'P1' }, { k: 'then', line: 7, label: 'then → P2', body: [{ k: 'log', line: 7, text: 'P2' }] }],
      },
      { k: 'log', line: 9, text: 'sync' },
    ],
  },
  {
    id: 'executor',
    name: 'Executor is sync',
    code: [
      'new Promise((resolve) => {',
      "  console.log('executor');",
      '  resolve();',
      "}).then(() => console.log('then'));",
      "setTimeout(() => console.log('timeout'), 0);",
      "console.log('end');",
    ],
    program: [
      {
        k: 'executor', line: 0,
        body: [{ k: 'log', line: 1, text: 'executor' }, { k: 'resolve', line: 2 }],
        then: { line: 3, label: 'then → then', body: [{ k: 'log', line: 3, text: 'then' }] },
      },
      { k: 'timeout', line: 4, label: 'timeout → timeout', body: [{ k: 'log', line: 4, text: 'timeout' }] },
      { k: 'log', line: 5, text: 'end' },
    ],
  },
];

export type Phase = 'script' | 'microtasks' | 'macrotask' | 'idle';

export interface ElFrame extends Frame {
  stack: string[];
  apis: string[];
  macro: string[];
  micro: string[];
  out: string[];
  line: number | null;
  phase: Phase;
  /** Which box to spotlight this frame. */
  focus: 'stack' | 'apis' | 'macro' | 'micro' | 'out' | null;
}

const hl = (s: string, c = '') => <span className={`hl ${c}`}>{s}</span>;

export function simulate(snippet: Snippet): ElFrame[] {
  const frames: ElFrame[] = [];
  const stack: string[] = [];
  const apis: Task[] = [];
  const macro: Task[] = [{ label: 'main script', body: snippet.program }];
  const micro: Task[] = [];
  const out: string[] = [];
  let phase: Phase = 'idle';

  const emit = (line: number | null, focus: ElFrame['focus'], say: ReactNode, hold?: number) => {
    frames.push({
      stack: [...stack], apis: apis.map((t) => t.label), macro: macro.map((t) => t.label), micro: micro.map((t) => t.label),
      out: [...out], line, phase, focus, say, hold,
    });
  };

  const run = (body: Stmt[]) => {
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      switch (s.k) {
        case 'log':
          stack.push('console.log');
          out.push(s.text);
          emit(s.line, 'out', <>console.log prints {hl(s.text, 'ok')} immediately: it's plain synchronous code.</>);
          stack.pop();
          break;
        case 'timeout':
          apis.push({ label: s.label, body: s.body });
          emit(s.line, 'apis', <>setTimeout hands the callback to the browser's <b>timer</b> and moves on. JavaScript never waits, even for 0 ms.</>);
          break;
        case 'then':
          micro.push({ label: s.label, body: s.body });
          emit(s.line, 'micro', <>The promise is already resolved, so {hl('.then', 'violet')}'s callback goes straight into the <b>microtask</b> queue. It can't run yet: the stack is busy.</>);
          break;
        case 'resolve':
          emit(s.line, 'stack', <>resolve() marks the promise fulfilled. Nothing runs yet; callbacks are always async.</>);
          break;
        case 'executor':
          stack.push('Promise executor');
          emit(s.line, 'stack', <>Surprise: the function passed to {hl('new Promise')} runs <b>right now</b>, synchronously.</>);
          run(s.body);
          stack.pop();
          micro.push({ label: s.then.label, body: s.then.body });
          emit(s.then.line, 'micro', <>.then is attached to an already-resolved promise, so its callback joins the <b>microtask</b> queue.</>);
          break;
        case 'callAsync': {
          stack.push(`${s.fn}()`);
          emit(s.line, 'stack', <>Calling an async function runs its body <b>synchronously</b>, right up to the first await.</>);
          const idx = s.body.findIndex((x) => x.k === 'await');
          run(idx < 0 ? s.body : s.body.slice(0, idx));
          if (idx >= 0) {
            micro.push({ label: `${s.fn} (resume)`, body: s.body.slice(idx + 1) });
            emit(s.body[idx].line, 'micro', <>{hl('await')} pauses {s.fn}: the rest of the function is queued as a <b>microtask</b>, and {s.fn}() returns a promise to the caller.</>);
          }
          stack.pop();
          break;
        }
        case 'await':
          break;
      }
    }
  };

  const moveTimers = () => {
    if (!apis.length) return;
    macro.push(...apis.splice(0));
    emit(null, 'macro', <>The 0 ms timers have expired, so the browser moves their callbacks into the <b>macrotask</b> queue. They still have to wait their turn.</>);
  };

  const drainMicro = () => {
    if (!micro.length) return;
    phase = 'microtasks';
    while (micro.length) {
      const t = micro.shift()!;
      stack.push(t.label);
      emit(null, 'micro', <>Stack is empty → run <b>every</b> microtask before anything else: {hl(t.label, 'violet')}.{micro.length ? ' More are still waiting.' : ''}</>);
      run(t.body);
      stack.pop();
    }
  };

  emit(null, 'macro', <>The whole script is itself the first <b>macrotask</b>. Press play to watch the event loop run it.</>);
  const script = macro.shift()!;
  phase = 'script';
  stack.push('main script');
  emit(null, 'stack', <>The script goes onto the <b>call stack</b> and runs top to bottom.</>);
  run(script.body);
  stack.pop();
  emit(null, 'stack', <>Script finished. The call stack is <b>empty</b>, and only now can the event loop pick what runs next.</>);
  moveTimers();
  drainMicro();
  while (macro.length) {
    const t = macro.shift()!;
    phase = 'macrotask';
    stack.push(t.label);
    emit(null, 'macro', <>Microtask queue empty → take <b>one</b> macrotask: {hl(t.label, 'info')}.</>);
    run(t.body);
    stack.pop();
    drainMicro();
    moveTimers();
  }
  phase = 'idle';
  emit(null, 'out', <>Done. Output order: {out.map((o, i) => <span key={i}>{i ? ' → ' : ''}{hl(o, 'ok')}</span>)}. Rule: sync code, then <b>all</b> microtasks, then one macrotask, repeat.</>, 2);
  return frames;
}
