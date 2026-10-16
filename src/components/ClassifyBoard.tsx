import { useState, type ReactNode } from 'react';
import { classifyScore, emptyClassify, pickCategory, sortedCount, type ClassifyState } from '../core/classify';
import { Button } from './ui';
import { useRadioGroup } from './useRadioGroup';
import './classifyBoard.css';

export interface ClassifyItem {
  id: string;
  /** What the learner sees: text or any node. */
  label: ReactNode;
  /** Plain-text name for the item's radio group; falls back to `label` when that is a string, else the id. */
  text?: string;
  /** Shown under the row after "Why?"; an item without one has no Why button. */
  explanation?: ReactNode;
}
export interface ClassifyCategory {
  id: string;
  label: string;
}
/** What a verdict line is built from. */
export interface ClassifyVerdictInfo {
  right: boolean;
  sorted: boolean;
  correct: ClassifyCategory;
}

const defaultVerdict = ({ right, sorted, correct }: ClassifyVerdictInfo): ReactNode =>
  right ? 'Right.' : `${sorted ? 'Not quite' : 'Not sorted'}: it is ${correct.label.toLowerCase()}.`;

const defaultGroupLabel = (item: ClassifyItem): string => `Category of ${item.text ?? (typeof item.label === 'string' ? item.label : item.id)}`;

function CategoryRow({ item, categories, value, onPick, groupLabel }: {
  item: ClassifyItem;
  categories: readonly ClassifyCategory[];
  value: string | null;
  onPick: (categoryId: string) => void;
  groupLabel: (item: ClassifyItem) => string;
}) {
  const radio = useRadioGroup(categories.length, categories.findIndex((c) => c.id === value), (i) => onPick(categories[i].id));
  return (
    <div className="classify-cats" role="radiogroup" aria-label={groupLabel(item)}>
      {categories.map((c, i) => (
        <button key={c.id} type="button" {...radio.itemProps(i)} className={`classify-cat${c.id === value ? ' is-on' : ''}`} onClick={() => onPick(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The learner sorts each item into one of 2-5 categories (a keyboard-first radio row per item), presses Check, and
 * gets a per-item verdict plus a score; "Why?" reveals an item's explanation. Controlled: the caller owns `value`
 * (answers + checked) so its stage can read them for captions and stats; Check and Reset call `onChange` too.
 * Starting value: `emptyClassify(items)` from core/classify.
 */
export function ClassifyBoard({
  items, categories, answerKey, value, onChange, labelFont = 'text', verdict = defaultVerdict, status = 'polite', groupLabel = defaultGroupLabel,
}: {
  items: readonly ClassifyItem[];
  categories: readonly ClassifyCategory[];
  /** Item id to the id of its correct category. */
  answerKey: Record<string, string>;
  value: ClassifyState;
  onChange: (next: ClassifyState) => void;
  /** 'mono' draws item labels as <code> in the mono font (snippets, grammars); 'text' leaves them as plain text. */
  labelFont?: 'text' | 'mono';
  /** The per-item line shown after Check (a plain span, not a live region). */
  verdict?: (info: ClassifyVerdictInfo) => ReactNode;
  /**
   * Live-region politeness for the score line, the only live region on the board: it announces "3 of 8 right"
   * once per Check instead of every row chattering. 'off' leaves it silent (for a stage that announces elsewhere).
   */
  status?: 'polite' | 'off';
  /** Accessible name of an item's category radio group. */
  groupLabel?: (item: ClassifyItem) => string;
}) {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const { answers, checked } = value;
  const categoryOf = (id: string): ClassifyCategory => categories.find((c) => c.id === answerKey[id]) ?? { id: answerKey[id], label: answerKey[id] };

  const toggleReveal = (id: string) => {
    const next = new Set(revealed);
    if (!next.delete(id)) next.add(id);
    setRevealed(next);
  };
  const reset = () => {
    setRevealed(new Set());
    onChange(emptyClassify(items));
  };
  const Label = labelFont === 'mono' ? 'code' : 'span';

  return (
    <div className="classify-board">
      <ul className="classify-items">
        {items.map((item) => {
          const picked = answers[item.id] ?? null;
          const right = picked === answerKey[item.id];
          const open = revealed.has(item.id);
          return (
            <li key={item.id} className={`classify-item${checked ? (right ? ' is-right' : ' is-wrong') : ''}`}>
              <Label className={`classify-label${labelFont === 'mono' ? ' is-mono' : ''}`}>{item.label}</Label>
              <CategoryRow item={item} categories={categories} value={picked} groupLabel={groupLabel} onPick={(c) => onChange(pickCategory(value, item.id, c))} />
              <div className="classify-verdict">
                {checked && <span>{verdict({ right, sorted: picked !== null, correct: categoryOf(item.id) })}</span>}
                {item.explanation != null && <Button aria-expanded={open} onClick={() => toggleReveal(item.id)}>{open ? 'Hide why' : 'Why?'}</Button>}
              </div>
              {open && item.explanation != null && <p className="classify-why">{item.explanation}</p>}
            </li>
          );
        })}
      </ul>
      <div className="classify-actions">
        <Button variant="primary" onClick={() => onChange({ answers, checked: true })}>Check</Button>
        <Button onClick={reset}>Reset</Button>
        <span {...(status === 'polite' ? { role: 'status' } : {})} className="classify-score">
          {checked ? `${classifyScore(items, answerKey, answers)} of ${items.length} right` : `${sortedCount(items, answers)} of ${items.length} sorted`}
        </span>
      </div>
    </div>
  );
}
