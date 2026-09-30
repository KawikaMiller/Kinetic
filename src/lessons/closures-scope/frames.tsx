import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  assign, collect, dequeue, emptyWorld, enter, envById, fnRef, GLOBAL, leave, lookup, newEnv, newFn, prim, print, read,
  schedule, setVar, UNSET, type World,
} from './model';

export interface ClFrame extends Frame {
  line: number | null;
  world: World;
  /** The environment a name lookup is checking right now. */
  searching: string | null;
  /** Where the lookup found the name. */
  found: string | null;
}

export interface Preset {
  id: string;
  name: string;
  /** Exactly the JavaScript shown. The tests run it for real, timers included. */
  code: string[];
  build: () => ClFrame[];
}

const label = (w: World, id: string) => envById(w, id)?.label ?? id;

function tracer() {
  const r = createRecorder<ClFrame>(
    { line: null, world: emptyWorld(), searching: null, found: null },
    { transient: { searching: null, found: null } },
  );
  const world = () => r.get().world;
  const step = (line: number | null, next: World, say: ReactNode) => r.snap(say, undefined, { line, world: next });

  return {
    frames: r.frames,
    world,
    step,
    /**
     * Animate a lookup of `name` from `from`: one frame per environment checked,
     * ending on the one that has it. Returns the value it found, as text.
     */
    walk(line: number, from: string, name: string, onFound: (value: string, where: string) => ReactNode): string {
      const w = world();
      const result = lookup(w, from, name);
      for (const id of result.path) {
        if (id === result.found) break;
        r.snap(<>Looking up <code>{name}</code>: not in <b>{label(w, id)}</b>, so follow its outer link.</>, undefined, { line, searching: id });
      }
      const value = read(w, from, name);
      r.snap(onFound(value, label(w, result.found!)), undefined, { line, found: result.found });
      return value;
    },
    /**
     * A call returns: its environment is released unless something still holds it,
     * then the collector sweeps before the next step. Pass `from` when the caller
     * receives the return value in the same step (so it's held before the sweep).
     */
    finishCall(line: number, say: ReactNode, from: World = world()) {
      step(line, leave(from), say);
      r.set({ world: collect(world()) });
    },
    finish: r.finish,
  };
}

const counter: Preset = {
  id: 'counter',
  name: 'Counter factory',
  code: [
    'function makeCounter() {',
    '  let count = 0;',
    '  return () => ++count;',
    '}',
    'const c1 = makeCounter();',
    'const c2 = makeCounter();',
    'c1();',
    'c1();',
    'console.log(c1(), c2());',
  ],
  build() {
    const t = tracer();
    let w = newFn(setVar(emptyWorld(), GLOBAL, 'makeCounter', fnRef('mc')), { id: 'mc', label: 'ƒ makeCounter', env: GLOBAL, place: { col: 2, row: 0 } });
    w = setVar(setVar(w, GLOBAL, 'c1', UNSET), GLOBAL, 'c2', UNSET);
    t.step(null, w, <>Every call creates a new <b>environment</b>: a box holding that call&apos;s variables, linked to the box it was written in.</>);

    const make = (n: 1 | 2, line: number, name: 'c1' | 'c2') => {
      const env = `mc${n}`;
      const fn = `f${n}`;
      t.step(line, enter(newEnv(t.world(), { id: env, label: `makeCounter() #${n}`, parent: GLOBAL, place: { col: 1, row: n - 1 } }), env), <>Calling <code>makeCounter()</code> creates environment <b>#{n}</b>, whose outer link points to global.</>);
      t.step(1, setVar(t.world(), env, 'count', prim(0)), <><code>let count = 0</code> lives in environment #{n}.</>);
      t.step(2, newFn(t.world(), { id: fn, label: 'ƒ () => ++count', env, place: { col: 2, row: n } }), <>The arrow function is created here, so it <span className="hl violet">captures environment #{n}</span>.</>);
      t.finishCall(
        line,
        <>makeCounter returns the function into <code>{name}</code>. Environment #{n} <b>stays alive</b>: the function still holds it, and through it its own <code>count</code>.</>,
        setVar(t.world(), GLOBAL, name, fnRef(fn)),
      );
    };
    make(1, 4, 'c1');
    make(2, 5, 'c2');

    const callCounter = (line: number, name: 'c1' | 'c2', n: 1 | 2, k: number) => {
      const call = `k${k}`;
      t.step(line, enter(newEnv(t.world(), { id: call, label: `${name}() call`, parent: `mc${n}`, place: { col: 1, row: 2 } }), call), <>Calling <code>{name}()</code>: a new environment for the call, linked to the one the arrow captured.</>);
      const before = t.walk(line, call, 'count', (v, where) => <>Found <code>count</code> = <span className="hl ok">{v}</span> in <b>{where}</b>.</>);
      const after = String(Number(before) + 1);
      t.step(line, assign(t.world(), call, 'count', prim(after)), <><code>++count</code> updates the <b>binding itself</b>: {name}&apos;s count is now <span className="hl ok">{after}</span>.</>);
      t.finishCall(line, <>The call&apos;s own environment is released: nothing holds it any more.</>);
      return after;
    };
    callCounter(6, 'c1', 1, 1);
    callCounter(7, 'c1', 1, 2);
    const a = callCounter(8, 'c1', 1, 3);
    const b = callCounter(8, 'c2', 2, 4);
    t.step(8, print(t.world(), `${a} ${b}`), <>Prints <span className="hl ok">{a} {b}</span>.</>);
    t.finish(<>Prints <span className="hl ok">{a} {b}</span>. Each counter kept <b>its own</b> environment alive, and each call changed the captured binding, not a copy of it.</>, 2);
    return t.frames;
  },
};

/** The classic loop-with-timeout. `kind` decides whether every callback shares one `i` or gets its own. */
function loopPreset(kind: 'var' | 'let'): Preset {
  const code = [`for (${kind} i = 0; i < 3; i++) {`, '  setTimeout(() => console.log(i), 0);', '}'];
  return {
    id: `loop-${kind}`,
    name: `Loop with ${kind}`,
    code,
    build() {
      const t = tracer();
      t.step(null, emptyWorld(), kind === 'var' ? <>Three timers, each logging <code>i</code>. With <code>var</code>, how many <code>i</code>s are there?</> : <>The same loop with <code>let</code>. Watch how many environments appear.</>);
      for (let i = 0; i < 3; i++) {
        const home = kind === 'var' ? GLOBAL : `it${i}`;
        if (kind === 'var') {
          t.step(0, setVar(t.world(), GLOBAL, 'i', prim(i)), i === 0 ? <><code>var i</code> belongs to the <b>whole</b> enclosing scope (here global): there&apos;s only one <code>i</code>.</> : <><code>i++</code> changes that same single binding: now {i}.</>);
        } else {
          // The body runs inside this iteration's own environment.
          const fresh = newEnv(i > 0 ? leave(t.world()) : t.world(), { id: home, label: `loop i = ${i}`, parent: GLOBAL, place: { col: 1, row: i }, vars: [['i', prim(i)]] });
          t.step(0, enter(fresh, home), i === 0 ? <><code>let</code> in a loop gets a <b>fresh environment per iteration</b>, each with its own <code>i</code>.</> : <>Iteration {i + 1}: another new environment, <code>i = {i}</code>.</>);
        }
        const w = schedule(newFn(t.world(), { id: `a${i}`, label: 'ƒ () => log(i)', env: home, place: { col: 2, row: i } }), `a${i}`);
        t.step(1, w, <>The callback captures <b>{label(w, home)}</b> and waits in the timer queue.</>);
      }
      if (kind === 'var') t.step(0, setVar(t.world(), GLOBAL, 'i', prim(3)), <>The loop ends with the shared <code>i</code> at <span className="hl">3</span>. The timers haven&apos;t run yet.</>);
      else t.step(0, leave(t.world()), <>The loop is done. Three environments stay alive, one per waiting callback.</>);

      const printed: string[] = [];
      for (let i = 0; i < 3; i++) {
        const home = kind === 'var' ? GLOBAL : `it${i}`;
        const call = `cb${i}`;
        const started = enter(newEnv(t.world(), { id: call, label: 'callback call', parent: home, place: { col: 1, row: kind === 'var' ? 0 : 3 } }), call);
        t.step(1, started, <>Timer {i + 1} fires. Its call environment links to the one the callback captured.</>);
        const v = t.walk(1, call, 'i', (value, where) => <>Found <code>i</code> = <span className="hl ok">{value}</span> in <b>{where}</b>.</>);
        printed.push(v);
        t.step(1, print(t.world(), v), <>Prints <span className="hl ok">{v}</span>.</>);
        t.finishCall(
          1,
          kind === 'let' ? <>Done: the callback leaves the queue, and it and its iteration environment are released.</> : <>Done: the callback leaves the queue and is released. The single shared <code>i</code> stays.</>,
          dequeue(t.world()),
        );
      }
      t.finish(
        kind === 'var' ? (
          <>Prints <span className="hl bad">{printed.join(', ')}</span>: all three callbacks captured the <b>same</b> binding, which reached 3 before they ran.</>
        ) : (
          <>Prints <span className="hl ok">{printed.join(', ')}</span>: each callback captured its <b>own</b> iteration&apos;s binding.</>
        ),
        2,
      );
      return t.frames;
    },
  };
}

const shadowing: Preset = {
  id: 'shadow',
  name: 'Shadowing',
  code: [
    "let x = 'outer';",
    'function inner() {',
    "  let x = 'inner';",
    '  return x;',
    '}',
    'function outer() {',
    '  return x;',
    '}',
    'console.log(inner(), outer());',
  ],
  build() {
    const t = tracer();
    let w = setVar(emptyWorld(), GLOBAL, 'x', prim("'outer'"));
    w = newFn(setVar(w, GLOBAL, 'inner', fnRef('fi')), { id: 'fi', label: 'ƒ inner', env: GLOBAL, place: { col: 2, row: 0 } });
    w = newFn(setVar(w, GLOBAL, 'outer', fnRef('fo')), { id: 'fo', label: 'ƒ outer', env: GLOBAL, place: { col: 2, row: 1 } });
    t.step(0, w, <>Two variables called <code>x</code>. Which one does each function see?</>);
    t.step(8, enter(newEnv(t.world(), { id: 'ie', label: 'inner() call', parent: GLOBAL, place: { col: 1, row: 0 } }), 'ie'), <>Calling <code>inner()</code> creates its environment.</>);
    t.step(2, setVar(t.world(), 'ie', 'x', prim("'inner'")), <>A new <code>x</code> in inner&apos;s own environment <b>shadows</b> the global one.</>);
    const first = t.walk(3, 'ie', 'x', (v, where) => <>Lookup stops at the first match: <span className="hl ok">{v}</span> in <b>{where}</b>. The outer x is never reached.</>);
    t.finishCall(8, <>inner returns and its environment is released.</>);
    t.step(8, enter(newEnv(t.world(), { id: 'oe', label: 'outer() call', parent: GLOBAL, place: { col: 1, row: 0 } }), 'oe'), <>Calling <code>outer()</code>: its environment has no <code>x</code>.</>);
    const second = t.walk(6, 'oe', 'x', (v, where) => <>Found <span className="hl ok">{v}</span> in <b>{where}</b> after walking outward.</>);
    t.finishCall(8, <>outer returns.</>);
    const line = `${first.replaceAll("'", '')} ${second.replaceAll("'", '')}`;
    t.step(8, print(t.world(), line), <>Prints <span className="hl ok">{line}</span>.</>);
    t.finish(<>Prints <span className="hl ok">{line}</span>. A lookup takes the <b>nearest</b> binding, walking outward from where the code is written.</>, 2);
    return t.frames;
  },
};

const staleClosure: Preset = {
  id: 'stale',
  name: 'Stale closure',
  code: [
    'let count = 0;',
    'function render() {',
    '  const snapshot = count;',
    '  return () => console.log(snapshot, count);',
    '}',
    'const handler = render();',
    'count = 5;',
    'handler();',
  ],
  build() {
    const t = tracer();
    let w = setVar(emptyWorld(), GLOBAL, 'count', prim(0));
    w = newFn(setVar(w, GLOBAL, 'render', fnRef('fr')), { id: 'fr', label: 'ƒ render', env: GLOBAL, place: { col: 2, row: 0 } });
    w = setVar(w, GLOBAL, 'handler', UNSET);
    t.step(0, w, <>A React-style pattern: each render copies the current state into a const, and a handler reads it later.</>);
    t.step(5, enter(newEnv(t.world(), { id: 're', label: 'render() call', parent: GLOBAL, place: { col: 1, row: 0 } }), 're'), <>Calling <code>render()</code> creates its environment.</>);
    const now = t.walk(2, 're', 'count', (v, where) => <><code>count</code> is <span className="hl ok">{v}</span> in <b>{where}</b> right now.</>);
    t.step(2, setVar(t.world(), 're', 'snapshot', prim(now)), <><code>snapshot</code> is a <b>new binding</b> in render&apos;s environment, set to {now}.</>);
    t.step(3, newFn(t.world(), { id: 'h', label: 'ƒ () => log(…)', env: 're', place: { col: 2, row: 1 } }), <>The handler <span className="hl violet">captures render&apos;s environment</span>.</>);
    t.finishCall(5, <>render returns the handler into <code>handler</code>; render&apos;s environment lives on inside it.</>, setVar(t.world(), GLOBAL, 'handler', fnRef('h')));
    t.step(6, assign(t.world(), GLOBAL, 'count', prim(5)), <><code>count = 5</code> changes the global binding. <code>snapshot</code> is a different binding, still 0.</>);
    t.step(7, enter(newEnv(t.world(), { id: 'hc', label: 'handler() call', parent: 're', place: { col: 1, row: 1 } }), 'hc'), <>Calling the handler.</>);
    const snap = t.walk(3, 'hc', 'snapshot', (v, where) => <><code>snapshot</code> = <span className="hl bad">{v}</span> in <b>{where}</b>: the value from that old render.</>);
    const live = t.walk(3, 'hc', 'count', (v, where) => <><code>count</code> = <span className="hl ok">{v}</span> in <b>{where}</b>: the live binding.</>);
    t.step(3, print(t.world(), `${snap} ${live}`), <>Prints <span className="hl ok">{snap} {live}</span>.</>);
    t.finishCall(7, <>The handler call is done.</>);
    t.finish(<>Prints <span className="hl ok">{snap} {live}</span>. The closure captured <b>bindings</b>, not values: <code>count</code> is live, but <code>snapshot</code> was frozen when that render ran. That&apos;s a stale closure.</>, 2);
    return t.frames;
  },
};

export const PRESETS: Preset[] = [counter, loopPreset('var'), loopPreset('let'), shadowing, staleClosure];
