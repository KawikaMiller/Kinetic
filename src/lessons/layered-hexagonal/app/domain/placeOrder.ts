import type { Notifier } from './Notifier';
import { needsApproval, type Order } from './order';
import type { OrderRepository } from './OrderRepository';
import type { PaymentPort } from './PaymentPort';

/** The driving port: what a controller, a CLI or a test may ask the domain to do. */
export type PlaceOrder = (total: number) => Order;

/** The use case. It knows the ports, never the adapters. */
export function placeOrder(total: number, repo: OrderRepository, pay: PaymentPort, notify: Notifier): Order {
  if (needsApproval(total)) return repo.save({ total, status: 'needs-approval' });
  if (!pay.charge(total)) throw new Error('payment declined');
  const order = repo.save({ total, status: 'paid' });
  notify.orderPlaced(order);
  return order;
}
