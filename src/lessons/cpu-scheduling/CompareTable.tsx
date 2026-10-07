import { WideRegion } from '../../components/WideRegion';
import { METRICS, policyLabel, type Comparison, type Metric, type Policy } from './model';

const show = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

/** 1-based rank of `policy` on `metric`: 1 + how many policies are strictly better. */
const rankOf = (c: Comparison, policy: Policy, metric: Metric) => {
  const mine = c.rows.find((r) => r.policy === policy)!.values[metric];
  return 1 + c.rows.filter((r) => r.values[metric] < mine - 1e-9).length;
};

/** Every policy on the same jobs; lower is better in every column, and the best is --ok. */
export function CompareTable({ c, current }: { c: Comparison; current: Policy }) {
  return (
    <div className="cs-compare">
      <WideRegion minWidth={560} label="Policy comparison: scroll sideways to see all of it" hint="swipe to see the whole table">
        <table className="data-table cs-table">
          <caption className="sr-only">Every policy on these jobs, lower is better; the rank is in brackets</caption>
          <thead>
            <tr>
              <th>Policy</th>
              {METRICS.map((m) => (
                <th key={m.id}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.policy}>
                <td>
                  {policyLabel(r.policy)}
                  {r.policy === current && <span className="cs-rank"> (shown)</span>}
                </td>
                {METRICS.map((m) => {
                  const best = c.winners[m.id].includes(r.policy);
                  return (
                    <td key={m.id} className={best ? 'cs-best' : ''}>
                      {show(r.values[m.id])} <span className="cs-rank">#{rankOf(c, r.policy, m.id)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </WideRegion>
      <p className="cs-verdict">
        {c.sweep
          ? `${policyLabel(c.sweep)} is best or tied best in every column for these jobs. The Starvation and Interactive + batch presets each break that sweep.`
          : `No single policy wins every column here: ${METRICS.map((m) => `${m.label} → ${c.winners[m.id].map(policyLabel).join('/')}`).join(', ')}.`}
      </p>
    </div>
  );
}
