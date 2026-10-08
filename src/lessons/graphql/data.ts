/**
 * The in-memory "database" the lesson's resolvers read: 60 fictional users who each have 50
 * orders and a ring of friends, and 8 products. Everything is generated from small formulas, so
 * every user has the same shape and a query's size is predictable.
 */

export interface User {
  id: number;
  name: string;
  email: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
}

export interface Product {
  id: number;
  name: string;
  /** In cents. */
  price: number;
  description: string;
  sku: string;
  stock: number;
}

export type OrderStatus = 'delivered' | 'shipped' | 'processing';

export interface Order {
  id: number;
  userId: number;
  productId: number;
  qty: number;
  /** In cents. */
  total: number;
  status: OrderStatus;
  placedAt: string;
}

export const USER_COUNT = 60;
export const ORDERS_PER_USER = 50;
/** The most a `friends(first: n)` or `orders(last: n)` list can return. */
export const MAX_LIST = 50;

const FIRST = ['Ada', 'Ben', 'Chen', 'Dara', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jun', 'Kit', 'Lia'];
const LAST = ['Okafor', 'Lind', 'Marsh', 'Nakai', 'Ortiz'];

export const userById = (id: number): User | null => {
  if (!Number.isInteger(id) || id < 1 || id > USER_COUNT) return null;
  const i = id - 1;
  const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
  return {
    id,
    name,
    email: `${name.toLowerCase().replace(' ', '.')}@mail.example`,
    bio: `Fictional customer number ${id}. Likes tea, trains and tidy spreadsheets.`,
    avatarUrl: `https://cdn.example/avatars/${id}.png`,
    createdAt: `2024-0${1 + (i % 9)}-1${i % 10}`,
  };
};

export const PRODUCTS: readonly Product[] = [
  ['Green tea', 450, 'Loose-leaf sencha, 100 g tin.'],
  ['Espresso beans', 1290, 'Medium roast, 1 kg bag, whole bean.'],
  ['Oat biscuits', 320, 'Twelve crisp oat biscuits, no nuts.'],
  ['Honey jar', 780, 'Wildflower honey, 340 g glass jar.'],
  ['Rye crackers', 290, 'Thin dark rye crackers, 200 g.'],
  ['Olive oil', 1150, 'Cold-pressed, 500 ml dark bottle.'],
  ['Dark chocolate', 410, '70% cocoa bar, 100 g.'],
  ['Sea salt', 260, 'Flaked sea salt, 250 g box.'],
].map(([name, price, description], i) => ({
  id: i + 1, name: name as string, price: price as number, description: description as string, sku: `SKU-${1000 + i}`, stock: 40 + i * 7,
}));

export const productById = (id: number): Product | null => PRODUCTS.find((p) => p.id === id) ?? null;

/** Order `i` (1-based) of a user: the product cycles through all 8 so consecutive orders differ. */
export function orderOf(userId: number, i: number): Order {
  const product = PRODUCTS[(userId * 5 + i * 3) % PRODUCTS.length];
  const qty = (i % 3) + 1;
  const day = new Date(Date.UTC(2026, 0, 1 + i * 3)).toISOString().slice(0, 10);
  return {
    id: userId * 1000 + i,
    userId,
    productId: product.id,
    qty,
    total: product.price * qty,
    status: i >= ORDERS_PER_USER - 2 ? 'processing' : i >= ORDERS_PER_USER - 5 ? 'shipped' : 'delivered',
    placedAt: day,
  };
}

/** The user's most recent `n` orders, newest first. */
export function lastOrders(userId: number, n: number): Order[] {
  const count = Math.max(0, Math.min(n, ORDERS_PER_USER));
  return Array.from({ length: count }, (_, k) => orderOf(userId, ORDERS_PER_USER - k));
}

/** `first` friends: the next users around a ring, so nobody is their own friend while first < 60. */
export const friendsOf = (userId: number, first: number): number[] =>
  Array.from({ length: Math.max(0, Math.min(first, MAX_LIST)) }, (_, j) => ((userId - 1 + j + 1) % USER_COUNT) + 1);

export const formatPrice = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
