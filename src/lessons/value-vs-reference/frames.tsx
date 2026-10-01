import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  alloc, assign, bindingsSeeing, declare, deepCopy, emptyMem, evaluate, log, popScope, prim, push, pushScope, setField,
  spreadCopy, type Mem,
} from './model';

export interface VrFrame extends Frame {
  /** Index into the preset's code, or null before the first line runs. */
  line: number | null;
  mem: Mem;
  /** Bindings that see the object just mutated: they flash. */
  seen: string[];
  /** The heap object changed on this step. */
  mutated: string | null;
  /** A binding the step failed on (assigning to a const). */
  blame: string | null;
}

export interface Preset {
  id: string;
  name: string;
  /** Exactly the JavaScript shown on screen. The tests run it for real. */
  code: string[];
  build: () => VrFrame[];
}

/** Records a preset step by step: run one line against the model, then snapshot it with a caption. */
function tracer() {
  const r = createRecorder<VrFrame>(
    { line: null, mem: emptyMem(), seen: [], mutated: null, blame: null },
    { transient: { seen: [], mutated: null, blame: null } },
  );
  const mem = () => r.get().mem;
  return {
    frames: r.frames,
    mem,
    /**
     * Snapshot `next` as line `line` has run. `mutated` flashes every name that can
     * see that object; `blame` marks the binding an error came from.
     */
    step(line: number | null, next: Mem, say: ReactNode, o: { mutated?: string; blame?: string } = {}) {
      const mutated = o.mutated ?? null;
      r.snap(say, undefined, { line, mem: next, mutated, seen: mutated ? bindingsSeeing(next, mutated) : [], blame: o.blame ?? null });
    },
    amendLast: r.amendLast,
  };
}

const copyNumber: Preset = {
  id: 'number',
  name: 'Copy a number',
  code: ['let a = 5;', 'let b = a;', 'b = b + 1;', 'console.log(a, b);'],
  build() {
    const t = tracer();
    t.step(null, t.mem(), <>Numbers, strings and booleans are <b>primitives</b>. Watch what <code>let b = a</code> does with one.</>);
    t.step(0, declare(t.mem(), 'a', prim(5)), <><code>a</code> holds the value <span className="hl">5</span> itself.</>);
    t.step(1, declare(t.mem(), 'b', evaluate(t.mem(), 'a')), <><code>b</code> gets its <b>own copy</b> of 5. Two separate boxes.</>);
    const b = evaluate(t.mem(), 'b');
    t.step(2, assign(t.mem(), 'b', prim(Number(b.kind === 'prim' ? b.value : 0) + 1)), <>Changing <code>b</code> only touches b&apos;s box. <code>a</code> is still 5.</>);
    t.step(3, log(t.mem(), 'a', 'b'), <>Prints <span className="hl ok">5 6</span>: copying a primitive copies the value.</>);
    t.amendLast(<>Prints <span className="hl ok">5 6</span>. For primitives, <code>=</code> copies the value, so the two variables are independent.</>, 2);
    return t.frames;
  },
};

const shareObject: Preset = {
  id: 'object',
  name: 'Share an object',
  code: ['let a = { n: 5 };', 'let b = a;', 'b.n = 6;', 'console.log(a.n, b.n);'],
  build() {
    const t = tracer();
    t.step(null, t.mem(), <>Same shape of code, but now <code>a</code> holds an <b>object</b>.</>);
    const [m1, obj] = alloc(t.mem(), { id: 'o1', label: '{ } object', fields: [['n', prim(5)]] });
    t.step(0, declare(m1, 'a', obj), <>The object lives on the <b>heap</b>. <code>a</code> holds a <span className="hl violet">reference</span>: an arrow to it.</>);
    t.step(1, declare(t.mem(), 'b', evaluate(t.mem(), 'a')), <><code>b = a</code> copies the <b>arrow</b>, not the object. Both names point at one box.</>);
    t.step(2, setField(t.mem(), 'b', 'n', prim(6)), <>Mutating through <code>b</code> changes the one shared object, so <span className="hl ok">a and b both see it</span>.</>, { mutated: 'o1' });
    t.step(3, log(t.mem(), 'a.n', 'b.n'), <>Prints <span className="hl ok">6 6</span>.</>);
    t.amendLast(<>Prints <span className="hl ok">6 6</span>. For objects, <code>=</code> copies the reference: two names, <b>one object</b>.</>, 2);
    return t.frames;
  },
};

const passToFunction: Preset = {
  id: 'function',
  name: 'Pass to a function',
  code: [
    'function mutate(p) { p.n = 6; }',
    'function reassign(p) { p = { n: 99 }; }',
    'let a = { n: 5 };',
    'mutate(a);',
    'reassign(a);',
    'console.log(a.n);',
  ],
  build() {
    const t = tracer();
    t.step(null, t.mem(), <>What happens to an object you pass into a function? Two functions, two different outcomes.</>);
    const [m1, obj] = alloc(t.mem(), { id: 'o1', label: '{ } object', fields: [['n', prim(5)]] });
    t.step(2, declare(m1, 'a', obj), <><code>a</code> refers to an object with <code>n: 5</code>.</>);
    const inMutate = declare(pushScope(t.mem(), 'mutate', 'mutate(p)'), 'p', evaluate(t.mem(), 'a'));
    t.step(3, inMutate, <>Calling <code>mutate(a)</code>: the parameter <code>p</code> is a <b>new variable</b> holding a copy of the reference.</>);
    t.step(0, setField(t.mem(), 'p', 'n', prim(6)), <>So <code>p.n = 6</code> mutates the <b>caller&apos;s object</b>: <span className="hl ok">a sees it</span>.</>, { mutated: 'o1' });
    t.step(3, popScope(t.mem(), 'mutate'), <>mutate returns. Its <code>p</code> is gone, but the change stays.</>);
    const inReassign = declare(pushScope(t.mem(), 'reassign', 'reassign(p)'), 'p', evaluate(t.mem(), 'a'));
    t.step(4, inReassign, <>Calling <code>reassign(a)</code>: again <code>p</code> starts as a copy of the reference.</>);
    const [m2, fresh] = alloc(t.mem(), { id: 'o2', label: '{ } object', fields: [['n', prim(99)]], column: 'b' });
    t.step(1, assign(m2, 'p', fresh), <><code>p = {'{…}'}</code> points <b>p</b> at a new object. <code>a</code> still points at the old one.</>);
    t.step(4, popScope(t.mem(), 'reassign'), <>reassign returns. Nothing refers to <code>{'{ n: 99 }'}</code> any more: it&apos;s <b>garbage</b>, faded and waiting for the collector.</>);
    t.step(5, log(t.mem(), 'a.n'), <>Prints <span className="hl ok">6</span>.</>);
    t.amendLast(<>Prints <span className="hl ok">6</span>. JS passes a <b>copy of the reference</b> (pass-by-sharing): mutating through it is visible, reassigning it isn&apos;t.</>, 2);
    return t.frames;
  },
};

const shallowVsDeep: Preset = {
  id: 'copy',
  name: 'Shallow vs deep copy',
  code: [
    "const a = { name: 'Ada', tags: ['math'] };",
    'const s = { ...a };',
    'const d = structuredClone(a);',
    "s.name = 'Grace';",
    "s.tags.push('code');",
    'console.log(a.name, a.tags.length, d.tags.length);',
  ],
  build() {
    const t = tracer();
    t.step(null, t.mem(), <>Two ways to copy an object. Only one of them copies what&apos;s <b>inside</b> it.</>);
    const [m1, tags] = alloc(t.mem(), { id: 'tags', label: '[ ] tags', shape: 'array', fields: [['0', prim('math')]], column: 'b' });
    const [m2, obj] = alloc(m1, { id: 'a', label: '{ } a', fields: [['name', prim('Ada')], ['tags', tags]] });
    t.step(0, declare(m2, 'a', obj, { isConst: true }), <><code>a</code> is an object with a nested array. The array is its <b>own</b> heap object.</>);
    const [m3, spread] = spreadCopy(t.mem(), 'a', { id: 's', label: '{ } s' });
    t.step(1, declare(m3, 's', spread, { isConst: true }), <><code>{'{ ...a }'}</code> is a <b>shallow</b> copy: a new outer object, but its <code>tags</code> arrow points at the <span className="hl violet">same array</span>.</>);
    const [m4, deep] = deepCopy(t.mem(), 'a', { suffix: '-d', label: '{ } d' });
    t.step(2, declare(m4, 'd', deep, { isConst: true }), <><code>structuredClone</code> is a <b>deep</b> copy: a new object <i>and</i> a new array.</>);
    t.step(3, setField(t.mem(), 's', 'name', prim('Grace')), <>Changing a top-level field of the copy only changes the copy: <span className="hl ok">only s sees it</span>.</>, { mutated: 's' });
    t.step(4, push(t.mem(), 's.tags', prim('code')), <>But the nested array is shared, so pushing through <code>s</code> changes <span className="hl ok">a too</span>. <code>d</code> has its own.</>, { mutated: 'tags' });
    t.step(5, log(t.mem(), 'a.name', 'a.tags.length', 'd.tags.length'), <>Prints <span className="hl ok">Ada 2 1</span>.</>);
    t.amendLast(<>Prints <span className="hl ok">Ada 2 1</span>. Spread copies one level; nested objects are still shared. Use <code>structuredClone</code> for a deep copy.</>, 2);
    return t.frames;
  },
};

const constIsNotFrozen: Preset = {
  id: 'const',
  name: 'const ≠ frozen',
  code: ['const user = { n: 1 };', 'user.n = 2;', 'console.log(user.n);', 'user = { n: 3 };'],
  build() {
    const t = tracer();
    t.step(null, t.mem(), <>Does <code>const</code> make an object immutable? Let&apos;s check.</>);
    const [m1, obj] = alloc(t.mem(), { id: 'o1', label: '{ } object', fields: [['n', prim(1)]] });
    t.step(0, declare(m1, 'user', obj, { isConst: true }), <><code>const</code> locks the <b>binding</b>: <code>user</code> will always point at this box.</>);
    t.step(1, setField(t.mem(), 'user', 'n', prim(2)), <>Changing the object is allowed: <span className="hl ok">const doesn&apos;t freeze the object</span>.</>, { mutated: 'o1' });
    t.step(2, log(t.mem(), 'user.n'), <>Prints <span className="hl ok">2</span>.</>);
    t.step(3, assign(t.mem(), 'user', prim(0)), <>Re-pointing <code>user</code> is what&apos;s forbidden: <span className="hl bad">TypeError</span>.</>, { blame: 'global:user' });
    t.amendLast(<>Prints 2, then throws <span className="hl bad">TypeError: Assignment to constant variable.</span> const stops rebinding, not mutation. Use <code>Object.freeze</code> for that.</>, 2);
    return t.frames;
  },
};

const identity: Preset = {
  id: 'equality',
  name: '=== compares identity',
  code: ['const x = { n: 1 };', 'const y = { n: 1 };', 'const z = x;', 'console.log(x === y, x === z);'],
  build() {
    const t = tracer();
    t.step(null, t.mem(), <>Two objects that look identical. Are they equal?</>);
    const [m1, ox] = alloc(t.mem(), { id: 'ox', label: '{ } object', fields: [['n', prim(1)]] });
    t.step(0, declare(m1, 'x', ox, { isConst: true }), <><code>x</code> refers to an object.</>);
    const [m2, oy] = alloc(t.mem(), { id: 'oy', label: '{ } object', fields: [['n', prim(1)]] });
    t.step(1, declare(m2, 'y', oy, { isConst: true }), <><code>y</code> refers to a <b>different</b> object with the same contents.</>);
    t.step(2, declare(t.mem(), 'z', evaluate(t.mem(), 'x'), { isConst: true }), <><code>z</code> copies x&apos;s arrow: same object.</>);
    t.step(3, log(t.mem(), 'x === y', 'x === z'), <>Prints <span className="hl ok">false true</span>.</>);
    t.amendLast(<>Prints <span className="hl ok">false true</span>. <code>===</code> on objects asks &quot;same box?&quot;, not &quot;same contents?&quot;.</>, 2);
    return t.frames;
  },
};

export const PRESETS: Preset[] = [copyNumber, shareObject, passToFunction, shallowVsDeep, constIsNotFrozen, identity];
