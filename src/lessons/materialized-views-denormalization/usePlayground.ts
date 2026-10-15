import { useState } from 'react';
import { CUSTOMERS, Counter, differences, initState, liveDashboard, read, seededWorld, write, type Config, type Dashboard, type Difference, type State, type Strategy, type Write } from './shop';
import { WORLD_SEED } from './workload';

export interface LastAction {
  kind: 'read' | 'write';
  label: string;
  touched: number;
}

export interface Playground {
  strategy: Strategy;
  cfg: Config;
  state: State;
  last: LastAction | null;
  /** The dashboard the learner last read, or null before the first read. */
  read: Dashboard | null;
  /** Keys of the live rows the last write changed ("revenue:3", "units:Gadget"). */
  changed: ReadonlySet<string>;
  /** True when the last operation rebuilt a full-refresh view. */
  refreshed: boolean;
  differences: Difference[];
  setStrategy: (s: Strategy) => void;
  setCfg: (patch: Partial<Config>) => void;
  place: () => void;
  refund: () => void;
  rename: () => void;
  readDashboard: () => void;
  reset: () => void;
}

const QTY = 2;

function changedKeys(a: Dashboard, b: Dashboard): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(b.revenue)) if (a.revenue[Number(k)] !== b.revenue[Number(k)]) out.add(`revenue:${k}`);
  for (const k of new Set([...Object.keys(a.units), ...Object.keys(b.units)])) if (a.units[k] !== b.units[k]) out.add(`units:${k}`);
  return out;
}

/** A shop you can poke: one strategy at a time, the operations as buttons, and a count of the rows each touched. */
export function usePlayground(initial: Strategy, cfgInit: Config): Playground {
  const [strategy, setStrategyState] = useState<Strategy>(initial);
  const [cfg, setCfgState] = useState<Config>(cfgInit);
  const [state, setState] = useState<State>(() => initState(initial, seededWorld(WORLD_SEED)));
  const [last, setLast] = useState<LastAction | null>(null);
  const [shown, setShown] = useState<Dashboard | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [refreshed, setRefreshed] = useState(false);
  const [counter, setCounter] = useState({ place: 0, rename: 0 });

  const reset = (s: Strategy = strategy) => {
    setState(initState(s, seededWorld(WORLD_SEED)));
    setLast(null);
    setShown(null);
    setChanged(new Set());
    setRefreshed(false);
    setCounter({ place: 0, rename: 0 });
  };
  const apply = (op: Write, label: string) => {
    const before = liveDashboard(state.world, new Counter());
    const got = write(strategy, cfg, state, op);
    setState(got.state);
    setLast({ kind: 'write', label, touched: got.touched });
    setChanged(changedKeys(before, liveDashboard(got.state.world, new Counter())));
    setRefreshed(strategy === 'full' && got.state.writesSince === 0);
  };
  const first = state.world.items[0];
  return {
    strategy, cfg, state, last, read: shown, changed, refreshed,
    differences: differences(strategy, cfg, state),
    setStrategy: (s) => { setStrategyState(s); reset(s); },
    setCfg: (patch) => setCfgState({ ...cfg, ...patch }),
    place: () => {
      const n = counter.place;
      setCounter({ ...counter, place: n + 1 });
      apply({ kind: 'place', customerId: (n % CUSTOMERS.length) + 1, productId: ((2 * n) % state.world.products.length) + 1, qty: QTY }, 'placed an order');
    },
    refund: () => {
      const item = state.world.items.at(-1);
      if (item) apply({ kind: 'refund', itemId: item.id }, 'refunded an item');
    },
    rename: () => {
      if (!first) return;
      const n = counter.rename + 1;
      setCounter({ ...counter, rename: n });
      const base = seededWorld(WORLD_SEED).products.find((p) => p.id === first.productId)!.name;
      apply({ kind: 'rename', productId: first.productId, name: `${base} v${n}` }, 'renamed a product');
    },
    readDashboard: () => {
      const got = read(strategy, cfg, state);
      setState(got.state);
      setShown(got.dashboard);
      setLast({ kind: 'read', label: 'read the dashboard', touched: got.touched });
      setChanged(new Set());
      setRefreshed(strategy === 'full' && got.state.writesSince === 0 && state.writesSince !== 0);
    },
    reset: () => reset(),
  };
}
