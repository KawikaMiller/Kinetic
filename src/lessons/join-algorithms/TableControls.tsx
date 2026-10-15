import { ChipButton, Hint, Slider, TextField, Toggle } from '../../components/ui';
import { FILTER_ID, SIZE_RANGE, type Shape } from './tables';
import type { TableState } from './useTableState';

const SHAPES: { value: Shape; label: string }[] = [
  { value: 'default', label: 'Unique customers' },
  { value: 'manyToMany', label: 'Many-to-many' },
  { value: 'nulls', label: 'NULL keys' },
];

/** The controls every scene shares: the shape of the data, its size, a one-customer filter, and typing a key. */
export function TableControls({ state }: { state: TableState }) {
  const { spec, selected, text, refusal } = state;
  return (
    <>
      <span className="ja-chips" role="group" aria-label="Table shape">
        {SHAPES.map((s) => (
          <ChipButton key={s.value} tone="violet" on={spec.shape === s.value} onClick={() => state.setSpec({ shape: s.value })}>{s.label}</ChipButton>
        ))}
      </span>
      <Slider label="Customers" value={spec.sizeA} min={SIZE_RANGE.min} max={SIZE_RANGE.max} onChange={(sizeA) => state.setSpec({ sizeA })} />
      <Slider label="Orders" value={spec.sizeB} min={SIZE_RANGE.min} max={SIZE_RANGE.max} onChange={(sizeB) => state.setSpec({ sizeB })} />
      <Toggle label="Outer table" value={spec.oneCustomer} onChange={(oneCustomer) => state.setSpec({ oneCustomer })} off="all customers" on={`one customer (id ${FILTER_ID})`} />
      {selected ? (
        <>
          <TextField label={`Key of ${selected.side === 'a' ? 'customer' : 'order'} ${selected.id}`} value={text} onChange={state.type} sanitize={(s) => s.slice(0, 6)} width={84} />
          {refusal && <Hint tone="muted">{refusal} The key is unchanged.</Hint>}
        </>
      ) : (
        <Hint>Click a key in either table to type a new one (a whole number, or NULL).</Hint>
      )}
    </>
  );
}
