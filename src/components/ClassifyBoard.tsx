import { useState, type ReactNode } from 'react';
import { allSorted, classifyScore, emptyClassify, pickCategory, sortedCount, type ClassifyState } from '../core/classify';
import { Button, ClaimLabel } from './ui';
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

/** Props both modes share. */
interface ClassifyBoardBaseProps {
  items: readonly ClassifyItem[];
  categories: readonly ClassifyCategory[];
  value: ClassifyState;
  onChange: (next: ClassifyState) => void;
  /** 'mono' draws item labels as <code> in the mono font (snippets, grammars); 'text' leaves them as plain text. */
  labelFont?: 'mono' | 'text';
  /**
   * Live-region politeness for the status line, the only live region on the board: it announces "3 of 8 right"
   * once per Check (explore mode: "3 of 8 placed" as items are placed) instead of every row chattering. 'off'
   * leaves it silent (for a stage that announces elsewhere).
   */
  status?: 'polite' | 'off';
  /** Accessible name of an item's category radio group. */
  groupLabel?: (item: ClassifyItem) => string;
}

/** The default mode: there is a right answer, Check shows a verdict per item and a score. */
interface ClassifyCheckProps extends ClassifyBoardBaseProps {
  mode?: 'check';
  /** Item id to the id of its correct category. */
  answerKey: Record<string, string>;
  /** The per-item line shown after Check (a plain span, not a live region). */
  verdict?: (info: ClassifyVerdictInfo) => ReactNode;
  reference?: never;
}

/** Explore mode: no key, no Check, no score and no per-item verdict; the placements are the lesson's input. */
interface ClassifyExploreProps extends ClassifyBoardBaseProps {
  mode: 'explore';
  answerKey?: never;
  verdict?: never;
  /**
   * One author's placement (item id to category id). Once every item is placed a button reveals it under each
   * item, beside a "one view, not the answer" claim label; it never marks the learner's placement right or wrong.
   */
  reference?: Record<string, string>;
}

export type ClassifyBoardProps = ClassifyCheckProps | ClassifyExploreProps;

const SHOW_REFERENCE = 'Show one reference';
const HIDE_REFERENCE = 'Hide the reference';

/**
 * The learner sorts each item into one of 2-5 categories (a keyboard-first radio row per item). In the default
 * `check` mode they press Check and get a per-item verdict plus a score; "Why?" reveals an item's explanation.
 * In `explore` mode (K4-10) there is no answer key: the board only reports how many items are placed, `onChange`
 * feeds the lesson's own model, and an optional `reference` can be revealed once everything is placed.
 * Controlled: the caller owns `value` (answers + checked) so its stage can read them for captions and stats;
 * Check (check mode) and Reset call `onChange` too. Starting value: `emptyClassify(items)` from core/classify.
 */
export function ClassifyBoard(props: ClassifyBoardProps) {
  const { items, categories, value, onChange, labelFont = 'text', status = 'polite', groupLabel = defaultGroupLabel } = props;
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [referenceShown, setReferenceShown] = useState(false);
  const { answers, checked } = value;
  const answerKey = props.answerKey;
  const reference = props.reference;
  const explore = props.mode === 'explore';
  const placed = sortedCount(items, answers);
  const everythingPlaced = allSorted(items, answers);
  const showReference = explore && reference !== undefined && referenceShown && everythingPlaced;
  const labelOf = (id: string): string => categories.find((c) => c.id === id)?.label ?? id;
  const categoryOf = (id: string): ClassifyCategory => categories.find((c) => c.id === answerKey?.[id]) ?? { id: answerKey?.[id] ?? id, label: answerKey?.[id] ?? id };

  const toggleReveal = (id: string) => {
    const next = new Set(revealed);
    if (!next.delete(id)) next.add(id);
    setRevealed(next);
  };
  const reset = () => {
    setRevealed(new Set());
    setReferenceShown(false);
    onChange(emptyClassify(items));
  };
  const Label = labelFont === 'mono' ? 'code' : 'span';

  return (
    <div className="classify-board">
      <ul className="classify-items">
        {items.map((item) => {
          const picked = answers[item.id] ?? null;
          const right = picked === answerKey?.[item.id];
          const open = revealed.has(item.id);
          const verdict = props.verdict ?? defaultVerdict;
          return (
            <li key={item.id} className={`classify-item${checked && !explore ? (right ? ' is-right' : ' is-wrong') : ''}`}>
              <Label className={`classify-label${labelFont === 'mono' ? ' is-mono' : ''}`}>{item.label}</Label>
              <CategoryRow item={item} categories={categories} value={picked} groupLabel={groupLabel} onPick={(c) => onChange(pickCategory(value, item.id, c))} />
              <div className="classify-verdict">
                {checked && !explore && <span>{verdict({ right, sorted: picked !== null, correct: categoryOf(item.id) })}</span>}
                {showReference && reference[item.id] !== undefined && <span className="classify-ref">Reference: {labelOf(reference[item.id])}</span>}
                {item.explanation != null && <Button aria-expanded={open} onClick={() => toggleReveal(item.id)}>{open ? 'Hide why' : 'Why?'}</Button>}
              </div>
              {open && item.explanation != null && <p className="classify-why">{item.explanation}</p>}
            </li>
          );
        })}
      </ul>
      <div className="classify-actions">
        {!explore && <Button variant="primary" onClick={() => onChange({ answers, checked: true })}>Check</Button>}
        {explore && reference !== undefined && (
          <Button variant="primary" softDisabled={!everythingPlaced} onClick={() => setReferenceShown(!referenceShown)}>
            {showReference ? HIDE_REFERENCE : SHOW_REFERENCE}
          </Button>
        )}
        <Button onClick={reset}>Reset</Button>
        <span {...(status === 'polite' ? { role: 'status' } : {})} className="classify-score">
          {explore
            ? `${placed} of ${items.length} placed${reference !== undefined && !everythingPlaced ? ': place every item to see a reference' : ''}`
            : checked ? `${classifyScore(items, answerKey ?? {}, answers)} of ${items.length} right` : `${placed} of ${items.length} sorted`}
        </span>
        {showReference && <ClaimLabel kind="view">not the answer</ClaimLabel>}
      </div>
    </div>
  );
}
