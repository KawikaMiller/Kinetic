import type { PaymentPort } from '../domain/PaymentPort';

/** A payment gateway adapter; the gateway itself is simulated and approves every charge. */
export class StripeLikePayments implements PaymentPort {
  charged: number[] = [];
  charge(total: number): boolean {
    this.charged.push(total);
    return true;
  }
}
