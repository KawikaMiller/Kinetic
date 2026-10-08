import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  ILLUSTRATIVE_COPY_KB, boxCode, byStrategy, compiledCopies, distinctArgs, spellTemplate, spellType, strategySentence, varianceLines, verdict, view,
  type BoxVersion, type Lang, type Op, type TypeArg, type ViewId,
} from './model';

// ── Scene 1 · Why generics ─────────────────────────────────────────

export interface BoxFrame extends Frame {
  /** Lines that have run (or been checked), and the line being looked at. */
  now: number | number[] | null;
  /** The value in the box: what is really stored, and what the code claims it is. */
  stored: string | null;
  claimed: string | null;
  showDuplicates: boolean;
  failed: boolean;
  printed: string[];
}

export function boxFrames(version: BoxVersion, bound: boolean): BoxFrame[] {
  const code = boxCode(version, bound);
  const rec = createRecorder<BoxFrame>({ now: null, stored: null, claimed: null, showDuplicates: false, failed: false, printed: [] });
  const lineNo = (i: number) => i + 1;
  switch (version) {
    case 'untyped':
      rec.snap(<>A Box that holds <code>any</code>: it accepts anything and promises nothing.</>);
      rec.snap(<>Line {lineNo(4)}: a number, 42, goes in. Nothing checks it, because the box takes <code>any</code>.</>, undefined, { now: 4, stored: '42', claimed: 'any' });
      rec.snap(<>Line {lineNo(5)}: <code>as string</code> tells the checker to trust us. It changes nothing at run time: the box still holds the number 42.</>, undefined, { now: 5, claimed: 'string' });
      rec.snap(
        <>Line {lineNo(6)} runs and <span className="hl bad">throws</span>: <code>{code.message}</code>. The mistake was made on line {lineNo(4)} and only found here, at run time.</>,
        2,
        { now: 6, failed: true },
      );
      break;
    case 'perType':
      rec.snap(<>To get checking without generics, write one box class per type: NumberBox, StringBox…</>);
      rec.snap(
        <>The highlighted lines repeat NumberBox line for line with only the type changed. Every new type (a BooleanBox, a UserBox) copies them again, and a bug fix has to be made in every copy.</>,
        2,
        { showDuplicates: true },
      );
      rec.snap(<>It is checked, so line {lineNo(8)} runs safely and prints <span className="hl ok">{code.output[0]}</span>. Safe, but at the price of the copies.</>, undefined, { now: 8, stored: "'ada'", claimed: 'string', printed: code.output });
      break;
    case 'generic':
      rec.snap(<>One definition with a type parameter <code>T</code>. Each use says what T is: <code>Box&lt;string&gt;</code> is a box of strings.</>);
      rec.snap(
        <>
          The checker reads the code before anything runs and <span className="hl orange">rejects line {lineNo(5)}</span>: <code>{code.message}</code> It is the same mistake the untyped box
          only found at run time.
        </>,
        2,
        { now: 5, stored: '42', claimed: 'string', failed: true },
      );
      rec.snap(
        <>Take away the rejected line {lineNo(5)} and line {lineNo(4)} runs and prints <span className="hl ok">{code.output[0]}</span>: one definition, checked for every T, no copies to keep in step.</>,
        undefined,
        { now: 4, stored: "'ada'", claimed: 'string', failed: false, printed: code.output },
      );
      break;
    case 'bounded':
      if (!bound) {
        rec.snap(<>A generic <code>max</code> in Java. Without a bound, T could be any type at all, so the compiler only lets you use what every type has.</>);
        rec.snap(
          <>
            <span className="hl orange">javac rejects line 2</span>: <code>cannot find symbol: method compareTo(T)</code>. Nothing says a T can be compared. Turn the bound on.
          </>,
          2,
          { now: 1, failed: true },
        );
      } else {
        rec.snap(<>With <code>T extends Comparable&lt;T&gt;</code>, every T the caller picks must have <code>compareTo</code>, so the body may call it.</>, undefined, { now: [0] });
        rec.snap(
          <>
            <code>max(3, 7)</code> gives <span className="hl ok">{code.output[0]}</span> and <code>max("pear", "apple")</code> gives <span className="hl ok">{code.output[1]}</span>. Passing a type
            without compareTo would now be the caller&apos;s compile error.
          </>,
          undefined,
          { now: [3, 4], printed: code.output },
        );
      }
      break;
  }
  return rec.frames;
}

// ── Scene 2 · Erasure vs monomorphisation ───────────────────────────

export interface StampFrame extends Frame {
  /** How many uses have been compiled so far. */
  done: number;
  /** The use being compiled now. */
  current: number | null;
  /** Type arguments with their own compiled copy so far (monomorphised only). */
  stamped: TypeArg[];
  copies: number;
  sizeKb: number;
}

export function stampFrames(l: Lang, uses: readonly TypeArg[]): StampFrame[] {
  const rec = createRecorder<StampFrame>({ done: 0, current: null, stamped: [], copies: 0, sizeKb: 0 });
  rec.snap(
    <>
      One generic definition, <span className="hl violet">{spellTemplate(l)}</span>, used {uses.length} time{uses.length === 1 ? '' : 's'} with {distinctArgs(uses).length} different type
      argument{distinctArgs(uses).length === 1 ? '' : 's'}. {strategySentence(l)}
    </>,
  );
  uses.forEach((arg, i) => {
    const seen = uses.slice(0, i).includes(arg);
    const so = uses.slice(0, i + 1);
    const copies = compiledCopies(l.strategy, so);
    const patch = { done: i + 1, current: i, stamped: l.strategy === 'monomorphised' ? distinctArgs(so) : [], copies, sizeKb: copies * ILLUSTRATIVE_COPY_KB };
    const t = <code>{spellType(l, arg)}</code>;
    let say;
    if (l.strategy === 'monomorphised') {
      say = seen ? (
        <>{t} again: its copy already exists, so it is reused. Still {copies} cop{copies === 1 ? 'y' : 'ies'}.</>
      ) : (
        <>{t}: the compiler <span className="hl info">stamps out a new copy</span> with T replaced by {l.args[arg]}. That is {copies} cop{copies === 1 ? 'y' : 'ies'} now, and the binary grows.</>
      );
    } else if (i === 0) {
      say =
        l.strategy === 'reified' ? (
          <>{t}: the definition is compiled once. The runtime keeps the argument, so {t} is its own type at run time.</>
        ) : (
          <>{t}: the compiler checks this use, then erases the argument. {l.id === 'ts' ? 'The emitted JavaScript has no types at all.' : 'One compiled class, no T inside it.'}</>
        );
    } else {
      say =
        l.strategy === 'reified' ? (
          <>{t}: no new code in the compiled program; the runtime still tells it apart from the other uses.</>
        ) : (
          <>{t}: checked, then erased to the same single class. Still 1 copy.</>
        );
    }
    rec.snap(say, undefined, patch);
  });
  const copies = compiledCopies(l.strategy, uses);
  rec.set({ current: null });
  rec.close(
    <>
      {uses.length} use{uses.length === 1 ? '' : 's'}, <b>{copies}</b> compiled cop{copies === 1 ? 'y' : 'ies'}.{' '}
      {l.strategy === 'monomorphised'
        ? 'Each copy is specialised for its type (fast, no boxing), at the cost of a bigger binary and a longer compile.'
        : l.strategy === 'reified'
          ? 'One definition in the compiled program, with the type arguments kept at run time so the program can ask about them (the JIT may still generate separate native code per value type).'
          : l.id === 'ts' ? 'One piece of plain JavaScript: small output, but the type arguments are gone at run time.' : 'One shared class: small output, but the type arguments are gone at run time.'}{' '}
      Erased: {byStrategy('erasure').join(', ')}. Reified: {byStrategy('reified').join(', ')}. Monomorphised: {byStrategy('monomorphised').join(', ')}.
    </>,
    2,
  );
  return rec.frames;
}

// ── Scene 3 · Variance ─────────────────────────────────────────────

export interface VarianceFrame extends Frame {
  /** 0: the declaration line, 1: the operation line. */
  line: 0 | 1;
  /** The verdict is on screen. */
  judged: boolean;
}

export function varianceFrames(viewId: ViewId, op: Op): VarianceFrame[] {
  const v = view(viewId);
  const ver = verdict(viewId, op);
  const lines = varianceLines(viewId, op);
  const rec = createRecorder<VarianceFrame>({ line: 0, judged: false });
  rec.snap(<>A list that really holds cats, and a second reference to it declared as <code>{v.label.replace(/ \(.*\)$/, '')}</code> in {v.lang}.</>);
  if (ver.at === 'declare') {
    rec.set({ judged: true });
    rec.close(
      <>
        <span className="hl orange">Rejected at compile time</span>, at the declaration itself: <code>{ver.message}</code>. {v.lang} generics are invariant: a List of Cat is not a List
        of Animal, because a List of Animal would let you add a Dog.
      </>,
      2,
    );
    return rec.frames;
  }
  rec.snap(<>The declaration compiles: <code>{lines[0]}</code>. Both references point at the same list.</>);
  rec.set({ line: 1, judged: true });
  const sayOp = {
    ok: <><span className="hl ok">Safe</span>: <code>{lines[1]}</code> works, because {ver.message}.</>,
    compile: <><span className="hl orange">Rejected at compile time</span>: <code>{ver.message}</code>. The compiler refuses before anything runs, because {ver.reason}.</>,
    runtime: <><span className="hl bad">Compiles, then throws at run time</span>: <code>{ver.message}</code>. Java arrays are covariant, so the compiler allowed it and the JVM checks each array store at run time instead.</>,
    unsound: (
      <>
        <span className="hl bad">Compiles and runs with no error</span>: TypeScript treats arrays as covariant and checks method parameters like <code>push</code>&apos;s bivariantly (even
        under <code>strictFunctionTypes</code>), so {ver.message}.
      </>
    ),
  }[ver.kind];
  rec.close(sayOp, 2);
  return rec.frames;
}
