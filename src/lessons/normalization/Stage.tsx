import { motion } from 'motion/react';
import { Fragment, useState } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { ANOMALIES, anomalyCaption, stageCaption } from './frames';
import {
  FDS, NEW_PRODUCT, STAGE_LABEL, cellId, fdText, invoiceSql, isForeignKey, joinCount, money, normalForm, repeatedCells, runAnomaly, schemaAt,
  violations, type AnomalyId, type Schema, type StageId, type Table, type Value,
} from './model';
import './styles.css';

const STAGES: StageId[] = [0, 1, 2, 3];
/** The 1NF table has nine columns: it keeps this width on a phone and scrolls. */
const WIDE_TABLE_PX = 620;
const WIDE_COLS = 7;
const HONEST = 'A small hand-made schema; the dependencies are given, not discovered from data. The normal forms and anomalies are computed from them.';

export function Stage() {
  const [stage, setStage] = useState<StageId>(1);
  const [prev, setPrev] = useState<StageId>(1);
  const [anomaly, setAnomaly] = useState<AnomalyId | null>(null);
  const base = schemaAt(stage);
  const run = anomaly ? runAnomaly(anomaly, base) : null;
  const shown = run ? run.after : base;
  const vio = base.flatMap((t) => violations(t));
  useIntroCaption(anomaly ? anomalyCaption(stage, anomaly, run!) : stageCaption(stage), [stage, anomaly]);

  const pickStage = (s: StageId) => {
    setPrev(stage);
    setStage(s);
  };
  const fdState = (i: number): LineState => (vio.some((v) => v.fd && v.fd.lhs.join() === FDS[i].lhs.join()) ? 'bad' : 'idle');
  const fdTrail = (i: number) => {
    const forms = [...new Set(vio.filter((v) => v.fd && v.fd.lhs.join() === FDS[i].lhs.join()).map((v) => `${v.form} in ${v.table}`))];
    return forms.length ? `breaks ${forms.join(', ')}` : null;
  };
  const prevSchema = schemaAt(prev);
  const moved = (t: Table, c: string) => stage > prev && !t.key.includes(c) && !prevSchema.some((p) => p.name === t.name && p.cols.includes(c));

  return (
    <StageFrame
      height={620}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'key column' },
        { color: 'var(--violet)', label: 'foreign key' },
        { color: 'var(--orange)', label: 'a repeated fact' },
        { color: 'var(--info)', label: 'column just moved' },
        { color: 'var(--bad)', label: 'inconsistent, broken or a list in one cell' },
        { color: 'var(--ok)', label: 'anomaly fixed' },
      ]} />}
      stats={
        <Stats>
          <Stat label="normal form" value={normalForm(base)} />
          <Stat label="tables" value={base.length} />
          <Stat label="joins to print an invoice" value={joinCount(stage)} />
        </Stats>
      }
      controls={[
        <Segmented key="stage" label="Design" value={stage} onChange={pickStage} options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />,
        <ControlGroup key="anomalies" label="Try an anomaly" inline>
          {ANOMALIES.map((a) => (
            <ChipButton key={a.id} tone="orange" on={anomaly === a.id} onClick={() => setAnomaly(anomaly === a.id ? null : a.id)}>{a.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad nm">
        <div className="nm-top">
          <div className="nm-fds">
            <SectionTitle weight="regular" hint="given">Functional dependencies</SectionTitle>
            <CodePanel lines={FDS.map(fdText)} stateOf={fdState} trailing={fdTrail} gutter="none" className="nm-code" />
          </div>
          <Scoreboard stage={stage} active={anomaly} />
        </div>
        <div className="nm-tables">
          {shown.map((t) => {
            const table = <TableView key={`${stage}-${t.name}`} schema={shown} table={t} inconsistent={run?.inconsistent} added={anomaly === 'insert' && run?.ok} moved={(c) => moved(t, c)} />;
            return t.cols.length >= WIDE_COLS
              ? <WideRegion key={`${stage}-${t.name}`} minWidth={WIDE_TABLE_PX} label={`${t.name} table: scroll sideways to see every column`}>{table}</WideRegion>
              : <Fragment key={`${stage}-${t.name}`}>{table}</Fragment>;
          })}
        </div>
        {run && <ConsolePanel title="what happened" lines={anomalyLines(anomaly!, run)} />}
        <div className="nm-read">
          <SectionTitle weight="regular" hint={`${joinCount(stage)} ${joinCount(stage) === 1 ? 'join' : 'joins'}`}>Reading it back: every order line with its customer and product</SectionTitle>
          <CodePanel lines={invoiceSql(stage)} gutter="none" className="nm-code" />
          <Hint block>
            The trade-off, named: each split stores a fact once, so writes can't contradict each other, and reads pay for it in joins. Copying data back
            on purpose for faster reads is denormalization, a later topic.
          </Hint>
        </div>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

function anomalyLines(id: AnomalyId, run: ReturnType<typeof runAnomaly>): ConsoleLine[] {
  if (id === 'update')
    return [run.ok ? { text: 'UPDATE: 1 row changed, every copy agrees', tone: 'ok' } : { text: `UPDATE: 1 row changed, ${run.inconsistent.size - 1} other copies now disagree`, tone: 'bad' }];
  if (id === 'delete')
    return [run.ok
      ? { text: `DELETE: ${run.touched} rows gone, no other fact lost`, tone: 'ok' }
      : { text: `DELETE: ${run.touched} rows gone, and with them the ${run.lost.join(' and the ')}`, tone: 'bad' }];
  return [run.ok
    ? { text: `INSERT ${NEW_PRODUCT.product_name} (${money(NEW_PRODUCT.price as number)}): 1 row added`, tone: 'ok' }
    : { text: `INSERT refused: ${run.refused}`, tone: 'bad' }];
}

/** Each anomaly re-run on the current design: still there, or fixed. */
function Scoreboard({ stage, active }: { stage: StageId; active: AnomalyId | null }) {
  const s = schemaAt(stage);
  return (
    <div className="nm-score">
      <SectionTitle weight="regular" hint={`at ${STAGE_LABEL[stage]}`}>Anomalies</SectionTitle>
      <table className="data-table nm-score-table">
        <tbody>
          {ANOMALIES.map((a) => {
            const ok = runAnomaly(a.id, s).ok;
            return (
              <tr key={a.id} className={a.id === active ? 'is-active' : undefined}>
                <td>{a.name}</td>
                <td><span className={`chip tone-${ok ? 'ok' : 'bad'}`}>{ok ? 'fixed' : 'present'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const KeyGlyph = () => (
  <svg className="nm-key" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="5" cy="8" r="3.2" />
    <path d="M8 8h7M12.5 8v3M15 8v2.2" />
  </svg>
);

function show(col: string, v: Value): string {
  if (v === null) return 'NULL';
  return col === 'price' && typeof v === 'number' ? money(v) : String(v);
}

function TableView({ schema, table, inconsistent, added, moved }: {
  schema: Schema;
  table: Table;
  inconsistent?: Set<string>;
  added?: boolean;
  moved: (col: string) => boolean;
}) {
  const repeated = repeatedCells(table);
  return (
    <motion.div className="nm-table-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <SectionTitle weight="regular" hint={`${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'}`}><span className="keep-case">{table.name}</span></SectionTitle>
      <table className="data-table nm-table" aria-label={`${table.name} table`}>
        <thead>
          <tr>
            {table.cols.map((c) => {
              const key = table.key.includes(c);
              const fk = isForeignKey(schema, table, c);
              return (
                <th key={c} className={['keep-case', key && 'nm-pk', fk && 'nm-fk', moved(c) && 'nm-moved'].filter(Boolean).join(' ')}>
                  {key && <KeyGlyph />}{c}{fk && <span className="nm-fk-tag">FK</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => {
            const isNew = added && i === table.rows.length - 1 && table.cols.includes('price');
            return (
              <tr key={i} className={isNew ? 'nm-added' : undefined}>
                {table.cols.map((c) => {
                  const bad = inconsistent?.has(`${table.name}/${cellId(i, c)}`);
                  const cls = [bad ? 'nm-bad' : repeated.has(cellId(i, c)) ? 'nm-repeat' : '', moved(c) && 'nm-moved', table.listCols?.includes(c) && 'nm-list'].filter(Boolean).join(' ');
                  return <td key={c} className={cls || undefined}>{show(c, r[c])}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}

