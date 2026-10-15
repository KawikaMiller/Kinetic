import { useMemo } from 'react';
import { Tray } from '../../components/Panel';
import { agreement, type Tables } from './join';

/** Chips shown before "and N more": the result can be a hundred pairs in the many-to-many shape. */
const MAX_CHIPS = 30;

/** The join's rows, and the live check that every algorithm returns exactly them (hash both in memory and spilling). */
export function ResultPanel({ tables }: { tables: Tables }) {
  const { pairs, agree } = useMemo(() => agreement(tables), [tables]);
  const chips = pairs.slice(0, MAX_CHIPS).map(([a, b]) => <span key={`${a}-${b}`} className="ja-pair">c{a}·o{b}</span>);
  if (pairs.length > MAX_CHIPS) chips.push(<span key="more" className="ja-pair is-more">and {pairs.length - MAX_CHIPS} more</span>);
  return (
    <div className="ja-result">
      <p className={`ja-agree ${agree ? 'is-ok' : 'is-bad'}`} role="status">
        {agree ? `Nested loop, index nested loop, hash join (in memory and spilling) and merge join all return the same ${pairs.length} ${pairs.length === 1 ? 'pair' : 'pairs'}.` : 'The algorithms disagree on this input.'}
      </p>
      <Tray label="Joined rows (customer, order)" empty="no pairs: no key in common" ariaLabel="Joined rows">{chips}</Tray>
    </div>
  );
}
