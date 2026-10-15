import { useMemo, useState } from 'react';
import type { Side, Tables } from './join';
import type { Selected } from './JoinGrids';
import { DEFAULT_SPEC, NO_EDITS, keyText, makeTables, parseKey, withEdits, type Edits, type TableSpec } from './tables';

export interface TableState {
  spec: TableSpec;
  tables: Tables;
  selected: Selected | null;
  /** The text in the key editor, and why the last typed text was refused ('' when it was fine). */
  text: string;
  refusal: string;
  setSpec: (patch: Partial<TableSpec>) => void;
  select: (s: Selected) => void;
  type: (text: string) => void;
}

/** The learner's tables: a spec (shape, sizes, filter), the keys they typed over it, and the cell being edited. */
export function useTableState(): TableState {
  const [spec, setSpecState] = useState<TableSpec>(DEFAULT_SPEC);
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [text, setText] = useState('');
  const [refusal, setRefusal] = useState('');
  const base = useMemo(() => makeTables(spec), [spec]);
  const tables = useMemo(() => withEdits(base, edits), [base, edits]);

  const setSpec = (patch: Partial<TableSpec>) => {
    setSpecState({ ...spec, ...patch });
    setEdits(NO_EDITS);
    setSelected(null);
    setRefusal('');
  };
  const select = (s: Selected) => {
    setSelected(s);
    setRefusal('');
    const key = (s.side === 'a' ? tables.a : tables.b).find((r) => r.id === s.id)?.key ?? null;
    setText(keyText(key));
  };
  const type = (value: string) => {
    setText(value);
    if (!selected) return;
    const parsed = parseKey(value);
    if (!parsed.ok) {
      setRefusal(parsed.error);
      return;
    }
    setRefusal('');
    const side: Side = selected.side;
    setEdits({ ...edits, [side]: { ...edits[side], [selected.id]: parsed.value } });
  };
  return { spec, tables, selected, text, refusal, setSpec, select, type };
}
