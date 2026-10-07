import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { cListing, RUST_LISTING, type StackListing } from './listings';
import { asText, inputBytesIn, NAME_BYTES, ROW_BYTES, slotById, slotOf, type SlotId, type StackRun } from './model';
import { blockAt, blockText, runUaf, UAF_PROGRAMS, type UafDefence, type UafStep } from './uaf';

/** The risk, in the plain words the spec fixes. */
export const RISK = 'If an attacker controls the bytes that overwrite this slot, they may be able to change what the program does next.';

export interface StackFrame extends Frame {
  /** How many of the copy's bytes have landed so far. */
  upTo: number;
  /** The bytes this step wrote, [from, to), for the highlight. */
  fresh: [number, number] | null;
  line: number | null;
  done: boolean;
}

export const listingFor = (run: StackRun): StackListing => (run.defences.memorySafe ? RUST_LISTING : cListing(run.defences.boundsCheck, run.defences.canary));

/** What the slot past the buffer is called in this build. */
export function slotName(id: SlotId, canary: boolean): string {
  switch (id) {
    case 'name':
      return 'name';
    case 'canary':
      return canary ? 'the canary' : 'the padding above name';
    case 'rbp':
      return 'the saved rbp';
    case 'ret':
      return 'the return address';
    case 'caller':
      return "main's frame";
  }
}

const quoted = (bytes: Uint8Array) => <>&quot;{asText(bytes)}&quot;</>;

function startSay(run: StackRun): ReactNode {
  const len = run.input.length;
  if (run.defences.memorySafe) {
    return (
      <>
        Rust: <code>name</code> is an 8-byte array and every <code>name[i]</code> is bounds-checked. The input is {plural(len, 'byte')}.
      </>
    );
  }
  const above = run.defences.canary ? (
    <>
      the <span className="hl violet">stack canary</span> (a random value the epilogue checks)
    </>
  ) : (
    <>8 bytes of padding (this build has no canary)</>
  );
  const copy = run.defences.boundsCheck ? (
    <>
      <code>snprintf</code> will write {plural(run.written, 'byte')}: at most 7 characters plus the NUL.
    </>
  ) : (
    <>
      <code>strcpy</code> will write {plural(run.written, 'byte')}: the {len} of the name plus its NUL.
    </>
  );
  return (
    <>
      greet&apos;s frame: <code>name[8]</code> at the lowest address, then {above}, the <span className="hl violet">saved rbp</span> and the{' '}
      <span className="hl violet">return address</span>. {copy}
    </>
  );
}

function chunkSay(run: StackRun, from: number, to: number): ReactNode {
  const hasNul = !run.defences.memorySafe && to === run.written;
  const textEnd = hasNul ? to - 1 : to;
  const text = run.input.subarray(from, textEnd);
  const tail = hasNul ? (text.length ? <> and the NUL</> : <>the NUL</>) : null;
  const range = from === to - 1 ? <>Byte {from}</> : <>Bytes {from}–{to - 1}</>;
  const what = (
    <>
      {text.length > 0 && quoted(text)}
      {tail}
    </>
  );
  if (from < NAME_BYTES) {
    return (
      <>
        {range} go into <code>name</code>: <span className="hl info">{what}</span>.
      </>
    );
  }
  const id = slotOf(from).id;
  return (
    <>
      {range} run past <code>name[7]</code> into {slotName(id, run.defences.canary)}: <span className="hl bad">{what}</span>.
    </>
  );
}

function canarySay(run: StackRun): ReactNode {
  const s = slotById('canary');
  const differ = run.after.subarray(s.from, s.to).filter((b, i) => b !== run.before[s.from + i]).length;
  return differ ? (
    <>
      The epilogue compares the canary with the copy kept outside the stack: <span className="hl bad">{differ} of 8 bytes differ</span>.
    </>
  ) : (
    <>
      The epilogue compares the canary with the copy kept outside the stack: <span className="hl ok">all 8 bytes match</span>.
    </>
  );
}

function corruptedSay(run: StackRun): ReactNode {
  const { nx, aslr } = run.defences;
  const what = run.changed.includes('ret') ? (
    inputBytesIn(run, 'ret') > 0 ? (
      <>
        The <span className="hl bad">return address now holds bytes from the input</span>: on <code>ret</code> the program would jump somewhere it never intended.
      </>
    ) : (
      <>
        The string&apos;s NUL <span className="hl bad">overwrote the return address&apos;s lowest byte</span>: on <code>ret</code> the program would jump somewhere it never intended.
      </>
    )
  ) : (
    <>
      The <span className="hl bad">saved rbp now holds bytes from the input</span>: when greet returns, main&apos;s frame pointer is wrong, so main would look for its own variables in the wrong place.
    </>
  );
  return (
    <>
      {what} The run stops here. {RISK}
      {nx && <> NX is on: the stack is data only, so the CPU won&apos;t run instructions from it. That doesn&apos;t undo this overwrite; it removes one way of abusing it.</>}
      {aslr && <> ASLR is on: these addresses change every run (try Run again), which makes guessing where things are much harder. It doesn&apos;t stop the overwrite either.</>}
    </>
  );
}

export function outcomeSay(run: StackRun): ReactNode {
  const len = run.input.length;
  switch (run.kind) {
    case 'fits':
      return run.defences.memorySafe ? (
        <>
          <span className="hl ok">Fits</span>: {plural(len, 'byte')} in an 8-byte array (Rust strings carry their length, so there&apos;s no NUL). greet returns normally.
        </>
      ) : (
        <>
          <span className="hl ok">Fits</span>: {plural(run.written, 'byte')}, the NUL included, in an 8-byte buffer.{run.defences.canary && ' The canary check passes.'} greet returns to main as intended.
        </>
      );
    case 'truncated':
      return (
        <>
          <span className="hl ok">Stopped by the bounds check</span>: <code>snprintf</code> wrote 8 bytes, {quoted(run.after.subarray(0, NAME_BYTES - 1))} and a NUL, and nothing past the
          buffer changed. The name is cut short; <code>snprintf</code> returns {len}, the length it wanted to write, so the code can notice.
        </>
      );
    case 'panic':
      return (
        <>
          <span className="hl ok">Stopped by Rust</span>: <code>name[8]</code> is out of bounds, so the program panics with an error instead of writing past the array.
          Nothing outside <code>name</code> changed.
        </>
      );
    case 'aborted':
      return (
        <>
          <span className="hl ok">Stopped by the canary</span>: stack smashing detected, so the program aborts before <code>ret</code> ever uses the return address
          {run.changed.includes('ret') ? ' (which the copy overwrote too)' : ''}. A loud, safe stop instead of a quiet corruption.
        </>
      );
    case 'quiet':
      return run.changed.length === 0 ? (
        <>
          The NUL landed one byte past <code>name[7]</code>, on a canary byte that already held 00, so nothing changed and the check passes. Still a bug:{' '}
          <span className="hl orange">one more character overwrites the canary</span>.
        </>
      ) : (
        <>
          {plural(run.wouldOverflow, 'byte')} ran past <code>name[7]</code> into {run.changed.map((id) => slotName(id, run.defences.canary)).join(' and ')}. The saved rbp
          and return address didn&apos;t change, so greet still returns to main: <span className="hl orange">a silent bug</span>, and a longer name changes them.
        </>
      );
    case 'corrupted':
      return corruptedSay(run);
  }
}

export function stackFrames(run: StackRun): StackFrame[] {
  const listing = listingFor(run);
  const r = createRecorder<StackFrame>({ upTo: 0, fresh: null, line: 1, done: false }, { transient: { fresh: null } });
  r.snap(startSay(run));
  for (let from = 0; from < run.written; from += ROW_BYTES) {
    const to = Math.min(from + ROW_BYTES, run.written);
    r.snap(chunkSay(run, from, to), 1, { upTo: to, fresh: [from, to], line: listing.copyLine });
  }
  const C = !run.defences.memorySafe;
  if (C && run.defences.canary) r.snap(canarySay(run), 1, { line: listing.endLine });
  r.set({ done: true, line: run.kind === 'panic' ? listing.copyLine : listing.endLine });
  r.close(outcomeSay(run), 2);
  return r.frames;
}

/* ---------- use after free ---------- */

export interface UafFrame extends Frame {
  /** Index into the run's steps. */
  k: number;
  done: boolean;
}

const addr = (a: number | null | undefined) => (a == null ? 'NULL' : `0x${a.toString(16)}`);

function uafStepSay(steps: UafStep[], k: number, defence: UafDefence): ReactNode {
  const step = steps[k];
  const s = step.state;
  const prev = steps[k - 1].state;
  const op = UAF_PROGRAMS[defence].steps[k - 1].ops;
  const gc = defence === 'gc';
  const first = op[0];
  switch (first.kind) {
    case 'malloc': {
      const a = s.vars[first.v];
      if (gc) {
        return first.v === 'p' ? (
          <>
            p gets a new object holding &apos;Ada&apos;. There is no <code>free()</code>: the object lives as long as anything can still reach it.
          </>
        ) : (
          <>
            q gets its <span className="hl ok">own, new object</span> at {addr(a)}: p&apos;s object is still reachable, so its memory can&apos;t be handed out again.
          </>
        );
      }
      return step.reused ? (
        <>
          q asks for 16 bytes and gets {addr(a)}, <span className="hl bad">the block p used</span>: the allocator may hand freed memory to the next request, and here it did.
          {s.stale.includes('p') ? ' p and q now point at the same memory.' : ''}
        </>
      ) : (
        <>
          <code>malloc(16)</code> hands {first.v} a 16-byte block at {addr(a)}.
        </>
      );
    }
    case 'write': {
      const block = blockAt(s, s.vars[first.v]);
      if (s.crash) {
        return (
          <>
            <code>strcpy(p, &quot;Lin&quot;)</code> writes through NULL. Mainstream systems leave address 0 unmapped, so the program{' '}
            <span className="hl ok">crashes right at the bug</span>: segmentation fault. q still holds &quot;{blockText(blockAt(s, s.vars.q)!)}&quot;.
          </>
        );
      }
      const w = s.wrote!;
      const owner = (['p', 'q'] as const).find((v) => v !== first.v && s.vars[v] === w.addr);
      if (s.stale.includes(first.v) && owner) {
        const before = blockAt(prev, w.addr)!;
        const changed = block!.bytes.filter((b, i) => b !== before.bytes[i]).length;
        return (
          <>
            <code>strcpy(p, &quot;Lin&quot;)</code> writes through the stale p and lands in {owner}&apos;s block: <span className="hl bad">{plural(changed, 'byte')} of {owner}&apos;s data change</span>, and{' '}
            {owner} now reads &quot;{blockText(block!)}&quot;. Nothing crashed and nothing warned.
          </>
        );
      }
      if (gc) {
        return (
          <>
            <code>p.name = &apos;Lin&apos;</code> changes p&apos;s own object, and only that: q still reads &apos;{blockText(blockAt(s, s.vars.q)!)}&apos;.
          </>
        );
      }
      return (
        <>
          <code>strcpy</code> puts &quot;{blockText(block!)}&quot; in {first.v}&apos;s block.
        </>
      );
    }
    case 'free':
      return (
        <>
          <code>free(p)</code> gives the block back to the allocator, but p still holds {addr(s.vars.p)}: a <span className="hl bad">dangling pointer</span>, and nothing stops the program
          using it.
        </>
      );
    case 'null':
      return (
        <>
          <code>p = NULL</code>: p no longer holds the old address, so nothing can reach the freed block through p. (Any other copy of that address would still dangle.)
        </>
      );
    case 'print': {
      const own = ownText(defence, first.v);
      const printed = s.out.at(-1)!;
      return printed === own ? (
        <>
          It prints <span className="hl ok">&quot;{printed}&quot;</span>: exactly what {first.v}&apos;s own line stored.
        </>
      ) : (
        <>
          It prints <span className="hl bad">&quot;{printed}&quot;</span>, not &quot;{own}&quot;: {first.v}&apos;s data changed although no line wrote &quot;{printed}&quot; through {first.v}.
        </>
      );
    }
  }
}

/** The text a variable's own write stored. */
function ownText(defence: UafDefence, v: 'p' | 'q'): string {
  for (const step of UAF_PROGRAMS[defence].steps) for (const op of step.ops) if (op.kind === 'write' && op.v === v) return op.text;
  return '';
}

function uafCloseSay(defence: UafDefence, steps: UafStep[]): ReactNode {
  const last = steps.at(-1)!.state;
  switch (defence) {
    case 'none':
      return (
        <>
          <span className="hl bad">Use after free</span>: the old pointer still worked, so its write corrupted whoever got the memory next, and q printed &quot;{last.out.at(-1)}&quot;. If an
          attacker controls what is written through a stale pointer, they may be able to change what the program does next.
        </>
      );
    case 'null':
      return (
        <>
          <span className="hl ok">Stopped</span>: with p set to NULL the stale write crashed cleanly instead of corrupting q. It only protects that one variable, so it&apos;s a habit, not a
          guarantee.
        </>
      );
    case 'rust':
      return (
        <>
          <span className="hl ok">Stopped at compile time</span>: rustc refuses to build it (error E0382, borrow of moved value). <code>drop(p)</code> moved p, so no later line may use it, and
          the use after free never runs.
        </>
      );
    case 'gc':
      return (
        <>
          <span className="hl ok">No use after free possible</span>: a garbage collector frees memory only once nothing can reach it, so a live reference never ends up pointing at someone
          else&apos;s data.
        </>
      );
  }
}

export function uafFrames(defence: UafDefence): { steps: UafStep[]; frames: UafFrame[] } {
  const steps = runUaf(defence);
  const r = createRecorder<UafFrame>({ k: 0, done: false });
  r.snap(
    defence === 'rust' ? (
      <>
        Rust: <code>drop(p)</code> frees the String and moves p, so p can&apos;t be used afterwards. The compiler checks every later use.
      </>
    ) : defence === 'gc' ? (
      <>JavaScript: objects are never freed by hand; the garbage collector reclaims them once nothing refers to them.</>
    ) : (
      <>Two pointers, p and q, and a heap the allocator manages.</>
    ),
  );
  for (let k = 1; k < steps.length; k++) r.snap(uafStepSay(steps, k, defence), 1, { k });
  r.set({ done: true });
  r.close(uafCloseSay(defence, steps), 2);
  return { steps, frames: r.frames };
}
