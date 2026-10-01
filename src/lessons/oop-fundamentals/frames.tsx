import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { areaOf, describeOf, instance, lineOf, ownProperties, resolve, squareAfterSetWidth, type ClassName, type InstanceId, type Method } from './model';

export interface DispatchFrame extends Frame {
  /** Line of CLASS_CODE being run, if any. */
  line: number | null;
  /** The object itself is being checked. */
  atInstance: boolean;
  /** The method being looked up (describe() looks up area() again partway through). */
  method: Method;
  searching: ClassName | null;
  found: ClassName | null;
  result: string | null;
  error: string | null;
}

const shortNumber = (n: number) => String(Number(n.toFixed(2)));

/** Animate `obj.method()`: look on the object, then walk up its class chain until an implementation turns up. */
export function dispatchFrames(id: InstanceId, method: Method): DispatchFrame[] {
  const r = createRecorder<DispatchFrame>(
    { line: null, method, atInstance: false, searching: null, found: null, result: null, error: null },
    { transient: { atInstance: false, searching: null } },
  );
  const cls = instance(id).cls;

  /** One walk up the chain; returns the class that has it, or null. */
  const walk = (name: Method, why: ReactNode): ClassName | null => {
    r.snap(why, undefined, { method: name, atInstance: true, found: null, line: null });
    const { path, found } = resolve(cls, name);
    for (const c of path) {
      if (c === found) break;
      r.snap(<><b>{c}</b> has no <code>{name}()</code> of its own, so follow its <span className="hl violet">[[Prototype]]</span> link up.</>, undefined, { searching: c });
    }
    if (found) {
      const override = found === cls;
      r.snap(
        override ? <>Found <code>{name}()</code> right on <b>{found}</b>: the subclass&apos;s own version (an <b>override</b>) wins.</> : <>Found <code>{name}()</code> on <b>{found}</b>: {cls} <b>inherits</b> it.</>,
        undefined,
        { found, line: lineOf(found, name) },
      );
    }
    return found;
  };

  r.snap(<>Calling <code>{id}.{method}()</code>. Which implementation runs?</>, undefined, {});
  const found = walk(method, <>JavaScript first looks on the object itself. It only holds data ({ownProperties(id).map(([n, v]) => `${n} = ${v}`).join(', ')}), no methods.</>);

  if (!found) {
    const error = `TypeError: ${id}.${method} is not a function`;
    r.snap(<>Reached the top of the chain without finding it: <span className="hl bad">{error}</span>.</>, 2, { error });
    return r.frames;
  }
  if (method === 'area') {
    const result = shortNumber(areaOf(id));
    r.snap(<>Returns <span className="hl ok">{result}</span>.</>, 2, { result });
    r.finish(<>Returns <span className="hl ok">{result}</span>. One call, and the object&apos;s class decided which code ran: that&apos;s <b>polymorphism</b>, with no if/else on the type.</>, 2);
  } else if (method === 'describe') {
    walk('area', <><code>describe()</code> calls <code>this.area()</code>. <code>this</code> is still {id}, so the search starts again from the object, <b>not</b> from Shape.</>);
    const result = describeOf(id);
    r.snap(<>Returns <span className="hl ok">&quot;{result}&quot;</span>.</>, 2, { result: `"${result}"` });
    r.finish(<>Returns <span className="hl ok">&quot;{result}&quot;</span>. Shape&apos;s code called <b>{cls}</b>&apos;s area(): the base class works with every subclass without knowing any of them.</>, 2);
  } else {
    r.snap(<><code>setWidth</code> changes <code>w</code> on the object.</>, 2, { result: 'undefined' });
  }
  return r.frames;
}

export const SQUARE_CODE = ['const sq = new Square(2);', 'sq.area();', 'sq.setWidth(5);', 'sq.area();'];

export interface SquareFrame extends Frame {
  line: number | null;
  w: number;
  h: number;
  area: number | null;
  broken: boolean;
}

/** A Square inherits Rect's setWidth, which only changes the width. */
export function squareFrames(): SquareFrame[] {
  const r = createRecorder<SquareFrame>({ line: null, w: 2, h: 2, area: null, broken: false });
  const side = 2;
  const width = 5;
  const after = squareAfterSetWidth(side, width);
  r.snap(<>&quot;A square is a rectangle&quot;, so <code>Square extends Rect</code>. Sounds right. Watch the shape.</>);
  r.snap(<>A 2 × 2 square.</>, undefined, { line: 0 });
  r.snap(<><code>area()</code> comes from Rect: <span className="hl ok">4</span>. Fine so far.</>, undefined, { line: 1, area: side * side });
  r.snap(
    <><code>setWidth(5)</code> is Rect&apos;s method: it only changes <code>w</code>. The &quot;square&quot; is now <span className="hl bad">5 × 2</span>.</>,
    undefined,
    { line: 2, w: after.w, h: after.h, area: null, broken: !after.isSquare },
  );
  r.snap(<><code>area()</code> returns <span className="hl bad">{after.area}</span>, not the 25 a 5-wide square should have.</>, 2, { line: 3, area: after.area });
  r.finish(
    <>Square inherits a method that breaks its own rule (sides equal). If code that works on any Rect breaks when handed a Square, the <b>is-a</b> relationship was a lie: prefer composition, or make shapes immutable.</>,
    2,
  );
  return r.frames;
}
