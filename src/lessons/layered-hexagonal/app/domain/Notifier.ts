import type { Order } from './order';

export interface Notifier {
  orderPlaced(order: Order): void;
}
