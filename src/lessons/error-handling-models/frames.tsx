import type { ReactNode } from 'react';
import type { CallFrameState } from '../../components/CallStackPanel';
import { createRecorder } from '../../core/recorder';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { FN_ARGS, headerLine, runTraced, show, type FailAt, type Fn, type Mode, type Preset, type TraceEvent } from './model';

export interface StackItem {
  fn: Fn;
  state: CallFrameState;
  tone?: Tone;
  detail?: string;
}

export interface EhFrame extends Frame {
  /** Bottom (main) first. */
  stack: StackItem[];
  /** Program line to highlight. */
  line: number | null;
  output: string[];
  /** "Error: bank timeout" once an exception escaped main (the console prints "Uncaught …"). */
  crash: string | null;
  /** The message of an error an empty catch threw away. */
  lost: string | null;
}

/** Longest value shown inside a stack frame; the caption always has the whole value. */
const FRAME_DETAIL_CHARS = 14;
const abbreviate = (s: string) => (s.length > FRAME_DETAIL_CHARS ? `${s.slice(0, FRAME_DETAIL_CHARS - 1)}…` : s);

const errBadge = (message: string) => <span className="hl bad">Error('{message}')</span>;

/** Index of the next event after `i` that isn't a log line. */
const nextShown = (events: TraceEvent[], i: number) => events.findIndex((x, k) => k > i && x.kind !== 'log');

/**
 * A function that returns leaves right after its return, or right after its own finally
 * (`return x` inside `try { } finally { }` runs the finally before the frame pops). That
 * leave is already shown by the return or finally frame, so it isn't a frame of its own.
 */
function mergedLeaves(events: TraceEvent[]): Set<number> {
  const skip = new Set<number>();
  events.forEach((e, i) => {
    if (e.kind !== 'return') return;
    let j = nextShown(events, i);
    if (events[j]?.kind === 'finally' && (events[j] as { fn: Fn }).fn === e.fn) j = nextShown(events, j);
    const next = events[j];
    if (next?.kind === 'leave' && next.fn === e.fn) skip.add(j);
  });
  return skip;
}

/** The value expression a `return` line hands back, e.g. "err('bank timeout')" or "res". */
const returnedExpr = (line: string | undefined) => /return (.*);$/.exec(line?.trim() ?? '')?.[1] ?? '';

/**
 * Which shown event each printed line appears with: the event it directly follows
 * (a finally or catch prints right after it starts), or, after a merged leave, the next
 * shown event (main's last log appears as main finishes).
 */
function logOwners(events: TraceEvent[], skip: Set<number>): Map<number, string[]> {
  const owners = new Map<number, string[]>();
  let owner: number | null = null;
  let pending: string[] = [];
  events.forEach((e, i) => {
    if (e.kind === 'log') {
      if (owner === null) pending.push(e.text);
      else owners.get(owner)!.push(e.text);
      return;
    }
    if (skip.has(i)) {
      owner = null;
      return;
    }
    owners.set(i, pending);
    pending = [];
    owner = i;
  });
  return owners;
}

function verdict(mode: Mode, preset: Preset, failAt: FailAt, output: string[], hasFinally: boolean): ReactNode {
  const responded = output.at(-1)?.replace('main: responded ', '') ?? '';
  if (mode === 'result') {
    return failAt === 'none' ? (
      <>Success, and every level still had to unwrap and re-wrap the value: <code>{responded}</code>.</>
    ) : (
      <>No hidden jumps: every level checked the result and passed the <b>Err</b> up by hand. Explicit, but verbose. main responded <code>{responded}</code>.</>
    );
  }
  if (failAt === 'none') {
    return (
      <>
        No failure: every frame returned normally{hasFinally ? ', and the finally still ran' : ''}. main responded <code>{responded}</code>.
      </>
    );
  }
  if (preset === 'swallow') {
    return (
      <>Looks like success: main responded <code>{responded}</code>. But the payment <span className="hl bad">never went through</span> and nobody knows why. Catching everything made it worse.</>
    );
  }
  if (preset === 'rethrow') return <>Handled at the boundary, with the original error kept as the <code>cause</code> for whoever debugs it. main responded <code>{responded}</code>.</>;
  return <>Handled at the boundary: the lock was released, the user gets a clean error, nothing crashed. main responded <code>{responded}</code>.</>;
}

export function errorFrames(lines: readonly string[], mode: Mode, preset: Preset, failAt: FailAt): EhFrame[] {
  const { events } = runTraced(lines);
  const skip = mergedLeaves(events);
  const rec = createRecorder<EhFrame>({ stack: [], line: null, output: [], crash: null, lost: null });
  const now = rec.get;
  let popNext = false;
  const finallyRan = new Set<Fn>();
  /** Functions that have returned but whose frame waits for their finally to run. */
  const returning = new Set<Fn>();

  rec.snap(
    mode === 'exceptions' ? (
      <>A request travels main → handleRequest → chargeCard → callBank. Watch how a failure travels back. Press play.</>
    ) : (
      <>The same calls, but failure is a value: every function returns <code>ok(…)</code> or <code>err(…)</code>. Press play.</>
    ),
  );

  const printedBy = logOwners(events, skip);
  events.forEach((e, i) => {
    if (e.kind === 'log' || skip.has(i)) return;
    const printed = printedBy.get(i) ?? [];

    const stack: StackItem[] = now().stack.map((s) => ({ fn: s.fn, state: 'waiting' }));
    /** A call whose return the previous frame showed: its frame pops as this step begins. */
    let popped: Fn | null = null;
    if (popNext) {
      popped = stack.pop()?.fn ?? null;
      popNext = false;
    }
    const top = stack[stack.length - 1];
    const set = (item: Partial<StackItem>) => Object.assign(top, item);
    let say: ReactNode = null;
    let line: number | null = 'line' in e ? e.line : null;
    const patch: Partial<EhFrame> = {};

    switch (e.kind) {
      case 'enter': {
        const caller = stack[stack.length - 1]?.fn;
        stack.push({ fn: e.fn, state: 'running' });
        line = headerLine(lines, e.fn);
        say = caller ? <>{caller} calls <code>{e.fn}({FN_ARGS[e.fn]})</code>.</> : <>main() starts handling one request.</>;
        break;
      }
      case 'return': {
        set({ state: 'returning', detail: `returns ${abbreviate(show(e.value))}` });
        const next = events[nextShown(events, i)];
        const finallyFirst = next?.kind === 'finally' && next.fn === e.fn;
        if (finallyFirst) returning.add(e.fn);
        else popNext = true;
        const isErr = mode === 'result' && typeof e.value === 'object' && e.value !== null && 'ok' in e.value && !e.value.ok;
        const creates = /^err\(/.test(returnedExpr(lines[e.line]));
        say = isErr ? (
          creates ? (
            <>{e.fn} fails, and says so with a value: it returns <code>{returnedExpr(lines[e.line])}</code> instead of throwing.</>
          ) : (
            <>{e.fn} checks the result: it's an <b>Err</b>, so it returns it upward. Explicit, and repeated at every level.</>
          )
        ) : finallyFirst ? (
          <>{e.fn} returns <code>{show(e.value)}</code>, but its <b>finally</b> still has to run before the frame can pop.</>
        ) : (
          <>{e.fn} returns <code>{show(e.value)}</code>.</>
        );
        break;
      }
      case 'leave': {
        stack.pop();
        say =
          e.fn !== 'main' ? (
            <>{e.fn} reaches its end without a return statement, so it returns <code>undefined</code>.</>
          ) : popped ? (
            <>{popped}&apos;s frame pops now that it has returned, and main finishes.</>
          ) : (
            <>main finishes.</>
          );
        break;
      }
      case 'throw': {
        set({ state: 'error', detail: `throws '${e.message}'` });
        say = <>{e.fn} throws {errBadge(e.message)}. Normal execution stops right here.</>;
        break;
      }
      case 'unwind': {
        set({ tone: 'dim', detail: 'no catch here: skipped' });
        popNext = true;
        say = finallyRan.has(e.fn) ? (
          <>Its finally is done, but {e.fn} has no catch: the error keeps flying and the frame pops.</>
        ) : (
          <>{e.fn} has no catch, so the error flies straight through it. Skipped: its frame pops.</>
        );
        break;
      }
      case 'finally': {
        finallyRan.add(e.fn);
        if (returning.delete(e.fn)) {
          // It returned first: the value waits until cleanup is done, then the frame pops.
          set({ tone: 'violet', detail: 'finally, then return' });
          popNext = true;
          say = <>{e.fn}'s <b>finally</b> runs first; only then does its return value reach the caller and the frame pop.</>;
        } else {
          set({ tone: 'violet', detail: 'finally: cleanup' });
          say = <>{e.fn}'s <b>finally</b> runs on the way out, whether or not something failed.</>;
        }
        break;
      }
      case 'catch': {
        const rethrows = events.slice(i + 1).find((x) => x.kind !== 'log')?.kind === 'throw';
        set({ state: 'ok', detail: rethrows ? 'catch: wraps it' : 'catch: handles it' });
        say = rethrows ? (
          <>{e.fn} catches '{e.message}', wraps it with a <code>cause</code>, and throws a new, clearer error.</>
        ) : (
          <>{e.fn}'s <b>catch</b> handles '{e.message}'. The error stops here.</>
        );
        break;
      }
      case 'swallow': {
        set({ tone: 'bad', detail: 'catch {}: does nothing' });
        patch.lost = e.message;
        say = <>{e.fn} has an empty <code>catch {'{}'}</code>: '{e.message}' is swallowed. No log, no signal, no error.</>;
        break;
      }
      case 'crash': {
        stack.length = 0;
        patch.crash = `Error: ${e.message}`;
        say = <>Nothing caught it: the error escapes main and the program <span className="hl bad">crashes</span>.</>;
        break;
      }
    }
    rec.snap(say, undefined, { stack, line, output: [...now().output, ...printed], ...patch });
  });

  const hasFinally = events.some((e) => e.kind === 'finally');
  if (!now().crash) rec.close(verdict(mode, preset, failAt, now().output, hasFinally), 2);
  return rec.frames;
}
