/** A simulated ORM: stands in for a real database client, keeping rows in memory. */
export interface Row {
  id: number;
  [column: string]: unknown;
}

export const db = {
  tables: new Map<string, Row[]>(),
  insert(table: string, values: Record<string, unknown>): Row {
    const rows = this.tables.get(table) ?? [];
    const row = { ...values, id: rows.length + 1 };
    this.tables.set(table, [...rows, row]);
    return row;
  },
};
