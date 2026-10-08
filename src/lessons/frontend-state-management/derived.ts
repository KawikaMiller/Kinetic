import { PRODUCTS, total } from './model';

/**
 * Derived state: the cart total computed from the items every time, against a total stored as its own piece
 * of state and kept in step by hand. The stored copy is updated by "add" but the code that handles "remove"
 * was written first and never learned about it: the usual way a second copy goes stale.
 */
export type CartEdit = { type: 'add'; product: number } | { type: 'remove'; product: number } | { type: 'clear' };

export interface DerivedCart {
  items: readonly number[];
  /** A second copy of the total, kept in state. */
  storedTotal: number;
}

export const EMPTY_CART: DerivedCart = { items: [0, 0, 0, 0], storedTotal: 0 };

export function editCart(c: DerivedCart, e: CartEdit): DerivedCart {
  switch (e.type) {
    case 'add':
      return {
        items: c.items.map((q, i) => (i === e.product ? q + 1 : q)),
        storedTotal: c.storedTotal + PRODUCTS[e.product].price,
      };
    case 'remove':
      // The stored total is not touched: the bug this scene is about.
      return { ...c, items: c.items.map((q, i) => (i === e.product ? Math.max(0, q - 1) : q)) };
    case 'clear':
      return { ...c, items: c.items.map(() => 0) };
  }
}

/** The derived total: always right, because there is no second copy to forget. */
export const derivedTotal = (c: DerivedCart): number => total(c.items);

export const isDrifting = (c: DerivedCart): boolean => c.storedTotal !== derivedTotal(c);

export const STORED_CODE = [
  'const [items, setItems] = useState(init);',
  'const [total, setTotal] = useState(0);',
  'add:    setItems(plus);  setTotal(total + price);',
  'remove: setItems(minus);   // no setTotal',
  'clear:  setItems(empty);   // no setTotal',
];

export const DERIVED_CODE = [
  'const [items, setItems] = useState(init);',
  'const total = sum(items);  // on every render',
  'add:    setItems(plus);',
  'remove: setItems(minus);',
  'clear:  setItems(empty);',
];
