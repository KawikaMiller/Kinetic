/** Orders over this total need a human to approve them before payment. */
export const APPROVAL_LIMIT = 500;

export type OrderStatus = 'paid' | 'needs-approval';

export interface Order {
  id: number;
  total: number;
  status: OrderStatus;
}

export const needsApproval = (total: number) => total > APPROVAL_LIMIT;
