/**
 * Who re-renders when one piece of state changes, under four ways of sharing it. Pure data and rules:
 * the real React panel counts real renders and the tests compare them with these predictions.
 * The rules describe React; "re-render" is React's word for running a component function again.
 */
import { computed, effect, signal, type Computed, type Signal } from './signals';

export type CompId = 'app' | 'header' | 'badge' | 'theme' | 'list' | 'card0' | 'card1' | 'card2' | 'card3' | 'sidebar' | 'summary';

export interface Product {
  name: string;
  price: number;
}

export const PRODUCTS: readonly Product[] = [
  { name: 'Mug', price: 12 },
  { name: 'Pen', price: 3 },
  { name: 'Lamp', price: 40 },
  { name: 'Book', price: 15 },
];

export type Theme = 'dark' | 'light';
export interface State {
  /** Quantity of each product. A new array on every change, like state updated immutably. */
  cart: readonly number[];
  theme: Theme;
}
export type Action = { type: 'add'; product: number } | { type: 'theme' };

export const INITIAL: State = { cart: [0, 0, 0, 0], theme: 'dark' };

export function reduce(state: State, action: Action): State {
  if (action.type === 'theme') return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' };
  return { ...state, cart: state.cart.map((q, i) => (i === action.product ? q + 1 : q)) };
}

export const count = (cart: readonly number[]): number => cart.reduce((a, b) => a + b, 0);
export const total = (cart: readonly number[]): number => cart.reduce((sum, q, i) => sum + q * PRODUCTS[i].price, 0);

export const COMPONENTS: { id: CompId; label: string; parent: CompId | null }[] = [
  { id: 'app', label: 'App', parent: null },
  { id: 'header', label: 'Header', parent: 'app' },
  { id: 'badge', label: 'CartBadge', parent: 'header' },
  { id: 'theme', label: 'ThemeToggle', parent: 'header' },
  { id: 'list', label: 'ProductList', parent: 'app' },
  { id: 'card0', label: 'Card Mug', parent: 'list' },
  { id: 'card1', label: 'Card Pen', parent: 'list' },
  { id: 'card2', label: 'Card Lamp', parent: 'list' },
  { id: 'card3', label: 'Card Book', parent: 'list' },
  { id: 'sidebar', label: 'Sidebar', parent: 'app' },
  { id: 'summary', label: 'CartSummary', parent: 'sidebar' },
];
export const IDS: CompId[] = COMPONENTS.map((c) => c.id);
export const LABEL = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.label])) as Record<CompId, string>;
export const childrenOf = (id: CompId): CompId[] => COMPONENTS.filter((c) => c.parent === id).map((c) => c.id);

const cardIndex = (id: CompId): number => Number(id.slice(4));
const isCard = (id: CompId): boolean => id.startsWith('card');

/** What a component draws itself: its own text, nothing inherited from children. Containers draw none. */
export function shown(id: CompId, s: State): unknown[] {
  if (id === 'badge') return [count(s.cart)];
  if (id === 'theme') return [s.theme];
  if (isCard(id)) return [s.cart[cardIndex(id)]];
  if (id === 'summary') return [s.cart.join(',')];
  return [];
}

export const APPROACHES = ['lifted', 'context', 'store', 'signals'] as const;
export type Approach = (typeof APPROACHES)[number];
export type ReactApproach = Exclude<Approach, 'signals'>;

/**
 * Lifted state: App owns the state and passes it down as props, every level forwarding what its children
 * need. These are the props each component receives (compared shallowly, as `memo` does).
 */
export function propsOf(id: CompId, s: State): unknown[] {
  switch (id) {
    case 'header': return [count(s.cart), s.theme];
    case 'badge': return [count(s.cart)];
    case 'theme': return [s.theme];
    case 'list': case 'sidebar': case 'summary': return [s.cart];
    default: return isCard(id) ? [s.cart[cardIndex(id)]] : [];
  }
}

/** Who reads the single context object { cart, theme }. */
export const CONTEXT_CONSUMERS: ReadonlySet<CompId> = new Set<CompId>(['badge', 'theme', 'card0', 'card1', 'card2', 'card3', 'summary']);

/** The slice each component selects from the store; it re-renders when the slice changes by Object.is. */
export function selected(id: CompId, s: State): unknown {
  if (id === 'badge') return count(s.cart);
  if (id === 'theme') return s.theme;
  if (isCard(id)) return s.cart[cardIndex(id)];
  if (id === 'summary') return s.cart;
  return undefined;
}
const SUBSCRIBERS: ReadonlySet<CompId> = new Set<CompId>(['badge', 'theme', 'card0', 'card1', 'card2', 'card3', 'summary']);

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * The components that re-render for one action, in tree order.
 * - lifted: App re-renders; each child re-renders when its parent did and (with `memo`) its props changed.
 *   Without memo, a parent's render re-renders every child.
 * - context: the provider (App, whose children are passed in as props, so they are not re-created) re-renders,
 *   and every consumer of the context re-renders, whichever field it reads.
 * - store: nobody owns the state in the tree; a component re-renders only when its selected slice changed.
 */
export function predict(approach: ReactApproach, memo: boolean, before: State, after: State): CompId[] {
  if (approach === 'context') return IDS.filter((id) => id === 'app' || CONTEXT_CONSUMERS.has(id));
  if (approach === 'store') return IDS.filter((id) => SUBSCRIBERS.has(id) && !Object.is(selected(id, before), selected(id, after)));
  const rendered = new Set<CompId>(['app']);
  for (const c of COMPONENTS) {
    if (c.parent === null || !rendered.has(c.parent)) continue;
    if (!memo || !sameList(propsOf(c.id, before), propsOf(c.id, after))) rendered.add(c.id);
  }
  return IDS.filter((id) => rendered.has(id));
}

export type RenderKind = 'needed' | 'wasted';

/**
 * A render is needed when the component is the owner of the state or what it draws changed; otherwise it
 * re-ran with identical output ("wasted"): a container that only forwards props, or a consumer of an
 * unrelated field.
 */
export function classify(id: CompId, owner: CompId | null, before: State, after: State): RenderKind {
  const changed = !sameList(shown(id, before), shown(id, after));
  return id === owner || changed ? 'needed' : 'wasted';
}

export const ownerOf = (approach: Approach): CompId | null => (approach === 'lifted' || approach === 'context' ? 'app' : null);

export interface Outcome {
  rendered: CompId[];
  kinds: Map<CompId, RenderKind>;
}

export function outcome(approach: ReactApproach, memo: boolean, before: State, after: State): Outcome {
  const rendered = predict(approach, memo, before, after);
  const owner = ownerOf(approach);
  return { rendered, kinds: new Map(rendered.map((id) => [id, classify(id, owner, before, after)])) };
}

// ── Signals: the same state as a dependency graph ────────────────────

export type SignalNodeId = 'q0' | 'q1' | 'q2' | 'q3' | 'theme' | 'count' | 'total' | 'e-badge' | 'e-card0' | 'e-card1' | 'e-card2' | 'e-card3' | 'e-summary' | 'e-theme';

/** Edges point from a value to what reads it. */
export const SIGNAL_EDGES: { from: SignalNodeId; to: SignalNodeId }[] = [
  { from: 'q0', to: 'count' }, { from: 'q1', to: 'count' }, { from: 'q2', to: 'count' }, { from: 'q3', to: 'count' },
  { from: 'q0', to: 'total' }, { from: 'q1', to: 'total' }, { from: 'q2', to: 'total' }, { from: 'q3', to: 'total' },
  { from: 'count', to: 'e-badge' },
  { from: 'q0', to: 'e-card0' }, { from: 'q1', to: 'e-card1' }, { from: 'q2', to: 'e-card2' }, { from: 'q3', to: 'e-card3' },
  { from: 'count', to: 'e-summary' }, { from: 'total', to: 'e-summary' },
  { from: 'theme', to: 'e-theme' },
];

export const EFFECT_FOR: Record<SignalNodeId, CompId | null> = {
  q0: null, q1: null, q2: null, q3: null, theme: null, count: null, total: null,
  'e-badge': 'badge', 'e-card0': 'card0', 'e-card1': 'card1', 'e-card2': 'card2', 'e-card3': 'card3', 'e-summary': 'summary', 'e-theme': 'theme',
};

export interface SignalRun {
  /** Effects (text bindings) that ran for the action, in the order they ran. */
  effects: SignalNodeId[];
  /** Computed values that actually recomputed. */
  computeds: SignalNodeId[];
}

/** The cart as real signals, computeds and effects (signals.ts). Components never re-run: only the bindings do. */
export function createSignalCart() {
  const log: SignalNodeId[] = [];
  const computedLog: SignalNodeId[] = [];
  const q: Signal<number>[] = PRODUCTS.map(() => signal(0));
  const theme = signal<Theme>('dark');
  const countC: Computed<number> = computed(() => q.reduce((n, s) => n + s.get(), 0), () => computedLog.push('count'));
  const totalC: Computed<number> = computed(() => q.reduce((n, s, i) => n + s.get() * PRODUCTS[i].price, 0), () => computedLog.push('total'));
  const bindings: [SignalNodeId, () => void][] = [
    ['e-badge', () => void countC.get()],
    ...q.map((s, i): [SignalNodeId, () => void] => [`e-card${i}` as SignalNodeId, () => void s.get()]),
    ['e-summary', () => void (countC.get(), totalC.get())],
    ['e-theme', () => void theme.get()],
  ];
  bindings.forEach(([id, fn]) =>
    effect(() => {
      fn();
      log.push(id);
    }),
  );
  log.length = 0;
  computedLog.length = 0;
  return {
    apply(action: Action): SignalRun {
      log.length = 0;
      computedLog.length = 0;
      if (action.type === 'theme') theme.set(theme.get() === 'dark' ? 'light' : 'dark');
      else q[action.product].set(q[action.product].get() + 1);
      return { effects: [...log], computeds: [...computedLog] };
    },
    cart: () => q.map((s) => s.get()),
  };
}
