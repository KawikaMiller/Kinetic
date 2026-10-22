import type { ReactNode } from 'react';

/** One choice in a <Segmented>. A boolean value is for a two-way switch ("Right" / "Wrong"): `value={flag}` and `onChange={setFlag}` need no mapping. */
export interface Option<T extends string | number | boolean> {
  value: T;
  label: ReactNode;
}

/** Map a lesson's `{ id, label }` table to Segmented options. */
export const toOptions = <T extends string | number>(xs: readonly { id: T; label: ReactNode }[]): Option<T>[] =>
  xs.map((x) => ({ value: x.id, label: x.label }));
