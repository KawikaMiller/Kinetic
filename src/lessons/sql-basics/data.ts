// The two tables every query in the lesson reads, plus the frame shape the stage draws.
import type { Frame } from '../../core/types';

export interface User {
  id: number;
  name: string;
  city: string;
}
export interface Order {
  id: number;
  userId: number;
  item: string;
  total: number;
}

export const USERS: User[] = [
  { id: 1, name: 'Ada', city: 'London' },
  { id: 2, name: 'Linus', city: 'Helsinki' },
  { id: 3, name: 'Grace', city: 'New York' },
  { id: 4, name: 'Alan', city: 'London' },
  { id: 5, name: 'Margaret', city: 'Boston' },
];

export const ORDERS: Order[] = [
  { id: 101, userId: 1, item: 'Keyboard', total: 80 },
  { id: 102, userId: 3, item: 'Monitor', total: 220 },
  { id: 103, userId: 1, item: 'Mouse', total: 25 },
  { id: 104, userId: 4, item: 'Laptop', total: 1200 },
  { id: 105, userId: 3, item: 'Cable', total: 10 },
  { id: 106, userId: 1, item: 'Webcam', total: 60 },
];

export const USER_COLS = ['id', 'name', 'city'] as const;
export const ORDER_COLS = ['id', 'user_id', 'item', 'total'] as const;

export type Step = 'FROM' | 'JOIN' | 'WHERE' | 'GROUP BY' | 'SELECT' | 'ORDER BY';
/** scan = being read now, match = kept, out = filtered away / no match */
export type Mark = 'scan' | 'match' | 'out';

export type Cell = string | number | null;

export interface ResultRow {
  key: string;
  cells: Cell[];
  /** id of the user this row came from: what GROUP BY users.id buckets on */
  userId?: number;
  /** group colour index while GROUP BY is bucketing */
  tint?: number;
}

export interface SqlFrame extends Frame {
  step: Step | null;
  done: Step[];
  users: Record<number, Mark>;
  orders: Record<number, Mark>;
  dimUserCols: string[];
  dimOrderCols: string[];
  links: { u: number; o: number }[];
  resultCols: string[];
  result: ResultRow[];
  examined: number;
}
