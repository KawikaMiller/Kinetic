import type { ReactNode } from 'react';
import type { CallResult } from './engine';
import type { Operator } from './modules';

/** Scene 1's caption, from the operator, the arguments and what the engine said. */
export function bytesCaption(o: { op: Operator; a: number; b: number; engine: CallResult; bytes: Uint8Array; valid: boolean }): ReactNode {
  const hex = `0x${o.op.byte.toString(16)}`;
  if (!o.valid) return <>The engine rejects these bytes, so there is nothing to call.</>;
  const answer = o.engine.ok ? String(o.engine.value) : `a ${o.engine.errorClass}`;
  return (
    <>
      The code section ends in the byte <b>{hex}</b>, <code>{o.op.name}</code>. Called through the real engine, add({o.a}, {o.b}) <b>{o.engine.ok ? '=' : 'gives'} {answer}</b>: {o.a} {o.op.c} {o.b}, in 32-bit arithmetic.
    </>
  );
}

/** Scene 3's caption, from the call and the memory it ran against. */
export function memoryCaption(o: { ptr: number; len: number; result: CallResult; memoryLength: number; grows: number; firstLength: number }): ReactNode {
  const end = o.ptr + o.len * 4;
  const grown = o.grows > 0
    ? <> After memory.grow the first view reads byteLength {o.firstLength}: it is detached, and a fresh view over memory.buffer sees {o.memoryLength.toLocaleString('en-US')} bytes.</>
    : null;
  if (o.len === 0) return <>sum_array({o.ptr}, 0) reads nothing, so the sum is 0 and nothing can trap.{grown}</>;
  if (!o.result.ok) {
    return <>sum_array({o.ptr}, {o.len}) reads bytes {o.ptr} to {end - 1}, but memory ends at byte {o.memoryLength - 1}: the engine <span className="hl bad wrap">traps with a {o.result.errorClass}</span>.{grown}</>;
  }
  return <>sum_array({o.ptr}, {o.len}) adds {o.len} 32-bit integers from address {o.ptr} (bytes {o.ptr} to {end - 1}): the real engine says <b>{o.result.value}</b>.{grown}</>;
}

/** Scene 4's caption, from what was handed over and what the last call did. */
export function importsCaption(o: { granted: boolean; missing: 'env' | 'log'; made: string | null; last: { label: string; result: CallResult } | null }): ReactNode {
  if (o.made) {
    return (
      <>
        Instantiating fails with a <span className="hl orange wrap">{o.made}</span>: the module imports env.log and {o.missing === 'env' ? 'the host gave no env object at all' : 'the env object has no log in it'}. The engine refuses at link time; nothing ran.
      </>
    );
  }
  if (!o.last) return <>The host handed over env.log, so the module instantiates. Call run(42), or try div.</>;
  const { label, result } = o.last;
  if (!result.ok) return <>{label} <span className="hl bad wrap">traps with a {result.errorClass}</span>: the engine stops that call, and the page carries on.</>;
  return <>{label}{result.value === undefined ? ' called env.log through the import and returned nothing' : ` = ${result.value}`}.</>;
}
