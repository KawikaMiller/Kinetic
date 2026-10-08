import type { Order } from '../domain/order';
import type { Notifier } from '../domain/Notifier';

export class EmailNotifier implements Notifier {
  sent: string[] = [];
  orderPlaced(order: Order): void {
    this.sent.push(`Order ${order.id} confirmed`);
  }
}
