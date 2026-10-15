import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, SortTh, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { useIntroCaption } from '../../core/caption';
import { parseBoundedInt } from '../../core/parse';
import { sig } from '../../core/format';
import { planCaption } from './captions';
import { INDEXES, misestimate, planNodes, queryById, scanOf, sqlLines, type IndexId, type QueryId } from './model';
import { PlanTree } from './PlanTree';
import { DEFAULT_CONTROLS, PLAN_SCENES, effectiveInputs, initialControls, scenePlan, type PlanControls, type PlanSceneId } from './scenes';
import { planTextLines } from './textPlan';
import { DAYS, ORDERS, STATUSES } from './table';

const CUSTOMER_RANGE = { min: 1, max: ORDERS.customers };

const parseCustomer = (text: string) =>
  parseBoundedInt(text, {
    ...CUSTOMER_RANGE,
    messages: {
      empty: `Type a customer id from ${CUSTOMER_RANGE.min} to ${CUSTOMER_RANGE.max.toLocaleString('en-US')}.`,
      invalid: (typed) => `"${typed}" is not a customer id: use plain digits, like 4242.`,
      tooSmall: () => `Customer ids start at ${CUSTOMER_RANGE.min}.`,
      tooBig: () => `There are ${CUSTOMER_RANGE.max.toLocaleString('en-US')} customers.`,
    },
  });

const cost = (x: number): string => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface CandidateRow { id: string; label: string; total: number; trueTotal: number; times: number; chosen: boolean }
type CandidateKey = 'plan' | 'cost' | 'times' | 'truth';

export function PlanScene({ scene, picker }: { scene: PlanSceneId; picker: ReactNode }) {
  const def = PLAN_SCENES[scene];
  const [ctl, setCtl] = useState<PlanControls>(initialControls(scene));
  const [text, setText] = useState(String(DEFAULT_CONTROLS.customerId));
  const [refusal, setRefusal] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const [costed, setCosted] = useState(0);
  const set = (patch: Partial<PlanControls>) => {
    setCtl({ ...ctl, ...patch });
    setViewId(null);
    setCosted(0);
  };

  const e = effectiveInputs(scene, ctl);
  const query = queryById(e.query);
  const r = scenePlan(scene, ctl);
  const truth = scene === 'misestimate' ? scenePlan(scene, ctl, 'actual') : undefined;
  const chosen = r.candidates[r.chosen];
  const viewed = r.candidates.find((c) => c.id === viewId) ?? chosen;
  const nodes = planNodes(viewed.root);
  const node = nodes[Math.min(costed, nodes.length - 1)];
  const scan = scanOf(chosen.root);
  const off = misestimate(scan.estRows, scan.actualRows);

  const rowsForTable = r.candidates.map((c, i) => ({
    id: c.id, label: c.label, total: c.total, trueTotal: truth?.candidates[i].total ?? c.total, times: c.total / chosen.total, chosen: i === r.chosen,
  }));
  const { sorted, headerProps } = useSortedRows<CandidateRow, CandidateKey>(rowsForTable, { plan: (x) => x.label, cost: (x) => x.total, truth: (x) => x.trueTotal, times: (x) => x.times }, { key: 'cost' });

  useIntroCaption(planCaption(scene, r, e.analyze, truth), [scene, JSON.stringify(ctl)]);

  const onCustomer = (value: string) => {
    setText(value);
    const parsed = parseCustomer(value);
    if (parsed.ok) {
      setRefusal('');
      set({ customerId: parsed.value });
    } else setRefusal(parsed.error);
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Chosen plan" value={chosen.label.replace('Index Scan: ', 'Index: ')} color="var(--ok)" sub={`${r.candidates.length} candidate${r.candidates.length === 1 ? '' : 's'} costed`} />
          <Stat label="Total cost" value={cost(chosen.total)} sub="toy cost units" />
          <Stat label="Scan rows" value={`${Math.round(scan.estRows).toLocaleString('en-US')} est${e.analyze ? ` · ${scan.actualRows.toLocaleString('en-US')} actual` : ''}`} color={e.analyze && off.flagged ? 'var(--bad)' : undefined} sub={e.analyze ? (off.direction === 'exact' ? 'estimate was exact' : `off by ${sig(off.ratio, 2)}×`) : 'estimated, not yet run'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'chosen (cheapest)' },
            { color: 'var(--dim)', label: 'rejected candidate' },
            { color: 'var(--hi)', label: 'node being costed' },
            { color: 'var(--info)', label: 'index scan' },
            { color: 'var(--orange)', label: 'Sort' },
            { color: 'var(--bad)', label: 'estimate far from actual' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {def.queries.length > 1 && (
            <span className="qp-chips" role="group" aria-label="Query">
              {def.queries.map((id) => (
                <ChipButton key={id} tone="violet" on={e.query === id} onClick={() => set({ query: id as QueryId })}>{queryById(id).label}</ChipButton>
              ))}
            </span>
          )}
        </>,
        <>
          {query.where === 'customer_id' && (
            <>
              <TextField label="customer_id" value={text} onChange={onCustomer} sanitize={(s) => s.replace(/[^\d\s-]/g, '')} width={96} />
              {refusal && <Hint tone="muted">{refusal} Using {ctl.customerId} for now.</Hint>}
            </>
          )}
          {query.where === 'status' && (
            <Segmented label="status" value={ctl.status} onChange={(status) => set({ status })} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          )}
          {query.where === 'created_at' && (
            <Slider label="created_at >= day" value={ctl.day} min={1} max={DAYS} onChange={(day) => set({ day })} format={(d) => `${d} of ${DAYS}`} />
          )}
          {def.analyze === 'toggle' && <Toggle label="EXPLAIN" value={ctl.analyze} onChange={(analyze) => set({ analyze })} off="estimates only" on="ANALYZE (run it)" />}
        </>,
        ...(def.indexToggles.length || def.showStats
          ? [
              <>
                {def.indexToggles.length > 0 && (
                  <span className="qp-chips" role="group" aria-label="Indexes">
                    {INDEXES.filter((ix) => def.indexToggles.includes(ix.id)).map((ix) => (
                      <ChipButton key={ix.id} tone="info" on={ctl.indexes[ix.id]} onStyle="solid" onClick={() => set({ indexes: { ...ctl.indexes, [ix.id as IndexId]: !ctl.indexes[ix.id] } })}>
                        index ({ix.columns})
                      </ChipButton>
                    ))}
                  </span>
                )}
                {def.showStats && <Toggle label="Statistics" value={ctl.stats === 'stale'} onChange={(stale) => set({ stats: stale ? 'stale' : 'fresh' })} off="fresh" on="stale" />}
              </>,
            ]
          : []),
      ]}
    >
      <div className="qp-stage stage-pad">
        {!def.indexToggles.length && <p className="qp-pinned">Indexes in this scene: {INDEXES.filter((ix) => e.setup.indexes[ix.id]).map((ix) => `(${ix.columns})`).join(', ') || 'none'}. Statistics: {e.setup.stats}. Change them in the other scenes.</p>}
        <div className="qp-panels">
          <CodePanel title="SQL" lines={sqlLines(query, e.params)} gutter="none" />
          <div className="qp-tree">
            <PlanTree root={viewed.root} analyze={e.analyze} selected={Math.min(costed, nodes.length - 1)} onSelect={setCosted} rejected={viewed.id !== chosen.id} />
            <p className={`qp-formula ${viewed.id === chosen.id ? '' : 'is-rejected'}`} role="status">
              <b className="qp-costed">{node.kind}</b> costs {node.formula}
              {viewed.id !== chosen.id && <> This candidate was rejected: {cost(viewed.total)} against {cost(chosen.total)}.</>}
            </p>
          </div>
        </div>
        {def.textPlan && (
          <div className="qp-text">
            <CodePanel title="EXPLAIN output, PostgreSQL style" lines={planTextLines(viewed.root, e.analyze)} gutter="none" />
          </div>
        )}
        {def.candidatesTable && (
          <div className="qp-table-wrap" tabIndex={0} role="region" aria-label="Candidate plans, sortable by column">
            <table className="data-table qp-table">
              <thead>
                <tr>
                  <SortTh {...headerProps('plan')}>Candidate</SortTh>
                  <SortTh {...headerProps('cost')}>Cost</SortTh>
                  <SortTh {...headerProps('times')}>vs cheapest</SortTh>
                  {truth && <SortTh {...headerProps('truth')}>Cost, true rows</SortTh>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className={c.chosen ? 'is-chosen' : 'is-rejected'}>
                    <td>
                      <button type="button" className="qp-pick" aria-pressed={viewed.id === c.id} onClick={() => { setViewId(c.id); setCosted(0); }}>
                        {c.label}{c.chosen ? ' (chosen)' : ''}
                      </button>
                    </td>
                    <td>{cost(c.total)}</td>
                    <td>{c.chosen ? '1.00×' : `${sig(c.times, 3)}×`}</td>
                    {truth && <td>{cost(c.trueTotal)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">toy cost model and a toy table of {ORDERS.rows.toLocaleString('en-US')} rows, not PostgreSQL&apos;s planner</Provenance>
          {def.textPlan && <Provenance kind="not-run">the text plan is the EXPLAIN layout from memory: shown, not run</Provenance>}
          <Provenance kind="from-memory">cost constants are the PostgreSQL defaults as remembered: check the docs</Provenance>
        </ProvenanceRow>
        <p className="qp-note">Plans here start from the WHERE clause: the toy considers an index only when the clause tests its first column, so it can differ from a real planner (SQLite also walks a created_at index just to get rows in order).</p>
      </div>
    </StageFrame>
  );
}
