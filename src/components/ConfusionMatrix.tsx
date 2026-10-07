import { NA, pct } from '../core/format';
import { classificationMetrics, type Confusion } from '../core/stats';
import { CONFUSION_TONE, type ConfusionCell } from './confusionTone';

export { CONFUSION_TONE, type ConfusionCell } from './confusionTone';

const CELL_NAME: Record<ConfusionCell, string> = {
  tp: 'true positive',
  fp: 'false positive',
  fn: 'false negative',
  tn: 'true negative',
};

/** A metric as a percentage, or a dash when it's undefined (its denominator is 0). */
const metric = (v: number) => (Number.isNaN(v) ? NA : pct(v, 1));

/**
 * A 2×2 confusion matrix: rows are the actual class, columns the prediction. Each cell
 * shows its count (and, with `share`, its share of all examples). Below it, precision,
 * recall, accuracy and F1 from core/stats (`metrics={false}` hides them). `highlight`
 * rings one cell, e.g. the one a lesson's sentence is about.
 */
export function ConfusionMatrix({
  tp, fp, fn, tn, labels = { positive: 'positive', negative: 'negative' }, highlight, share = false, metrics = true, className = '',
}: Confusion & {
  /** Names for the two classes ("sick" / "healthy", "spam" / "not spam"). */
  labels?: { positive: string; negative: string };
  highlight?: ConfusionCell;
  /** Show each count's share of the total under it. */
  share?: boolean;
  metrics?: boolean;
  className?: string;
}) {
  const counts: Confusion = { tp, fp, fn, tn };
  const total = tp + fp + fn + tn;
  const m = classificationMetrics(counts);

  const cell = (k: ConfusionCell) => (
    <td className={`confusion-cell tone-${CONFUSION_TONE[k]} ${highlight === k ? 'is-highlight' : ''}`}>
      <span className="confusion-abbr">{k.toUpperCase()}</span>
      <span className="confusion-count">{counts[k].toLocaleString('en-US')}</span>
      {share && <span className="confusion-share">{total ? pct(counts[k] / total, 1) : NA}</span>}
      <span className="sr-only">{CELL_NAME[k]}s</span>
    </td>
  );

  return (
    <div className={`confusion ${className}`}>
      <table className="confusion-table">
        <thead>
          <tr>
            <td />
            <th scope="colgroup" colSpan={2} className="confusion-axis">
              predicted
            </th>
          </tr>
          <tr>
            <th scope="col" className="confusion-axis">
              actual
            </th>
            <th scope="col">{labels.positive}</th>
            <th scope="col">{labels.negative}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{labels.positive}</th>
            {cell('tp')}
            {cell('fn')}
          </tr>
          <tr>
            <th scope="row">{labels.negative}</th>
            {cell('fp')}
            {cell('tn')}
          </tr>
        </tbody>
      </table>
      {metrics && (
        <dl className="confusion-metrics">
          <div>
            <dt>precision</dt>
            <dd>{metric(m.precision)}</dd>
          </div>
          <div>
            <dt>recall</dt>
            <dd>{metric(m.recall)}</dd>
          </div>
          <div>
            <dt>accuracy</dt>
            <dd>{metric(m.accuracy)}</dd>
          </div>
          <div>
            <dt>F1</dt>
            <dd>{metric(m.f1)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
