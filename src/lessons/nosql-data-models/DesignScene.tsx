import { Fragment, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { EXAMPLE_CUSTOMER, EXAMPLE_ORDER } from './canon';
import {
  CLUSTERINGS, PARTITION_KEYS, REQUIREMENT_SETS, ddl, evaluateDesign, partitionCount, totalsFor, type Clustering, type Design, type PartitionKey, type Serve,
} from './design';
import { MODELS, buildEngine, runQuery, type ModelId, type Params, type QueryId } from './engines';
import { QUERIES, modelLabel, newPriceFor } from './frames';

const TABLE_MIN_PX = 480;
const P: Params = { order: EXAMPLE_ORDER, customer: EXAMPLE_CUSTOMER, product: 'P1', newPrice: newPriceFor('P1') };
const HONEST = 'Lookup counts come from a simplified model of each store, every store prepared with the structures it would add (wide-column follows the table design above). Real databases add planners, indexes and caches.';

const SERVE_TONE: Record<Serve['kind'], 'ok' | 'orange' | 'bad'> = { one: 'ok', 'one-sorted-in-app': 'orange', scatter: 'bad' };
const SERVE_TEXT: Record<Serve['kind'], string> = { one: 'one partition', 'one-sorted-in-app': 'one partition, sorted by the app', scatter: 'every partition' };
const queryLabel = (q: QueryId) => QUERIES.find((x) => x.id === q)!.label;

export function DesignScene({ picker }: { picker: ReactNode }) {
  const [setId, setSetId] = useState(REQUIREMENT_SETS[0].id);
  const [model, setModel] = useState<ModelId>('wide');
  const [key, setKey] = useState<PartitionKey>('order_id');
  const [clustering, setClustering] = useState<Clustering>('id');
  const set = REQUIREMENT_SETS.find((s) => s.id === setId)!;
  const design: Design = { key, clustering };
  const verdict = evaluateDesign(set, design);
  const totals = totalsFor(set, design, P);
  const lo = Math.min(...Object.values(totals));
  const hi = Math.max(...Object.values(totals));
  const best = MODELS.filter((m) => totals[m.id] === lo).map((m) => m.label);
  const perModel = (m: ModelId, q: QueryId) => (m === 'wide' ? verdict.perQuery.find((x) => x.query === q)!.serve.partitions : runQuery(buildEngine(m, { prepared: true }), q, P).lookups);

  useIntroCaption(
    model === 'wide'
      ? <>Your wide-column table, partitioned by <code>{key}</code>, serves {verdict.served} of the 2 required queries from one partition
        {verdict.served < 2 ? <>; the other has to read {plural(verdict.perQuery.find((x) => x.serve.kind === 'scatter')!.serve.partitions, 'partition')}. One table per query is how wide-column stores are designed, at the price of a copy to keep in sync</> : ''}.
        {verdict.hot.level === 'bad' ? <> But that one partition takes all the traffic and data: a hot partition, so the low count is no bargain.</> : ''}
        {' '}Fewest lookups for this pair: {best.join(' and ')} ({lo}).</>
      : <>{modelLabel(model)} needs {totals[model]} lookups for these two queries; the fewest is {lo}, by {best.join(' and ')}. The wide-column column follows the table design below
        (partition key <code>{key}</code>{verdict.hot.level === 'bad' ? ', a hot partition' : ''}). No model is best at every pair of queries: change the required set.</>,
    [setId, model, key, clustering],
  );

  return (
    <StageFrame
      height={540}
      legend={<Legend items={[
        { color: 'var(--ok)', label: 'one partition / fewest lookups' },
        { color: 'var(--orange)', label: 'sorted in the application / a warning' },
        { color: 'var(--bad)', label: 'reads every partition / hot partition / most lookups' },
      ]} />}
      controls={[
        <Fragment key="scene">{picker}</Fragment>,
        <Segmented key="set" label="Required queries" value={setId} onChange={setSetId} options={REQUIREMENT_SETS.map((s) => ({ value: s.id, label: s.label }))} />,
        <ControlGroup key="model" label="Your model" inline>
          {MODELS.map((m) => <ChipButton key={m.id} tone="info" on={model === m.id} onClick={() => setModel(m.id)}>{m.label}</ChipButton>)}
        </ControlGroup>,
        <Fragment key="key">
          <Segmented label="Wide-column partition key" value={key} onChange={setKey} options={PARTITION_KEYS.map((k) => ({ value: k.id, label: k.label }))} />
          <Segmented label="Clustering" value={clustering} onChange={setClustering} options={CLUSTERINGS.map((c) => ({ value: c.id, label: c.label }))} />
        </Fragment>,
      ]}
    >
      <div className="stage-pad nm">
        <div className="nm-design">
            <SectionTitle weight="regular" hint={`${plural(partitionCount(key), 'partition')} in this data`}>Your wide-column table, one row per order line</SectionTitle>
            <p className="nm-table-def">{ddl({ key, clustering })}</p>
            <div className={`nm-hot tone-${verdict.hot.level === 'ok' ? 'ok' : verdict.hot.level === 'warn' ? 'orange' : 'bad'}`} role="status">
              <b>{verdict.hot.level === 'ok' ? 'Even spread' : verdict.hot.level === 'warn' ? 'Hot partitions likely' : 'Hot partition'}</b>: {verdict.hot.reason}.
            </div>
            <ul className="nm-serves">
              {verdict.perQuery.map((x) => (
                <li key={x.query} className={`tone-${SERVE_TONE[x.serve.kind]}`}>
                  <b>{queryLabel(x.query)}</b>: <span className="chip">{SERVE_TEXT[x.serve.kind]}</span> {x.serve.note}.
                </li>
              ))}
            </ul>
        </div>
        <SectionTitle weight="regular" hint="lookups, from the compare scene">The two queries in every model</SectionTitle>
        <WideRegion minWidth={TABLE_MIN_PX} label="Totals table: scroll sideways to see every model">
          <table className="data-table nm-compare-table" aria-label="Lookups for the two required queries in each model">
            <thead>
              <tr><th />{MODELS.map((m) => <th key={m.id} className={m.id === model ? 'is-selected' : undefined}>{m.label}</th>)}</tr>
            </thead>
            <tbody>
              {set.queries.map((q) => (
                <tr key={q}>
                  <th className="keep-case">{queryLabel(q)}</th>
                  {MODELS.map((m) => <td key={m.id}>{perModel(m.id, q)}</td>)}
                </tr>
              ))}
              <tr>
                <th>total</th>
                {MODELS.map((m) => <td key={m.id} className={lo === hi ? 'nm-plain' : totals[m.id] === lo ? 'nm-ok' : totals[m.id] === hi ? 'nm-bad' : 'nm-plain'}><b>{totals[m.id]}</b></td>)}
              </tr>
            </tbody>
          </table>
        </WideRegion>
        <Hint block>
          Access-pattern-first: write down the queries before choosing the model and the key. In a wide-column store a query that isn't served by the
          partition key has to read every partition: Cassandra refuses it unless you add ALLOW FILTERING or an index, and DynamoDB needs a Scan. {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}
