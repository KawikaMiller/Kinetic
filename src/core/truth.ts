/** One assignment of truth values to named variables, e.g. { p: true, q: false }. */
export type TruthRow = Record<string, boolean>;

/**
 * Every assignment of `vars`, in counting order with the first variable as the
 * most significant: for [p, q] → FF, FT, TF, TT. `trueFirst` reverses it (TT…FF),
 * the order most logic textbooks use.
 */
export function truthRows(vars: readonly string[], o: { trueFirst?: boolean } = {}): TruthRow[] {
  const count = 2 ** vars.length;
  const rows: TruthRow[] = [];
  for (let k = 0; k < count; k++) {
    const n = o.trueFirst ? count - 1 - k : k;
    const row: TruthRow = {};
    vars.forEach((v, i) => {
      row[v] = Math.floor(n / 2 ** (vars.length - 1 - i)) % 2 === 1;
    });
    rows.push(row);
  }
  return rows;
}

/** Index of `row` within truthRows(vars, o), for highlighting the current inputs. */
export function truthRowIndex(vars: readonly string[], row: TruthRow, o: { trueFirst?: boolean } = {}): number {
  const n = vars.reduce((acc, v) => acc * 2 + (row[v] ? 1 : 0), 0);
  return o.trueFirst ? 2 ** vars.length - 1 - n : n;
}
