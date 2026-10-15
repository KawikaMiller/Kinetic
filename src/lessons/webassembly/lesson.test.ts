import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { mulberry32, randInt } from '../../core/random';
import { bytesCaption, importsCaption, memoryCaption } from './captions';
import { CARDS } from './cards';
import { call, engineAdd, engineSum, errorClass, importInstance, instantiate, sumArrayInstance, validAll } from './engine';
import { moduleFields } from './fields';
import { importsFor } from './imports';
import { decodeBody, frames, importCount, insText, interpret, listingOf } from './interp';
import lesson from './index';
import { fits, LEN_MAX, makeWorld, MEMORY_DATA, memoryBytes, PAGE_BYTES, PTR_MAX, readLen, readPtr, sumArray } from './memory';
import {
  addModuleFor, ADD_BYTES, HEADER_BYTES, IMPORT_BYTES, MODULE_SIZES, OPERATOR_AT, OPERATORS, readU32, sectionsOf, SUM_ARRAY_BYTES, SUM_BYTES, type OperatorId,
} from './modules';

/** The spec's author-run hex strings, typed independently of modules.ts. */
const SPEC_HEX = {
  add: '0061736d01000000 01070160027f7f017f 03020100 07070103616464 0000 0a09010700200020016a0b',
  sum: '0061736d0100000001060160017f017f030201000707010373756d00000a25012301027f02400340200120004e0d01200220016a2102200141016a21010c000b0b20020b',
  sumArray: '0061736d0100000001070160027f7f017f0302010005030100010713020973756d5f61727261790000036d656d02000a2e012c01027f02400340200220014e0d012003200020024102746a2802006a2103200241016a21020c000b0b20030b',
};
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const i32 = (n: number) => n | 0;

describe('the modules', () => {
  it('are the spec’s bytes: 41, 68 and 95 long, and the import module 72', () => {
    expect(hex(ADD_BYTES)).toBe(SPEC_HEX.add.replace(/\s+/g, ''));
    expect(hex(SUM_BYTES)).toBe(SPEC_HEX.sum);
    expect(hex(SUM_ARRAY_BYTES)).toBe(SPEC_HEX.sumArray);
    expect([ADD_BYTES.length, SUM_BYTES.length, SUM_ARRAY_BYTES.length, IMPORT_BYTES.length]).toEqual([41, 68, 95, 72]);
    expect(MODULE_SIZES).toEqual({ add: 41, sum: 68, sumArray: 95, imports: 72 });
  });

  it('all pass WebAssembly.validate in the real engine', () => {
    expect(validAll()).toBe(true);
    for (const b of [ADD_BYTES, SUM_BYTES, SUM_ARRAY_BYTES, IMPORT_BYTES]) expect(WebAssembly.validate(b as BufferSource)).toBe(true);
  });

  it('read as sections: header 0 to 7, then each section by its own size, ending at the last byte', () => {
    const names = (b: Uint8Array) => sectionsOf(b).map((s) => s.name);
    expect(names(ADD_BYTES)).toEqual(['type', 'function', 'export', 'code']);
    expect(names(SUM_ARRAY_BYTES)).toEqual(['type', 'function', 'memory', 'export', 'code']);
    expect(names(IMPORT_BYTES)).toEqual(['type', 'import', 'function', 'export', 'code']);
    expect(sectionsOf(ADD_BYTES).map((s) => [s.from, s.to])).toEqual([[8, 16], [17, 20], [21, 29], [30, 40]]);
    for (const b of [ADD_BYTES, SUM_BYTES, SUM_ARRAY_BYTES, IMPORT_BYTES]) {
      const secs = sectionsOf(b);
      expect(secs[0].from).toBe(HEADER_BYTES);
      expect(secs[secs.length - 1].to).toBe(b.length - 1);
      secs.slice(1).forEach((s, i) => expect(s.from).toBe(secs[i].to + 1));
    }
    expect(readU32(Uint8Array.from([0xe5, 0x8e, 0x26]), 0)).toEqual({ value: 624485, next: 3 });
  });

  it('the byte grid’s fields cover every byte once, and none of them is drawn in --bad or --ok', () => {
    for (const b of [ADD_BYTES, SUM_BYTES, SUM_ARRAY_BYTES, IMPORT_BYTES]) {
      const fields = moduleFields(b);
      expect(fields[0]).toMatchObject({ from: 0, to: 7 });
      const covered = new Array<number>(b.length).fill(0);
      for (const f of fields) {
        expect(['bad', 'ok']).not.toContain(f.tone);
        for (let i = f.from; i <= f.to; i++) covered[i]++;
      }
      expect(covered.every((n) => n === 1)).toBe(true);
    }
  });
});

describe('the add operator choices come from the engine', () => {
  it('give 10, 4 and 21 for (7, 3), read off the engine and agreeing with JavaScript', () => {
    const expected: Record<OperatorId, number> = { add: 7 + 3, sub: 7 - 3, mul: 7 * 3 };
    for (const o of OPERATORS) {
      const r = engineAdd(o.id, 7, 3);
      expect(r, o.id).toEqual({ ok: true, value: expected[o.id] });
    }
    expect([10, 4, 21]).toEqual(OPERATORS.map((o) => (engineAdd(o.id, 7, 3) as { value: number }).value));
  });

  it('change exactly one byte of the module, to a validated opcode', () => {
    expect(OPERATOR_AT).toBe(39);
    for (const o of OPERATORS) {
      const m = addModuleFor(o.id);
      expect(m.length).toBe(ADD_BYTES.length);
      expect(WebAssembly.validate(m as BufferSource)).toBe(true);
      const diff = [...m].map((b, i) => (b === ADD_BYTES[i] ? -1 : i)).filter((i) => i >= 0);
      expect(diff).toEqual(o.id === 'add' ? [] : [OPERATOR_AT]);
      expect(m[OPERATOR_AT]).toBe(o.byte);
    }
    expect(OPERATORS.map((o) => o.byte)).toEqual([0x6a, 0x6b, 0x6c]);
  });
});

describe('the lesson’s interpreter against the real engine', () => {
  const rnd = mulberry32(2026);
  const value = (o: ReturnType<typeof interpret>) => (o.kind === 'value' ? o.value : `trap: ${o.reason}`);

  it('add, sub and mul agree on 1,000 seeded pairs each, including the 32-bit extremes', () => {
    const extremes = [INT_MIN, INT_MAX, 0, 1, -1, 65536, 46341];
    const pairs: [number, number][] = [];
    for (const a of extremes) for (const b of extremes) pairs.push([a, b]);
    while (pairs.length < 1000) pairs.push([randInt(INT_MIN, INT_MAX, rnd), randInt(INT_MIN, INT_MAX, rnd)]);
    for (const o of OPERATORS) {
      const module = addModuleFor(o.id);
      const made = instantiate(module);
      if (!made.ok) throw new Error('add module did not instantiate');
      for (const [a, b] of pairs) {
        const engine = call(made.instance, 'add', a, b);
        expect(engine.ok && engine.value, `${o.id} ${a} ${b}`).toBe(value(interpret(module, 0, [a, b])));
      }
    }
  });

  it('wraps to 32 bits the way the engine does, as a check on the extremes themselves', () => {
    expect(engineAdd('add', INT_MAX, 1)).toEqual({ ok: true, value: INT_MIN });
    expect(i32(INT_MAX + 1)).toBe(INT_MIN);
    expect(engineAdd('mul', 65536, 65536)).toEqual({ ok: true, value: 0 });
  });

  it('sum agrees for n from 0 to 100 and equals n (n - 1) / 2', () => {
    for (let n = 0; n <= 100; n++) {
      const engine = engineSum(n);
      expect(engine, `n=${n}`).toEqual({ ok: true, value: (n * (n - 1)) / 2 > 0 ? (n * (n - 1)) / 2 : 0 });
      expect(value(interpret(SUM_BYTES, 0, [n])), `n=${n}`).toBe(engine.ok ? engine.value : undefined);
    }
    expect([engineSum(5), engineSum(10)]).toEqual([{ ok: true, value: 10 }, { ok: true, value: 45 }]);
  });

  it('div agrees on seeded pairs and on its traps: divide by zero and INT_MIN / -1', () => {
    const made = importInstance({ env: { log: () => {} } });
    if (!made.ok) throw new Error('import module did not instantiate');
    expect(importCount(IMPORT_BYTES)).toBe(1);
    const pairs: [number, number][] = [[7, 2], [-7, 2], [7, -2], [1, 0], [0, 0], [INT_MIN, -1], [INT_MIN, 1], [INT_MAX, -1]];
    while (pairs.length < 500) pairs.push([randInt(-1000, 1000, rnd), randInt(-5, 5, rnd)]);
    let traps = 0;
    for (const [a, b] of pairs) {
      const engine = call(made.instance, 'div', a, b);
      const ours = interpret(IMPORT_BYTES, 1, [a, b]);
      if (engine.ok) expect(value(ours), `${a} / ${b}`).toBe(engine.value);
      else {
        traps++;
        expect(engine.errorClass).toBe('RuntimeError');
        expect(ours.kind, `${a} / ${b}`).toBe('trap');
      }
    }
    expect(traps).toBeGreaterThan(5);
    expect(call(made.instance, 'div', 7, 2)).toEqual({ ok: true, value: 3 });
    expect(call(made.instance, 'div', -7, 2)).toEqual({ ok: true, value: -3 });
  });

  it('sum_array agrees on seeded arrays at seeded addresses, and at the memory’s edge', () => {
    for (let k = 0; k < 200; k++) {
      const { instance, memory } = sumArrayInstance();
      const view = new Int32Array(memory.buffer);
      for (let i = 0; i < 64; i++) view[i] = randInt(INT_MIN, INT_MAX, rnd);
      const ptr = randInt(0, 64, rnd) * 2;
      const len = randInt(0, 64, rnd);
      const engine = call(instance, 'sum_array', ptr, len);
      const ours = interpret(SUM_ARRAY_BYTES, 0, [ptr, len], new Uint8Array(memory.buffer));
      expect(engine.ok && engine.value, `${ptr} ${len}`).toBe(value(ours));
    }
    const { instance, memory } = sumArrayInstance();
    const mem = new Uint8Array(memory.buffer);
    for (const [ptr, len] of [[65532, 1], [65533, 1], [65536, 0], [65536, 1], [65530, 4], [0, 16384], [0, 16385]] as const) {
      const engine = call(instance, 'sum_array', ptr, len);
      const ours = interpret(SUM_ARRAY_BYTES, 0, [ptr, len], mem);
      expect(engine.ok, `${ptr} ${len}`).toBe(ours.kind === 'value');
    }
  });
});

describe('the traps, the import errors and memory.grow, asserted on the engine', () => {
  it('ptr = 65530 with len = 4 throws a WebAssembly.RuntimeError (out-of-bounds load)', () => {
    const { instance } = sumArrayInstance();
    expect(() => (instance.exports.sum_array as (a: number, b: number) => number)(65530, 4)).toThrow(WebAssembly.RuntimeError);
    expect(call(instance, 'sum_array', 65530, 4)).toEqual({ ok: false, errorClass: 'RuntimeError' });
    expect(fits(65530, 4, PAGE_BYTES)).toBe(false);
    expect(fits(0, 8, PAGE_BYTES)).toBe(true);
  });

  it('div(1, 0) throws a RuntimeError', () => {
    const made = importInstance({ env: { log: () => {} } });
    expect(made.ok && call(made.instance, 'div', 1, 0)).toEqual({ ok: false, errorClass: 'RuntimeError' });
  });

  it('a missing env throws a TypeError, a missing log a LinkError, and with log run(42) calls it', () => {
    expect(() => new WebAssembly.Instance(new WebAssembly.Module(IMPORT_BYTES as BufferSource), {})).toThrow(TypeError);
    expect(() => new WebAssembly.Instance(new WebAssembly.Module(IMPORT_BYTES as BufferSource), { env: {} })).toThrow(WebAssembly.LinkError);
    expect(importInstance(importsFor(false, 'env', () => {}))).toEqual({ ok: false, errorClass: 'TypeError' });
    expect(importInstance(importsFor(false, 'log', () => {}))).toEqual({ ok: false, errorClass: 'LinkError' });
    expect(importInstance(undefined)).toEqual({ ok: false, errorClass: 'TypeError' });
    const logged: number[] = [];
    const made = importInstance(importsFor(true, 'env', (n) => logged.push(n)));
    expect(made.ok && call(made.instance, 'run', 42)).toEqual({ ok: true, value: undefined });
    expect(logged).toEqual([42]);
  });

  it('error classes are told apart without reading the engine’s own message', () => {
    expect(errorClass(new TypeError('x'))).toBe('TypeError');
    expect(errorClass(new WebAssembly.LinkError('x'))).toBe('LinkError');
    expect(errorClass(new WebAssembly.RuntimeError('x'))).toBe('RuntimeError');
    expect(errorClass(new WebAssembly.CompileError('x'))).toBe('CompileError');
    expect(errorClass(new Error('x'))).toBe('Error');
  });

  it('after memory.grow(1) the first buffer’s byteLength is 0 and the memory is 131,072 bytes, and the data is kept', () => {
    const w = makeWorld();
    expect(w.firstBuffer.byteLength).toBe(PAGE_BYTES);
    w.memory.grow(1);
    expect([w.firstBuffer.byteLength, w.memory.buffer.byteLength]).toEqual([0, 131072]);
    expect([...new Int32Array(w.memory.buffer).slice(0, 4)]).toEqual([3, 1, 4, 1]);
  });
});

describe('the memory scene’s model', () => {
  it('JavaScript wrote sixteen integers through an Int32Array: sum_array(0, 8) is 31 and sum_array(4, 4) is 11', () => {
    const w = makeWorld();
    expect(MEMORY_DATA.slice(0, 8).reduce((a, b) => a + b, 0)).toBe(31);
    expect(sumArray(w, 0, 8)).toMatchObject({ engine: { ok: true, value: 31 }, agree: true });
    expect(sumArray(w, 4, 4)).toMatchObject({ engine: { ok: true, value: 11 }, agree: true });
    expect([...memoryBytes(w).slice(0, 8)]).toEqual([3, 0, 0, 0, 1, 0, 0, 0]);
  });

  it('the page’s interpreter and the engine trap together on 65530, 4', () => {
    const r = sumArray(makeWorld(), 65530, 4);
    expect(r.engine).toEqual({ ok: false, errorClass: 'RuntimeError' });
    expect(r.ours.kind).toBe('trap');
    expect(r.agree).toBe(true);
  });

  it('ptr is read from 0 to 70,000 and len from 0 to 64, and anything else is refused with a message', () => {
    expect([PTR_MAX, LEN_MAX]).toEqual([70000, 64]);
    expect(readPtr('70000')).toEqual({ ok: true, value: 70000 });
    expect(readPtr('70001')).toEqual({ ok: false, error: 'ptr goes from 0 to 70,000.' });
    expect(readLen('64')).toEqual({ ok: true, value: 64 });
    expect(readLen('65')).toEqual({ ok: false, error: 'len goes from 0 to 64.' });
    for (const bad of ['', '-1', '1.5', '1e3', 'abc', '0x10']) {
      expect(readPtr(bad).ok, bad).toBe(false);
      expect(readLen(bad).ok, bad).toBe(false);
    }
  });
});

describe('decoding the function bodies from the bytes', () => {
  it('sum decodes to the listing the stepper shows', () => {
    const body = decodeBody(SUM_BYTES, 0);
    expect(body.extra).toBe(2);
    expect(listingOf(body)).toEqual([
      'block', '  loop', '    local.get 1', '    local.get 0', '    i32.ge_s', '    br_if 1', '    local.get 2', '    local.get 1', '    i32.add',
      '    local.set 2', '    local.get 1', '    i32.const 1', '    i32.add', '    local.set 1', '    br 0', '  end', 'end', 'local.get 2', 'end',
    ]);
  });

  it('add is local.get 0, local.get 1, the operator, end; signed constants and memory immediates decode', () => {
    expect(decodeBody(ADD_BYTES, 0).code.map(insText)).toEqual(['local.get 0', 'local.get 1', 'i32.add', 'end']);
    expect(decodeBody(SUM_ARRAY_BYTES, 0).code.some((i) => i.op === 'i32.load' && i.imm[1] === 0)).toBe(true);
    expect(decodeBody(SUM_ARRAY_BYTES, 0).code.map(insText)).toContain('i32.load offset=0');
  });

  it('refuses an opcode outside its subset instead of guessing', () => {
    const odd = ADD_BYTES.slice();
    odd[OPERATOR_AT] = 0x6e;
    expect(() => decodeBody(odd, 0)).toThrow(/outside this interpreter's subset/);
  });
});

describe('stepping sum with the interpreter', () => {
  it('sum(5) returns 10 in the last frame, never leaves a label open, and the frames are one instruction apart', () => {
    const body = decodeBody(SUM_BYTES, 0);
    const run = frames(body, [5]);
    const last = run[run.length - 1];
    expect([last.status, last.result]).toEqual(['returned', 10]);
    run.slice(1).forEach((f, i) => expect(f.steps - run[i].steps).toBe(1));
    expect(last.labels).toEqual([]);
    expect(run[0].locals).toEqual([5, 0, 0]);
  });

  it('every frame’s caption passes the glue check, for the extremes of n', () => {
    for (const n of [0, 5, 12]) {
      for (const f of frames(decodeBody(SUM_BYTES, 0), [n])) expectCaption(f.note || 'start');
    }
  });
});

describe('captions', () => {
  it('scene 1 names the byte, the operator and the engine’s answer; scene 3 names the trap and the detached view', () => {
    const op = OPERATORS[1];
    const text = expectCaption(bytesCaption({ op, a: 7, b: 3, engine: engineAdd('sub', 7, 3), bytes: addModuleFor('sub'), valid: true }));
    expect(text).toContain('0x6b');
    expect(text).toContain('add(7, 3) = 4');
    const world = makeWorld();
    const trap = sumArray(world, 65530, 4).engine;
    const trapText = expectCaption(memoryCaption({ ptr: 65530, len: 4, result: trap, memoryLength: PAGE_BYTES, grows: 0, firstLength: PAGE_BYTES }));
    expect(trapText).toContain('traps with a RuntimeError');
    expect(trapText).toContain('bytes 65530 to 65545');
    const grownText = expectCaption(memoryCaption({ ptr: 0, len: 8, result: sumArray(world, 0, 8).engine, memoryLength: 131072, grows: 1, firstLength: 0 }));
    expect(grownText).toContain('byteLength 0');
    expect(grownText).toContain('131,072');
    expect(expectCaption(memoryCaption({ ptr: 70000, len: 0, result: { ok: true, value: 0 }, memoryLength: PAGE_BYTES, grows: 0, firstLength: PAGE_BYTES }))).toContain('nothing can trap');
  });

  it('scene 4 says the engine refuses at link time and names the class, and that a trap stops only that call', () => {
    expect(expectCaption(importsCaption({ granted: false, missing: 'env', made: 'TypeError', last: null }))).toContain('TypeError');
    expect(expectCaption(importsCaption({ granted: false, missing: 'log', made: 'LinkError', last: null }))).toContain('no log in it');
    expect(expectCaption(importsCaption({ granted: true, missing: 'env', made: null, last: { label: 'div(1, 0)', result: { ok: false, errorClass: 'RuntimeError' } } }))).toContain('traps with a RuntimeError');
    expect(expectCaption(importsCaption({ granted: true, missing: 'env', made: null, last: { label: 'div(7, 2)', result: { ok: true, value: 3 } } }))).toContain('div(7, 2) = 3');
  });

  it('the cards make no timing claim and hedge what they cannot run', () => {
    expect(CARDS).toHaveLength(4);
    for (const c of CARDS) expect(c.text, c.id).not.toMatch(/\b\d+(\.\d+)?\s?(x|times|ms|%) faster\b|\bfaster by\b/i);
    expect(CARDS.find((c) => c.id === 'speed')?.text).toContain('measures nothing');
    expect(CARDS.find((c) => c.id === 'toolchains')?.note).toContain('from memory');
  });
});

describe('only fixed bytes reach the engine', () => {
  it('no source file of the lesson builds a Module outside engine.ts, and none calls eval', () => {
    const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(10);
    for (const [name, source] of files) {
      expect(source, name).not.toMatch(/\beval\s*\(|new Function/);
      if (!name.endsWith('engine.ts')) expect(source, name).not.toMatch(/new WebAssembly\.(Module|Instance)|WebAssembly\.instantiate/);
    }
    const engine = files.find(([name]) => name.endsWith('engine.ts'))![1];
    expect(engine).toContain("'wasm-unsafe-eval'");
  });
});

describe('try-this entries, from the default state', () => {
  it('try-this 1: add(7, 3) = 10 at 41 bytes, and sub gives 4 and mul 21', () => {
    expect(engineAdd('add', 7, 3)).toEqual({ ok: true, value: 10 });
    expect([engineAdd('sub', 7, 3), engineAdd('mul', 7, 3)]).toEqual([{ ok: true, value: 4 }, { ok: true, value: 21 }]);
    expect(lesson.tryThis[0]).toContain('41 bytes');
    expect(lesson.tryThis[0]).toContain('= 10');
    expect(lesson.tryThis[0]).toContain('engine says 4');
    expect(lesson.tryThis[0]).toContain('i32.mul gives 21');
  });

  it('try-this 2: sum(5) returns 10 and sum(10) returns 45 in both', () => {
    const last = frames(decodeBody(SUM_BYTES, 0), [5]).at(-1)!;
    expect(last.result).toBe(10);
    expect(frames(decodeBody(SUM_BYTES, 0), [10]).at(-1)!.result).toBe(45);
    expect(lesson.tryThis[1]).toContain('returns 10');
    expect(lesson.tryThis[1]).toContain('45');
  });

  it('try-this 3: 0 and 8 sum to 31 and 65530, 4 traps with a RuntimeError', () => {
    const w = makeWorld();
    expect(sumArray(w, 0, 8).engine).toEqual({ ok: true, value: 31 });
    expect(sumArray(w, 65530, 4).engine).toEqual({ ok: false, errorClass: 'RuntimeError' });
    expect(lesson.tryThis[2]).toContain('sum to 31');
    expect(lesson.tryThis[2]).toContain('RuntimeError');
    expect(lesson.tryThis[2]).toContain('65,536 bytes');
  });

  it('try-this 4: growing by a page detaches the first view (byteLength 0) and makes the memory 131,072 bytes', () => {
    const w = makeWorld();
    w.memory.grow(1);
    expect([w.firstBuffer.byteLength, w.memory.buffer.byteLength]).toEqual([0, 131072]);
    expect(lesson.tryThis[3]).toContain('reads 0');
    expect(lesson.tryThis[3]).toContain('131,072 bytes');
  });

  it('try-this 5: TypeError for no env, LinkError for no log, then run(42) and a div(1, 0) RuntimeError', () => {
    expect(importInstance(importsFor(false, 'env', () => {}))).toMatchObject({ errorClass: 'TypeError' });
    expect(importInstance(importsFor(false, 'log', () => {}))).toMatchObject({ errorClass: 'LinkError' });
    expect(lesson.tryThis[4]).toContain('TypeError when the whole env object is missing');
    expect(lesson.tryThis[4]).toContain('LinkError when only log is');
    expect(lesson.tryThis[4]).toContain('RuntimeError');
  });
});

describe('the caption effects cannot loop', () => {
  // The repo has no DOM renderer, so this is a source-level guard for a bug that shipped once: MemoryScene recomputed
  // sumArray on every render and listed the fresh result in the effect that sets the caption, which re-rendered the
  // stage, which ran the effect again, forever ("Maximum update depth exceeded").
  const sources = import.meta.glob<string>('./*Scene.tsx', { query: '?raw', import: 'default', eager: true });

  it('MemoryScene computes the engine result inside useMemo', () => {
    const memory = sources['./MemoryScene.tsx'];
    expect(memory).toMatch(/const result = useMemo\(\(\) => sumArray\(world, ptr, len\), \[world, ptr, len, grows\]\)/);
  });
});
