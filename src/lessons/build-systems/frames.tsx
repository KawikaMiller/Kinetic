import type { ReactNode } from 'react';
import { plural, joinList } from '../../core/format';
import type { Frame } from '../../core/types';
import { topoOrder, verdictOf, type BuildRun, type Verdict } from './model';

export type NodeState = 'idle' | 'edited' | 'queued' | 'building' | 'fetching' | 'rebuilt' | 'hit' | 'uptodate' | 'stale' | 'poisoned';

export interface BuildFrame extends Frame {
  t: number;
  /** The last frame: verdicts (stale, poisoned) are shown. */
  final: boolean;
}


const secs = (s: number) => `${Math.round(s * 10) / 10} s`;

/** When a target's fate is known: its own action's end, or (early cutoff) when its last input settled. */
export function settleTimes(run: BuildRun): Map<string, number> {
  const end = new Map(run.slots.map((s) => [s.id, s.end]));
  const at = new Map<string, number>();
  for (const id of topoOrder(run.graph)) {
    if (!run.result.results[id]) continue;
    at.set(id, end.get(id) ?? Math.max(0, ...run.graph.declared[id].map((d) => at.get(d) ?? 0)));
  }
  return at;
}

export const verdicts = (run: BuildRun): Record<string, Verdict> =>
  Object.fromEntries(Object.entries(run.result.results).map(([id, r]) => [id, verdictOf(r, run.truth[id])]));

/** The colour state of every node at time t of the build. */
export function nodeStates(run: BuildRun, t: number, final: boolean): Record<string, NodeState> {
  const out: Record<string, NodeState> = {};
  const slot = new Map(run.slots.map((s) => [s.id, s]));
  const settle = settleTimes(run);
  const v = verdicts(run);
  for (const n of run.graph.nodes) {
    if (n.kind === 'src') {
      // A clean build has no previous build to compare with, so every source counts as changed: none was edited by the learner.
      out[n.id] = !run.clean && run.result.changed.includes(n.id) ? 'edited' : 'idle';
      continue;
    }
    const r = run.result.results[n.id];
    const s = slot.get(n.id);
    let state: NodeState;
    const runs = r.status === 'rebuilt';
    if (s) state = t < s.start ? 'queued' : t < s.end ? (runs ? 'building' : 'fetching') : runs ? 'rebuilt' : 'hit';
    else if (r.status === 'cutoff') state = t < settle.get(n.id)! ? 'queued' : 'hit';
    else state = 'uptodate';
    const verdict = v[n.id];
    if (final && verdict !== 'ok') state = verdict;
    out[n.id] = state;
  }
  return out;
}

function startCaption(run: BuildRun): ReactNode {
  const { changed, results } = run.result;
  const candidates = Object.keys(results).filter((id) => results[id].candidate);
  const work = run.slots.length;
  if (run.clean) {
    const fetched = run.slots.filter((s) => results[s.id].status !== 'rebuilt').length;
    const runs = work - fetched;
    return <>Clean build on {plural(run.workers, 'worker')}: no previous outputs. {plural(work, 'action')} in topological order: {runs ? `${runs} to run` : 'none to run'}{fetched ? `, ${fetched} to fetch from a cache` : ''}.</>;
  }
  if (!changed.length) {
    return run.mode === 'hash'
      ? <>No source&apos;s <b>content hash</b> changed (a touch only moves the timestamp), so every key matches. Nothing to do.</>
      : <>Nothing is newer than the targets built from it, so make has nothing to do.</>;
  }
  const what = run.mode === 'hash'
    ? <>{joinList(changed)}: content hash changed. </>
    : <>{joinList(changed)}: timestamp is newer than {changed.length === 1 ? 'its targets' : 'their targets'}. </>;
  return <>{what}<span className="hl info">{plural(candidates.length, 'target')}</span> can reach {changed.length === 1 ? 'it' : 'them'} in reverse: {joinList(candidates)}.
    {run.mode === 'hash' ? ' Each one rebuilds only if its key comes out different.' : ' make rebuilds each one whose input is newer.'}</>;
}

function eventCaption(run: BuildRun, t: number): ReactNode {
  const { results } = run.result;
  const settle = settleTimes(run);
  const done = run.slots.filter((s) => s.end === t);
  const started = run.slots.filter((s) => s.start === t);
  const cut = Object.keys(results).filter((id) => results[id].status === 'cutoff' && settle.get(id) === t);
  const parts: ReactNode[] = done.map((s) => {
    const r = results[s.id];
    if (r.status === 'hit-remote') return <>{s.id} fetched from the remote cache.</>;
    if (r.status === 'hit-local') return <>{s.id} came out of the local cache.</>;
    const same = run.before[s.id]?.out === r.out;
    return same ? <>{s.id} rebuilt, and its output hash is <b>unchanged</b>.</> : <>{s.id} rebuilt with a new output hash.</>;
  });
  if (cut.length) parts.push(<><span className="hl ok">{joinList(cut)}</span>: inputs unchanged, same key, so nothing had to run (early cutoff).</>);
  const building = started.filter((s) => results[s.id].status === 'rebuilt');
  const fetching = started.filter((s) => results[s.id].status !== 'rebuilt');
  if (building.length) parts.push(<>Now building {joinList(building.map((s) => s.id))}.</>);
  if (fetching.length) parts.push(<>Now fetching {joinList(fetching.map((s) => s.id))} from {fetching.some((s) => results[s.id].status === 'hit-remote') ? 'the remote' : 'the local'} cache.</>);
  return <>t = {secs(t)}: {parts.map((p, i) => <span key={i}>{i ? ' ' : ''}{p}</span>)}</>;
}

function finalCaption(run: BuildRun): ReactNode {
  const { results } = run.result;
  const total = Object.keys(results).length;
  const rebuilt = Object.keys(results).filter((id) => results[id].status === 'rebuilt').length;
  const took = Math.max(0, ...run.slots.map((s) => s.end));
  const saved = run.cleanSeconds - took;
  const v = verdicts(run);
  const stale = Object.keys(v).filter((id) => v[id] === 'stale');
  const poisoned = Object.keys(v).filter((id) => v[id] === 'poisoned');
  const head = <>Done in {secs(took)} on {plural(run.workers, 'worker')}: rebuilt {rebuilt} of {total} targets. A clean build takes {secs(run.cleanSeconds)}
    {saved > 0 ? `, so this saved ${secs(saved)}` : ''}. Critical path: {secs(run.critical)}.</>;
  const skipped = stale.filter((id) => results[id].status === 'uptodate' && run.graph.actual[id].some((d) => !run.graph.declared[id].includes(d)));
  const staleNote = stale.length ? (
    <> <span className="hl bad">Stale: {joinList(stale)}</span>.{skipped.length
      ? ` ${joinList(skipped)} reads ${joinList(skipped.flatMap((id) => run.graph.actual[id].filter((d) => !run.graph.declared[id].includes(d))))} without declaring it, so the edit never reached it.`
      : ''}</>
  ) : null;
  // A poisoned target either has a key that leaves out an input (a root), or inherits wrong bytes through its inputs.
  const roots = poisoned.filter((id) => !run.graph.declared[id].some((d) => v[d] === 'poisoned'));
  const inherited = poisoned.filter((id) => !roots.includes(id));
  const poisonNote = poisoned.length ? (
    <> <span className="hl orange">Poisoned: {joinList(poisoned)}</span> came out of a cache with the wrong bytes. Only {joinList(roots)}&apos;s key leaves out an input that
      differs between machines{inherited.length ? `; ${joinList(inherited)} inherit${inherited.length === 1 ? 's' : ''} it through ${inherited.length === 1 ? 'its' : 'their'} inputs` : ''}.</>
  ) : null;
  const verdict = !stale.length && !poisoned.length ? <> Every output matches a from-scratch build.</> : null;
  return <>{head}{staleNote}{poisonNote}{verdict}</>;
}

/** One frame per moment something starts or finishes, then a summary frame. */
export function buildFrames(run: BuildRun): BuildFrame[] {
  const settle = settleTimes(run);
  const cutoffAt = [...settle].filter(([id]) => run.result.results[id].status === 'cutoff').map(([, t]) => t);
  const times = [...new Set([0, ...run.slots.flatMap((s) => [s.start, s.end]), ...cutoffAt])].sort((a, b) => a - b);
  const frames: BuildFrame[] = times.map((t) => ({ t, final: false, say: t === 0 ? startCaption(run) : eventCaption(run, t) }));
  const last = times[times.length - 1];
  frames.push({ t: last, final: true, say: finalCaption(run), hold: 2 });
  return frames;
}
