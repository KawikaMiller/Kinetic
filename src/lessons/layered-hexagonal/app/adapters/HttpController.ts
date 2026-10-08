import type { PlaceOrder } from '../domain/placeOrder';

/** A driving adapter: turns an HTTP request into a call on the use case. */
export class HttpController {
  private placeOrder: PlaceOrder;
  constructor(placeOrder: PlaceOrder) {
    this.placeOrder = placeOrder;
  }
  post(body: { total: number }) {
    return { status: 201, body: this.placeOrder(body.total) };
  }
}
