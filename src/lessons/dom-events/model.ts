// The sandbox DOM and the rules of event dispatch, as pure data.
// The Stage animates what real listeners actually recorded; this model is the DOM spec's
// prediction, used by the tests and to check the recording against.

export type NodeId = 'card' | 'section' | 'button' | 'span' | 'check';

/** DOM event phases, as `event.eventPhase` reports them. */
export const CAPTURING = 1;
export const AT_TARGET = 2;
export const BUBBLING = 3;
export type Phase = typeof CAPTURING | typeof AT_TARGET | typeof BUBBLING;

export const PARENT: Record<NodeId, NodeId | null> = {
  card: null,
  section: 'card',
  button: 'section',
  span: 'button',
  check: 'section',
};

export const CHILDREN: Record<NodeId, NodeId[]> = {
  card: ['section'],
  section: ['button', 'check'],
  button: ['span'],
  span: [],
  check: [],
};

export const TAG: Record<NodeId, string> = {
  card: 'div.card',
  section: 'section',
  button: 'button',
  span: 'span',
  check: 'input',
};

export type ListenerMode = 'off' | 'capture' | 'bubble';

export interface ListenerSpec {
  mode: ListenerMode;
  stop: boolean;
  prevent: boolean;
}

export type Listeners = Record<NodeId, ListenerSpec>;

export const DEFAULT_LISTENERS: Listeners = {
  card: { mode: 'capture', stop: false, prevent: false },
  section: { mode: 'bubble', stop: false, prevent: false },
  button: { mode: 'bubble', stop: false, prevent: false },
  span: { mode: 'bubble', stop: false, prevent: false },
  check: { mode: 'bubble', stop: false, prevent: false },
};

/** Root-first path from the card down to `target`. */
export function pathTo(target: NodeId): NodeId[] {
  const path: NodeId[] = [];
  for (let n: NodeId | null = target; n; n = PARENT[n]) path.unshift(n);
  return path;
}

export interface Fired {
  node: NodeId;
  phase: Phase;
}

/** Every stop an event makes on its way from the root down to the target and back up. */
export function trip(path: NodeId[]): Fired[] {
  const target = path[path.length - 1];
  const ancestors = path.slice(0, -1);
  return [
    ...ancestors.map((node) => ({ node, phase: CAPTURING as Phase })),
    { node: target, phase: AT_TARGET as Phase },
    ...ancestors.reverse().map((node) => ({ node, phase: BUBBLING as Phase })),
  ];
}

export interface Prediction {
  fired: Fired[];
  /** The node whose listener called stopPropagation, if any. */
  stoppedAt: NodeId | null;
  defaultPrevented: boolean;
}

/**
 * What the DOM spec says happens when `target` is clicked, with one listener per node.
 * Capture listeners run root → parent of target; every listener on the target runs in the
 * target phase (capture flag or not); bubble listeners run parent of target → root.
 * stopPropagation lets the current listener finish, then nothing further runs.
 */
export function predict(target: NodeId, listeners: Listeners): Prediction {
  const steps = trip(pathTo(target));

  const fired: Fired[] = [];
  let stoppedAt: NodeId | null = null;
  let defaultPrevented = false;
  for (const step of steps) {
    const l = listeners[step.node];
    const listens =
      l.mode !== 'off' &&
      (step.phase === AT_TARGET || (step.phase === CAPTURING ? l.mode === 'capture' : l.mode === 'bubble'));
    if (!listens) continue;
    fired.push(step);
    if (l.prevent) defaultPrevented = true;
    if (l.stop) {
      stoppedAt = step.node;
      break;
    }
  }
  return { fired, stoppedAt, defaultPrevented };
}

export interface TourStep extends Fired {
  /** A listener here ran during this step. */
  fired: boolean;
  /** Propagation was stopped before this step, so the event never got here. */
  cut: boolean;
}

/**
 * Every stop on the event's trip, down then up, annotated with what actually fired
 * (from a recording of real listeners) and where a stopPropagation cut the trip.
 */
export function tour(path: NodeId[], recorded: Fired[], stoppedAt: NodeId | null): TourStep[] {
  const stops = trip(path);

  const ran = new Set(recorded.map((r) => `${r.node}:${r.phase}`));
  const stopIndex =
    stoppedAt === null ? -1 : stops.findIndex((s) => s.node === stoppedAt && ran.has(`${s.node}:${s.phase}`));
  return stops.map((s, i) => ({
    ...s,
    fired: ran.has(`${s.node}:${s.phase}`),
    cut: stopIndex >= 0 && i > stopIndex,
  }));
}

export const PHASE_NAME: Record<Phase, string> = {
  [CAPTURING]: 'capture',
  [AT_TARGET]: 'target',
  [BUBBLING]: 'bubble',
};
