export interface PaymentPort {
  charge(total: number): boolean;
}
