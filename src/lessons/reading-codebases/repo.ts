// A small fictional shop backend (Express-style TypeScript), the repo the lesson
// explores. Plain data: file contents and their commit history.

export interface RepoFile {
  path: string;
  lines: string[];
}

const file = (path: string, text: string): RepoFile => ({ path, lines: text.replace(/^\n/, '').replace(/\n$/, '').split('\n') });

export const FILES: RepoFile[] = [
  file('src/server.ts', `
import express from 'express';
import { cartRoutes } from './routes/cart';
import { checkoutRoutes } from './routes/checkout';

export const app = express();
app.use(express.json());
app.use(cartRoutes);
app.use(checkoutRoutes);

app.listen(3000, () => console.log('shop listening on :3000'));
`),
  file('src/routes/cart.ts', `
import { Router } from 'express';
import { addItem, viewCart } from '../controllers/cartController';

export const cartRoutes = Router();

cartRoutes.get('/cart', viewCart);
cartRoutes.post('/cart/items', addItem);
`),
  file('src/routes/checkout.ts', `
import { Router } from 'express';
import { createCheckout } from '../controllers/checkoutController';

export const checkoutRoutes = Router();

// POST /checkout: pay for the cart and create an order
checkoutRoutes.post('/checkout', createCheckout);
`),
  file('src/controllers/cartController.ts', `
import type { Request, Response } from 'express';
import { loadCart, saveCart } from '../repositories/orderRepository';
import { totalFor } from '../services/pricing';

export async function viewCart(req: Request, res: Response) {
  const cart = await loadCart(req.user.id);
  res.json({ ...cart, total: totalFor(cart) });
}

export async function addItem(req: Request, res: Response) {
  const cart = await loadCart(req.user.id);
  cart.items.push(req.body);
  await saveCart(cart);
  res.status(201).json(cart);
}
`),
  file('src/controllers/checkoutController.ts', `
import type { Request, Response } from 'express';
import { PaymentDeclined } from '../errors';
import { placeOrder } from '../services/orderService';

export async function createCheckout(req: Request, res: Response) {
  try {
    const order = await placeOrder(req.user.id, req.body.card);
    res.status(201).json(order);
  } catch (err) {
    if (err instanceof PaymentDeclined) {
      return res.status(402).json({ error: 'Payment declined' });
    }
    throw err;
  }
}
`),
  file('src/services/orderService.ts', `
import { loadCart, saveOrder } from '../repositories/orderRepository';
import { chargeCard } from './payments';
import { totalFor } from './pricing';

export async function placeOrder(userId: string, card: string) {
  const cart = await loadCart(userId);
  const total = totalFor(cart);
  const receipt = await chargeCard(card, total);
  return saveOrder({ userId, items: cart.items, total, receipt });
}
`),
  file('src/services/pricing.ts', `
import { TAX_RATE } from '../config/tax';
import type { Cart } from '../repositories/orderRepository';

export function applyDiscount(subtotal: number, coupon?: string) {
  if (coupon === 'WELCOME10') return subtotal * 0.9;
  return subtotal;
}

export function totalFor(cart: Cart) {
  const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discounted = applyDiscount(subtotal, cart.coupon);
  return Math.round(discounted * (1 + TAX_RATE) * 100) / 100;
}
`),
  file('src/services/payments.ts', `
import { createBankClient } from 'acme-bank';
import { PaymentDeclined } from '../errors';

const bank = createBankClient(process.env.BANK_KEY);

export async function chargeCard(card: string, amount: number) {
  const result = await bank.charge({ card, amount });
  if (result.status === 'declined') {
    throw new PaymentDeclined(result.reason);
  }
  return result.receiptId;
}
`),
  file('src/repositories/orderRepository.ts', `
import { db } from '../db';

export interface Cart {
  userId: string;
  items: { price: number; qty: number }[];
  coupon?: string;
}

export function loadCart(userId: string): Promise<Cart> {
  return db.one('SELECT * FROM carts WHERE user_id = $1', [userId]);
}

export function saveCart(cart: Cart) {
  return db.none('UPDATE carts SET items = $1 WHERE user_id = $2', [cart.items, cart.userId]);
}

export function saveOrder(order: { userId: string; items: unknown[]; total: number; receipt: string }) {
  return db.one('INSERT INTO orders (user_id, items, total, receipt) VALUES ($1, $2, $3, $4) RETURNING *',
    [order.userId, order.items, order.total, order.receipt]);
}
`),
  file('src/config/tax.ts', `
// Sales tax for the Austin store. Change only with finance's sign-off.
export const TAX_RATE = 0.0825;
`),
  file('src/errors.ts', `
export class PaymentDeclined extends Error {
  constructor(reason: string) {
    super(\`Payment declined: \${reason}\`);
    this.name = 'PaymentDeclined';
  }
}
`),
  file('tests/pricing.test.ts', `
import { applyDiscount } from '../src/services/pricing';

describe('applyDiscount', () => {
  it('takes 10% off with the WELCOME10 coupon', () => {
    expect(applyDiscount(100, 'WELCOME10')).toBe(90);
  });

  it('ignores unknown coupons', () => {
    expect(applyDiscount(100, 'FREE')).toBe(100);
  });
});
`),
  file('tests/checkout.test.ts', `
import request from 'supertest';
import { app } from '../src/server';

it('returns 402 when the card is declined', async () => {
  const res = await request(app).post('/checkout').send({ card: 'tok_declined' });
  expect(res.status).toBe(402);
});
`),
];

export interface Commit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export const INITIAL_COMMIT: Commit = { hash: 'e81b2c0', author: 'Sam Okafor', date: '2025-03-02', message: 'Initial checkout flow' };

/** Later commits and the lines (1-based, inclusive) they last touched. */
export const HISTORY: { commit: Commit; file: string; from: number; to: number }[] = [
  {
    commit: { hash: '4f9d1aa', author: 'Lee Park', date: '2025-06-11', message: 'Add WELCOME10 first-order coupon (MKT-88)' },
    file: 'src/services/pricing.ts', from: 4, to: 7,
  },
  {
    commit: { hash: '7c02e19', author: 'Sam Okafor', date: '2025-07-19', message: 'Return 402 instead of 500 when the bank declines a card' },
    file: 'src/controllers/checkoutController.ts', from: 10, to: 12,
  },
  {
    commit: { hash: 'a1f3d07', author: 'Priya Natarajan', date: '2025-09-30', message: 'Raise sales tax to 8.25% for the Austin store (FIN-212)' },
    file: 'src/config/tax.ts', from: 1, to: 2,
  },
];
