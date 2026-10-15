import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { reconcile, sameSpec } from './reconcile';
import { SCRIPT_END, verdict, type Handler, type ScriptFrame } from './script';
import { failingShare, secondsToRun, describeAction, type World } from './world';

export type Mode = 'loop' | 'drift' | 'trap';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The resources whose live spec differs from git (or is missing), by key. */
export const driftedKeys = (w: World): string[] => Object.keys(w.desired).filter((k) => !sameSpec(w.desired[k], w.live[k]));

/** Scenes 1 to 3: whether live matches git, what the controller will do next and when, all read from the world. */
export function liveCaption(mode: Mode, w: World): ReactNode {
  const plan = reconcile(w.desired, w.live, { prune: w.prune });
  const diffs = plan.actions.length;
  const status = diffs === 0 ? <>Live matches git.</> : <>{plural(diffs, 'change')} between git and live{!w.paused && w.autoSync ? <>: the controller will {describeAction(plan.actions[0])} in {secondsToRun(w)} s.</> : w.paused ? <>, and sync is paused, so nothing will change them.</> : <>, and auto-sync is off, so the controller only reports it.</>}</>;
  const load = mode === 'trap' ? <> The web deployment has {w.live.web?.replicas ?? 0} replicas live and git wants {w.desired.web?.replicas ?? 0}.</> : null;
  return (
    <>
      Second {w.t}. {status}
      {load}
    </>
  );
}

/** Scene 3: how the users are doing, from the live replicas and the traffic. */
export function trapCaption(w: World, spike: boolean): ReactNode {
  const failing = failingShare(w.live, spike);
  return (
    <>
      {liveCaption('trap', w)} {spike ? 'Traffic is at the spike' : 'Traffic is normal'}: <b>{pct(failing)} of requests fail</b>
      {w.paused && w.unnoticedSeconds > 0 ? <>, and sync has been paused for {w.unnoticedSeconds} s with the cluster drifted from git</> : null}.
    </>
  );
}

/** Scene 4: what the handler did at this second and whether it has ended right. */
export function scriptCaption(f: ScriptFrame, handler: Handler): ReactNode {
  const v = verdict(f.desired, f.live);
  const end = f.t === SCRIPT_END;
  const wrong = v.wrong.length ? `, and ${v.wrong.join(' and ')} ${v.wrong.length === 1 ? 'is' : 'are'} wrong` : '';
  const orphans = v.orphans.length ? `, ${v.orphans.join(' and ')} left as an orphan` : '';
  return (
    <>
      Second {f.t}: {f.notes.length ? f.notes.join('; ') : 'nothing happens'}. {end ? (v.matches && !v.orphans.length ? <>The {handler}-triggered controller ends with live equal to git.</> : <>The {handler}-triggered controller ends{wrong}{orphans}.</>) : <>Live {v.matches ? 'matches' : 'differs from'} git{wrong}.</>}
    </>
  );
}
