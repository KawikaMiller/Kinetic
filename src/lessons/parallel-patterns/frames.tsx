import type { ReactNode } from 'react';
import { plural, sig } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  OPS, blellochCost, brentRange, doubled, hillisCost, mapSteps, nextPow2, sameValue, scan, sequentialScan, showValue,
  type Cost, type OpId, type ReduceVerdict, type ScanKind, type ScanMode, type ScanTrace, type Value,
} from './patterns';

const list = (vals: readonly Value[]) => vals.map((v) => showValue(v, 12)).join(', ');
const range = (a: number, b: number) => (a === b ? `${a}` : `${a} to ${b}`);

// ── map ──────────────────────────────────────────────────────────────────

export interface MapFrame extends Frame {
  /** Steps run so far. */
  step: number;
}

export function mapFrames(values: readonly number[], p: number): MapFrame[] {
  const n = values.length;
  const steps = mapSteps(n, p);
  const frames: MapFrame[] = [
    {
      step: 0,
      say: (
        <>
          Map applies one function (doubling) to each of {plural(n, 'element')}. No element needs another, so {plural(p, 'processor')} do it in <span className="hl">{plural(steps, 'step')}</span>, {p} elements at a time.
        </>
      ),
    },
  ];
  for (let k = 1; k <= steps; k++) {
    const from = (k - 1) * p;
    const to = Math.min(n, k * p) - 1;
    frames.push({ step: k, say: <>Step {k} of {steps}: elements {range(from, to)} are doubled together, {plural(to - from + 1, 'processor')} busy.</> });
  }
  frames.push({ step: steps, hold: 2, say: <>Done: {list(values.map(doubled))}. One processor would need {n} steps; {plural(p, 'processor')} need {steps}.</> });
  return frames;
}

// ── reduce ───────────────────────────────────────────────────────────────

export interface ReduceFrame extends Frame {
  /** Tree levels shown so far (0 is just the input). */
  level: number;
}

export function reduceVerdictSentence(v: ReduceVerdict, op: OpId): ReactNode {
  const tree = showValue(v.tree.result, 14);
  const fold = showValue(v.fold.result, 14);
  if (v.agree) return <><span className="hl ok">The tree agrees with the fold: {fold}.</span>{op === 'subtract' ? ' Agreeing on this input does not make subtract associative: try more values.' : ''}</>;
  if (v.reason === 'regrouping') {
    return (
      <>
        <span className="hl bad wrap">Regrouping changes the answer</span>: the tree gives {tree}, the fold {fold}. The same order, grouped differently, already differs, so {OPS[op].label} is not associative on these values.
      </>
    );
  }
  return (
    <>
      <span className="hl bad wrap">Reordering changes the answer</span>: the tree gives {tree}, the fold {fold}. The tree in the original order would agree; the swapped arrival order is what differs, so {OPS[op].label} is not commutative.
    </>
  );
}

export function reduceFrames(vals: readonly Value[], v: ReduceVerdict, op: OpId, arrival: boolean): ReduceFrame[] {
  const n = vals.length;
  const sym = OPS[op].symbol;
  const levels = v.tree.levels;
  const frames: ReduceFrame[] = [
    {
      level: 0,
      say: (
        <>
          {plural(n, 'value')} combined with {OPS[op].label}. The fold takes {plural(v.fold.steps, 'step')} one after another; the tree pairs neighbours and halves the list each level: {plural(v.tree.steps, 'level')},{' '}
          {plural(v.tree.ops, 'operation')} in all{arrival ? ', each pair combined in arrival order (the second of the two first)' : ''}.
        </>
      ),
    },
  ];
  for (let k = 1; k < levels.length; k++) {
    const pairs = Math.floor(levels[k - 1].length / 2);
    frames.push({
      level: k,
      say: <>Level {k}: {plural(pairs, 'pair')} combined with {sym} at the same time, leaving {plural(levels[k].length, 'value')}: {list(levels[k])}.</>,
    });
  }
  frames.push({ level: levels.length - 1, hold: 2.5, say: reduceVerdictSentence(v, op) });
  return frames;
}

// ── scan ─────────────────────────────────────────────────────────────────

export interface ScanFrame extends Frame {
  /** Rows of the trace shown so far (1 is just the input). */
  row: number;
}

export function costOf(kind: ScanKind, n: number): Cost {
  return kind === 'hillis-steele' ? hillisCost(n) : blellochCost(n);
}

export const kindName = (kind: ScanKind): string => (kind === 'hillis-steele' ? 'Hillis-Steele' : 'Blelloch');

export function estimateText(c: Cost, p: number): string {
  const r = brentRange(c, p);
  return `${sig(r.low)} to ${sig(r.high)} steps on ${plural(p, 'processor')}`;
}

function rowSay(trace: ScanTrace, k: number): ReactNode {
  const r = trace.rows[k];
  const wrote = r.writes.length;
  const title = r.label[0].toUpperCase() + r.label.slice(1);
  if (r.label.startsWith('stride')) return <>{title}: combining in parallel across {plural(wrote, 'cell')}, each with the cell {r.label.slice(7)} places to its left.</>;
  if (r.label.startsWith('up-sweep')) return <>{title}: {plural(wrote, 'pair')} combined into partial totals, working up the tree.</>;
  if (r.label.startsWith('clear')) return <>The total is set aside and the last cell is cleared to the identity, ready for the sweep back down.</>;
  return <>{title}: prefixes move down across {plural(wrote / 2, 'pair')}; each left cell takes the prefix and each right cell the prefix followed by the left total.</>;
}

export function scanFrames(vals: readonly Value[], trace: ScanTrace, op: OpId, mode: ScanMode): ScanFrame[] {
  const n = vals.length;
  const cost = costOf(trace.kind, n);
  const loop = sequentialScan(vals, OPS[op], mode);
  const same = trace.result.every((v, i) => sameValue(v, loop[i]));
  const frames: ScanFrame[] = [
    {
      row: 1,
      say: (
        <>
          An {mode} scan of {plural(n, 'value')} with {OPS[op].label}, by {kindName(trace.kind)}
          {trace.padding > 0 ? `, padded to ${nextPow2(n)} cells with ${trace.padding} copies of the identity` : ''}. The loop needs {plural(n - 1, 'step')}; this takes {plural(cost.span, 'step')} and {plural(cost.work, 'operation')}.
        </>
      ),
    },
  ];
  for (let k = 1; k < trace.rows.length; k++) frames.push({ row: k + 1, say: rowSay(trace, k) });
  frames.push({
    row: trace.rows.length,
    hold: 2.5,
    say: same ? (
      <>
        <span className="hl ok">Matches the loop</span>: {list(trace.result)}. Work {cost.work} against {Math.max(0, n - 1)} for the loop, span {cost.span} against {Math.max(0, n - 1)}.
      </>
    ) : (
      <>
        <span className="hl bad">Does not match the loop</span>: the scan gives {list(trace.result)} and the loop {list(loop)}, because {OPS[op].label} is not associative and the scan regroups.
      </>
    ),
  });
  return frames;
}

/** The scan trace for a scene, from the same function the tests check. */
export const traceOf = (kind: ScanKind, vals: readonly Value[], op: OpId, mode: ScanMode): ScanTrace => scan(kind, vals, OPS[op], mode);
