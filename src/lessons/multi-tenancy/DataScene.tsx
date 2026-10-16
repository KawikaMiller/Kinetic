import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer } from '../../core/format';
import { dataCaption } from './captions';
import { COSTS, ISOLATIONS, ISOLATION_NAME, SHOPS, TENANT_COUNT, listOrders, type Isolation } from './data';
import { initialData, type DataState } from './init';

/** The tenant the query runs as. */
const CALLER = SHOPS[0];

export function DataScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<DataState>(initialData);
  const result = useMemo(() => listOrders(s.model, CALLER, { filtered: false, rowLevelSecurity: s.rowLevelSecurity }), [s.model, s.rowLevelSecurity]);

  useIntroCaption(dataCaption(s.model, s.ran, CALLER, result, s.rowLevelSecurity), [s.model, s.ran, s.rowLevelSecurity]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Rows returned" value={s.ran ? result.rows.length : 'not run'} sub={[`for ${CALLER}`]} />
          <Stat label="From other tenants" value={s.ran ? result.leaked : 'not run'} color={s.ran ? (result.leaked ? 'var(--bad)' : 'var(--ok)') : undefined} sub={['rows that are not this tenant\'s']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a row of the calling tenant' },
            { color: 'var(--bad)', label: 'a row of another tenant that came back' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Design" value={s.model} onChange={(model: Isolation) => setS((x) => ({ ...x, model }))} options={ISOLATIONS.map((m) => ({ value: m, label: ISOLATION_NAME[m] }))} />
        </>,
        <>
          <Button variant="primary" onClick={() => setS((x) => ({ ...x, ran: true }))}>Run the query that forgets the tenant filter</Button>
          {s.model === 'pooled' && <Toggle label="Row-level security" value={s.rowLevelSecurity} onChange={(rowLevelSecurity) => setS((x) => ({ ...x, rowLevelSecurity }))} off="off" on="on" />}
          <Button onClick={() => setS(initialData())}>Reset</Button>
        </>,
      ]}
    >
      <div className="mt-stage stage-pad">
        <Box>
          <SectionTitle hint={`the application runs this as ${CALLER}`}>The query</SectionTitle>
          <pre className="mt-sql"><code>{result.sql}</code></pre>
          <p className="mt-note">The tenant filter is missing, as if a developer forgot it.</p>
        </Box>
        <Box>
          <SectionTitle hint="orders">What came back</SectionTitle>
          {s.ran ? (
            <div className="mt-table-wrap">
              <table className="data-table mt-table">
                <thead>
                  <tr><th>Id</th><th>Tenant</th><th>Item</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id} className={r.tenant === CALLER ? 'is-ok' : 'is-hurt'}>
                      <td>{r.id}</td>
                      <th scope="row">{r.tenant}</th>
                      <td>{r.item}</td>
                      <td>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-note">Nothing yet. Run the query.</p>
          )}
        </Box>
        <Box>
          <SectionTitle hint={`illustrative, for ${integer(TENANT_COUNT)} tenants`}>The three designs side by side</SectionTitle>
          <div className="mt-table-wrap">
            <table className="data-table mt-table">
              <thead>
                <tr><th>Design</th><th>Cost per tenant a month</th><th>Tenants one unfiltered query can return</th><th>Tenants sharing one failure</th><th>Times a migration runs</th></tr>
              </thead>
              <tbody>
                {ISOLATIONS.map((m) => (
                  <tr key={m} className={m === s.model ? 'is-actor' : ''}>
                    <th scope="row">{ISOLATION_NAME[m]}</th>
                    <td>{COSTS[m].costPerTenant}</td>
                    <td>{integer(COSTS[m].leakReach(TENANT_COUNT))}</td>
                    <td>{integer(COSTS[m].sharedFate(TENANT_COUNT))}</td>
                    <td>{integer(COSTS[m].migrations(TENANT_COUNT))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Hint tone="muted" block>
          Row-level security (as in PostgreSQL, from memory) makes the database apply the tenant filter whatever the query says, so a forgotten filter is safe. A schema or database per tenant removes the mistake, and costs more to run.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="invented">the shops and their orders are made up; no real company is meant</Provenance>
          <Provenance kind="illustrative">the costs, the effort and the number of tenants are made up; check your own platform</Provenance>
          <Provenance kind="from-memory">row-level security as PostgreSQL describes it; verify against its documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
