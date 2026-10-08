import { motion } from 'motion/react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import { plainTone, type Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { groupFrames, rankCaption, showValue, windowFrames, type GroupFrame, type GroupPhase, type WindowFrame } from './frames';
import {
  AGGS, FILTERS, FRAMES, GROUP_COLS, RANK_SQL, SALES, cells, runGroup, runRanking, runWindow, windowSql,
  type AggId, type Cell, type FilterId, type FrameId, type GroupCol, type GroupQuery,
} from './model';
import './styles.css';

type SceneId = 'group' | 'window' | 'rank';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'group', label: 'GROUP BY' },
  { value: 'window', label: 'Window frames' },
  { value: 'rank', label: 'Ranking' },
];
const STEP_MS = 1700;
const WINDOW_STEP_MS = 1100;
const TABLES_MIN_PX = 560;
/** The window and ranking tables: five columns, partitions as heading rows. */
const NARROW_TABLE_PX = 340;
const HONEST = "Evaluated by the lesson's own engine; every query here is checked against SQLite in tests.";
const HEADERS = ['id', 'region', 'rep', 'month', 'amount'];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'group' });
  if (scene === 'window') return <WindowScene picker={picker} />;
  if (scene === 'rank') return <RankScene picker={picker} />;
  return <GroupScene picker={picker} />;
}

const NullCell = ({ v }: { v: Cell }) => (v === null ? <td className="sa-null">NULL</td> : <td>{v}</td>);
const regionTone = (region: string): Tone => plainTone(['North', 'South', 'West'].indexOf(region));

// ── GROUP BY ────────────────────────────────────────────────────────────

const PRESETS: { id: string; label: string; q: GroupQuery }[] = [
  { id: 'where-having', label: 'WHERE vs HAVING', q: { by: 'region', agg: 'sum', filter: 'sum-450', place: 'having', withRep: false } },
  { id: 'count', label: 'COUNT(*) vs COUNT(amount)', q: { by: 'region', agg: 'count-amount', filter: 'none', place: 'where', withRep: false } },
  { id: 'bare', label: 'non-aggregated column', q: { by: 'region', agg: 'sum', filter: 'none', place: 'where', withRep: true } },
];

const GROUP_LABEL: Record<GroupCol, string> = { none: 'nothing', region: 'region', rep: 'rep', month: 'month' };
const PHASE_ORDER: GroupPhase[] = ['rows', 'where', 'group', 'having', 'select'];
const reached = (now: GroupPhase, p: GroupPhase) => PHASE_ORDER.indexOf(now) >= PHASE_ORDER.indexOf(p);

function GroupScene({ picker }: { picker: ReactNode }) {
  const [q, setQ] = useState<GroupQuery>(PRESETS[0].q);
  const run = useMemo(() => runGroup(q), [q]);
  const frames = useMemo(() => groupFrames(q, run), [q, run]);
  const player = usePlayer<GroupFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const phase = player.frame.phase;
  const set = (patch: Partial<GroupQuery>) => setQ({ ...q, ...patch });
  const grouped = !run.error && reached(phase, 'group');
  const toneOf = (key: string): Tone => plainTone(Math.max(0, run.groups.findIndex((g) => g.key === key)));
  const struckGroups = reached(phase, 'having') ? new Set(run.groups.filter((g) => !g.kept).map((g) => g.key)) : new Set<string>();

  const lineState = (i: number): LineState => {
    const line = run.sql[i];
    if (run.error) {
      const bad = run.error.kind === 'aggregate-in-where' ? 'WHERE' : run.error.kind === 'ungrouped-in-having' ? 'HAVING' : 'SELECT';
      return line.startsWith(bad) ? 'bad' : 'idle';
    }
    const now: Record<GroupPhase, string> = { rows: 'FROM', where: 'WHERE', group: 'GROUP BY', having: 'HAVING', select: 'SELECT' };
    return line.startsWith(now[phase]) && player.index > 0 ? 'now' : 'idle';
  };

  const ordered = grouped
    ? run.groups.flatMap((g) => g.rows.map((i) => ({ i, key: g.key })))
    : SALES.map((_, i) => ({ i, key: '' }));
  const filter = FILTERS.find((f) => f.id === q.filter)!;

  return (
    <StageFrame
      player={player}
      height={560}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'clause running now' },
        { color: 'var(--amber)', label: 'groups (one hue each)' },
        { color: 'var(--dim)', label: 'removed by WHERE / HAVING' },
        { color: 'var(--violet)', label: 'NULL' },
        { color: 'var(--bad)', label: 'not valid SQL' },
      ]} />}
      controls={[
        <Fragment key="scene">{picker}</Fragment>,
        <ControlGroup key="presets" label="Presets" inline>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={JSON.stringify(p.q) === JSON.stringify(q)} onClick={() => setQ(p.q)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
        <Fragment key="build">
          <Segmented label="GROUP BY" value={q.by} onChange={(by) => set({ by })} options={GROUP_COLS.map((c) => ({ value: c, label: GROUP_LABEL[c] }))} />
          <Segmented label="Aggregate" value={q.agg} onChange={(agg: AggId) => set({ agg })} options={AGGS.map((a) => ({ value: a.id, label: a.sql }))} />
        </Fragment>,
        <Fragment key="filter">
          <Segmented label="Filter" value={q.filter} onChange={(filter: FilterId) => set({ filter })} options={FILTERS.map((f) => ({ value: f.id, label: f.sql || 'none' }))} />
          <Toggle label="Put it in" value={q.place === 'having'} onChange={(h) => set({ place: h ? 'having' : 'where' })} off="WHERE" on="HAVING" />
          <Toggle label="SELECT rep too" value={q.withRep} onChange={(withRep) => set({ withRep })} off="No" on="Yes" />
        </Fragment>,
      ]}
    >
      <div className="stage-pad sa">
        <CodePanel lines={run.sql} stateOf={lineState} gutter="none" className="sa-code" />
        {run.error && <p className="sa-error" role="status">{run.error.message}.</p>}
        <WideRegion minWidth={TABLES_MIN_PX} label="Tables: scroll sideways to see both">
          <div className="sa-tables">
            <div className="sa-panel">
              <SectionTitle weight="regular" hint={grouped ? `${run.groups.length} ${run.groups.length === 1 ? 'group' : 'groups'}` : `${SALES.length} rows`}>sales</SectionTitle>
              <table className="data-table sa-table" aria-label="sales rows">
                <thead><tr>{HEADERS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {ordered.map(({ i, key }, k) => {
                    const s = SALES[i];
                    const first = grouped && (k === 0 || ordered[k - 1].key !== key);
                    const dropped = phase === 'where' && !run.whereKept[i];
                    const tone = grouped ? toneOf(key) : null;
                    return (
                      <Fragment key={s.id}>
                        {first && q.by !== 'none' && (
                          <tr className={`sa-bucket tone-${tone} ${struckGroups.has(key) ? 'is-struck' : ''}`}><td colSpan={5}>{q.by} = {key}</td></tr>
                        )}
                        <motion.tr layout="position" transition={SPRING.soft} className={['sa-row', tone && `tone-${tone}`, dropped && 'is-dropped', struckGroups.has(key) && grouped && 'is-struck'].filter(Boolean).join(' ')}>
                          {cells(s).map((v, j) => <NullCell key={j} v={v} />)}
                        </motion.tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {grouped && run.whereKept.some((k) => !k) && <p className="sa-note">{run.whereKept.filter((k) => !k).length} rows removed by WHERE before grouping.</p>}
            </div>
            {!run.error && reached(phase, 'select') && (
              <div className="sa-panel">
                <SectionTitle weight="regular" hint={`${run.result.length} ${run.result.length === 1 ? 'row' : 'rows'}`}>Result</SectionTitle>
                <table className="data-table sa-table" aria-label="Query result">
                  <thead><tr>{run.resultCols.map((c) => <th key={c} className="keep-case">{c}</th>)}</tr></thead>
                  <tbody>
                    {run.groups.filter((g) => g.kept).map((g) => (
                      <motion.tr key={g.key} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={`sa-row tone-${toneOf(g.key)}`}>
                        {q.by !== 'none' && <td>{g.key}</td>}
                        {g.value === null ? <td className="sa-null">NULL</td> : <td>{showValue(g.value)}</td>}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </WideRegion>
        <Hint block>
          {filter.id !== 'none' && !filter.aggregate && filter.col === q.by ? 'This filter tests the grouped column, so WHERE and HAVING give the same rows; WHERE usually does less work, since it shrinks the input before grouping (though optimisers often move such a filter down for you). ' : ''}
          {q.agg === 'avg' ? 'AVG is shown rounded to one decimal place. ' : ''}{HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Window frames ───────────────────────────────────────────────────────

function WindowScene({ picker }: { picker: ReactNode }) {
  const [frame, setFrame] = useState<FrameId>('default');
  const rows = useMemo(() => runWindow(frame), [frame]);
  const frames = useMemo(() => windowFrames(frame, rows), [frame, rows]);
  const player = usePlayer<WindowFrame>(frames, { interval: WINDOW_STEP_MS, autoplayOnChange: false });
  const at = player.frame.at;
  const cur = at >= 0 ? rows[at] : null;
  const inFrame = new Set(cur?.frame ?? []);
  const sql = windowSql(frame);

  return (
    <StageFrame
      player={player}
      height={600}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'row being computed' },
        { color: 'var(--violet)', label: 'its frame (and NULL)' },
        { color: 'var(--amber)', label: 'partitions (one hue each)' },
      ]} />}
      controls={[
        <Fragment key="scene">{picker}</Fragment>,
        <Segmented key="frame" label="OVER (…)" value={frame} onChange={setFrame} options={FRAMES.map((f) => ({ value: f.id, label: f.label }))} />,
      ]}
    >
      <div className="stage-pad sa">
        <CodePanel lines={sql} active={at >= 0 ? 2 : undefined} gutter="none" className="sa-code" />
        <WideRegion minWidth={NARROW_TABLE_PX} label="Table: scroll sideways to see every column">
          <table className="data-table sa-table sa-window" aria-label="sales with the window total">
            <thead><tr>{['id', 'rep', 'month', 'amount', 'total'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((w, k) => {
                const s = SALES[w.sale];
                const newPart = k === 0 || SALES[rows[k - 1].sale].region !== s.region;
                const tone = regionTone(s.region);
                const classes = ['sa-row', `tone-${tone}`, inFrame.has(w.sale) && 'in-frame', k === at && 'is-current'].filter(Boolean).join(' ');
                return (
                  <Fragment key={s.id}>
                    {newPart && <tr className={`sa-bucket tone-${tone}`}><td colSpan={5}>partition: region = {s.region}</td></tr>}
                    <tr className={classes}>
                      <td>{s.id}</td><td>{s.rep}</td><td>{s.month}</td><NullCell v={s.amount} />
                      <td className="sa-total">{k <= at ? showValue(w.value) : ''}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>
          With ORDER BY and no frame clause, SQL's default frame is <code>RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW</code>: rows with the same month
          are peers and share a total. The ROWS frames add <code>id</code> to the ORDER BY, because ROWS on tied months would otherwise depend on whichever order the
          engine reads them in. {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Ranking ─────────────────────────────────────────────────────────────

function RankScene({ picker }: { picker: ReactNode }) {
  const rows = useMemo(() => runRanking(), []);
  useIntroCaption(rankCaption(rows));
  return (
    <StageFrame
      height={480}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'a tie: RANK and DENSE_RANK repeat' },
        { color: 'var(--amber)', label: 'partitions (one hue each)' },
      ]} />}
      controls={[<Fragment key="scene">{picker}</Fragment>]}
    >
      <div className="stage-pad sa">
        <CodePanel lines={RANK_SQL} gutter="none" className="sa-code" />
        <WideRegion minWidth={NARROW_TABLE_PX} label="Table: scroll sideways to see every column">
          <table className="data-table sa-table sa-window" aria-label="Sales ranked three ways">
            <thead><tr>{['rep', 'amount', 'row_num', 'rank_pos', 'dense_pos'].map((h) => <th key={h} className="keep-case">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, k) => {
                const s = SALES[r.sale];
                const newPart = k === 0 || SALES[rows[k - 1].sale].region !== s.region;
                const tone = regionTone(s.region);
                return (
                  <Fragment key={s.id}>
                    {newPart && <tr className={`sa-bucket tone-${tone}`}><td colSpan={5}>partition: region = {s.region}</td></tr>}
                    <tr className={`sa-row tone-${tone}`}>
                      <td>{s.rep}</td><td>{s.amount}</td>
                      <td>{r.rowNumber}</td>
                      <td className={r.tied ? 'sa-tie' : undefined}>{r.rank}</td>
                      <td className={r.tied ? 'sa-tie' : undefined}>{r.denseRank}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>The two sales with no amount are left out (WHERE amount IS NOT NULL): databases disagree on whether NULL sorts first or last. {HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
