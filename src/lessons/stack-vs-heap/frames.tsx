import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { allocate, call, emptyWorld, free, NULL, overflow, prim, readThrough, ret, set, toSlot, UNSET, writeThrough, type Mode, type World } from './model';

/** How many frames the drawn stack holds before it overflows. Real stacks hold thousands. */
export const STACK_LIMIT = 6;

export interface ShFrame extends Frame {
  line: number | null;
  world: World;
}

export interface Preset {
  id: string;
  name: string;
  mode: Mode;
  language: 'JavaScript' | 'C';
  code: string[];
  /** Draw the stack's size limit (the overflow preset runs into it). */
  showsStackLimit?: boolean;
  build: () => ShFrame[];
}

function tracer(mode: Mode) {
  const r = createRecorder<ShFrame>({ line: null, world: emptyWorld(mode) });
  return {
    frames: r.frames,
    world: () => r.get().world,
    step(line: number | null, world: World, say: ReactNode) {
      r.snap(say, undefined, { line, world });
    },
    finish: r.finish,
  };
}

const outliveFrame: Preset = {
  id: 'outlive',
  name: 'Objects outlive the call',
  mode: 'managed',
  language: 'JavaScript',
  code: [
    'function makePoint(x) {',
    '  const p = { x, y: 0 };',
    '  return p;',
    '}',
    'function main() {',
    '  const pt = makePoint(3);',
    '  const n = 42;',
    '}',
    'main();',
  ],
  build() {
    const t = tracer('managed');
    t.step(null, t.world(), <>Each call gets a <b>stack frame</b> for its locals. Objects go somewhere else. Let&apos;s see where.</>);
    t.step(8, call(t.world(), 'main', 'main()', [['pt', UNSET], ['n', UNSET]]), <>Calling <code>main()</code> pushes a frame with room for <code>pt</code> and <code>n</code>.</>);
    t.step(5, call(t.world(), 'mk', 'makePoint(x)', [['x', prim(3)], ['p', UNSET]]), <><code>makePoint(3)</code> pushes its own frame on top. <code>x</code> is a number, stored right in the frame.</>);
    const [w1, point] = allocate(t.world(), { id: 'pt', label: '{ } point', fields: [{ name: 'x', text: '3' }, { name: 'y', text: '0' }] });
    t.step(1, set(w1, 'p', point), <>The object goes on the <b>heap</b>. The local <code>p</code> only holds a <span className="hl violet">reference</span> to it.</>);
    const popped = ret(t.world());
    t.step(2, set(popped, 'pt', point), <><code>makePoint</code> returns: its frame is <b>gone</b>, but the object survives, because <code>pt</code> still refers to it.</>);
    t.step(6, set(t.world(), 'n', prim(42)), <><code>n = 42</code> is a primitive, so it lives in main&apos;s frame.</>);
    t.step(8, ret(t.world()), <><code>main</code> returns. Nothing refers to the point any more: it&apos;s <b>collectable</b>, and the garbage collector will reclaim it.</>);
    t.finish(<>Locals live and die with their frame; the object lived exactly as long as something could <b>reach</b> it. That&apos;s the managed-memory rule (JavaScript, Java, Python, C#).</>, 2);
    return t.frames;
  },
};

const stackOverflow: Preset = {
  id: 'overflow',
  name: 'Stack overflow',
  mode: 'managed',
  language: 'JavaScript',
  code: ['function down(n) {', '  return down(n + 1);', '}', 'down(0);'],
  showsStackLimit: true,
  build() {
    const t = tracer('managed');
    t.step(null, t.world(), <>A function that calls itself with no way out. Every call needs a new frame.</>);
    for (let n = 0; n < STACK_LIMIT; n++) {
      t.step(n === 0 ? 3 : 1, call(t.world(), `d${n}`, `down(${n})`, [['n', prim(n)]]), n === 0 ? <>The first call pushes a frame.</> : <>Another call, another frame: <b>{n + 1}</b> on the stack and nothing ever returns.</>);
    }
    t.step(1, overflow(t.world()), <>The stack is a fixed-size region. It&apos;s full: <span className="hl bad">RangeError: Maximum call stack size exceeded</span>.</>);
    t.finish(<><span className="hl bad">Stack overflow.</span> This drawing holds {STACK_LIMIT} frames; a real stack holds thousands, but runaway recursion fills any stack.</>, 2);
    return t.frames;
  },
};

const mallocFree: Preset = {
  id: 'malloc',
  name: 'malloc and free',
  mode: 'manual',
  language: 'C',
  code: ['int main(void) {', '  int *p = malloc(sizeof(int));', '  *p = 7;', '  free(p);', '  p = NULL;', '}'],
  build() {
    const t = tracer('manual');
    t.step(null, t.world(), <>In C, nobody collects garbage. You ask for heap memory and you give it back.</>);
    t.step(0, call(t.world(), 'main', 'main()', [['p', UNSET]]), <><code>main</code>&apos;s frame has one local, the pointer <code>p</code>.</>);
    const [w1, block] = allocate(t.world(), { id: 'b1', label: 'int (4 bytes)', fields: [{ name: 'value', text: '?' }] });
    t.step(1, set(w1, 'p', block), <><code>malloc</code> reserves a block on the heap and returns its address. It starts out holding garbage (?).</>);
    t.step(2, writeThrough(t.world(), 'p', 'value', '7'), <><code>*p = 7</code> writes through the pointer into the block.</>);
    t.step(3, free(t.world(), 'p'), <><code>free(p)</code> hands the block back. <code>p</code> still holds the old address: it&apos;s now <span className="hl bad">dangling</span>.</>);
    t.step(4, set(t.world(), 'p', NULL), <>Setting <code>p = NULL</code> means nobody can use the freed block by accident.</>);
    t.step(5, ret(t.world()), <>main returns. Every block was freed exactly once: <span className="hl ok">no leak, no dangling pointer</span>.</>);
    t.finish(<>Allocate, use, free once, forget the address. Every manual-memory bug below is one of those steps going wrong.</>, 2);
    return t.frames;
  },
};

const danglingLocal: Preset = {
  id: 'dangling',
  name: 'Pointer to a local',
  mode: 'manual',
  language: 'C',
  code: ['int *bad(void) {', '  int x = 7;', '  return &x;', '}', 'int main(void) {', '  int *p = bad();', '  printf("%d", *p);', '}'],
  build() {
    const t = tracer('manual');
    t.step(null, t.world(), <>A function returns the address of one of its own locals. What could go wrong?</>);
    t.step(4, call(t.world(), 'main', 'main()', [['p', UNSET]]), <><code>main</code> starts.</>);
    t.step(5, call(t.world(), 'bad', 'bad()', [['x', UNSET]]), <><code>bad()</code> gets a frame.</>);
    t.step(1, set(t.world(), 'x', prim(7)), <><code>x = 7</code> lives in <b>bad&apos;s frame</b>, on the stack.</>);
    t.step(5, set(ret(t.world()), 'p', toSlot('bad', 'x')), <><code>bad</code> returns <code>&amp;x</code>, and its frame is popped. <code>p</code> now points into a <span className="hl bad">dead frame</span>.</>);
    t.step(6, readThrough(t.world(), 'p'), <>Reading <code>*p</code> is <span className="hl bad">undefined behaviour</span>: the next call can overwrite that memory at any moment.</>);
    t.finish(<>It might print 7, or anything else. Never return the address of a local: allocate on the heap, or return the value itself.</>, 2);
    return t.frames;
  },
};

const useAfterFree: Preset = {
  id: 'uaf',
  name: 'Use after free',
  mode: 'manual',
  language: 'C',
  code: ['int main(void) {', '  int *p = malloc(sizeof(int));', '  *p = 7;', '  free(p);', '  *p = 8;', '}'],
  build() {
    const t = tracer('manual');
    t.step(null, t.world(), <>The same start as a correct program, but one step in the wrong order.</>);
    t.step(0, call(t.world(), 'main', 'main()', [['p', UNSET]]), <><code>main</code>&apos;s frame with the pointer <code>p</code>.</>);
    const [w1, block] = allocate(t.world(), { id: 'b1', label: 'int (4 bytes)', fields: [{ name: 'value', text: '?' }] });
    t.step(1, set(w1, 'p', block), <><code>malloc</code> gives <code>p</code> a block.</>);
    t.step(2, writeThrough(t.world(), 'p', 'value', '7'), <><code>*p = 7</code>: fine.</>);
    t.step(3, free(t.world(), 'p'), <><code>free(p)</code>: the block is returned, but <code>p</code> still holds its address.</>);
    t.step(4, writeThrough(t.world(), 'p', 'value', '8'), <><code>*p = 8</code> still writes, straight into freed memory: a <span className="hl bad">use-after-free</span>. C doesn&apos;t stop you.</>);
    t.finish(<>That memory may already belong to someone else. Use-after-free bugs corrupt data and are a classic security hole.</>, 2);
    return t.frames;
  },
};

const leak: Preset = {
  id: 'leak',
  name: 'Memory leak',
  mode: 'manual',
  language: 'C',
  code: ['void work(void) {', '  int *buf = malloc(64);', '  /* ...forgot free(buf) */', '}', 'int main(void) {', '  for (int i = 0; i < 3; i++) work();', '}'],
  build() {
    const t = tracer('manual');
    t.step(null, t.world(), <>A function allocates a buffer and forgets to free it. Called three times.</>);
    t.step(4, call(t.world(), 'main', 'main()', [['i', prim(0)]]), <><code>main</code> starts its loop.</>);
    for (let i = 0; i < 3; i++) {
      if (i > 0) t.step(5, set(t.world(), 'i', prim(i)), <><code>i = {i}</code>: around again.</>);
      t.step(5, call(t.world(), `w${i}`, 'work()', [['buf', UNSET]]), <>Calling <code>work()</code>.</>);
      const [w1, block] = allocate(t.world(), { id: `b${i}`, label: '64 bytes', fields: [{ name: 'data', text: '…' }] });
      t.step(1, set(w1, 'buf', block), <><code>malloc(64)</code>: a new block, and <code>buf</code> is the only pointer to it.</>);
      t.step(3, ret(t.world()), <><code>work</code> returns without <code>free</code>. The only pointer is gone, so the block can never be freed: <span className="hl bad">leak #{i + 1}</span>.</>);
    }
    t.finish(<><span className="hl bad">3 leaked blocks.</span> A leak in a loop, or in a server that runs for weeks, eats memory until the process dies.</>, 2);
    return t.frames;
  },
};

export const PRESETS: Preset[] = [outliveFrame, stackOverflow, mallocFree, danglingLocal, useAfterFree, leak];
