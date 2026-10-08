import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { toneVar } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { EXAMPLE_CUSTOMER, EXAMPLE_ORDER, PRODUCTS } from './canon';
import { MODELS, buildEngine, buildGraph, extremes, runQuery, type ModelId, type Params, type QueryId, type Result } from './engines';
import { QUERIES, modelLabel, newPriceFor, queryFrames, recordTones, type QueryFrame } from './frames';
import { GraphModel, RecordGrid, StorageView } from './Views';

const STEP_MS = 1500;
const HONEST = 'Lookup counts come from a simplified model of each store; real databases add indexes, caches and batching. The dataset is tiny on purpose: 16 orders.';

const MODEL_LEGEND = (
  <Legend items={[
    { color: 'var(--hi)', label: 'record being read now' },
    { color: 'var(--info)', label: 'already read' },
    { color: 'var(--orange)', label: 'record rewritten by an update' },
    { color: 'var(--violet)', label: 'embedded sub-document' },
    { color: 'var(--ok)', label: 'cheapest model' },
    { color: 'var(--bad)', label: 'costliest model' },
  ]} />
);

export function ModelsScene({ picker }: { picker: ReactNode }) {
  const [model, setModel] = useState<ModelId>('document');
  const [query, setQuery] = useState<QueryId>('price');
  const [product, setProduct] = useState('P1');
  const [prepared, setPrepared] = useState(true);
  const params = useMemo<Params>(() => ({ order: EXAMPLE_ORDER, customer: EXAMPLE_CUSTOMER, product, newPrice: newPriceFor(product) }), [product]);
  const engine = useMemo(() => buildEngine(model, { prepared }), [model, prepared]);
  const result = useMemo(() => runQuery(engine, query, params), [engine, query, params]);
  const frames = useMemo(() => queryFrames(model, query, result, params, prepared), [model, query, result, params, prepared]);
  const player = usePlayer<QueryFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const step = player.frame.step;
  const tones = recordTones(result, step);
  const soFar = result.steps.slice(0, step + 1).reduce((s, x) => s + x.count, 0);
  const runs = useMemo(() => Object.fromEntries(MODELS.map((m) => [m.id, runQuery(buildEngine(m.id, { prepared }), query, params)])) as Record<ModelId, Result<unknown>>, [query, prepared, params]);
  const unprepared = useMemo(() => ({
    scan: runQuery(buildEngine('kv'), 'also', params).lookups,
    nested: runQuery(buildEngine('relational'), 'also', params).lookups,
  }), [params]);
  const ext = extremes(query, runs);
  const done = step >= result.steps.length;

  return (
    <StageFrame
      player={player}
      height={600}
      legend={MODEL_LEGEND}
      stats={
        <Stats>
          <Stat label="lookups so far" value={soFar} />
          <Stat label="round trips" value={done ? result.roundTrips : '…'} />
          {query === 'price' && <Stat label="copies to update" value={done ? result.copies ?? 0 : '…'} color={done ? toneVar('orange') : undefined} />}
        </Stats>
      }
      controls={[
        <Fragment key="scene">{picker}<Segmented label="Model" value={model} onChange={setModel} options={MODELS.map((m) => ({ value: m.id, label: m.label }))} /></Fragment>,
        <ControlGroup key="queries" label="Query" inline>
          {QUERIES.map((q) => <ChipButton key={q.id} tone="info" on={query === q.id} onClick={() => setQuery(q.id)}>{q.label}</ChipButton>)}
        </ControlGroup>,
        <Fragment key="params">
          <Segmented label="Product (price and also-bought)" value={product} onChange={setProduct} options={PRODUCTS.map((p) => ({ value: p.id, label: `${p.id} ${p.name}` }))} />
          <Toggle label="Prepare each store for these queries" value={prepared} onChange={setPrepared} off="Unprepared" on="Prepared" />
        </Fragment>,
      ]}
    >
      <div className="stage-pad nm">
        <div className="nm-row">
          <div className="nm-records">
            <SectionTitle weight="regular" hint={modelLabel(model)}>What the store holds</SectionTitle>
            {model === 'graph'
              ? <GraphModel rep={buildGraph()} tones={tones} showBought={query === 'also'} />
              : <RecordGrid groups={engine.groups()} tones={tones} />}
          </div>
          <div className="nm-storage">
            <StorageView engine={engine} orderId={EXAMPLE_ORDER} />
            {model === 'document' && <Hint block>The violet lines are embedded sub-documents: a copy of each product's name and price, taken when the order was placed.</Hint>}
          </div>
        </div>
        <CompareTable runs={runs} query={query} selected={model} ext={ext} />
        <Hint block>
          Prepared adds what each store would add for these queries: relational a covering index and a purchases summary table, document a covering index and a
          purchased list on each customer, key-value index keys. Wide-column (tables built per query) and graph (BOUGHT edges) always carry theirs. Every one of
          those is another copy the application must keep up to date. One lookup is a keyed read or write, an index probe, a whole partition, or a node with its edge list.
        </Hint>
        {query === 'also' && (
          <Hint block>
            Prepared, every model answers in the same number of lookups: a graph pays off on multi-hop questions (friends of friends), not one hop over a list
            someone already precomputed. Unprepared, a full scan ({unprepared.scan} records) beats the relational nested-loop plan ({unprepared.nested} lookups) at this
            size; scans lose as data grows, index lookups don't.
          </Hint>
        )}
        {query === 'last10' && (
          <Hint block>
            Graph databases can index properties, which this model doesn't; here a graph has no ordering to read the newest 10 from, so it reads every order of the customer.
          </Hint>
        )}
        <Hint block>
          The price in an order is what the customer paid, so real order history should keep its snapshot; this query shows what "everywhere" costs when
          a fact you copied into many records really has to change (a product's name, say). {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

function CompareTable({ runs, query, selected, ext }: {
  runs: Record<ModelId, Result<unknown>>;
  query: QueryId;
  selected: ModelId;
  ext: ReturnType<typeof extremes>;
}) {
  const mark = (m: ModelId) => (ext.cheapest.includes(m) ? 'ok' : ext.costliest.includes(m) ? 'bad' : '');
  return (
    <div className="nm-compare">
      <SectionTitle weight="regular" hint={query === 'price' ? 'ranked by copies, then lookups' : 'ranked by lookups'}>The same query in every model</SectionTitle>
      <table className="data-table nm-compare-table" aria-label="Cost of this query in each model">
        <thead>
          <tr>{MODELS.map((m) => <th key={m.id} className={m.id === selected ? 'is-selected' : undefined}>{m.label}</th>)}</tr>
        </thead>
        <tbody>
          <tr>{MODELS.map((m) => <td key={m.id} className={`nm-${mark(m.id) || 'plain'}`}><b>{runs[m.id].lookups}</b> {runs[m.id].lookups === 1 ? 'lookup' : 'lookups'}</td>)}</tr>
          <tr>{MODELS.map((m) => <td key={m.id}>{runs[m.id].roundTrips} round {runs[m.id].roundTrips === 1 ? 'trip' : 'trips'}</td>)}</tr>
          {query === 'price' && <tr>{MODELS.map((m) => <td key={m.id}>{runs[m.id].copies} {runs[m.id].copies === 1 ? 'copy' : 'copies'}</td>)}</tr>}
          <tr>{MODELS.map((m) => <td key={m.id} className="nm-verdict">{ext.cheapest.includes(m.id) ? 'cheapest' : ext.costliest.includes(m.id) ? 'costliest' : ''}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}
