import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { plural } from '../../core/format';
import { toneVar, type Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { fmtBytes, fmtMs, ormFrames, shortSql, summaryRow, type OrmFrame } from './frames';
import {
  LATENCY_DEFAULT_MS, LATENCY_MAX_MS, LATENCY_MIN_MS, PAGE_DEFAULT, PAGE_MAX, PAGE_MIN, STRATEGIES, runStrategy, snippet, timeline,
  type Query, type Scene, type Strategy,
} from './model';

const STEP_MS = 800;
const GANTT_MIN_PX = 560;
const LOG_TAIL = 10;
const PREVIEW_POSTS = 4;
const WIRE_ROWS = 8;
const HONEST = 'Simulated database and latency (illustrative numbers); the SQL is real and checked against SQLite in tests.';

const LEGEND = (
  <Legend items={[
    { color: 'var(--hi)', label: 'ORM line running' },
    { color: 'var(--info)', label: 'the first query' },
    { color: 'var(--orange)', label: 'one query per item (the N)' },
    { color: 'var(--ok)', label: "a fix's queries" },
    { color: 'var(--bad)', label: 'duplicated rows in a join' },
    { color: 'var(--dim)', label: 'application idle' },
  ]} />
);

/** The colour of a query: the lazy loop's repeats are the N, a fix's queries are the cheap side. */
const toneOf = (strategy: Strategy, q: Query): Tone => (strategy === 'lazy' ? (q.kind === 'first' ? 'info' : 'orange') : 'ok');
const roundTenth = (v: number) => Math.round(v * 10) / 10;

export function OrmScene({ scene, picker }: { scene: Scene; picker: ReactNode }) {
  const [strategy, setStrategy] = useState<Strategy>('lazy');
  const [n, setN] = useState(PAGE_DEFAULT);
  const [latency, setLatency] = useState(LATENCY_DEFAULT_MS);
  const [focus, setFocus] = useState<number | null>(null);
  const run = useMemo(() => runStrategy(scene, strategy, n), [scene, strategy, n]);
  const lines = useMemo(() => snippet(scene, strategy, n), [scene, strategy, n]);
  const frames = useMemo(() => ormFrames(scene, strategy, run, latency), [scene, strategy, run, latency]);
  const player = usePlayer<OrmFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const { shown, line } = player.frame;
  const tl = useMemo(() => timeline(run.queries, latency), [run, latency]);
  const compare = useMemo(() => STRATEGIES.map((s) => ({ ...s, ...summaryRow(scene, s.id, n, latency) })), [scene, n, latency]);
  const slowest = Math.max(...compare.map((c) => c.total));
  const fastest = Math.min(...compare.map((c) => c.total));
  const sofar = tl.items.slice(0, shown);
  const spent = sofar.at(-1)?.end ?? 0;
  const bytesSoFar = sofar.reduce((s, t) => s + t.query.bytes, 0);

  const bars: GanttBar[] = sofar.flatMap((t, i) => [
    { id: `idle${i}`, lane: 'app', start: t.start, end: t.end, tone: 'dim', kind: 'blocked' },
    { id: `q${i}`, lane: 'db', start: t.start, end: t.end, tone: toneOf(strategy, t.query), ...(focus !== null && t.query.line === focus ? { ring: 'hi' as const } : {}) },
  ]);

  const logLines: ConsoleLine[] = [
    ...(shown > LOG_TAIL ? [{ text: `… ${shown - LOG_TAIL} earlier queries`, tone: 'muted' as Tone }] : []),
    ...sofar.slice(-LOG_TAIL).map((t, k) => {
      const i = Math.max(0, shown - LOG_TAIL) + k;
      return { text: `${i + 1}. ${shortSql(t.query.sql)}`, tone: focus !== null && t.query.line === focus ? ('hi' as Tone) : toneOf(strategy, t.query) };
    }),
  ];

  const lineState = (i: number): LineState => (i === line ? 'now' : 'idle');
  const sentBy = (i: number) => run.queries.slice(0, shown).filter((q) => q.line === i).length;
  const pick = (s: Strategy) => {
    setStrategy(s);
    setFocus(null);
  };

  return (
    <StageFrame
      player={player}
      height={640}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="queries" value={`${shown} of ${run.queries.length}`} color={strategy === 'lazy' && shown > 1 ? toneVar('orange') : undefined} />
          <Stat label="time so far" value={fmtMs(spent)} />
          <Stat label="bytes so far" value={fmtBytes(bytesSoFar)} />
        </Stats>
      }
      controls={[
        <Fragment key="scene">{picker}</Fragment>,
        <ControlGroup key="fixes" label="Strategy" inline>
          {STRATEGIES.map((s) => <ChipButton key={s.id} tone={s.id === 'lazy' ? 'orange' : 'ok'} on={strategy === s.id} onClick={() => pick(s.id)}>{s.label}</ChipButton>)}
        </ControlGroup>,
        <Fragment key="sliders">
          <Slider label="Round-trip latency" value={latency} min={LATENCY_MIN_MS} max={LATENCY_MAX_MS} step={0.2} onChange={(v) => setLatency(roundTenth(v))} format={(v) => `${v.toFixed(1)} ms`} />
          <Slider label="Posts on the page" value={n} min={PAGE_MIN} max={PAGE_MAX} step={10} onChange={setN} />
        </Fragment>,
      ]}
    >
      <div className="stage-pad orm">
        <div className="orm-gantt">
          <SectionTitle weight="regular" hint={`same time scale for every strategy: 0 to ${fmtMs(slowest)}`}>Timeline: one query after another</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_PX} label="Query timeline: scroll sideways to see all of it">
            <GanttLanes
              lanes={[{ id: 'app', label: 'app: idle' }, { id: 'db', label: 'query in flight' }]}
              bars={bars}
              domain={[0, slowest]}
              now={shown > 0 ? spent : undefined}
              unit=" ms"
              axis
              labelWidth={110}
              ariaLabel={`Query waterfall: ${plural(shown, 'query', 'queries')} sent, ${fmtMs(spent)} elapsed`}
            />
          </WideRegion>
        </div>
        <div className="orm-row">
          <div className="orm-code">
            <SectionTitle weight="regular" hint="click a line to find its queries">ORM code</SectionTitle>
            <CodePanel
              lines={lines}
              stateOf={lineState}
              gutter="number"
              onLineClick={(i) => setFocus(focus === i ? null : i)}
              pressed={(i) => focus === i}
              lineLabel={(i) => `Line ${i + 1}: ${focus === i ? 'stop highlighting' : 'highlight'} its queries`}
              trailing={(i) => (shown > 0 && sentBy(i) > 0 ? plural(sentBy(i), 'query', 'queries') : null)}
            />
          </div>
          <div className="orm-log">
            <SectionTitle weight="regular" hint="what the ORM sends">SQL log</SectionTitle>
            <ConsolePanel title="queries" lines={logLines} empty="(none yet: press play)" />
          </div>
        </div>
        <Compare rows={compare} selected={strategy} fastest={fastest} slowest={slowest} />
        {scene === 'nested' && strategy === 'join' && <WireRows run={run} />}
        <Preview run={run} />
        <Hint block>
          A fix has its own cost: the join returns one row per comment and repeats the post's columns on each (see the red rows), and a batch's {`IN (…)`} list grows with the
          page. Queries here are serial because each needs the previous answer. {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

function Compare({ rows, selected, fastest, slowest }: {
  rows: { id: Strategy; label: string; count: number; total: number; bytes: number }[];
  selected: Strategy;
  fastest: number;
  slowest: number;
}) {
  return (
    <div className="orm-compare">
      <SectionTitle weight="regular" hint="same page, same latency">Every strategy</SectionTitle>
      <WideRegion minWidth={420} label="Comparison table: scroll sideways to see every column">
        <table className="data-table" aria-label="Queries, time and bytes for each strategy">
          <thead><tr><th>strategy</th><th>queries</th><th>total time</th><th>bytes</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === selected ? 'is-selected' : undefined}>
                <td>{r.label}</td>
                <td>{r.count}</td>
                <td className={fastest === slowest ? '' : r.total === fastest ? 'orm-ok' : r.total === slowest ? 'orm-bad' : ''}>{fmtMs(r.total)}</td>
                <td>{fmtBytes(r.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </WideRegion>
    </div>
  );
}

/** The rows the nested join sends back: the post's columns repeat on every comment's row. */
function WireRows({ run }: { run: ReturnType<typeof runStrategy> }) {
  const q = run.queries[0];
  const posts = new Set(q.rows.map((r) => r[0])).size;
  return (
    <div className="orm-wire">
      <SectionTitle weight="regular" hint={`${plural(q.rows.length, 'row')} for ${plural(posts, 'post')}, ${fmtBytes(q.bytes)}`}>What came back over the wire</SectionTitle>
      <WideRegion minWidth={460} label="Rows returned by the join: scroll sideways">
        <table className="data-table" aria-label="Rows returned by the join">
          <thead><tr><th>post</th><th>title</th><th>comment</th><th>body</th><th>commenter</th></tr></thead>
          <tbody>
            {q.rows.slice(0, WIRE_ROWS).map((r, i) => {
              const repeat = i > 0 && q.rows[i - 1][0] === r[0];
              return (
                <tr key={i}>
                  <td className={repeat ? 'orm-dup' : undefined}>{r[0]}</td>
                  <td className={repeat ? 'orm-dup' : undefined}>{r[1]}</td>
                  {r.slice(2).map((v, k) => <td key={k} className={v === null ? 'orm-null' : undefined}>{v === null ? 'NULL' : v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </WideRegion>
      {q.rows.length > WIRE_ROWS && <p className="orm-more">… and {q.rows.length - WIRE_ROWS} more rows</p>}
    </div>
  );
}

/** The page the code finally renders: the same for every strategy. */
function Preview({ run }: { run: ReturnType<typeof runStrategy> }) {
  return (
    <div className="orm-page">
      <SectionTitle weight="regular" hint="identical for every strategy">The rendered page</SectionTitle>
      <ul className="orm-posts">
        {run.page.slice(0, PREVIEW_POSTS).map((p) => (
          <li key={p.id}>
            <b>{p.title}</b>{p.author ? <> by {p.author}</> : null}
            {p.comments && (p.comments.length === 0 ? <span className="orm-faint"> · no comments</span> : <span className="orm-faint"> · {plural(p.comments.length, 'comment')}, first: “{p.comments[0].body}” by {p.comments[0].user}</span>)}
          </li>
        ))}
      </ul>
    </div>
  );
}
