import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import {
  DELETED_ORDER, NEW_EMAIL, STAGE_LABEL, joinCount, normalForm, runAnomaly, schemaAt, violations, type AnomalyId, type AnomalyRun, type StageId,
} from './model';

const code = (s: string) => <code>{s}</code>;

export const ANOMALIES: { id: AnomalyId; label: string; name: string }[] = [
  { id: 'update', label: "Change Ada's email in one row", name: 'update anomaly' },
  { id: 'delete', label: `Delete order ${DELETED_ORDER}`, name: 'deletion anomaly' },
  { id: 'insert', label: 'Add a product nobody has ordered', name: 'insertion anomaly' },
];

/** What the design is and what's wrong with it, from the checker. */
export function stageCaption(stage: StageId): ReactNode {
  const s = schemaAt(stage);
  const nf = normalForm(s);
  const v = s.flatMap((t) => violations(t));
  const first = v.find((x) => x.form === '1NF') ?? v.find((x) => x.form === '2NF') ?? v.find((x) => x.form === '3NF') ?? v[0];
  const tables = plural(s.length, 'table');
  if (!first) {
    return <>{STAGE_LABEL[stage]}: {tables}, and in each one every dependency's left side is a key. That's 3NF, and BCNF as well. Each fact is stored once;
      printing an invoice now takes {plural(joinCount(stage), 'join')}.</>;
  }
  const breaks = first.form;
  return <>{STAGE_LABEL[stage]} ({tables}): the checker finds it in <b>{nf}</b>. It breaks <span className="hl bad">{breaks}</span>
    {first.fd ? <> on {code(`${first.fd.lhs.join(', ')} → ${first.fd.rhs.join(', ')}`)}</> : ''}: {first.why}.</>;
}

/** What an anomaly did here, from its own run. */
export function anomalyCaption(stage: StageId, id: AnomalyId, run: AnomalyRun = runAnomaly(id, schemaAt(stage))): ReactNode {
  const at = STAGE_LABEL[stage];
  switch (id) {
    case 'update': {
      const others = run.inconsistent.size - 1;
      return run.ok
        ? <>At {at}, Ada's email lives in one row, so changing it there changes it everywhere: <span className="hl ok">no update anomaly</span>.</>
        : <>The app changed Ada's email to {code(NEW_EMAIL)} in one row, but {plural(others, 'other copy', 'other copies')} still say the old one: the
          database now <span className="hl bad">disagrees with itself</span> (an update anomaly). Every copy must be found and changed, every time.</>;
    }
    case 'delete':
      return run.ok
        ? <>Order {DELETED_ORDER} is gone ({plural(run.touched, 'row')}), and nothing else went with it: <span className="hl ok">no deletion anomaly</span>.</>
        : <>Deleting order {DELETED_ORDER} ({plural(run.touched, 'row')}) also deleted facts that had nothing to do with it: the database no longer knows
          the <span className="hl bad">{run.lost.join(' or the ')}</span> (a deletion anomaly).</>;
    case 'insert':
      return run.ok
        ? <>The new product goes into its own table with no order needed: <span className="hl ok">no insertion anomaly</span>.</>
        : <>Can't add it: {run.refused}. To record a product, you'd need a fake order or NULLs in the key (an <span className="hl bad">insertion anomaly</span>).</>;
  }
}
