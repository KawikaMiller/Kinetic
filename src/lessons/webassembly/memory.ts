import { parseBoundedInt } from '../../core/parse';
import { call, sumArrayInstance } from './engine';
import { interpret } from './interp';
import { SUM_ARRAY_BYTES } from './modules';

/** What JavaScript writes into linear memory before the learner calls anything: sixteen 32-bit integers from address 0. */
export const MEMORY_DATA: readonly number[] = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3];
export const PAGE_BYTES = 65536;
export const PTR_MAX = 70_000;
export const LEN_MAX = 64;
export const INT_BYTES = 4;
export const WINDOW_BYTES = 16;

export interface World {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  /** The buffer JavaScript's first view was made on, kept to show that growing detaches it. */
  firstBuffer: ArrayBuffer;
}

/** A fresh instance with the data written through an Int32Array view over its memory. */
export function makeWorld(): World {
  const { instance, memory } = sumArrayInstance();
  const firstBuffer = memory.buffer;
  new Int32Array(firstBuffer).set(MEMORY_DATA);
  return { instance, memory, firstBuffer };
}

export const memoryBytes = (w: World) => new Uint8Array(w.memory.buffer);

/** The real engine and the page's interpreter on sum_array(ptr, len), against the same memory. */
export function sumArray(w: World, ptr: number, len: number) {
  const engine = call(w.instance, 'sum_array', ptr, len);
  const ours = interpret(SUM_ARRAY_BYTES, 0, [ptr, len], memoryBytes(w));
  const agree = engine.ok ? ours.kind === 'value' && ours.value === engine.value : ours.kind === 'trap';
  return { engine, ours, agree };
}

/** Whether a read of `len` integers from `ptr` fits in the memory (the page's own arithmetic, for the caption). */
export const fits = (ptr: number, len: number, memoryLength: number) => ptr + len * INT_BYTES <= memoryLength;

const wholeNumber = (what: string, max: number) => ({
  min: 0,
  max,
  messages: { tooBig: () => `${what} goes from 0 to ${max.toLocaleString('en-US')}.`, invalid: (t: string) => `"${t}" is not a whole number for ${what}.` },
});

/** The learner's ptr field: a whole number from 0 to 70,000, or the reason it is refused. */
export const readPtr = (text: string) => parseBoundedInt(text, wholeNumber('ptr', PTR_MAX));
/** The learner's len field: a whole number from 0 to 64. */
export const readLen = (text: string) => parseBoundedInt(text, wholeNumber('len', LEN_MAX));
