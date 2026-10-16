import { useState, type ReactNode } from 'react';
import { Button } from '../../components/ui';
import { useRadioGroup } from '../../components/useRadioGroup';
import { score } from './classification';

/*
 * A classification board kept in this lesson's own files (a Phase 2 request asks for the shared version): items
 * are sorted into labelled bins with a keyboard-first radio row per item, then checked, with a per-item reveal.
 */
export interface BoardItem {
  id: string;
  label: ReactNode;
}
export interface BoardBin {
  id: string;
  label: string;
}

function BinRow({ item, bins, value, onPick }: { item: BoardItem; bins: readonly BoardBin[]; value: string | null; onPick: (bin: string) => void }) {
  const radio = useRadioGroup(bins.length, bins.findIndex((b) => b.id === value), (i) => onPick(bins[i].id));
  return (
    <div className="ub-bins" role="radiogroup" aria-label={`Category of ${typeof item.label === 'string' ? item.label : item.id}`}>
      {bins.map((b, i) => (
        <button key={b.id} type="button" {...radio.itemProps(i)} className={`ub-bin${b.id === value ? ' is-on' : ''}`} onClick={() => onPick(b.id)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}

export function ClassifyBoard({
  items, bins, answerKey, explain, binLabel, onChange,
}: {
  items: readonly BoardItem[];
  bins: readonly BoardBin[];
  answerKey: Record<string, string>;
  explain: (id: string) => ReactNode;
  binLabel: (id: string) => string;
  /** Called with the number of items sorted and (after a check) the score, for the stage's caption. */
  onChange?: (state: { sorted: number; checked: boolean; correct: number }) => void;
}) {
  const [assigned, setAssigned] = useState<Record<string, string | null>>(() => Object.fromEntries(items.map((i) => [i.id, null])));
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());

  const sorted = items.filter((i) => assigned[i.id] !== null).length;
  const correct = score(items, answerKey, assigned);
  const report = (next: Record<string, string | null>, isChecked: boolean) =>
    onChange?.({ sorted: items.filter((i) => next[i.id] !== null).length, checked: isChecked, correct: score(items, answerKey, next) });

  const pick = (id: string, bin: string) => {
    const next = { ...assigned, [id]: bin };
    setAssigned(next);
    setChecked(false);
    report(next, false);
  };
  const check = () => {
    setChecked(true);
    report(assigned, true);
  };
  const reset = () => {
    const next = Object.fromEntries(items.map((i) => [i.id, null]));
    setAssigned(next);
    setChecked(false);
    setRevealed(new Set());
    report(next, false);
  };
  const toggleReveal = (id: string) => {
    const next = new Set(revealed);
    if (!next.delete(id)) next.add(id);
    setRevealed(next);
  };

  return (
    <div className="ub-board">
      <ul className="ub-items">
        {items.map((item) => {
          const right = assigned[item.id] === answerKey[item.id];
          return (
            <li key={item.id} className={`ub-item${checked ? (right ? ' is-right' : ' is-wrong') : ''}`}>
              <code className="ub-snippet">{item.label}</code>
              <BinRow item={item} bins={bins} value={assigned[item.id]} onPick={(b) => pick(item.id, b)} />
              <div className="ub-verdict">
                {checked && <span role="status">{right ? 'Right.' : assigned[item.id] === null ? `Not sorted: it is ${binLabel(answerKey[item.id])}.` : `Not quite: it is ${binLabel(answerKey[item.id])}.`}</span>}
                <Button aria-expanded={revealed.has(item.id)} onClick={() => toggleReveal(item.id)}>{revealed.has(item.id) ? 'Hide why' : 'Why?'}</Button>
              </div>
              {revealed.has(item.id) && <p className="ub-why">{explain(item.id)}</p>}
            </li>
          );
        })}
      </ul>
      <div className="ub-board-actions">
        <Button variant="primary" onClick={check}>Check</Button>
        <Button onClick={reset}>Reset</Button>
        <span role="status" className="ub-score">{checked ? `${correct} of ${items.length} right` : `${sorted} of ${items.length} sorted`}</span>
      </div>
    </div>
  );
}
