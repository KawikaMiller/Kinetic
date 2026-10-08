import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { ChipButton, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { NA, bytes, ms } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { lastOrders } from './data';
import { POOL_SIZE, execute } from './exec';
import { compareFrames, costCaption, levelFrames } from './frames';
import { DEFAULT_PICK, ORDER_COUNTS, queryFor, toggle, type Pick, type PickKey } from './picker';
import { SHOWN_ITEMS, buildTree, type TreeNode } from './resolverTree';
import { SCREEN_ORDERS, SCREEN_QUERY, SCREEN_USER, planGraphql, planRest } from './rest';
import { CACHING_NOTE, DB_COUNT_NOTE, costView, dataLoaderNote, dbRows, responseLines } from './scenes';
import { LIMITS, depthOf, printQuery } from './schema';
import './styles.css';

type SceneId = 'compare' | 'resolvers' | 'cost';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'compare', label: 'REST vs GraphQL' },
  { value: 'resolvers', label: 'Resolvers' },
  { value: 'cost', label: 'Cost limits' },
];

const kb = (n: number) => bytes(n, { base: 1000 });
const STEP_MS = 330;
const LEVEL_STEP_MS = 1900;
const COMPARE_MIN_W = 520;
const NO_LABEL = Number.POSITIVE_INFINITY;
/** The whole 3-order response fits; a longer one is cut and says so. */
const COMPARE_LINES = 40;
const RESPONSE_LINES = 22;
const DB_ROWS = 6;
const HONEST_COMPARE = 'A simplified GraphQL executor written for this lesson; the database is in-memory and timings are illustrative (a fixed round trip, 20 ms per database call).';

/** The product whose lookup fails when the learner breaks the product service: the one on the second-newest order. */
const FAILING_PRODUCT = lastOrders(SCREEN_USER, SCREEN_ORDERS)[1].productId;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'compare' });
  const [broken, setBroken] = useState(false);
  const failProductId = broken ? FAILING_PRODUCT : null;
  const service = <Toggle label="Product service" value={broken} onChange={setBroken} off="healthy" on="one product fails" />;
  if (scene === 'resolvers') return <ResolversScene picker={picker} service={service} failProductId={failProductId} />;
  if (scene === 'cost') return <CostScene picker={picker} />;
  return <CompareScene picker={picker} service={service} failProductId={failProductId} />;
}

const cheaper = (a: number, b: number, mine: number): string | undefined => (a === b ? undefined : mine < Math.max(a, b) ? 'var(--ok)' : 'var(--bad)');

// ── REST vs GraphQL ─────────────────────────────────────────────────────

function CompareScene({ picker, service, failProductId }: { picker: ReactNode; service: ReactNode; failProductId: number | null }) {
  const rest = useMemo(() => planRest(failProductId), [failProductId]);
  const gql = useMemo(() => planGraphql(failProductId), [failProductId]);
  const { frames, end } = useMemo(() => compareFrames(failProductId), [failProductId]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;
  const err = gql.body.errors?.[0];
  const response = useMemo(() => responseLines(gql.body, COMPARE_LINES), [gql]);
  const naiveCalls = useMemo(() => execute(SCREEN_QUERY, { dataLoader: false, failProductId }).dbCalls.length, [failProductId]);

  const lanes = [...rest.requests.map((r) => ({ id: r.id, label: r.path.replace('GET ', '') })), { id: 'gql', label: 'POST /graphql' }];
  const bars: GanttBar[] = [
    ...rest.requests.filter((r) => now > r.start).map((r): GanttBar => ({
      id: r.id, lane: r.id, start: r.start, end: Math.min(r.end, now), kind: r.status === 503 && now >= r.end ? 'blocked' : 'work',
      tone: now >= r.end ? (r.status === 503 ? 'bad' : 'ok') : 'info', label: `${r.path}: ${r.status}`,
    })),
    ...(now > gql.start ? [{ id: 'gql', lane: 'gql', start: 0, end: Math.min(gql.end, now), tone: (now >= gql.end ? 'ok' : 'info') as Tone, label: `POST /graphql: ${gql.status}` }] : []),
  ];
  const restDone = now >= rest.totalMs;
  const gqlDone = now >= gql.end;

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request in flight' },
            { color: 'var(--ok)', label: 'answered (200)' },
            { color: 'var(--bad)', label: '503: the product call failed' },
            { color: 'var(--orange)', label: 'a field that failed inside a 200' },
            { color: 'var(--dim)', label: 'bytes the screen does not use' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="REST requests" value={rest.requests.length} color={cheaper(rest.requests.length, 1, rest.requests.length)} />
          <Stat label="GraphQL requests" value={1} color={cheaper(rest.requests.length, 1, 1)} />
          <Stat label="REST done" value={restDone ? ms(rest.totalMs) : '…'} sub={restDone ? `${kb(rest.bytes)} received` : undefined} color={restDone ? cheaper(rest.totalMs, gql.end, rest.totalMs) : undefined} />
          <Stat label="GraphQL done" value={gqlDone ? ms(gql.end) : '…'} sub={gqlDone ? `${kb(gql.responseBytes)} received` : undefined} color={gqlDone ? cheaper(rest.totalMs, gql.end, gql.end) : undefined} />
        </Stats>
      }
      controls={[<>{picker}{service}</>]}
    >
      <div className="stage-pad gq">
        <WideRegion minWidth={COMPARE_MIN_W} label="Request timelines: scroll sideways to see all of them">
          <GanttLanes
            lanes={lanes}
            bars={bars}
            domain={[0, end]}
            now={now}
            unit=" ms"
            axis
            size="md"
            labelWidth={150}
            labelMinPx={NO_LABEL}
            markers={err && now >= gql.end ? [{ at: gql.end, label: 'errors[]', tone: 'orange' }] : []}
            ariaLabel={`REST makes ${rest.requests.length} requests in ${ms(rest.totalMs)}; GraphQL makes 1 in ${ms(gql.end)}`}
          />
        </WideRegion>
        <div className="gq-two">
          <Box className="gq-rest">
            <SectionTitle weight="regular" hint="what each response carried">REST: bytes used and unused</SectionTitle>
            <ul className="gq-rest-list">
              {rest.requests.map((r) => {
                const arrived = now >= r.end;
                return (
                  <li key={r.id}>
                    <span className="gq-path">{r.path.replace('GET ', '')}</span>
                    <span className={`gq-status ${arrived ? (r.status === 200 ? 'is-ok' : 'is-bad') : ''}`}>{arrived ? r.status : '…'}</span>
                    <Bar value={arrived ? r.usefulBytes : 0} max={r.bytes} tone="ok" animate={false} track="var(--dim)" trailing={arrived ? `${r.usefulBytes} of ${r.bytes} B used` : 'waiting'} />
                  </li>
                );
              })}
            </ul>
            {restDone && <Hint block>{kb(rest.usefulBytes)} of {kb(rest.bytes)} is used by the screen; the grey part of each bar is unused fields.</Hint>}
          </Box>
          <div className="gq-gql">
            <CodePanel title="The one request: POST /graphql" lines={printQuery(SCREEN_QUERY)} gutter="none" />
            <CodePanel
              title={gqlDone ? `Response: HTTP ${gql.status}` : 'Response'}
              lines={gqlDone ? [...response.lines, ...(response.cut ? [`… ${response.cut} more lines`] : [])] : ['(waiting)']}
              gutter="none"
              renderLine={(line) => (line.includes('"product": null') || line.includes('"errors"') ? <span className="gq-orange">{line}</span> : line)}
            />
          </div>
        </div>
        <Hint block>
          {HONEST_COMPARE} A tuned REST API (field selection, embedded resources, a purpose-built endpoint for this screen) closes much of the gap; GraphQL gives every client that choice
          without a new endpoint. It also saved round trips here, not server work. The query travels as a {kb(gql.requestBytes)} POST body. {CACHING_NOTE} (see http-caching). {dataLoaderNote(gql.execution.dbCalls.length, naiveCalls)}
          Subscriptions, GraphQL&apos;s push, are a different transport (see realtime-transports).
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Resolvers ───────────────────────────────────────────────────────────

const NODE_W = 150;
const NODE_H = 46;
const COLUMN_W = 176;
const ROW_H = 84;
const TREE_MIN_COLUMNS = 3;

interface NodeState {
  hidden: boolean;
  tone: 'now' | 'done' | 'error';
}

function nodeState(n: TreeNode, level: number): NodeState {
  if (n.level > level) return { hidden: true, tone: 'now' };
  if (n.error) return { hidden: false, tone: 'error' };
  return { hidden: false, tone: n.level === level ? 'now' : 'done' };
}

function ResolversScene({ picker, service, failProductId }: { picker: ReactNode; service: ReactNode; failProductId: number | null }) {
  const [pick, setPick] = useState<Pick>(DEFAULT_PICK);
  const [dataLoader, setDataLoader] = useState(false);
  const query = useMemo(() => queryFor(pick), [pick]);
  const exec = useMemo(() => execute(query, { dataLoader, failProductId }), [query, dataLoader, failProductId]);
  const tree = useMemo(() => buildTree(exec), [exec]);
  const frames = useMemo(() => levelFrames(exec, dataLoader), [exec, dataLoader]);
  const player = usePlayer(frames, { interval: LEVEL_STEP_MS, autoplayOnChange: false });
  const level = player.frame.level;
  const done = player.index === frames.length - 1;
  const now = level < 0 ? 0 : exec.levelEnds[level];
  const leaves = [...tree.nodes.values()].filter((n) => !(tree.children.get(n.id)?.length)).length;
  const width = Math.max(TREE_MIN_COLUMNS, leaves) * COLUMN_W + 40;
  const height = (depthRows(tree) + 0.4) * ROW_H;
  const response = useMemo(() => responseLines({ data: exec.data, ...(exec.errors.length ? { errors: exec.errors } : {}) }, RESPONSE_LINES), [exec]);
  const table = dbRows(exec, level, DB_ROWS);
  const connections = Math.max(1, ...exec.dbCalls.map((c) => c.conn + 1));
  const bars: GanttBar[] = exec.dbCalls.filter((c) => c.level <= level).map((c) => ({
    id: `db${c.id}`, lane: `c${c.conn}`, start: c.start, end: c.end, tone: c.batched ? 'violet' : 'info',
    label: c.batched ? `batched: ${c.sql}` : c.sql,
  }));

  const chip = (key: PickKey, label: string, disabled = false) => (
    <ChipButton tone="info" on={pick[key]} onStyle="solid" disabled={disabled} onClick={() => setPick((p) => toggle(p, key))}>{label}</ChipButton>
  );

  return (
    <StageFrame
      player={player}
      height={460}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'resolving now' },
            { color: 'var(--ok)', label: 'resolved' },
            { color: 'var(--orange)', label: 'failed (null + error)' },
            { color: 'var(--info)', label: 'database call' },
            { color: 'var(--violet)', label: 'batched call (DataLoader)' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Resolvers run" value={exec.invocations.filter((i) => i.level <= level).length} />
          <Stat label="DB calls" value={exec.dbCalls.filter((c) => c.level <= level).length} color={done ? (dataLoader ? 'var(--ok)' : exec.dbCalls.length > 3 ? 'var(--bad)' : undefined) : undefined} />
          <Stat label="Elapsed" value={ms(now)} sub="illustrative" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="DataLoader" value={dataLoader} onChange={setDataLoader} off="off: one call per resolver" on="on: batch per tick" />
          {service}
        </>,
        <>
          <div className="gq-chips" role="group" aria-label="Fields in the query">
            {chip('email', 'user.email')}
            {chip('orders', 'user.orders')}
            {chip('total', 'order.total')}
            {chip('status', 'order.status')}
            {chip('product', 'order.product')}
            {chip('productName', 'product.name')}
            {chip('productPrice', 'product.price')}
          </div>
          <Segmented label="orders(last: n), n =" value={pick.n} onChange={(n) => setPick((p) => ({ ...p, n }))} options={ORDER_COUNTS.map((n) => ({ value: n, label: String(n) }))} />
        </>,
      ]}
    >
      <div className="stage-pad gq">
        <div className="gq-top">
          <CodePanel title="Query" lines={printQuery(query)} gutter="none" className="gq-query" />
          <CodePanel
            title={done ? 'Response' : 'Response (after the last level)'}
            lines={done ? [...response.lines, ...(response.cut ? [`… ${response.cut} more lines`] : [])] : ['(resolving…)']}
            gutter="none"
            className="gq-response"
            renderLine={(line) => (line.includes('"product": null') || line.includes('"errors"') ? <span className="gq-orange">{line}</span> : line)}
          />
        </div>
        <WideRegion minWidth={minWidthForText(width, 10.5)} label="Resolver tree: scroll sideways to see all of it">
          <TreeSvg
            shape={{ root: tree.root, children: (id) => tree.children.get(id) ?? [] }}
            layout="tidy"
            width={width}
            height={height}
            levelGap={ROW_H}
            natural
            top={NODE_H / 2 + 10}
            hidden={(id) => nodeState(tree.nodes.get(id)!, level).hidden}
            nodeClass={(id) => `gq-node is-${nodeState(tree.nodes.get(id)!, level).tone} kind-${tree.nodes.get(id)!.kind}`}
            renderNode={(id) => <ResolverNode node={tree.nodes.get(id)!} />}
            ariaLabel="Resolver tree: each box is a field resolver or a list element"
          />
        </WideRegion>
        {tree.hidden > 0 && <Hint block>Drawing the first {SHOWN_ITEMS} of {tree.hidden + SHOWN_ITEMS} orders; the rest have exactly the same shape and cost.</Hint>}
        <SectionTitle weight="regular" hint={`${connections > 1 ? `${POOL_SIZE} connections available` : 'one connection used'}`}>Database calls over time</SectionTitle>
        <WideRegion minWidth={COMPARE_MIN_W} label="Database calls: scroll sideways to see all of them">
          <GanttLanes
            lanes={Array.from({ length: connections }, (_, i) => ({ id: `c${i}`, label: `connection ${i + 1}` }))}
            bars={bars}
            domain={[0, Math.max(exec.totalMs, 20)]}
            now={now}
            unit=" ms"
            axis
            labelWidth={110}
            labelMinPx={NO_LABEL}
            ariaLabel="Database calls on the connection pool"
          />
        </WideRegion>
        <div className="gq-table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">call</th><th scope="col">SQL (illustrative)</th></tr></thead>
            <tbody>
              {table.rows.length ? table.rows.map((r) => (
                <tr key={r.id}><td>{r.id + 1}{r.batched ? ' · batched' : ''}</td><td className="gq-sql">{r.sql}</td></tr>
              )) : <tr><td colSpan={2}>none yet</td></tr>}
              {table.more > 0 && <tr><td colSpan={2}>… and {table.more} more calls like these</td></tr>}
            </tbody>
          </table>
        </div>
        <Hint block>
          {HONEST_COMPARE} The general N + 1 problem is the subject of orm-n-plus-one; here each product resolver is the culprit. A level only starts when the one above it is done. {DB_COUNT_NOTE} The query always selects name: a selection can't be empty.
        </Hint>
      </div>
    </StageFrame>
  );
}


/** The deepest row of the tree (the root is row 1). */
function depthRows(tree: ReturnType<typeof buildTree>): number {
  const walk = (id: string): number => 1 + Math.max(0, ...(tree.children.get(id) ?? []).map(walk));
  return walk(tree.root);
}

function ResolverNode({ node }: { node: TreeNode }) {
  const sub = node.dbCall !== null ? `${node.sub ? `${node.sub} · ` : ''}db call ${node.dbCall + 1}${node.batched ? ' (batched)' : ''}` : node.sub;
  return (
    <>
      <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} className="gq-box" />
      <text y={-4} className="gq-title">{node.title}</text>
      <text y={12} className="gq-sub">{sub.length > 26 ? `${sub.slice(0, 25)}…` : sub}</text>
    </>
  );
}

// ── Cost limits ─────────────────────────────────────────────────────────

const LEVEL_MAX = 6;
const FIRSTS = [5, 10, 50];
const COST_BAR_MAX = LIMITS.maxCost * 4;
const DEPTH_BAR_MAX = LEVEL_MAX + 2;
const group = (n: number) => n.toLocaleString('en-US');

function CostScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [levels, setLevels] = useState(2);
  const [first, setFirst] = useState(10);
  const [limitsOn, setLimitsOn] = useState(true);
  const view = useMemo(() => costView(levels, first, limitsOn), [levels, first, limitsOn]);
  const depth = depthOf(view.query);
  const cost = view.status === 'rejected' ? view.outcome.verdict.cost : view.status === 'skipped' ? view.cost : view.outcome.verdict.cost;
  const caption = useMemo(() => costCaption(view, levels, first), [view, levels, first]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const overCost = cost > LIMITS.maxCost;
  const overDepth = depth > LIMITS.maxDepth;
  const resolvers = view.status === 'executed' ? view.outcome.execution.invocations.length : view.status === 'rejected' ? 0 : null;
  const error = view.status === 'rejected' ? { errors: [{ message: view.outcome.message }] } : null;
  const response = view.status === 'executed' ? responseLines({ data: view.outcome.execution.data }, 14) : null;

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'within the limit' },
            { color: 'var(--bad)', label: 'over the limit' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Friends levels" value={levels} min={0} max={LEVEL_MAX} onChange={setLevels} />
          <Segmented label="friends(first: n), n =" value={first} onChange={setFirst} options={FIRSTS.map((n) => ({ value: n, label: String(n) }))} />
          <Toggle label="Server limits" value={limitsOn} onChange={setLimitsOn} off="off" on="on" />
        </>,
      ]}
    >
      <div className="stage-pad gq">
        <div className="gq-top">
          <CodePanel title="Query" lines={printQuery(view.query)} gutter="none" className="gq-query" />
          <Box className="gq-meters">
            <SectionTitle weight="regular" hint={`limits: depth ${LIMITS.maxDepth}, cost ${group(LIMITS.maxCost)}`}>Measured before it runs</SectionTitle>
            <div className="gq-meter">
              <span className="gq-meter-label">Depth</span>
              <Bar value={depth} max={DEPTH_BAR_MAX} marker={LIMITS.maxDepth} markLabel={`depth limit ${LIMITS.maxDepth}`} tone={overDepth ? 'bad' : 'ok'} animate={false} trailing={`${depth} (limit ${LIMITS.maxDepth})`} />
            </div>
            <div className="gq-meter">
              <span className="gq-meter-label">Cost</span>
              <Bar value={cost} max={COST_BAR_MAX} marker={LIMITS.maxCost} markLabel={`cost limit ${group(LIMITS.maxCost)}`} tone={overCost ? 'bad' : 'ok'} animate={false} trailing={`${group(cost)} (limit ${group(LIMITS.maxCost)})`} />
            </div>
            <Hint block>Cost = field resolvers the query can run: the sum over its fields of the list sizes above them. The bar stops at 4 × the limit.</Hint>
            <Stats>
              <Stat label="Resolvers run" value={resolvers === null ? NA : group(resolvers)} sub={view.status === 'rejected' ? 'rejected first' : view.status === 'skipped' ? 'not run here' : undefined} color={view.status === 'rejected' ? 'var(--ok)' : undefined} />
              <Stat label="Names asked for" value={group(view.names)} />
            </Stats>
          </Box>
        </div>
        {error && <CodePanel title="What the client gets back" lines={JSON.stringify(error, null, 2).split('\n')} gutter="none" className="gq-error" renderLine={(line) => <span className="gq-bad">{line}</span>} />}
        {response && <CodePanel title="Response (first lines)" lines={[...response.lines, ...(response.cut ? [`… ${response.cut} more lines`] : [])]} gutter="none" />}
        <Hint block>
          {HONEST_COMPARE} No attack here: a client can simply ask for far more than it needs, and the server must price a query before it spends anything on it. Real servers combine depth,
          cost and timeouts; these limits are illustrative, and this lesson never runs more than 5,000 resolvers in your browser.
        </Hint>
      </div>
    </StageFrame>
  );
}
