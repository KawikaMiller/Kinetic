import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { OTHER_CPU_WEIGHT, cpuShare, memoryOutcome, pidsOutcome, rootIsHostRoot, type NamespaceId, NAMESPACE_ORDER } from './isolation';
import { ACTION_LABEL, LIMIT_NOTE, RING_LABEL, RING_ORDER, RULES, decide, decisionText, type ActionId, type RingId } from './rings';
import { checkMinimal, grantedExtras, replay, TRACE, type DefaultAction } from './seccomp';
import { SURFACES, type SurfaceMode } from './surface';

export const ringList = (rings: readonly RingId[]): string => (rings.length === 0 ? 'no ring' : RING_ORDER.filter((r) => rings.includes(r)).map((r) => RING_LABEL[r]).join(', '));

/** The rings scene: what happens to the picked action with the rings that are on. */
export function ringsCaption(action: ActionId, rings: readonly RingId[]): ReactNode {
  const d = decide(action, new Set(rings));
  const head = (
    <>
      With {ringList(rings)} on, the plugin tries to {ACTION_LABEL[action]}: {decisionText(d)}.
    </>
  );
  if (d.kind === 'allowed') return <>{head} Nothing that is switched on stops it, so it succeeds against the host: the outcome a sandbox exists to prevent.</>;
  if (d.kind === 'limited') {
    const notes = RING_ORDER.filter((r) => rings.includes(r) && RULES[r][action] === 'limited' && LIMIT_NOTE[r][action]).map((r) => `${RING_LABEL[r]}: ${LIMIT_NOTE[r][action]}`);
    return <>{head} {notes.length > 0 ? `What each limit means: ${notes.join('; ')}.` : ''}</>;
  }
  return <>{head} The action stops at that ring and goes no further.</>;
}

/** The seccomp scene: how far the script got with the allow-list. */
export function seccompCaption(allowed: readonly string[], otherwise: DefaultAction): ReactNode {
  const set = new Set(allowed);
  const r = replay(set, otherwise);
  const c = checkMinimal(set);
  const extras = grantedExtras(set);
  const run =
    r.firstDenied === null ? (
      <>The whole script of {plural(TRACE.length, 'call')} ran.</>
    ) : (
      <>
        Call {r.firstDenied + 1} of {TRACE.length}, <code>{r.rows[r.firstDenied].name}</code>, is not on the list: the process is {otherwise === 'kill' ? 'killed' : 'handed an error it does not handle, and stops'} there.
      </>
    );
  return (
    <>
      {run}{' '}
      {c.minimal
        ? 'This list is the smallest that still runs the script.'
        : c.runs
          ? `It runs, but allows ${plural(c.extra.length, 'call')} the script never makes${extras.length ? `, which grant: ${extras.map((e) => `${e.name} ${e.grants}`).join('; ')}` : ''}.`
          : `It is missing ${c.missing.join(', ')}.`}
    </>
  );
}

/** The views scene: namespaces, the memory limit, the process limit and the CPU share. */
export function viewsCaption(namespaces: readonly NamespaceId[], memoryLimitMiB: number, allocateMiB: number, pidsLimit: number, forks: number, cpuWeight: number): ReactNode {
  const on = new Set(namespaces);
  const mem = memoryOutcome(memoryLimitMiB, allocateMiB);
  const pids = pidsOutcome(pidsLimit, forks);
  return (
    <>
      {plural(namespaces.length, 'namespace')} of {NAMESPACE_ORDER.length} on; root inside the sandbox {rootIsHostRoot(on) ? 'is uid 0 on the host too, the same user id as host root (no user namespace)' : 'is an unprivileged id on the host'}.{' '}
      {mem.killed ? <>Allocating {allocateMiB} MiB against a limit of {memoryLimitMiB} MiB kills the plugin at the first byte over, byte {mem.killedAtByte!.toLocaleString('en-US')}.</> : <>Allocating {allocateMiB} MiB stays within the {memoryLimitMiB} MiB limit.</>}{' '}
      {pids.failed > 0 ? <>{plural(forks, 'fork')} against a limit of {pidsLimit} processes: {pids.started} started, fork {pids.firstFailure} and after fail.</> : <>{plural(forks, 'fork')} fit under the limit of {pidsLimit} processes.</>}{' '}
      Under CPU contention a weight of {cpuWeight} against {OTHER_CPU_WEIGHT} gets {Math.round(cpuShare(cpuWeight, OTHER_CPU_WEIGHT) * 100)}%.
    </>
  );
}

/** The kernel scene. */
export function kernelCaption(mode: SurfaceMode): ReactNode {
  const s = SURFACES[mode];
  return (
    <>
      The plugin faces {s.label}: {s.exposed} {s.unit}. Under it: {s.under}.{' '}
      {mode === 'microvm' ? 'In this model a bug in the host kernel is reached only through the hypervisor, which is now the surface to trust.' : 'In this model a bug in that kernel is a bug under the plugin.'} The numbers are illustrative.
    </>
  );
}

