import { createContext, memo, useContext, useEffect, useReducer, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { useTallyCount, type ActionBus, type RenderTally } from './counts';
import { INITIAL, LABEL, PRODUCTS, count, reduce, type Action, type CompId, type State } from './model';

/**
 * The same eleven components in real React, wired three ways. Every component tallies its own renders from an
 * effect; the lesson's buttons reach the state through an action bus because they live outside this tree.
 */
const TallyContext = createContext<RenderTally | null>(null);
const BusContext = createContext<ActionBus | null>(null);

export function RealTreeProviders({ tally, bus, children }: { tally: RenderTally; bus: ActionBus; children: ReactNode }) {
  return (
    <TallyContext value={tally}>
      <BusContext value={bus}>{children}</BusContext>
    </TallyContext>
  );
}

/** Runs after every render of the component that calls it. */
function useTally(id: CompId) {
  const tally = useContext(TallyContext)!;
  useEffect(() => {
    tally.bump(id);
  });
}

function useActions(dispatch: (a: Action) => void) {
  const bus = useContext(BusContext)!;
  useEffect(() => bus.subscribe(dispatch), [bus, dispatch]);
}

function Count({ id }: { id: CompId }) {
  const n = useTallyCount(useContext(TallyContext)!, id);
  return <span className={`fs-real-count ${n ? 'is-hit' : ''}`}>×{n}</span>;
}

function Box({ id, children, text }: { id: CompId; children?: ReactNode; text?: ReactNode }) {
  return (
    <div className="fs-real-box" data-comp={id}>
      <div className="fs-real-head">
        <b>{LABEL[id]}</b>
        <Count id={id} />
        {text !== undefined && <span className="fs-real-text">{text}</span>}
      </div>
      {children && <div className="fs-real-kids">{children}</div>}
    </div>
  );
}

const shallowEqual = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.is(a[k], b[k]));

const cardId = (i: number) => `card${i}` as CompId;
const qtyText = (q: number) => (q ? `in cart: ${q}` : 'not in cart');
const summaryText = (cart: readonly number[]) => `${count(cart)} items`;

// ── 1. Lifted state: App owns it and passes props down ───────────────

interface Memoable {
  /** Wraps the component in React.memo (shallow props comparison) when on. */
  m: boolean;
}
/** `memo` with a comparison that only skips when `m` is on: one component type, so the toggle never remounts. */
const lifted = <P extends Memoable>(C: ComponentType<P>) => memo(C, (a, b) => b.m && shallowEqual(a, b));

const LBadge = lifted(function LBadge({ count: n }: Memoable & { count: number }) {
  useTally('badge');
  return <Box id="badge" text={`${n} items`} />;
});
const LTheme = lifted(function LTheme({ theme }: Memoable & { theme: string }) {
  useTally('theme');
  return <Box id="theme" text={theme} />;
});
const LHeader = lifted(function LHeader({ count: n, theme, m }: Memoable & { count: number; theme: string }) {
  useTally('header');
  return (
    <Box id="header">
      <LBadge count={n} m={m} />
      <LTheme theme={theme} m={m} />
    </Box>
  );
});
const LCard = lifted(function LCard({ index, qty }: Memoable & { index: number; qty: number }) {
  useTally(cardId(index));
  return <Box id={cardId(index)} text={`${PRODUCTS[index].name}: ${qtyText(qty)}`} />;
});
const LList = lifted(function LList({ cart, m }: Memoable & { cart: readonly number[] }) {
  useTally('list');
  return (
    <Box id="list">
      {cart.map((q, i) => (
        <LCard key={i} index={i} qty={q} m={m} />
      ))}
    </Box>
  );
});
const LSummary = lifted(function LSummary({ cart }: Memoable & { cart: readonly number[] }) {
  useTally('summary');
  return <Box id="summary" text={summaryText(cart)} />;
});
const LSidebar = lifted(function LSidebar({ cart, m }: Memoable & { cart: readonly number[] }) {
  useTally('sidebar');
  return (
    <Box id="sidebar">
      <LSummary cart={cart} m={m} />
    </Box>
  );
});

export function LiftedTree({ memoOn }: { memoOn: boolean }) {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  useActions(dispatch);
  useTally('app');
  return (
    <Box id="app">
      <LHeader count={count(state.cart)} theme={state.theme} m={memoOn} />
      <LList cart={state.cart} m={memoOn} />
      <LSidebar cart={state.cart} m={memoOn} />
    </Box>
  );
}

// ── 2. Context: one object, every consumer re-renders ────────────────

const StateContext = createContext<State>(INITIAL);

function CBadge() {
  const { cart } = useContext(StateContext);
  useTally('badge');
  return <Box id="badge" text={`${count(cart)} items`} />;
}
function CTheme() {
  const { theme } = useContext(StateContext);
  useTally('theme');
  return <Box id="theme" text={theme} />;
}
function CCard({ index }: { index: number }) {
  const { cart } = useContext(StateContext);
  useTally(cardId(index));
  return <Box id={cardId(index)} text={`${PRODUCTS[index].name}: ${qtyText(cart[index])}`} />;
}
function CSummary() {
  const { cart } = useContext(StateContext);
  useTally('summary');
  return <Box id="summary" text={summaryText(cart)} />;
}

/** The provider takes its children as props, the usual pattern, so only consumers re-render when the state changes. */
function ContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  useActions(dispatch);
  useTally('app');
  return (
    <Box id="app">
      <StateContext value={state}>{children}</StateContext>
    </Box>
  );
}

function ContextHeader() {
  useTally('header');
  return (
    <Box id="header">
      <CBadge />
      <CTheme />
    </Box>
  );
}
function ContextList() {
  useTally('list');
  return (
    <Box id="list">
      {PRODUCTS.map((_, i) => (
        <CCard key={i} index={i} />
      ))}
    </Box>
  );
}
function ContextSidebar() {
  useTally('sidebar');
  return (
    <Box id="sidebar">
      <CSummary />
    </Box>
  );
}

export function ContextTree() {
  return (
    <ContextProvider>
      <ContextHeader />
      <ContextList />
      <ContextSidebar />
    </ContextProvider>
  );
}

// ── 3. A tiny external store with selectors (useSyncExternalStore) ───

interface Store {
  get: () => State;
  dispatch: (a: Action) => void;
  subscribe: (l: () => void) => () => void;
}

function createStore(): Store {
  let state = INITIAL;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch: (a) => {
      state = reduce(state, a);
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
const StoreContext = createContext<Store | null>(null);

/** Re-renders the component only when `select(state)` changes by Object.is. */
function useSelector<T>(select: (s: State) => T): T {
  const store = useContext(StoreContext)!;
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

function SBadge() {
  const n = useSelector((s) => count(s.cart));
  useTally('badge');
  return <Box id="badge" text={`${n} items`} />;
}
function STheme() {
  const theme = useSelector((s) => s.theme);
  useTally('theme');
  return <Box id="theme" text={theme} />;
}
function SCard({ index }: { index: number }) {
  const q = useSelector((s) => s.cart[index]);
  useTally(cardId(index));
  return <Box id={cardId(index)} text={`${PRODUCTS[index].name}: ${qtyText(q)}`} />;
}
function SSummary() {
  const cart = useSelector((s) => s.cart);
  useTally('summary');
  return <Box id="summary" text={summaryText(cart)} />;
}

function SHeader() {
  useTally('header');
  return (
    <Box id="header">
      <SBadge />
      <STheme />
    </Box>
  );
}
function SList() {
  useTally('list');
  return (
    <Box id="list">
      {PRODUCTS.map((_, i) => (
        <SCard key={i} index={i} />
      ))}
    </Box>
  );
}
function SSidebar() {
  useTally('sidebar');
  return (
    <Box id="sidebar">
      <SSummary />
    </Box>
  );
}

/** No state in the tree at all: the containers render once and never again. */
function StoreApp() {
  useTally('app');
  return (
    <Box id="app">
      <SHeader />
      <SList />
      <SSidebar />
    </Box>
  );
}

export function StoreTree() {
  const [store] = useState(createStore);
  useActions(store.dispatch);
  return (
    <StoreContext value={store}>
      <StoreApp />
    </StoreContext>
  );
}
