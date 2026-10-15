import { useState } from 'react';
import { WEATHER, setEntry, withRow, type Matrix } from './model';

/** The editable weather chain of one scene; Stage mounts it fresh per scene, so every scene opens on the default matrix. */
export function useChain() {
  const [P, setP] = useState<Matrix>(WEATHER);
  return {
    P,
    setEntry: (row: number, col: number, value: number) => setP((p) => setEntry(p, row, col, value)),
    setRow: (row: number, values: readonly number[]) => setP((p) => withRow(p, row, values)),
    reset: () => setP(WEATHER),
  };
}

export type Chain = ReturnType<typeof useChain>;
