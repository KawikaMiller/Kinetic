/**
 * The real engine, called on the lesson's fixed bytes. WebAssembly.Module and Instance run only
 * these constants (or the add module with one of three whitelisted bytes), never learner input,
 * and instantiating needs 'wasm-unsafe-eval' under a strict Content Security Policy.
 */
import { addModuleFor, ADD_BYTES, IMPORT_BYTES, SUM_ARRAY_BYTES, SUM_BYTES, type OperatorId } from './modules';

/** The class of an engine error, as the lesson names it (not the engine's own message). */
export type EngineErrorClass = 'RuntimeError' | 'LinkError' | 'CompileError' | 'TypeError' | 'Error';

export function errorClass(e: unknown): EngineErrorClass {
  if (e instanceof WebAssembly.RuntimeError) return 'RuntimeError';
  if (e instanceof WebAssembly.LinkError) return 'LinkError';
  if (e instanceof WebAssembly.CompileError) return 'CompileError';
  if (e instanceof TypeError) return 'TypeError';
  return 'Error';
}

export type Instantiated = { ok: true; instance: WebAssembly.Instance } | { ok: false; errorClass: EngineErrorClass };

/** Runs `bytes`, which must be one of this lesson's own modules, in the real engine. */
export function instantiate(bytes: Uint8Array, imports?: WebAssembly.Imports): Instantiated {
  try {
    // Instantiating needs 'wasm-unsafe-eval' under a strict Content Security Policy. It is safe here because `bytes` is always a constant from ./modules, never learner input: only fixed lesson bytes run.
    const module = new WebAssembly.Module(bytes as BufferSource);
    return { ok: true, instance: new WebAssembly.Instance(module, imports) };
  } catch (e) {
    return { ok: false, errorClass: errorClass(e) };
  }
}

export type CallResult = { ok: true; value: number | undefined } | { ok: false; errorClass: EngineErrorClass };

export function call(instance: WebAssembly.Instance, name: string, ...args: number[]): CallResult {
  try {
    return { ok: true, value: (instance.exports[name] as (...a: number[]) => number | undefined)(...args) };
  } catch (e) {
    return { ok: false, errorClass: errorClass(e) };
  }
}

/** The add module with the chosen operator, validated first, then called in the real engine. */
export function engineAdd(op: OperatorId, a: number, b: number): CallResult {
  const bytes = addModuleFor(op);
  if (!WebAssembly.validate(bytes as BufferSource)) return { ok: false, errorClass: 'CompileError' };
  const made = instantiate(bytes);
  return made.ok ? call(made.instance, 'add', a, b) : made;
}

export function engineSum(n: number): CallResult {
  const made = instantiate(SUM_BYTES);
  return made.ok ? call(made.instance, 'sum', n) : made;
}

/** The sum_array module and its exported memory, ready to be filled. */
export function sumArrayInstance(): { instance: WebAssembly.Instance; memory: WebAssembly.Memory } {
  const made = instantiate(SUM_ARRAY_BYTES);
  if (!made.ok) throw new Error(`sum_array did not instantiate: ${made.errorClass}`);
  return { instance: made.instance, memory: made.instance.exports.mem as WebAssembly.Memory };
}

export const importInstance = (imports?: WebAssembly.Imports) => instantiate(IMPORT_BYTES, imports);

export const validAll = () => [ADD_BYTES, SUM_BYTES, SUM_ARRAY_BYTES, IMPORT_BYTES].every((b) => WebAssembly.validate(b as BufferSource));
