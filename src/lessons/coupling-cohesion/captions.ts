import { plural } from '../../core/format';
import {
  EDGES, blastRadius, changeSet, coupling, couplingDelta, modulesTouched, type Assignment, type ChangeRequest, type FnId, type Slot,
} from './model';

/** Captions as plain text, computed from the current layout so they can't outlive it. */

const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A preset's name while the layout is still that preset; "Custom layout" once a function has moved. */
export const layoutName = (presetLabel: string, presetAssign: Assignment, current: Assignment) => (current === presetAssign ? presetLabel : 'Custom layout');

export function layoutCaption(label: string, a: Assignment): string {
  const c = coupling(a);
  if (c === 0) {
    return `${label}: no edge crosses a module boundary, so coupling is 0. Now pick a change request and look at the blast radius.`;
  }
  return `${label}: ${c} of ${EDGES.length} call edges cross a module boundary. Pick a change request to see how far a change spreads.`;
}

export function requestCaption(req: ChangeRequest, a: Assignment, modules: readonly string[]): string {
  const set = changeSet(req);
  const callers = set.slice(1);
  const touched = modulesTouched(a, req);
  const edits = callers.length ? `edits ${req.seed} and its ${plural(callers.length, 'caller')} ${list(callers)}` : `edits ${req.seed}`;
  const where = touched.length === 1 ? `1 module (${modules[touched[0]]})` : `${touched.length} modules (${list(touched.map((m) => modules[m]))})`;
  return `"${req.label}" ${edits}: it lands in ${where}, with a blast radius of ${blastRadius(a, req)} (the functions in those modules: this lesson's rough proxy for code to re-read and retest).`;
}

export function moveCaption(fn: FnId, before: Assignment, to: Slot, modules: readonly string[], req: ChangeRequest | null): string {
  const d = couplingDelta(before, fn, to);
  const after = { ...before, [fn]: to };
  const change = d === 0 ? 'unchanged' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
  const base = `Moved ${fn} to ${modules[to]}: coupling ${coupling(before)} → ${coupling(after)} (${change}).`;
  if (!req) return base;
  return `${base} "${req.label}" now lands in ${plural(modulesTouched(after, req).length, 'module')}.`;
}
