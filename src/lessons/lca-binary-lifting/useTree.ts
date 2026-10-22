import { useMemo, useState } from 'react';
import { T0_PARENTS, addLeaf, buildTable, type Table } from './model';

export interface TreeState {
  parents: readonly number[];
  table: Table;
  /** The parent typed for the next leaf. */
  draft: string;
  error: string | null;
  setDraft: (v: string) => void;
  add: () => void;
  reset: () => void;
  load: (parents: readonly number[]) => void;
}

/** The learner's tree (T0 to begin with): leaves can be added under a typed parent, and the jump table follows the tree. */
export function useTree(): TreeState {
  const [parents, setParents] = useState<readonly number[]>(T0_PARENTS);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const table = useMemo(() => buildTable(parents), [parents]);
  return {
    parents,
    table,
    draft,
    error,
    setDraft: (v) => {
      setDraft(v);
      setError(null);
    },
    add: () => {
      const result = addLeaf(parents, draft);
      if (result.ok) {
        setParents(result.parents);
        setDraft('');
        setError(null);
      } else {
        setError(result.error);
      }
    },
    reset: () => {
      setParents(T0_PARENTS);
      setError(null);
    },
    load: (next) => {
      setParents(next);
      setError(null);
    },
  };
}
