import type { PlaceOrder } from '../domain/placeOrder';

/** A driving adapter: the same use case, called from a command line. */
export class CliDriver {
  private placeOrder: PlaceOrder;
  constructor(placeOrder: PlaceOrder) {
    this.placeOrder = placeOrder;
  }
  run(args: string[]): string {
    const order = this.placeOrder(Number(args[0]));
    return `order ${order.id}: ${order.status}`;
  }
}
