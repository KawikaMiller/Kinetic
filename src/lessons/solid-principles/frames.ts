import type { Frame } from '../../core/types';
import type { Tone } from '../../core/tone';
import { L_CODE, VARIANTS, type Design, type PrincipleId, type Variant } from './code';
import { changedLines, impact, stubCount, touchedCount, type Impact } from './model';
import { PRINCIPLES } from './principles';
import { runAll, type RunResult } from './run';

/** A frame's mark on a class: the change ripple, or the L run's verdict. */
export type UnitMark = 'hi' | 'bad' | 'orange' | 'ok';

export interface SpFrame extends Frame {
  say: string;
  variant: Variant;
  marks: Record<string, UnitMark>;
  /** Listing lines the change added or edited. */
  changed: ReadonlySet<number>;
  /** The L run's printed output so far. */
  console: { text: string; tone: Tone }[];
}

const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const NONE: ReadonlySet<number> = new Set();
const other = (d: Design): Design => (d === 'violating' ? 'fixed' : 'violating');
const designWord = (d: Design) => (d === 'violating' ? 'violating' : 'fixed');

export function impactOf(p: Exclude<PrincipleId, 'L'>, d: Design): Impact {
  const v = VARIANTS[p][d];
  return impact(v.before, v.after);
}

function extra(p: Exclude<PrincipleId, 'L'>, d: Design): string {
  const v = VARIANTS[p][d];
  if (p === 'I') {
    const before = stubCount(v.before, 'SimpleScanner');
    const after = stubCount(v.after, 'SimpleScanner');
    return after ? ` SimpleScanner now stubs ${after} methods (it had ${before}), none of which it can do.` : ' SimpleScanner stubs nothing: it only implements Scanning.';
  }
  if (p === 'S' && d === 'violating') return ' Report.total() rode along: unchanged, but it ships and is re-tested with the layout change.';
  if (p === 'O' && d === 'fixed') return ' The one existing edit is a line in exporterFor, the wiring; no exporter that already worked was opened.';
  if (p === 'D' && d === 'fixed') return ' ReportService never changed: it only knows ReportRepo.';
  return '';
}

function changeFrames(p: Exclude<PrincipleId, 'L'>, d: Design): SpFrame[] {
  const pr = PRINCIPLES[p];
  const { before, after } = VARIANTS[p][d];
  const im = impact(before, after);
  const start = im.added[0] ?? im.edited[0];
  const changed = changedLines(before, after);
  const base = { console: [] };
  const edits: Record<string, UnitMark> = Object.fromEntries([...im.edited.map((u) => [u, 'bad']), ...im.added.map((u) => [u, 'hi'])]);
  const retest: Record<string, UnitMark> = { ...edits, ...Object.fromEntries(im.retest.map((u) => [u, 'orange'])) };
  const done: Record<string, UnitMark> = { ...retest, ...Object.fromEntries(im.untouched.map((u) => [u, 'ok'])) };
  const n = touchedCount(im);
  const m = touchedCount(impactOf(p, other(d)));
  const parts = [im.edited.length && `edits ${list(im.edited)}`, im.added.length && `adds ${list(im.added)}`].filter(Boolean).join(' and ');
  return [
    { ...base, say: `"${pr.request}", against the ${designWord(d)} design: ${d === 'violating' ? pr.violating : pr.fixed}. Press play.`, variant: before, marks: {}, changed: NONE },
    { ...base, say: `The change starts in ${start}.`, variant: before, marks: { [start]: 'hi' }, changed: NONE },
    { ...base, say: `The change ${parts}: the highlighted lines.`, variant: after, marks: edits, changed },
    {
      ...base,
      say: im.retest.length
        ? `${list(im.retest)} ${im.retest.length === 1 ? 'depends' : 'depend'} on edited code, so ${im.retest.length === 1 ? 'it has' : 'they have'} to be re-tested.`
        : 'Nothing depends on the edited code, so nothing else needs re-testing.',
      variant: after,
      marks: retest,
      changed,
    },
    {
      ...base,
      say: `${n} touched (classes or functions edited, added or re-tested), ${im.untouched.length} left alone. The ${designWord(other(d))} design touches ${m}.${extra(p, d)}`,
      variant: after,
      marks: done,
      changed,
    },
  ];
}

const printed = (r: RunResult): { text: string; tone: Tone }[] => [
  { text: `> ${r.call.code}`, tone: 'muted' },
  ...(r.ok ? r.value.map((text) => ({ text, tone: 'ok' as Tone })) : [{ text: `Uncaught ${r.errorName}: ${r.message}`, tone: 'bad' as Tone }]),
];

/** Subclasses that broke the function written for their base type, in a full run. */
export const breaks = (d: Design) => runAll(d).filter((r) => !r.ok).length;

function substitutionFrames(d: Design): SpFrame[] {
  const results = runAll(d);
  const variant = L_CODE[d];
  const frames: SpFrame[] = [
    {
      say: `Each call hands a subclass to a function written for its base type, and really runs it. Press play.`,
      variant,
      marks: {},
      changed: NONE,
      console: [],
    },
  ];
  const marks: Record<string, UnitMark> = {};
  const out: { text: string; tone: Tone }[] = [];
  results.forEach((r) => {
    out.push(...printed(r));
    const now: Record<string, UnitMark> = { ...marks, [r.call.fn]: 'hi', [r.call.subclass]: r.ok ? 'ok' : 'bad' };
    marks[r.call.subclass] = r.ok ? (marks[r.call.subclass] === 'bad' ? 'bad' : 'ok') : 'bad';
    frames.push({
      say: r.ok
        ? `${r.call.fn}() was written for ${r.call.base}; handed a ${r.call.subclass}, it works.`
        : `${r.call.fn}() was written for ${r.call.base}; handed a ${r.call.subclass}, it throws a real ${r.errorName}. It compiled fine; the subclass broke the base type's promise.`,
      variant,
      marks: now,
      changed: NONE,
      console: [...out],
    });
  });
  const broke = results.filter((r) => !r.ok);
  frames.push({
    say: broke.length
      ? `${broke.length} of ${results.length} substitutions broke. Every caller of saveAll now needs to know which kind of File it has, which is what the principle forbids.`
      : `${results.length} of ${results.length} substitutions work. In TypeScript, saveAll(files: WritableFile[]) would also refuse a ReadOnlyFile at compile time; here JSDoc only documents it.`,
    variant,
    marks: { ...marks },
    changed: NONE,
    console: [...out],
  });
  return frames;
}

export function buildFrames(p: PrincipleId, d: Design): SpFrame[] {
  return p === 'L' ? substitutionFrames(d) : changeFrames(p, d);
}
