/**
 * Scene 4's script, pure: the same events either way, so that the only difference is how the controller reacts. Three things happen to
 * the system: someone deletes the service by hand, someone scales the api by hand, and a commit removes the worker from git. The
 * controller may be down while the first two happen. An edge-triggered handler reacts to each event it sees; a level-triggered one
 * compares the whole state every second.
 */
import { DESIRED_START, apply, reconcile, type Spec, type State } from './reconcile';

export type Handler = 'edge' | 'level';

export const SCRIPT_END = 16;
/** The controller is down from this second (inclusive) to this one (exclusive), when it restarts. */
export const DOWN_FROM = 2;
export const DOWN_UNTIL = 8;

export type ScriptEvent =
  | { t: number; kind: 'cluster-delete'; key: string; text: string }
  | { t: number; kind: 'cluster-scale'; key: string; replicas: number; text: string }
  | { t: number; kind: 'git-remove'; key: string; text: string };

export const EVENTS: readonly ScriptEvent[] = [
  { t: 3, kind: 'cluster-delete', key: 'web-svc', text: 'someone deletes web-svc by hand' },
  { t: 5, kind: 'cluster-scale', key: 'api', replicas: 7, text: 'someone scales api to 7 by hand' },
  { t: 10, kind: 'git-remove', key: 'worker', text: 'a commit removes worker from git' },
];

export interface ScriptFrame {
  t: number;
  desired: State;
  live: State;
  down: boolean;
  /** What happened at this second: the events, and what the controller did. */
  notes: string[];
}

export interface ScriptOptions {
  handler: Handler;
  /** Does the controller restart and miss the events while it is down? */
  restart: boolean;
  prune: boolean;
}

const isDown = (t: number, restart: boolean) => restart && t >= DOWN_FROM && t < DOWN_UNTIL;

export function runScript({ handler, restart, prune }: ScriptOptions): ScriptFrame[] {
  let desired: State = DESIRED_START;
  let live: State = DESIRED_START;
  const frames: ScriptFrame[] = [];
  for (let t = 0; t <= SCRIPT_END; t++) {
    const notes: string[] = [];
    const happening = EVENTS.filter((e) => e.t === t);
    for (const e of happening) {
      notes.push(e.text);
      if (e.kind === 'cluster-delete') {
        const next = { ...live };
        delete next[e.key];
        live = next;
      } else if (e.kind === 'cluster-scale') live = { ...live, [e.key]: { ...live[e.key], replicas: e.replicas } };
      else {
        const next = { ...desired };
        delete next[e.key];
        desired = next;
      }
    }
    const down = isDown(t, restart);
    if (down) notes.push('controller is down: it sees nothing');
    else if (handler === 'level') {
      const action = reconcile(desired, live, { prune }).actions[0];
      if (action) {
        live = apply(live, action);
        notes.push(`level-triggered: compares everything, ${action.type} ${action.key}`);
      }
    } else {
      for (const e of happening) {
        if (e.kind === 'git-remove') {
          if (prune) {
            const next = { ...live };
            delete next[e.key];
            live = next;
            notes.push(`edge-triggered: reacts to "${e.text}", deletes ${e.key}`);
          } else notes.push(`edge-triggered: reacts to "${e.text}", leaves ${e.key} as an orphan (pruning is off)`);
        } else {
          live = { ...live, [e.key]: desired[e.key] };
          notes.push(`edge-triggered: reacts to "${e.text}", restores ${e.key} from git`);
        }
      }
    }
    frames.push({ t, desired, live, down, notes });
  }
  return frames;
}

export interface Verdict {
  /** Does live equal desired on every desired key? */
  matches: boolean;
  /** Keys that differ or are missing. */
  wrong: string[];
  /** Live keys that git does not have. */
  orphans: string[];
}

const canon = (s: Spec | undefined) => (s ? [s.kind, s.image, s.replicas, s.port].join('|') : 'missing');

/** Judged key by key, by a set walk of both states. */
export function verdict(desired: State, live: State): Verdict {
  const wrong = Object.keys(desired).filter((k) => canon(live[k]) !== canon(desired[k]));
  return { matches: wrong.length === 0, wrong, orphans: Object.keys(live).filter((k) => !(k in desired)) };
}
