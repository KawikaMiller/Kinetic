import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  RANGE_TO, countdownResults, filterOf, forBreakRun, lazyRun, naturalsRun, reusable, showArray, showResult, twoPasses, SOURCES,
  type FilterId, type LazyEvent, type ProgramId, type SourceId, type Station,
} from './model';

const big = (n: number) => n.toLocaleString('en-US');

// ── Scene 1 · eager vs lazy ────────────────────────────────────────

export interface PipeFrame extends Frame {
  /** Lazy: the hop on screen now. */
  event: LazyEvent | null;
  counts: Record<Station, number>;
  result: number[];
}

const ZERO: Record<Station, number> = { range: 0, map: 0, filter: 0, take: 0 };

export function lazyFrames(f: FilterId, n: number): PipeFrame[] {
  const { result, events } = lazyRun(f, n);
  const rec = createRecorder<PipeFrame>({ event: null, counts: ZERO, result: [] });
  rec.snap(<>Lazy: nothing runs until <code>take</code> asks for a value. Each ask travels back to <code>range</code>, and one value comes forward.</>);
  const kept: number[] = [];
  for (const e of events) {
    let say;
    if (e.from === 'range') say = <><code>range</code> yields <b>{e.value}</b> because someone downstream asked.</>;
    else if (e.from === 'map') say = <><code>map</code> squares it: <b>{e.value}</b>.</>;
    else if (e.dropped) say = <><code>filter</code> drops <b>{e.value}</b> (fails <code>{filterOf(f).code}</code>) and asks for the next one.</>;
    else {
      kept.push(e.value);
      say = <><code>take</code> gets <b>{e.value}</b>: {kept.length} of {n}.</>;
    }
    rec.snap(say, undefined, { event: e, counts: e.counts, result: [...kept] });
  }
  const last = events.at(-1)!.counts;
  rec.set({ event: null });
  rec.close(
    <>
      <span className="hl ok">{showArray(result)}</span>, the same answer, after pulling only <span className="hl ok">{last.range}</span> of {big(RANGE_TO)} values from <code>range</code>.{' '}
      <code>take</code> stopped asking, so the other {big(RANGE_TO - last.range)} were never made: the work didn&apos;t happen later, it never happened.
    </>,
    2,
  );
  return rec.frames;
}

// ── Scene 2 · the protocol ─────────────────────────────────────────

export interface ProtoFrame extends Frame {
  defLine: number | null;
  callerLine: number | null;
  /** The real call stack, top first. */
  stack: { id: string; name: string; state: 'running' | 'waiting' }[];
  /** A suspended generator's frame object, off the stack (null when there is none). */
  parked: string | null;
  printed: string[];
}

const MAIN = { id: 'main', name: 'main', state: 'running' as const };
const mainWaiting = { ...MAIN, state: 'waiting' as const };

export function protoFrames(p: ProgramId): ProtoFrame[] {
  const rec = createRecorder<ProtoFrame>({ defLine: null, callerLine: null, stack: [MAIN], parked: null, printed: [] });
  const printed: string[] = [];
  if (p === 'hand') {
    const rs = countdownResults('hand');
    rec.snap(<>An iterator is any object with a <code>next()</code> method that returns <code>{'{ value, done }'}</code>. This one is written by hand.</>);
    rec.snap(<><code>countdown(3)</code> returns the object at once. Its state, <code>n = 3</code>, lives in the closure.</>, undefined, { callerLine: 0 });
    rs.forEach((r, i) => {
      printed.push(showResult(r));
      rec.snap(
        r.done ? (
          <><code>n</code> is 0, so <code>next()</code> returns <span className="hl ok">{showResult(r)}</span>: the iterator is finished.</>
        ) : (
          <><code>next()</code> is an ordinary call: it runs to the end and returns <b>{showResult(r)}</b>. Nothing is paused; <code>n</code> is now {r.value - 1}, kept in the closure.</>
        ),
        undefined,
        { callerLine: i + 1, defLine: r.done ? 3 : 4, stack: [{ id: 'next', name: 'next()', state: 'running' }, mainWaiting], printed: [...printed] },
      );
    });
    rec.set({ defLine: null, stack: [MAIN] });
    rec.close(<>You wrote the bookkeeping yourself: where you are (<code>n</code>) and when it is over (<code>done</code>). A generator does the same with a paused function.</>);
    return rec.frames;
  }
  if (p === 'gen') {
    const rs = countdownResults('gen');
    rec.snap(<>The same countdown as a <code>function*</code>. Calling it returns a generator object; each <code>next()</code> resumes the body until the next <code>yield</code>.</>);
    rec.snap(<><code>countdown(3)</code> runs <b>none</b> of the body. It makes a frame object, parked before line 1, off the stack.</>, undefined, { callerLine: 0, parked: 'countdown(3) · not started · n = 3' });
    rs.forEach((r, i) => {
      const resumeAt = i === 0 ? 1 : 3;
      rec.snap(
        <>{i === 0 ? <>The first <code>next()</code> starts the body: the generator&apos;s frame goes on the stack for the first time and runs to the first <code>yield</code>.</> : <><code>next()</code> resumes right after the <code>yield</code>: the generator&apos;s frame goes back on the stack and runs.</>}</>,
        undefined,
        { callerLine: i + 1, defLine: resumeAt, stack: [{ id: 'gen', name: 'countdown(3)', state: 'running' }, mainWaiting], parked: null },
      );
      printed.push(showResult(r));
      if (r.done) {
        rec.snap(<><code>n</code> is 0, the loop ends and the body returns: <span className="hl ok">{showResult(r)}</span>. The frame is gone for good.</>, undefined, {
          defLine: 5, stack: [MAIN], parked: null, printed: [...printed],
        });
      } else {
        rec.snap(
          <><code>yield {r.value}</code> hands back <b>{showResult(r)}</b> and <b>suspends</b>: the frame leaves the stack and waits as an object, paused at line 3, with <code>n = {r.value}</code>.</>,
          undefined,
          { defLine: 2, stack: [MAIN], parked: `countdown(3) · paused at yield · n = ${r.value}`, printed: [...printed] },
        );
      }
    });
    rec.close(<>Same results as the hand-written one, but the &quot;where am I&quot; bookkeeping is the paused function itself: the same suspension an <code>await</code> uses.</>);
    return rec.frames;
  }
  if (p === 'forBreak') {
    const run = forBreakRun();
    rec.snap(<><code>for…of</code> speaks the protocol for you: it calls <code>[Symbol.iterator]()</code> once, then <code>next()</code> until <code>done</code>.</>, undefined, { callerLine: 0 });
    rec.snap(<><code>[Symbol.iterator]()</code> on a generator object returns the object itself. First <code>next()</code>: <b>3</b>, printed.</>, undefined, {
      callerLine: 2, defLine: 3, parked: 'countdown(3) · paused at yield · n = 3', printed: ['3'],
    });
    rec.snap(<>Next <code>next()</code>: <b>2</b>, and <code>x === 2</code> hits <code>break</code>.</>, undefined, { callerLine: 1, defLine: 3, parked: 'countdown(3) · paused at yield · n = 2' });
    rec.snap(
      <><code>break</code> makes <code>for…of</code> call the iterator&apos;s <code>return()</code>: the generator resumes at its paused <code>yield</code> as though a <code>return</code> were written there, so its <code>finally</code> runs and prints <b>cleanup</b>.</>,
      2,
      { callerLine: 1, defLine: 7, stack: [{ id: 'gen', name: 'countdown(3) · return()', state: 'running' }, mainWaiting], parked: null, printed: run.printed },
    );
    rec.set({ defLine: null, callerLine: null, stack: [MAIN] });
    rec.close(<>Printed <span className="hl ok">{run.printed.join(', ')}</span>. Leaving a loop early still lets the generator clean up (close a file, release a lock).</>);
    return rec.frames;
  }
  const run = naturalsRun(3);
  rec.snap(<><code>naturals()</code> never ends: <code>while (true)</code>. That is fine for a generator, because it only runs when asked.</>);
  for (let i = 1; i <= run.pulled; i++) {
    rec.snap(<><code>take</code> asks; <code>naturals</code> resumes, yields <b>{i}</b> and suspends again.</>, undefined, {
      callerLine: 0, defLine: 2, parked: `naturals() · paused at yield · n = ${i + 1}`, printed: [],
    });
  }
  rec.snap(
    <><code>--k</code> reaches 0, so <code>take</code> returns. Leaving its <code>for…of</code> calls <code>naturals</code>&apos;s <code>return()</code>, which closes it: it will never run again.</>,
    undefined,
    { callerLine: 0, defLine: 8, parked: null, stack: [{ id: 'take', name: 'take(…, 3)', state: 'running' }, mainWaiting] },
  );
  rec.set({ parked: null, printed: [showArray(run.result)], callerLine: 1, defLine: null, stack: [MAIN] });
  rec.close(
    <>
      After {run.pulled} values <code>take</code> is done: <span className="hl ok">{showArray(run.result)}</span>. An endless sequence, and it finished. (Spreading it without <code>take</code> never
      gets a <code>done: true</code>, so it never returns normally: try the button.)
    </>,
  );
  return rec.frames;
}

// ── Scene 3 · single pass ──────────────────────────────────────────

export interface PassFrame extends Frame {
  pass: 0 | 1 | 2;
  first: unknown[] | null;
  second: unknown[] | null;
}

export function passFrames(id: SourceId): PassFrame[] {
  const [first, second] = twoPasses(id);
  const name = SOURCES.find((s) => s.value === id)!.label;
  const rec = createRecorder<PassFrame>({ pass: 0, first: null, second: null });
  rec.snap(<>Spread the same <b>{name}</b> twice.</>);
  rec.snap(<>First pass: <span className="hl ok">{showArray(first)}</span>.</>, undefined, { pass: 1, first });
  rec.set({ pass: 2, second });
  rec.close(
    reusable(id) ? (
      <>
        Second pass: <span className="hl ok">{showArray(second)}</span> again. {id === 'array' ? 'An array' : 'This class'} is an iterable: each <code>[Symbol.iterator]()</code> call makes a fresh
        iterator.
      </>
    ) : (
      <>
        Second pass: <span className="hl bad">{showArray(second)}</span>. A {id === 'file' ? 'line reader (a stand-in for reading a file)' : 'generator object'} is an iterator: its{' '}
        <code>[Symbol.iterator]()</code> returns itself, already at the end. Single pass, like a real file or network stream.
      </>
    ),
    2,
  );
  return rec.frames;
}
