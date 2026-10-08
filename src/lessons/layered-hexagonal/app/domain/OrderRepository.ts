import type { Order } from './order';

export interface OrderRepository {
  save(order: Omit<Order, 'id'>): Order;
}
