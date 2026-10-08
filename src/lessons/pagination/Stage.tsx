import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Slider, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import {
  DEPTHS, LIMIT, MAX_ROWS, analyse, byFeed, clockOf, createWorld, cursorResponse, deleteNewest, insertAtHead, keysetCost, makeTable,
  nextPage, offsetCost, pageAll, tieTable, type Analysis, type Mark, type Row, type World,
} from './model';
import { deleteCaption, insertCaption, list, pageCaption } from './frames';
import './styles.css';

type SceneId = 'feed' | 'ties' | 'cost';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'feed', label: 'Feed under writes' },
  { value: 'ties', label: 'Tie-breaker' },
  { value: 'cost', label: 'Cost at depth' },
];
const HONEST = 'Simulated table; the scan counts model a B-tree index seek, not a real database.';
const START_ROWS = 15;
const INSERT_K = 2;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'feed' });
  if (scene === 'ties') return <TiesScene picker={picker} />;
  if (scene === 'cost') return <CostScene picker={picker} />;
  return <FeedScene picker={picker} />;
}

const fresh = () => nextPage(createWorld(makeTable(START_ROWS)));

const TAG: Partial<Record<Mark, string>> = { duplicate: 'again', gap: 'skipped', new: 'new' };

function RowStrip({ rows, a, label }: { rows: Row[]; a: Analysis; label: string }) {
  return (
    <ol className="pg-strip" aria-label={label}>
      {rows.map((r) => {
        const m = a.marks.get(r.id)!;
        return (
          <li key={r.id} className={`pg-row is-${m}`}>
            <span className="pg-id">#{r.id}</span>
            <span className="pg-ts">{clockOf(r.ts)}</span>
            {TAG[m] && <span className="pg-tag">{TAG[m]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Feed under writes ───────────────────────────────────────────────────

function FeedScene({ picker }: { picker: ReactNode }) {
  const [w, setW] = useState<World>(fresh);
  const setCaption = useSetCaption();
  useIntroCaption(<>Page 1 of a feed, newest first, loaded twice: by offset (left) and by cursor (right). Insert {INSERT_K} new rows, then load the next page.</>);
  const sorted = [...w.table].sort(byFeed);
  const ao = analyse(w, w.offset);
  const ac = analyse(w, w.cursor);
  const page = w.offset.pages.length;

  const next = () => {
    const n = nextPage(w);
    setW(n);
    setCaption(pageCaption(w, n));
  };
  const insert = () => {
    const n = insertAtHead(w, INSERT_K);
    setW(n);
    setCaption(insertCaption(n.table.slice(-INSERT_K).map((r) => r.id), n));
  };
  const del = () => {
    const n = deleteNewest(w);
    setW(n);
    setCaption(deleteCaption(sorted[0].id, !w.initial.includes(sorted[0].id), n));
  };
  const reset = () => {
    setW(fresh());
    setCaption(<>Back to page 1 of {START_ROWS} rows.</>);
  };
  const done = !w.offset.hasMore && !w.cursor.hasMore;

  return (
    <StageFrame
      height={520}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'this page' }, { color: 'var(--dim)', label: 'seen before' }, { color: 'var(--bad)', label: 'duplicate' },
        { color: 'var(--orange)', label: 'skipped (gap)' }, { color: 'var(--info)', label: 'inserted while paging' }, { color: 'var(--ok)', label: 'stable cursor' },
      ]} />}
      controls={[
        <>{picker}</>,
        <>
          <Button variant="primary" onClick={next} disabled={done}>Next page</Button>
          <Button onClick={insert} disabled={w.table.length + INSERT_K > MAX_ROWS}>Insert {INSERT_K} new rows</Button>
          <Button onClick={del} disabled={!w.table.length}>Delete the newest row</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad pg">
        <div className="pg-cols">
          <div className="pg-col">
            <SectionTitle weight="regular" hint={`page ${page} · ${w.offset.scanned} rows read`}>Offset</SectionTitle>
            <CodePanel gutter="none" lines={[`ORDER BY created_at DESC, id DESC`, `LIMIT ${LIMIT + 1} OFFSET ${Math.max(0, w.offset.offset - LIMIT)}`]} />
            <RowStrip rows={sorted} a={ao} label="Feed as the offset session sees it" />
            <p className="pg-sum">{ao.duplicates.length ? <span className="pg-bad">{ao.duplicates.length} duplicate{ao.duplicates.length === 1 ? '' : 's'}</span> : 'no duplicates'} · {ao.gaps.length ? <span className="pg-gap">{ao.gaps.length} skipped</span> : 'none skipped'}</p>
          </div>
          <div className="pg-col">
            <SectionTitle weight="regular" hint={`page ${w.cursor.pages.length} · ${w.cursor.scanned} rows read`}>Cursor (keyset)</SectionTitle>
            <CodePanel gutter="none" lines={[
              w.cursor.pages.length > 1 ? 'WHERE (created_at, id) < (:ts, :id)' : '-- page 1: no cursor yet',
              `ORDER BY created_at DESC, id DESC LIMIT ${LIMIT + 1}`,
            ]} />
            <RowStrip rows={sorted} a={ac} label="Feed as the cursor session sees it" />
            <p className="pg-sum">{ac.duplicates.length || ac.gaps.length ? `${ac.duplicates.length} duplicates · ${ac.gaps.length} skipped` : <span className="pg-ok">no duplicates · none skipped</span>}</p>
          </div>
          <div className="pg-col pg-resp">
            <SectionTitle weight="regular" hint="the cursor API's answer">Response</SectionTitle>
            <CodePanel gutter="none" lines={cursorResponse(w.table, w.cursor)} className="pg-json" />
            {w.cursor.cursor && <p className="pg-sum">The cursor is opaque: base64url of <code>{`{"ts":${w.cursor.cursor.ts},"id":${w.cursor.cursor.id}}`}</code>, the last row's sort key. Clients just send it back.</p>}
          </div>
        </div>
        <Hint block>{HONEST} Each query fetches {LIMIT + 1} rows for a page of {LIMIT}: the extra one only says has_more.</Hint>
      </div>
    </StageFrame>
  );
}

// ── Tie-breaker ─────────────────────────────────────────────────────────

const PAGE_TONE = ['pg-p1', 'pg-p2', 'pg-p3'];

function TiesScene({ picker }: { picker: ReactNode }) {
  const [tieBreak, setTieBreak] = useState(false);
  const table = tieTable();
  const pages = pageAll(table, tieBreak);
  const pageOf = new Map(pages.flatMap((p, i) => p.map((id) => [id, i] as const)));
  const skipped = table.filter((r) => !pageOf.has(r.id)).map((r) => r.id).sort((a, b) => b - a);
  const say = skipped.length
    ? <>Sorting by created_at alone, page 1 ends on a row stamped {clockOf(5)}, and the next query asks for <code>created_at &lt; {clockOf(5)}</code>: <span className="hl orange">{list(skipped)} are skipped</span>, though they share that minute. (Using &lt;= would repeat rows instead.)</>
    : <>With id as a tie-breaker in both the sort and the cursor, the next query starts strictly after (09:05, #{pages[0][pages[0].length - 1]}): <span className="hl ok">all 12 rows, each once</span>.</>;
  useIntroCaption(say, [tieBreak]);
  // In the order the query sorted them: by created_at alone, ties stay in table order.
  const sorted = [...table].sort(tieBreak ? byFeed : (x, y) => y.ts - x.ts);

  return (
    <StageFrame
      height={420}
      legend={<Legend items={[
        { color: 'var(--sky)', label: 'page 1' }, { color: 'var(--amber)', label: 'page 2' }, { color: 'var(--pink)', label: 'page 3' }, { color: 'var(--orange)', label: 'skipped' },
      ]} />}
      controls={[<>{picker}<Toggle label="Sort and cursor" value={tieBreak} onChange={setTieBreak} off="created_at only" on="(created_at, id)" /></>]}
    >
      <div className="stage-pad pg">
        <div className="pg-cols">
          <div className="pg-col">
            <SectionTitle weight="regular" hint="three rows share 09:05">12 rows, as the query sorts them</SectionTitle>
            <ol className="pg-strip" aria-label="Rows and the page each landed on">
              {sorted.map((r) => {
                const p = pageOf.get(r.id);
                return (
                  <li key={r.id} className={`pg-row ${p === undefined ? 'is-gap' : PAGE_TONE[p]}`}>
                    <span className="pg-id">#{r.id}</span><span className="pg-ts">{clockOf(r.ts)}</span>
                    <span className="pg-tag">{p === undefined ? 'skipped' : `page ${p + 1}`}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="pg-col">
            <SectionTitle weight="regular" hint="page 2's query">SQL</SectionTitle>
            <CodePanel gutter="none" lines={tieBreak
              ? ['WHERE (created_at, id) < (\'09:05\', 8)', 'ORDER BY created_at DESC, id DESC', `LIMIT ${LIMIT + 1}`]
              : [`WHERE created_at < '09:05'`, 'ORDER BY created_at DESC', `LIMIT ${LIMIT + 1}`]} />
            <p className="pg-sum">
              {tieBreak
                ? 'A unique, stable sort key (created_at, then id) means every row has exactly one place, so "after this row" is never ambiguous.'
                : 'Without a unique key, ties have no defined order: a real database may even return them in a different order on each query. Here they come out in table order.'}
            </p>
          </div>
        </div>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

// ── Cost at depth ───────────────────────────────────────────────────────

const PAGE_FMT = (p: number) => `page ${p.toLocaleString('en-US')}`;

function CostScene({ picker }: { picker: ReactNode }) {
  const [at, setAt] = useState(2);
  const page = DEPTHS[at];
  const off = offsetCost(page);
  const key = keysetCost(page);
  const say = <>Page {page.toLocaleString('en-US')}: offset walks <span className="hl bad">{off.toLocaleString('en-US')} index entries</span> to return {LIMIT}; keyset seeks straight to the cursor and reads <span className="hl ok">{key}</span>.</>;
  useIntroCaption(say, [page]);

  return (
    <StageFrame
      height={460}
      legend={<Legend items={[{ color: 'var(--violet)', label: 'rows the DB reads' }, { color: 'var(--bad)', label: 'offset (costly)' }, { color: 'var(--ok)', label: 'keyset (cheap)' }]} />}
      controls={[<>{picker}<Slider label="Depth" value={at} min={0} max={DEPTHS.length - 1} onChange={setAt} format={(i) => PAGE_FMT(DEPTHS[i])} /></>]}
    >
      <div className="stage-pad pg">
        <div className="pg-cols">
          <div className="pg-col">
            <SectionTitle weight="regular" hint="to scale">Rows read for {PAGE_FMT(page)}</SectionTitle>
            <Bar value={off} max={off} tone="violet" label={<>offset · <code>OFFSET {((page - 1) * LIMIT).toLocaleString('en-US')}</code></>} trailing={off.toLocaleString('en-US')} />
            <Bar value={key} max={off} tone="violet" label={<>keyset · <code>WHERE (created_at, id) &lt; cursor</code></>} trailing={String(key)} />
            <table className="data-table pg-trade">
              <thead><tr><th /><th>offset</th><th>cursor</th></tr></thead>
              <tbody>
                <tr><td>jump to page 50</td><td className="pg-ok">yes</td><td className="pg-bad">no: next / previous only</td></tr>
                <tr><td>"page 3 of 40" counts</td><td className="pg-ok">easy (COUNT, which is a scan too)</td><td className="pg-bad">not built in</td></tr>
                <tr><td>cost of a deep page</td><td className="pg-bad">grows with depth</td><td className="pg-ok">about the same as page 1</td></tr>
                <tr><td>new or deleted rows while paging</td><td className="pg-bad">duplicates and gaps</td><td className="pg-ok">stable</td></tr>
              </tbody>
            </table>
          </div>
          <div className="pg-col pg-plot">
            <Plot2D x={{ domain: [1, 10000], log: true, label: 'page number' }} y={{ domain: [1, 1e5], log: true, label: 'rows read' }} ariaLabel="Rows read against page number, log-log">
              <Curve fn={(p) => offsetCost(p)} tone="bad" />
              <Curve fn={(p) => keysetCost(p)} tone="ok" />
              <VLine at={page} label={PAGE_FMT(page)} tone="hi" />
              <Points data={[{ x: page, y: off, tone: 'bad' }, { x: page, y: key, tone: 'ok' }]} />
            </Plot2D>
          </div>
        </div>
        <Hint block>{HONEST} Keyset also pays a seek of a few index pages (about log n), not counted here. GraphQL's Relay connections are cursor pagination with a fixed shape.</Hint>
      </div>
    </StageFrame>
  );
}
