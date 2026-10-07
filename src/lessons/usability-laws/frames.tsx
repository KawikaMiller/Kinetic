import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { FITTS_TRIALS, HICK_TRIALS, type Fit, type Trial } from './model';

export const ms = (v: number) => `${Math.round(v).toLocaleString('en-US')} ms`;
/** A signed coefficient with a real minus: "+ 150" or "− 20". */
const signed = (v: number) => (v < 0 ? `− ${Math.round(-v)}` : `+ ${Math.round(v)}`);
export const r2Text = (r2: number | null) => (r2 === null ? 'R² undefined' : `R² = ${r2.toFixed(2)}`);

/** The intercept with a real minus sign. */
const lead = (v: number) => (Math.round(v) < 0 ? `−${Math.round(-v)}` : `${Math.round(v)}`);
export const fitFormula = (f: Extract<Fit, { ok: true }>, x: string) => `${lead(f.a)} ${signed(f.b)} · ${x} ms`;

/** Where Hick's law applies, worded once for the caption, the stage and the summary. */
export const HICK_SCOPE = "equally likely options you don't have to search for; scanning an unfamiliar list grows roughly linearly, and practice flattens the slope";

const nonPointer = (trials: readonly Trial[]) => trials.some((t) => t.input === 'keyboard' || t.input === 'touch' || t.input === 'pen');

const misses = (n: number, noun = 'mis-click') => (n ? <> {plural(n, noun)} {n === 1 ? 'was' : 'were'} counted and left out of the fit.</> : null);

/** What the Fitts game says, computed from the trials recorded so far. */
export function fittsCaption(trials: readonly Trial[], fit: Fit): ReactNode {
  if (!trials.length) {
    return <>Press Start, click the blue dot, then the yellow target as fast as you can while still hitting it. {FITTS_TRIALS} trials; the grey points are a synthetic
      participant until you have your own.</>;
  }
  const done = <>{trials.length} of {FITTS_TRIALS} trials done.</>;
  if (!fit.ok) return <>{done} {fit.n} valid so far: <span className="hl">{fit.reason}</span> before your own line can be fitted.{misses(fit.misses)}</>;
  const slope = fit.b <= 0 ? <> The slope isn&apos;t positive yet: too few or too noisy trials to read much into.</> : null;
  const input = nonPointer(trials)
    ? <> Some trials came from a keyboard, touch or pen: Fitts&apos;s law models pointing with a mouse-like device, so those times measure something else.</>
    : null;
  return <>{done} Your fit: MT ≈ <span className="hl ok">{fitFormula(fit, 'ID')}</span> ({r2Text(fit.r2)}, {fit.n} trials).{misses(fit.misses)}{slope}{input} Rough: your own
    clicks, timed by the browser to within a few ms.</>;
}

export function hickCaption(trials: readonly Trial[], fit: Fit, alphabetical: boolean): ReactNode {
  const order = alphabetical
    ? <> The menu is alphabetical, so you can search it instead of reading every item.</>
    : <> The menu is shuffled each round, so you have to search it by eye: that grows closer to linearly with n, and a poor fit to log₂(n + 1) here is real, not a bug.</>;
  if (!trials.length) {
    return <>Press Next round, then click the named item. Hick&apos;s law models choice time as a + b·log₂(n + 1) for {HICK_SCOPE}.{order}</>;
  }
  const done = <>{trials.length} of {HICK_TRIALS} rounds done.</>;
  if (!fit.ok) return <>{done} {fit.n} valid so far: <span className="hl">{fit.reason}</span> before your own line can be fitted.{misses(fit.misses, 'wrong pick')}{order}</>;
  return <>{done} Your fit: time ≈ <span className="hl ok">{fitFormula(fit, 'log₂(n + 1)')}</span> ({r2Text(fit.r2)}).{misses(fit.misses, 'wrong pick')} These times include
    reading the prompt and moving the pointer, so they are rough.{order}</>;
}
