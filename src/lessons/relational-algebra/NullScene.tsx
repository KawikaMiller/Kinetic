import { Fragment, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import type { Tone } from '../../core/tone';
import { nullCaption } from './frames';
import { NULL_QUERIES, runNullQuery, type NullQueryId, type Tri } from './nulls';
import { RelTable, type ShownRow } from './RelTable';

const TRI_TONE: Record<Tri, Tone> = { TRUE: 'ok', FALSE: 'dim', UNKNOWN: 'orange' };
const TABLES_MIN_PX = 460;

const NULL_HONEST = "Evaluated by the lesson's own engine with SQL's NULL rules; every query here is checked against SQLite in tests.";

export function NullScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<NullQueryId>('not-in');
  const [fixed, setFixed] = useState(false);
  const [unknownToggle, setUnknownToggle] = useState(true);
  const q = NULL_QUERIES.find((x) => x.id === id)!;
  // The NULL-sid enrolment only matters to NOT IN; every other query pins it off so a hidden toggle can't move its numbers.
  const unknown = id === 'not-in' && unknownToggle;
  const variant = fixed ? 'fix' : 'trap';
  const run = runNullQuery(id, variant, unknown);
  useIntroCaption(nullCaption(id, variant, unknown, run), [id, variant, unknown]);

  const tested: ShownRow[] = run.tested
    ? run.tested.rows.map((cells, i) => {
      const t = run.tested!.verdict[i];
      return { key: `t${i}`, cells, tone: t === 'TRUE' ? 'ok' : t === 'UNKNOWN' ? 'orange' : 'dim', extra: <span className={`chip tone-${TRI_TONE[t]} ra-tri`}>{t}</span> };
    })
    : [];
  const result: ShownRow[] = run.result.rows.map((cells, i) => ({ key: `r${i}`, cells, tone: null, padded: run.padded[i] }));

  return (
    <StageFrame
      height={460}
      legend={<Legend items={[
        { color: 'var(--ok)', label: 'TRUE: kept' },
        { color: 'var(--dim)', label: 'FALSE: dropped' },
        { color: 'var(--orange)', label: 'UNKNOWN: dropped too' },
        { color: 'var(--violet)', label: 'NULL / padded by an outer join' },
      ]} />}
      controls={[
        <Fragment key="scene">{picker}</Fragment>,
        <ControlGroup key="query" label="Query" inline>
          {NULL_QUERIES.map((x) => <ChipButton key={x.id} tone="info" on={id === x.id} onClick={() => setId(x.id)}>{x.label}</ChipButton>)}
        </ControlGroup>,
        <Fragment key="version">
          <Toggle label="Version" value={fixed} onChange={setFixed} off={q.trap} on={q.fix} />
          {id === 'not-in' && <Toggle label="An enrolment with sid NULL" value={unknownToggle} onChange={setUnknownToggle} off="Absent" on="Present" />}
        </Fragment>,
      ]}
    >
      <div className="stage-pad ra">
        <div className="ra-top">
          <div className="ra-sql">
            <SectionTitle weight="regular" hint={plural(run.result.rows.length, 'row')}>Query</SectionTitle>
            <CodePanel lines={run.sql} gutter="none" className="ra-code" />
          </div>
          <p className="ra-data">
            This scene adds the NULLs real data grows: a course with no teacher yet (Security), an enrolment left behind for a deleted course (OLD){unknown ? ', and an enrolment whose student was never recorded' : ''}.
          </p>
        </div>
        <WideRegion minWidth={TABLES_MIN_PX} label="Tables: scroll sideways to see every column">
          <div className="ra-tables">
            {run.tested && (
              <RelTable
                title={id === 'on-where' && fixed ? 'Pairs whose cid matched' : 'Rows tested'}
                hint={run.tested.testLabel}
                cols={run.tested.cols}
                rows={tested}
                extraHead="is"
                ariaLabel="Rows the condition tested, with its truth value"
              />
            )}
            <RelTable title="Result" cols={run.result.cols} rows={result} ariaLabel="Query result" />
          </div>
        </WideRegion>
        <Hint block>WHERE and ON keep a row only when the condition is TRUE; FALSE and UNKNOWN both drop it. {NULL_HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
