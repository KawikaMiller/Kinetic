import type { Order } from '../domain/order';
import type { OrderRepository } from '../domain/OrderRepository';

export class InMemoryOrderRepo implements OrderRepository {
  orders: Order[] = [];
  save(order: Omit<Order, 'id'>): Order {
    const saved = { ...order, id: this.orders.length + 1 };
    this.orders.push(saved);
    return saved;
  }
}
