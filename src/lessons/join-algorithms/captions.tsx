import type { ReactNode } from 'react';
import { joinList, plural, ratioText } from '../../core/format';
import { SHORT_LABEL, type Cond, type Tables, type VerdictRow } from './join';

const names = (rows: readonly VerdictRow[], verdict: VerdictRow['verdict']): string => {
  const list = rows.filter((r) => r.verdict === verdict).map((r) => SHORT_LABEL[r.id]);
  return joinList(list);
};

/** Scene 4's caption: the verdicts in the table, in the table's own numbers. */
export function costCaption(rows: readonly VerdictRow[], t: Tables, cond: Cond): ReactNode {
  const run = rows.filter((r) => r.cost !== null);
  const best = rows.find((r) => r.verdict === 'cheapest')!;
  const worst = rows.find((r) => r.verdict === 'dearest');
  if (cond === 'lt') {
    return (
      <>
        A non-equality join (a.key &lt; b.key) leaves {run.length === 1 ? <>only the <span className="hl ok">{SHORT_LABEL[best.id].toLowerCase()}</span></> : 'few options'}: {best.cost} comparisons. The others are refused because a hash or a sorted run can only find rows with the same key.
      </>
    );
  }
  return (
    <>
      On {plural(t.a.length, 'customer')} and {plural(t.b.length, 'order')} the cheapest is <span className="hl ok">{names(rows, 'cheapest')}</span> at {best.cost} {best.cost === 1 ? 'unit' : 'units'}
      {worst ? <>; the dearest is <span className="hl bad">{names(rows, 'dearest')}</span> at {worst.cost}, {ratioText(worst.cost! / Math.max(1, best.cost!))}× as much</> : <>; every algorithm costs the same here</>}.
    </>
  );
}
