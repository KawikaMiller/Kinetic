/**
 * The ownership scene's toy borrow checker. A straight-line program of up to ten lines from a fixed palette, one
 * value `x`, an optional second owner `y`, and four borrow names. Rules (a toy subset of Rust's, labelled so on
 * screen): one owner at a time; many shared borrows or one mutable borrow, never both while either is still used;
 * a borrow is live from its creation to its last use; x cannot be moved, dropped or written while a borrow of it is live.
 *
 * Two independently structured checkers decide every program and the tests compare them: `checkSequential` walks
 * the lines keeping a set of live borrows, `checkByIntervals` builds every borrow's live interval first and tests
 * each operation against the intervals.
 */
export type BorrowName = 'r' | 'r2' | 'm' | 'm2';

export const BORROWS: Record<BorrowName, { mutable: boolean }> = {
  r: { mutable: false },
  r2: { mutable: false },
  m: { mutable: true },
  m2: { mutable: true },
};

export type Line =
  | { op: 'new' }
  | { op: 'move' }
  | { op: 'borrow'; name: BorrowName }
  | { op: 'useBorrow'; name: BorrowName }
  | { op: 'use' }
  | { op: 'write' }
  | { op: 'drop' };

export const MAX_LINES = 10;

/** The palette in the order the tray shows it. */
export const PALETTE: readonly Line[] = [
  { op: 'new' },
  { op: 'move' },
  { op: 'borrow', name: 'r' },
  { op: 'borrow', name: 'r2' },
  { op: 'borrow', name: 'm' },
  { op: 'borrow', name: 'm2' },
  { op: 'useBorrow', name: 'r' },
  { op: 'useBorrow', name: 'r2' },
  { op: 'useBorrow', name: 'm' },
  { op: 'useBorrow', name: 'm2' },
  { op: 'use' },
  { op: 'write' },
  { op: 'drop' },
];

export function formatLine(l: Line): string {
  switch (l.op) {
    case 'new': return 'let x = new';
    case 'move': return 'let y = move x';
    case 'borrow': return `let ${l.name} = ${BORROWS[l.name].mutable ? '&mut ' : '&'}x`;
    case 'useBorrow': return `use ${l.name}`;
    case 'use': return 'use x';
    case 'write': return 'write x';
    case 'drop': return 'drop x';
  }
}

export type Rule = 'use-after-move' | 'two-mutable' | 'mutable-while-shared' | 'move-while-borrowed' | 'write-while-borrowed' | 'use-while-mutably-borrowed' | 'no-borrow';

/** Rule names as the lesson prints them, with the Rust code each is modelled on (quoted from memory). */
export const RULES: Record<Rule, { name: string; code: string | null }> = {
  'use-after-move': { name: 'x has no value here: it was moved, dropped or never created', code: 'E0382' },
  'two-mutable': { name: 'two mutable borrows are live at once', code: 'E0499' },
  'mutable-while-shared': { name: 'a mutable and a shared borrow are live at once', code: 'E0502' },
  'move-while-borrowed': { name: 'x is moved or dropped while a borrow of it is still used later', code: 'E0505' },
  'write-while-borrowed': { name: 'x is written while a borrow of it is still used later', code: 'E0506' },
  'use-while-mutably-borrowed': { name: 'x is used while a mutable borrow of it is still used later', code: 'E0503' },
  'no-borrow': { name: 'this borrow name has not been created yet', code: null },
};

export interface Problem {
  /** Zero-based line index. */
  line: number;
  rule: Rule;
}

export interface Verdict {
  problems: Problem[];
  accepted: boolean;
}

/** Live-range policy: the checker's own is `last-use`; the other two exist for the tests' broken variants. */
export type RangePolicy = 'last-use' | 'creation-only' | 'end-of-program';

/** For each `useBorrow` line, the borrow instance (creation line) it refers to, or null when the name was never created. */
function usesOf(program: readonly Line[]): { creation: (number | null)[] } {
  const latest = new Map<BorrowName, number>();
  const creation = program.map((l, i) => {
    if (l.op === 'borrow') {
      latest.set(l.name, i);
      return null;
    }
    return l.op === 'useBorrow' ? (latest.get(l.name) ?? null) : null;
  });
  return { creation };
}

/** The last line that uses each borrow instance (keyed by creation line), per the range policy. */
function lastUses(program: readonly Line[], policy: RangePolicy): Map<number, number> {
  const last = new Map<number, number>();
  program.forEach((l, i) => {
    if (l.op === 'borrow') last.set(i, policy === 'end-of-program' ? program.length : i);
  });
  if (policy === 'creation-only' || policy === 'end-of-program') return last;
  usesOf(program).creation.forEach((c, i) => {
    if (c !== null) last.set(c, i);
  });
  return last;
}

/** The rule a line at index i breaks given x's state and the borrows live around it, or null. Shared by both checkers' tables of rules, not of state. */
function ruleFor(line: Line, xValid: boolean, liveMutable: number, liveShared: number): Rule | null {
  switch (line.op) {
    case 'new':
    case 'useBorrow':
      return null;
    case 'borrow':
      if (!xValid) return 'use-after-move';
      if (BORROWS[line.name].mutable) return liveMutable > 0 ? 'two-mutable' : liveShared > 0 ? 'mutable-while-shared' : null;
      return liveMutable > 0 ? 'mutable-while-shared' : null;
    case 'move':
    case 'drop':
      if (!xValid) return 'use-after-move';
      return liveMutable + liveShared > 0 ? 'move-while-borrowed' : null;
    case 'write':
      if (!xValid) return 'use-after-move';
      return liveMutable + liveShared > 0 ? 'write-while-borrowed' : null;
    case 'use':
      if (!xValid) return 'use-after-move';
      return liveMutable > 0 ? 'use-while-mutably-borrowed' : null;
  }
}

/** Does this line leave x with a value afterwards? */
function xAfter(line: Line, xValid: boolean): boolean {
  if (line.op === 'new') return true;
  if (line.op === 'move' || line.op === 'drop') return false;
  return xValid;
}

/** Checker 1: a sequential state machine over the lines with a running set of live borrows. */
export function checkSequential(program: readonly Line[], policy: RangePolicy = 'last-use'): Verdict {
  const last = lastUses(program, policy);
  const { creation } = usesOf(program);
  const problems: Problem[] = [];
  const live = new Map<number, boolean>();
  let xValid = false;
  program.forEach((line, i) => {
    for (const [c, end] of last) if (live.has(c) && end <= i) live.delete(c);
    if (line.op === 'useBorrow' && creation[i] === null) problems.push({ line: i, rule: 'no-borrow' });
    const mutable = [...live.values()].filter(Boolean).length;
    const rule = ruleFor(line, xValid, mutable, live.size - mutable);
    if (rule) problems.push({ line: i, rule });
    if (line.op === 'borrow') live.set(i, BORROWS[line.name].mutable);
    xValid = xAfter(line, xValid);
    if (line.op === 'borrow' && (last.get(i) as number) <= i) live.delete(i);
  });
  return { problems, accepted: problems.length === 0 };
}

interface Interval {
  from: number;
  to: number;
  mutable: boolean;
}

/** Checker 2: build every borrow's interval first, then test each line against the intervals that strictly surround it. */
export function checkByIntervals(program: readonly Line[], policy: RangePolicy = 'last-use'): Verdict {
  const last = lastUses(program, policy);
  const { creation } = usesOf(program);
  const intervals: Interval[] = [...last].map(([from, to]) => ({ from, to, mutable: BORROWS[(program[from] as { name: BorrowName }).name].mutable }));
  const problems: Problem[] = [];
  program.forEach((line, i) => {
    if (line.op === 'useBorrow' && creation[i] === null) problems.push({ line: i, rule: 'no-borrow' });
    const around = intervals.filter((iv) => iv.from < i && i < iv.to);
    const xValid = xHasValueBefore(program, i);
    const rule = ruleFor(line, xValid, around.filter((iv) => iv.mutable).length, around.filter((iv) => !iv.mutable).length);
    if (rule) problems.push({ line: i, rule });
  });
  return { problems, accepted: problems.length === 0 };
}

/** Does x hold a value just before line i? The last line before i that creates, moves or drops x decides. */
function xHasValueBefore(program: readonly Line[], i: number): boolean {
  for (let k = i - 1; k >= 0; k--) {
    const op = program[k].op;
    if (op === 'new') return true;
    if (op === 'move' || op === 'drop') return false;
  }
  return false;
}

/** The Rust book's borrowing programs, with their published verdicts. */
export interface Preset {
  id: string;
  label: string;
  program: Line[];
  /** The verdict the book gives. */
  accepted: boolean;
}

const L = (op: Line['op'], name?: BorrowName): Line => (name ? ({ op, name } as Line) : ({ op } as Line));

export const PRESETS: Preset[] = [
  { id: 'two-mut', label: 'Two &mut', accepted: false, program: [L('new'), L('borrow', 'm'), L('borrow', 'm2'), L('useBorrow', 'm'), L('useBorrow', 'm2')] },
  { id: 'shared-then-mut', label: 'Shared, then &mut', accepted: false, program: [L('new'), L('borrow', 'r'), L('borrow', 'r2'), L('borrow', 'm'), L('useBorrow', 'r'), L('useBorrow', 'r2'), L('useBorrow', 'm')] },
  { id: 'nll', label: 'Shared ends before &mut', accepted: true, program: [L('new'), L('borrow', 'r'), L('borrow', 'r2'), L('useBorrow', 'r'), L('useBorrow', 'r2'), L('borrow', 'm'), L('useBorrow', 'm')] },
  { id: 'after-move', label: 'Use after move', accepted: false, program: [L('new'), L('move'), L('use')] },
];

/** Where x's memory goes back: the line of an explicit drop, or the end of the program when it is never dropped or moved. */
export function freedAt(program: readonly Line[]): { line: number | null; why: string } {
  const drop = program.findIndex((l) => l.op === 'drop');
  if (drop >= 0) {
    const later = program.slice(drop + 1).some((l) => l.op === 'new');
    return { line: drop, why: `at the drop on line ${drop + 1}${later ? ' (a later x goes back at the end of the program)' : ''}` };
  }
  if (program.some((l) => l.op === 'move')) return { line: null, why: 'when its new owner y goes out of scope, at the end of the program' };
  return { line: null, why: 'when x goes out of scope, at the end of the program' };
}

/** Per line: is a borrow live across it, and of which kind? For the listing's tint. Uses the sequential rule. */
export function liveKinds(program: readonly Line[]): ('shared' | 'mutable' | null)[] {
  const last = lastUses(program, 'last-use');
  return program.map((_, i) => {
    const around = [...last].filter(([from, to]) => from <= i && i <= to);
    if (around.some(([from]) => BORROWS[(program[from] as { name: BorrowName }).name].mutable)) return 'mutable';
    return around.length ? 'shared' : null;
  });
}

/** Lines that mention x after it was moved or dropped, for the dim tint. */
export function movedFrom(program: readonly Line[]): boolean[] {
  return program.map(
    (l, i) => (l.op === 'use' || l.op === 'write' || l.op === 'drop' || l.op === 'move') && !xHasValueBefore(program, i) && program.slice(0, i).some((p) => p.op === 'move' || p.op === 'drop'),
  );
}
