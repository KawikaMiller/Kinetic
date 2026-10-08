/**
 * behavioral-patterns: the pure model. The strategy code on screen is run as real JavaScript in
 * the tests; the observer, undo/redo and state machine are plain reducers checked against
 * independent reference implementations over seeded or exhaustive inputs.
 */

// ── Strategy ───────────────────────────────────────────────────────

export type CarrierId = 'standard' | 'express' | 'freeOver50' | 'overnight';
export const CARRIERS: { id: CarrierId; label: string; expr: string; usesTotal: boolean; price: (total: number) => number }[] = [
  { id: 'standard', label: 'standard', expr: '5', usesTotal: false, price: () => 5 },
  { id: 'express', label: 'express', expr: '15', usesTotal: false, price: () => 15 },
  { id: 'freeOver50', label: 'free over 50', expr: 'total > 50 ? 0 : 5', usesTotal: true, price: (t) => (t > 50 ? 0 : 5) },
  { id: 'overnight', label: 'overnight', expr: '25', usesTotal: false, price: () => 25 },
];
/** A carrier as a small arrow function: the strategy. */
const strategyOf = (c: (typeof CARRIERS)[number]) => (c.usesTotal ? `(total) => (${c.expr})` : `() => ${c.expr}`);
export const NEW_CARRIER: CarrierId = 'overnight';
export const ORDER_TOTALS = [20, 49, 50, 51, 120];

/** Carriers on sale: the first three, plus overnight once it is added. */
export const carriersFor = (added: boolean) => CARRIERS.filter((c) => added || c.id !== NEW_CARRIER);
export const carrier = (id: CarrierId) => CARRIERS.find((c) => c.id === id)!;

export type StrategyMode = 'switch' | 'strategies';

/** The shipping code: a function that grows a branch per carrier, or a table of small strategies. */
export function shippingCode(mode: StrategyMode, added: boolean): string[] {
  const cs = carriersFor(added);
  if (mode === 'switch') {
    return [
      'function shipping(carrier, total) {',
      '  switch (carrier) {',
      ...cs.flatMap((c) => [`    case '${c.id}':`, `      return ${c.expr};`]),
      "    default: throw new Error('unknown carrier');",
      '  }',
      '}',
    ];
  }
  return [
    'const strategies = {',
    ...cs.map((c) => `  ${c.id}: ${strategyOf(c)},`),
    '};',
    'const shipping = (carrier, total) => strategies[carrier](total);',
  ];
}

/** Lines that exist only after the change: what a reviewer has to write or edit. */
export function addedLines(mode: StrategyMode): string[] {
  const before = shippingCode(mode, false);
  return shippingCode(mode, true).filter((l) => !before.includes(l));
}

/** Does adding the carrier edit the existing `shipping` function's body? (Switch: yes. Table: no.) */
export function editsShippingBody(mode: StrategyMode): boolean {
  const body = (m: StrategyMode, added: boolean) => {
    const code = shippingCode(m, added);
    if (m === 'strategies') return code.filter((l) => l.startsWith('const shipping'));
    return code.filter((l) => l !== 'function shipping(carrier, total) {' && !l.startsWith('//'));
  };
  return body(mode, false).join('\n') !== body(mode, true).join('\n');
}

// ── Observer ───────────────────────────────────────────────────────

export type SubId = 'chart' | 'alert' | 'log';
export const SUBS: { id: SubId; label: string; does: string }[] = [
  { id: 'chart', label: 'chart', does: 'redraws the line' },
  { id: 'alert', label: 'alert', does: 'checks the threshold' },
  { id: 'log', label: 'log', does: 'writes a line' },
];
export const PRICES = [101, 99, 104, 98, 107, 103];

export interface SubState {
  /** The subject holds a reference to it. */
  attached: boolean;
  /** The component is still on screen. */
  mounted: boolean;
  /** Notifications it has been sent. */
  received: number;
  /** Notifications delivered after it was unmounted (each keeps a price alive). */
  deadDeliveries: number;
}
export interface ObserverState {
  subs: Record<SubId, SubState>;
  /** Attached subscribers in the order they subscribed: a Set notifies in insertion order, so this is the notify order. */
  order: SubId[];
  tick: number;
  /** Who the last publish was delivered to (in subscription order), and who was dead. */
  last: { price: number; to: SubId[]; dead: SubId[] } | null;
}
const fresh = (attached: boolean): SubState => ({ attached, mounted: true, received: 0, deadDeliveries: 0 });
export const initialObserver = (): ObserverState => ({ subs: { chart: fresh(true), alert: fresh(false), log: fresh(false) }, order: ['chart'], tick: 0, last: null });

export type ObserverAction = { type: 'attach' | 'detach' | 'unmount'; id: SubId } | { type: 'publish' } | { type: 'reset' };

export const isDead = (s: SubState) => s.attached && !s.mounted;
/** Attached subscribers, in subscription order. */
export const attachedIds = (st: ObserverState) => [...st.order];

export function canAct(st: ObserverState, a: ObserverAction): boolean {
  if (a.type === 'attach') return !st.subs[a.id].attached && st.subs[a.id].mounted;
  if (a.type === 'detach') return st.subs[a.id].attached;
  if (a.type === 'unmount') return st.subs[a.id].mounted;
  return true;
}

export function observerStep(st: ObserverState, a: ObserverAction): ObserverState {
  if (a.type === 'reset') return initialObserver();
  if (!canAct(st, a)) return st;
  const subs = { chart: { ...st.subs.chart }, alert: { ...st.subs.alert }, log: { ...st.subs.log } };
  let order = st.order;
  if (a.type === 'attach') {
    subs[a.id].attached = true;
    order = [...order, a.id];
  }
  if (a.type === 'detach') {
    subs[a.id].attached = false;
    order = order.filter((x) => x !== a.id);
  }
  if (a.type === 'unmount') subs[a.id].mounted = false;
  if (a.type !== 'publish') return { ...st, subs, order };
  const to = [...order];
  const dead: SubId[] = [];
  for (const id of to) {
    subs[id].received++;
    if (!subs[id].mounted) {
      subs[id].deadDeliveries++;
      dead.push(id);
    }
  }
  return { subs, order, tick: st.tick + 1, last: { price: PRICES[st.tick % PRICES.length], to, dead } };
}

/** Objects the program can no longer use but still holds: each dead subscriber plus every price it has been handed since. */
export const retainedObjects = (st: ObserverState) => SUBS.reduce((n, x) => (isDead(st.subs[x.id]) ? n + 1 + st.subs[x.id].deadDeliveries : n), 0);

export const OBSERVER_CODE = [
  'class PriceFeed {',
  '  #subscribers = new Set();',
  '  subscribe(fn) { this.#subscribers.add(fn); return () => this.#subscribers.delete(fn); }',
  '  publish(price) { for (const fn of this.#subscribers) fn(price); }',
  '}',
];

// ── Command ────────────────────────────────────────────────────────

export const SLOTS = 6;
export interface Shape {
  id: string;
  x: number;
}
export type Command =
  | { kind: 'draw'; id: string; x: number }
  | { kind: 'move'; id: string; from: number; to: number }
  | { kind: 'delete'; id: string; x: number };

export interface Editor {
  doc: Shape[];
  undo: Command[];
  redo: Command[];
  /** Every command ever executed (not undo/redo): what could be logged or sent to a server. */
  log: Command[];
  /** Draw commands executed so far: names the next shape A, B, C… */
  drawn: number;
}
export const initialEditor = (): Editor => ({ doc: [], undo: [], redo: [], log: [], drawn: 0 });

export const describe = (c: Command) => (c.kind === 'draw' ? `draw ${c.id} at ${c.x}` : c.kind === 'move' ? `move ${c.id} ${c.from}→${c.to}` : `delete ${c.id} at ${c.x}`);

const byX = (doc: Shape[]) => [...doc].sort((a, b) => a.x - b.x);
export const occupied = (doc: Shape[], x: number) => doc.some((s) => s.x === x);

export function applyCommand(doc: Shape[], c: Command): Shape[] {
  if (c.kind === 'draw') return byX([...doc, { id: c.id, x: c.x }]);
  if (c.kind === 'move') return byX(doc.map((s) => (s.id === c.id ? { ...s, x: c.to } : s)));
  return doc.filter((s) => s.id !== c.id);
}
export function revertCommand(doc: Shape[], c: Command): Shape[] {
  if (c.kind === 'draw') return doc.filter((s) => s.id !== c.id);
  if (c.kind === 'move') return byX(doc.map((s) => (s.id === c.id ? { ...s, x: c.from } : s)));
  return byX([...doc, { id: c.id, x: c.x }]);
}

export type EditorAction = { type: 'draw' } | { type: 'move'; id: string } | { type: 'delete'; id: string } | { type: 'undo' } | { type: 'redo' };

/** The command an action would create, or null when it is not possible right now. */
export function commandFor(e: Editor, a: EditorAction): Command | null {
  if (a.type === 'draw') {
    const x = Array.from({ length: SLOTS }, (_, i) => i).find((i) => !occupied(e.doc, i));
    return x === undefined || e.drawn >= 26 ? null : { kind: 'draw', id: String.fromCharCode(65 + e.drawn), x };
  }
  if (a.type === 'move' || a.type === 'delete') {
    const s = e.doc.find((d) => d.id === a.id);
    if (!s) return null;
    if (a.type === 'delete') return { kind: 'delete', id: s.id, x: s.x };
    return s.x + 1 < SLOTS && !occupied(e.doc, s.x + 1) ? { kind: 'move', id: s.id, from: s.x, to: s.x + 1 } : null;
  }
  return null;
}

export const canEdit = (e: Editor, a: EditorAction) => (a.type === 'undo' ? e.undo.length > 0 : a.type === 'redo' ? e.redo.length > 0 : commandFor(e, a) !== null);

export function editorStep(e: Editor, a: EditorAction): Editor {
  if (!canEdit(e, a)) return e;
  if (a.type === 'undo') {
    const c = e.undo[e.undo.length - 1];
    return { ...e, doc: revertCommand(e.doc, c), undo: e.undo.slice(0, -1), redo: [...e.redo, c] };
  }
  if (a.type === 'redo') {
    const c = e.redo[e.redo.length - 1];
    return { ...e, doc: applyCommand(e.doc, c), redo: e.redo.slice(0, -1), undo: [...e.undo, c] };
  }
  const c = commandFor(e, a)!;
  // A new action clears the redo stack: the undone future no longer exists.
  return { doc: applyCommand(e.doc, c), undo: [...e.undo, c], redo: [], log: [...e.log, c], drawn: e.drawn + (c.kind === 'draw' ? 1 : 0) };
}

export const EDITOR_CODE = [
  'class Editor {',
  '  undoStack = []; redoStack = [];',
  '  run(command) { command.do(); this.undoStack.push(command); this.redoStack = []; }',
  '  undo() { const c = this.undoStack.pop(); c.undo(); this.redoStack.push(c); }',
  '  redo() { const c = this.redoStack.pop(); c.do(); this.undoStack.push(c); }',
  '}',
];

// ── State ──────────────────────────────────────────────────────────

export type PState = 'stopped' | 'playing' | 'paused' | 'buffering';
export type PEvent = 'play' | 'pause' | 'stop' | 'drop' | 'recover';
export const P_STATES: PState[] = ['stopped', 'playing', 'paused', 'buffering'];
export const P_EVENTS: { id: PEvent; label: string }[] = [
  { id: 'play', label: 'play' },
  { id: 'pause', label: 'pause' },
  { id: 'stop', label: 'stop' },
  { id: 'drop', label: 'network drop' },
  { id: 'recover', label: 'network back' },
];

/** The valid transitions; every other (state, event) pair is invalid. */
export const TRANSITIONS: Record<PState, Partial<Record<PEvent, PState>>> = {
  stopped: { play: 'playing' },
  playing: { pause: 'paused', stop: 'stopped', drop: 'buffering' },
  paused: { play: 'playing', stop: 'stopped' },
  buffering: { recover: 'playing', stop: 'stopped' },
};

/** Why each invalid press does nothing. */
export const REASONS: Record<PState, Partial<Record<PEvent, string>>> = {
  stopped: { pause: 'nothing is playing to pause', stop: 'it is already stopped', drop: 'no stream is open for the network to drop', recover: 'nothing was buffering' },
  playing: { play: 'it is already playing', recover: 'it is not buffering' },
  paused: { pause: 'it is already paused', drop: 'in this model a paused player is not fetching, so a drop changes nothing', recover: 'it is not buffering' },
  buffering: { play: 'there is nothing to play until the network is back', pause: 'this model does not allow pausing while buffering', drop: 'it is already buffering' },
};

/** How the diagram draws a state: the lesson's `watch` text says "box" and a test keeps the two in step. */
export const STATE_NODE_SHAPE = 'box' as const;

export const nextState = (s: PState, e: PEvent): PState | null => TRANSITIONS[s][e] ?? null;
export const isValid = (s: PState, e: PEvent) => nextState(s, e) !== null;

export const STATE_LABEL: Record<PState, string> = { stopped: 'Stopped', playing: 'Playing', paused: 'Paused', buffering: 'Buffering' };

/** The flags version: one boolean per state, so nothing stops two being set at once. */
export const FLAGS: Record<PState, string> = { stopped: 'isStopped', playing: 'isPlaying', paused: 'isPaused', buffering: 'isBuffering' };
export interface FlagRow {
  flags: Record<PState, boolean>;
  /** The state this row means, or null when it is nonsense (none set, or several). */
  means: PState | null;
}
export const flagRows = (): FlagRow[] =>
  Array.from({ length: 16 }, (_, m) => {
    const flags = { stopped: !!(m & 8), playing: !!(m & 4), paused: !!(m & 2), buffering: !!(m & 1) };
    const set = P_STATES.filter((s) => flags[s]);
    return { flags, means: set.length === 1 ? set[0] : null };
  });

export const STATE_CODE = [
  'const TRANSITIONS = {',
  "  stopped:   { play: 'playing' },",
  "  playing:   { pause: 'paused', stop: 'stopped', drop: 'buffering' },",
  "  paused:    { play: 'playing', stop: 'stopped' },",
  "  buffering: { recover: 'playing', stop: 'stopped' },",
  '};',
  'const press = (state, event) => TRANSITIONS[state][event] ?? state;',
];
export const FLAGS_CODE = [
  'function onPause() {',
  '  if (isPlaying && !isPaused && !isBuffering && !isStopped) {',
  '    isPlaying = false; isPaused = true;',
  '  }',
  '}',
  '// …and the same careful check in every other handler',
];
