/** Scene 3's rows and caption, pure so tests can read them. */
import type { Tone } from '../../core/tone';
import { FAULT_TEXT, DEFAULT_PLAN, type BackupSet, type Fault, type Outcome, type Plan } from './plan';
import { minutesText } from './view';
import { outcomeText } from './planView';

/** Scene 3 opens on a plan nobody has tested: snapshots and a log archive, the key kept apart. */
export const DRILL_PLAN: Plan = { ...DEFAULT_PLAN, tests: 'never', keyWith: false };

/** The sets as the learner sees them: faults stay hidden until a drill restores the set, and disappear once fixed. */
export const drillSets = (sets: readonly BackupSet[], tested: boolean, fixed: boolean): BackupSet[] =>
  sets.map((s) => ({ ...s, tested, fault: fixed ? null : s.fault }));

export interface DrillRow {
  label: string;
  cell: { text: string; tone: Tone; fill: 'tint' | 'outline' };
  rail: { tone: Tone; label: string } | null;
}

/** Untested sets are dim and unverified, a restored set is green with a tick, a faulty one red with its fault. */
export function drillRows(sets: readonly BackupSet[]): DrillRow[] {
  return sets.map((s) => {
    if (!s.tested) return { label: s.label, cell: { text: '?', tone: 'dim', fill: 'outline' }, rail: { tone: 'dim', label: 'untested' } };
    if (s.fault) return { label: s.label, cell: { text: '!', tone: 'bad', fill: 'tint' }, rail: { tone: 'bad', label: FAULT_TEXT[s.fault] } };
    return { label: s.label, cell: { text: '✓', tone: 'ok', fill: 'tint' }, rail: { tone: 'ok', label: 'restored' } };
  });
}

export function drillCaption(a: { tested: boolean; fixed: boolean; struck: boolean; found: Fault[]; outcome: Outcome; sound: Outcome }): string {
  if (a.struck) {
    const fine = a.outcome.restored && a.outcome.reached >= a.sound.reached;
    return `${outcomeText(a.outcome)} ${fine ? (a.tested ? 'The drill came first, so the disaster found nothing new.' : 'This seed had no fault to find.') : `A sound plan would have lost ${minutesText(a.sound.lostMin)}: the fault was found at the disaster.`}`;
  }
  if (!a.tested) return 'Every backup set is unverified: nobody has restored any of them, so nobody knows whether they work. A backup you have not restored is a rumour.';
  if (a.found.length === 0) return 'The restore test passed on every set: this seed has no fault.';
  return a.fixed ? 'The fault found in the drill is fixed.' : `The drill found a fault: ${FAULT_TEXT[a.found[0]]}. It cost a drill, not a disaster.`;
}
