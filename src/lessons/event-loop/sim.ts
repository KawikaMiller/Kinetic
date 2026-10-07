// Pure model behind the event-loop lesson: a tiny interpreter for the snippets' statements
// that moves callbacks between the call stack, Web APIs and the two queues. Each step
// carries a typed note; frames.tsx turns notes into captions.

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
export type Focus = 'stack' | 'apis' | 'macro' | 'micro' | 'out' | null;

export type Note =
  | { kind: 'intro' }
  | { kind: 'script-start' }
  | { kind: 'log'; text: string }
  | { kind: 'timeout' }
  | { kind: 'then' }
  | { kind: 'resolve' }
  | { kind: 'executor' }
  | { kind: 'executor-then' }
  | { kind: 'call-async' }
  | { kind: 'await'; fn: string }
  | { kind: 'script-end' }
  | { kind: 'timers-expire' }
  | { kind: 'run-micro'; label: string; more: boolean }
  | { kind: 'run-macro'; label: string }
  | { kind: 'done'; out: string[] };

export interface ElStep {
  stack: string[];
  apis: string[];
  macro: string[];
  micro: string[];
  out: string[];
  line: number | null;
  phase: Phase;
  /** Which box to spotlight this step. */
  focus: Focus;
  note: Note;
}

export function simulate(snippet: Snippet): ElStep[] {
  const steps: ElStep[] = [];
  const stack: string[] = [];
  const apis: Task[] = [];
  const macro: Task[] = [{ label: 'main script', body: snippet.program }];
  const micro: Task[] = [];
  const out: string[] = [];
  let phase: Phase = 'idle';

  const emit = (line: number | null, focus: Focus, note: Note) => {
    steps.push({
      stack: [...stack], apis: apis.map((t) => t.label), macro: macro.map((t) => t.label), micro: micro.map((t) => t.label),
      out: [...out], line, phase, focus, note,
    });
  };

  const run = (body: Stmt[]) => {
    for (const s of body) {
      switch (s.k) {
        case 'log':
          stack.push('console.log');
          out.push(s.text);
          emit(s.line, 'out', { kind: 'log', text: s.text });
          stack.pop();
          break;
        case 'timeout':
          apis.push({ label: s.label, body: s.body });
          emit(s.line, 'apis', { kind: 'timeout' });
          break;
        case 'then':
          micro.push({ label: s.label, body: s.body });
          emit(s.line, 'micro', { kind: 'then' });
          break;
        case 'resolve':
          emit(s.line, 'stack', { kind: 'resolve' });
          break;
        case 'executor':
          stack.push('Promise executor');
          emit(s.line, 'stack', { kind: 'executor' });
          run(s.body);
          stack.pop();
          micro.push({ label: s.then.label, body: s.then.body });
          emit(s.then.line, 'micro', { kind: 'executor-then' });
          break;
        case 'callAsync': {
          stack.push(`${s.fn}()`);
          emit(s.line, 'stack', { kind: 'call-async' });
          const idx = s.body.findIndex((x) => x.k === 'await');
          run(idx < 0 ? s.body : s.body.slice(0, idx));
          if (idx >= 0) {
            micro.push({ label: `${s.fn} (resume)`, body: s.body.slice(idx + 1) });
            emit(s.body[idx].line, 'micro', { kind: 'await', fn: s.fn });
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
    emit(null, 'macro', { kind: 'timers-expire' });
  };

  const drainMicro = () => {
    if (!micro.length) return;
    phase = 'microtasks';
    while (micro.length) {
      const t = micro.shift()!;
      stack.push(t.label);
      emit(null, 'micro', { kind: 'run-micro', label: t.label, more: micro.length > 0 });
      run(t.body);
      stack.pop();
    }
  };

  emit(null, 'macro', { kind: 'intro' });
  const script = macro.shift()!;
  phase = 'script';
  stack.push('main script');
  emit(null, 'stack', { kind: 'script-start' });
  run(script.body);
  stack.pop();
  emit(null, 'stack', { kind: 'script-end' });
  moveTimers();
  drainMicro();
  while (macro.length) {
    const t = macro.shift()!;
    phase = 'macrotask';
    stack.push(t.label);
    emit(null, 'macro', { kind: 'run-macro', label: t.label });
    run(t.body);
    stack.pop();
    drainMicro();
    moveTimers();
  }
  phase = 'idle';
  emit(null, 'out', { kind: 'done', out: [...out] });
  return steps;
}
