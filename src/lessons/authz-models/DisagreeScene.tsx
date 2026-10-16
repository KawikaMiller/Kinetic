import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useSortedRows } from '../../components/useSortedRows';
import { Legend, Provenance, ProvenanceRow, Segmented, SortTh, Stat, Stats } from '../../components/ui';
import { disagreeCaption } from './captions';
import { MODELS, disagreementRows, type ModelId, type Row } from './models';
import { OrgEdits } from './OrgEdits';
import { OPENING } from './opening';
import { REQUIREMENTS, type Org } from './org';

const COLUMNS = {
  user: (r: Row) => r.user.name,
  action: (r: Row) => r.action,
  doc: (r: Row) => r.doc.name,
  acl: (r: Row) => Number(r.decisions.acl),
  rbac: (r: Row) => Number(r.decisions.rbac),
  abac: (r: Row) => Number(r.decisions.abac),
  rebac: (r: Row) => Number(r.decisions.rebac),
  disagree: (r: Row) => Number(r.disagree),
  wrong: (r: Row) => r.wrong.length,
};
type Key = keyof typeof COLUMNS;

const cell = (r: Row, m: ModelId) => (
  <td key={m} className={r.wrong.includes(m) ? 'az-wrong' : undefined}>{r.decisions[m] ? 'yes' : 'no'}</td>
);

/** Scene 2: every question under every model, sortable by disagreement, against a stated requirement. */
export function DisagreeScene({ picker, org, setOrg }: { picker: ReactNode; org: Org; setOrg: (next: Org) => void }) {
  const [req, setReq] = useState(OPENING.requirement);
  const rows = useMemo(() => disagreementRows(org, req), [org, req]);
  const { sorted, headerProps } = useSortedRows<Row, Key>(rows, COLUMNS, { key: 'disagree', ascending: false });
  const disagree = rows.filter((r) => r.disagree).length;
  const wrong = rows.filter((r) => r.wrong.length > 0).length;
  const text = REQUIREMENTS.find((r) => r.id === req)!.text;

  return (
    <StageFrame
      height={680}
      intro={disagreeCaption(rows, req)}
      introKey={`${rows.length}|${disagree}|${wrong}|${req}`}
      stats={
        <Stats>
          <Stat label="Questions" value={rows.length} sub="users x actions x documents" />
          <Stat label="Models disagree" value={disagree} color={disagree ? 'var(--hi)' : undefined} sub="not all four say the same" />
          <Stat label="Differ from the requirement" value={wrong} color={wrong ? 'var(--bad)' : 'var(--ok)'} sub="at least one model's answer" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the models disagree on this row', shape: 'square' },
            { color: 'var(--bad)', label: 'this model differs from the requirement', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Requirement" value={req} options={REQUIREMENTS.map((r) => ({ value: r.id, label: r.label }))} onChange={setReq} />
        </>,
        <OrgEdits key="edits" org={org} setOrg={setOrg} />,
      ]}
    >
      <div className="az-stage stage-pad">
        <p className="az-note">Requirement: {text} Edit the organisation in the first scene, or use the switches below.</p>
        <Box className="az-panel az-scroll" role="region" aria-label="Every question under every model" tabIndex={0}>
          <table className="data-table az-table">
            <thead>
              <tr>
                <SortTh {...headerProps('user')}>User</SortTh>
                <SortTh {...headerProps('action')}>Action</SortTh>
                <SortTh {...headerProps('doc')}>Document</SortTh>
                {MODELS.map((m) => <SortTh key={m.id} {...headerProps(m.id)}>{m.label}</SortTh>)}
                <SortTh {...headerProps('disagree')}>Models disagree</SortTh>
                <SortTh {...headerProps('wrong')}>Models wrong</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className={r.disagree ? 'az-disagree' : undefined}>
                  <td>{r.user.name}</td>
                  <td>{r.action}</td>
                  <td>{r.doc.name}</td>
                  {MODELS.map((m) => cell(r, m.id))}
                  <td>{r.disagree ? 'yes' : 'no'}</td>
                  <td>{r.wrong.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">an invented organisation; the "right" answer comes from the stated requirement, evaluated directly on the attributes</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
