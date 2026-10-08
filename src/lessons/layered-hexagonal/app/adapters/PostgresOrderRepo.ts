import type { Order } from '../domain/order';
import type { OrderRepository } from '../domain/OrderRepository';
import { db } from '../lib/orm';

export class PostgresOrderRepo implements OrderRepository {
  save(order: Omit<Order, 'id'>): Order {
    const row = db.insert('orders', { total: order.total, status: order.status });
    return { id: row.id, total: order.total, status: order.status };
  }
}
