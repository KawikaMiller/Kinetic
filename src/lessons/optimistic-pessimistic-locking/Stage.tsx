import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { barLabelPx } from '../../core/gantt';
import { decimal } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { HTTP_ACTORS, buildHttpFrames, changeCaption, httpLadder, introCaption, type HttpFrame } from './frames';
import {
  DEFAULT_TIMEOUT, LUNCH_TICKS, MAX_EDITORS, NAME, PRESET_ORDERS, START, STEPS, STRATEGIES, TRIALS, USERS, able, contention, contentionCurve,
  etag, finished, httpScript, lostUpdates, run, sqlFor, tally, type Ev, type Opts, type Strategy, type UserId, type World,
} from './model';
import './styles.css';

type SceneId = 'lanes' | 'http' | 'contention';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'lanes', label: 'Two editors' },
  { value: 'http', label: 'Over HTTP' },
  { value: 'contention', label: 'Contention' },
];
const LANE_TONE: Record<UserId, Tone> = { ana: 'info', ben: 'violet' };
const DEFAULT_PRESET = 'both-read';
const STEP_MS = 1400;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'lanes' });
  if (scene === 'http') return <HttpScene picker={picker} />;
  if (scene === 'contention') return <ContentionScene picker={picker} />;
  return <LanesScene picker={picker} />;
}

// ── Two editors ─────────────────────────────────────────────────────────

const STRATEGY_NOTE: Record<Strategy, string> = {
  none: 'Each user runs plain statements in its own transaction at READ COMMITTED: a transaction alone does not stop two read-modify-writes from overwriting each other.',
  pessimistic: 'SELECT … FOR UPDATE takes a row lock that is held until COMMIT: the second reader waits.',
  optimistic: 'No lock: the UPDATE only applies if the version is still the one that was read; 0 rows means someone else got there first.',
  atomic: 'One statement does the subtraction inside the database, so there is no read-modify-write to interleave. Only works when the change is a simple formula.',
};
const SCOPE = 'Simulated database row and lock manager at READ COMMITTED; times are in illustrative ticks.';

function LanesScene({ picker }: { picker: ReactNode }) {
  const [strategy, setStrategy] = useState<Strategy>('none');
  const [lunch, setLunch] = useState(false);
  const [timeout, setLockTimeout] = useState(DEFAULT_TIMEOUT);
  const [clicks, setClicks] = useState<UserId[]>(() => PRESET_ORDERS.find((p) => p.id === DEFAULT_PRESET)!.order);
  const [anchor, setAnchor] = useState(0);
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET);
  // The timeout only means something to a lock wait: the other strategies run on the default.
  const opts: Opts = useMemo(
    () => ({ editTicks: { ana: lunch ? LUNCH_TICKS : 1, ben: 1 }, lockTimeout: strategy === 'pessimistic' ? timeout : DEFAULT_TIMEOUT }),
    [lunch, timeout, strategy],
  );
  const w = useMemo(() => run(strategy, opts, clicks, presetId !== null), [strategy, opts, clicks, presetId]);
  const prev = useMemo(() => (anchor > 0 ? run(strategy, opts, clicks.slice(0, anchor)) : null), [strategy, opts, clicks, anchor]);
  const label = STRATEGIES.find((s) => s.id === strategy)!.label;
  useIntroCaption(changeCaption(prev, w, introCaption(label)), [w, prev, label]);
  const all = useMemo(() => tally(strategy, opts), [strategy, opts]);

  const load = (id: string) => {
    setPresetId(id);
    setClicks(PRESET_ORDERS.find((p) => p.id === id)!.order);
    setAnchor(0);
  };
  const reset = () => {
    setPresetId(null);
    setClicks([]);
    setAnchor(0);
  };
  const press = (u: UserId) => {
    setAnchor(clicks.length);
    setClicks([...clicks, u]);
  };
  const pickStrategy = (s: Strategy) => {
    setStrategy(s);
    if (presetId === null) reset();
  };

  return (
    <StageFrame
      height={560}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'Ana' }, { color: 'var(--violet)', label: 'Ben' }, { color: 'var(--hi)', label: 'current step / row lock' },
        { color: 'var(--ok)', label: 'committed' }, { color: 'var(--orange)', label: 'conflict detected' }, { color: 'var(--bad)', label: 'lost update / timeout' },
      ]} />}
      controls={[
        <>{picker}<Segmented label="Strategy" value={strategy} onChange={pickStrategy} options={STRATEGIES.map((s) => ({ value: s.id, label: s.label }))} /></>,
        <>
          <ControlGroup label="Load an ordering" inline>
            {PRESET_ORDERS.map((p) => <ChipButton key={p.id} tone="info" size="md" on={presetId === p.id} onClick={() => load(p.id)}>{p.label}</ChipButton>)}
          </ControlGroup>
          <Toggle label="Ana" value={lunch} onChange={setLunch} off="Edits quickly" on="Goes to lunch mid-edit" />
          {strategy === 'pessimistic' && <Slider label="Lock wait timeout" value={timeout} min={1} max={12} onChange={setLockTimeout} format={(v) => `${v} ticks`} />}
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad lk">
        <div className="lk-lanes">
          <Lane user="ana" w={w} disabled={presetId !== null} onStep={press} />
          <RowTable w={w} />
          <Lane user="ben" w={w} disabled={presetId !== null} onStep={press} />
        </div>
        <Timeline w={w} />
        <p className="lk-note">{STRATEGY_NOTE[strategy]}</p>
        <p className="lk-tally" role="status">{tallyText(strategy, all)}</p>
        <Hint block>{SCOPE} At stricter isolation levels the database may itself refuse the second write (see <code>isolation-levels</code>); this scene stays at READ COMMITTED. A deadlock needs two locks, so one row can't show it (<code>deadlocks</code>).</Hint>
      </div>
    </StageFrame>
  );
}

function tallyText(s: Strategy, t: ReturnType<typeof tally>): string {
  const of = `of all ${t.orderings} orderings of the six steps`;
  switch (s) {
    case 'none': return `No locking loses an update in ${t.lost} ${of}: every one where both users read before either saves.`;
    case 'pessimistic':
      return `Pessimistic locking loses an update in ${t.lost} ${of}; the second reader waits in ${t.blocked}${t.timedOut ? ` and times out in ${t.timedOut}` : ''}.`;
    case 'optimistic': return `Optimistic locking loses an update in ${t.lost} ${of}; a conflict is detected and retried in ${t.conflicts}.`;
    case 'atomic': return `The atomic UPDATE loses an update in ${t.lost} ${of}, with no waiting and no conflicts.`;
  }
}

/** The index of the SQL line a finished event ran. */
const LINE: Record<Ev['kind'], number> = { read: 0, wait: 0, edit: 1, save: 2 };

function Lane({ user, w, disabled, onStep }: { user: UserId; w: World; disabled: boolean; onStep: (u: UserId) => void }) {
  const s = w.users[user];
  const tone = LANE_TONE[user];
  const last = [...w.events].reverse().find((e) => e.kind !== 'wait');
  const sql = STEPS.map((st) => sqlFor(w.strategy, st, s.seen, s.local));
  // The line this user just ran is the current step; a conflicted save stays flagged until anyone acts again.
  const justRan = last && last.user === user ? LINE[last.kind] : -1;
  const state = (i: number): LineState => {
    if (i === justRan) return last!.kind === 'save' && last!.result === 'conflict' ? 'bad' : 'now';
    if (s.waitingSince !== null && i === 0) return 'pending';
    return i < s.pc ? 'done' : 'idle';
  };
  const status = s.outcome === 'saved' ? 'saved' : s.outcome === 'timeout' ? 'timed out' : s.waitingSince !== null ? 'waiting for the lock' : 'idle';
  return (
    <div className={`lk-lane tone-${tone}`}>
      <SectionTitle weight="regular" hint={`${status}${s.retries ? ` · ${s.retries} ${s.retries === 1 ? 'retry' : 'retries'}` : ''}`}>{NAME[user]}</SectionTitle>
      <div className="lk-steps" role="group" aria-label={`${NAME[user]}'s steps`}>
        {STEPS.map((st, i) => (
          <ChipButton key={st} tone={tone} size="md" disabled={disabled || !able(w, user) || s.pc !== i} onClick={() => onStep(user)}
            ariaLabel={`${NAME[user]}: ${st}`}>
            {s.pc > i ? '✓ ' : ''}{st}
          </ChipButton>
        ))}
      </div>
      <CodePanel lines={sql} gutter="none" stateOf={state} className="lk-sql"
        trailing={(i) => (i === 0 && s.waitingSince !== null ? 'blocked: the row is locked' : null)} />
    </div>
  );
}

function RowTable({ w }: { w: World }) {
  const lost = lostUpdates(w);
  return (
    <div className="lk-row">
      <SectionTitle weight="regular" hint="products">The row</SectionTitle>
      <table className="data-table">
        <thead><tr><th>id</th><th>stock</th><th>version</th><th>lock</th></tr></thead>
        <tbody>
          <tr>
            <td>7</td><td className="lk-stock">{w.row.stock}</td><td>{w.row.version}</td>
            <td className={w.lock ? 'lk-lock' : ''}>{w.lock ? `🔒 ${NAME[w.lock]}` : '–'}</td>
          </tr>
          {lost > 0 && finished(w) && (
            <tr className="lk-ghost"><td>7</td><td>{START.stock - w.committed}</td><td>ghost</td><td>should be, if no sale was lost</td></tr>
          )}
        </tbody>
      </table>
      {lost > 0 && finished(w) && <p className="lk-ghost-note">{lost} decrement lost: the red ghost row is what the stock should be.</p>}
    </div>
  );
}

function Timeline({ w }: { w: World }) {
  const maxT = Math.max(...w.events.map((e) => e.t1), w.now, 6);
  const bars: GanttBar[] = w.events.map((e, i) => ({
    id: `e${i}`, lane: e.user, start: e.t0, end: e.t1, tone: LANE_TONE[e.user],
    kind: e.kind === 'wait' ? 'blocked' : 'work',
    label: e.kind === 'wait' ? (e.result === 'timeout' ? 'timeout' : 'waits') : e.kind,
    ring: e.kind === 'wait' ? (e.result === 'timeout' ? 'bad' : undefined)
      : e.kind === 'save' ? (e.result === 'conflict' ? 'orange' : e.clobbered ? 'bad' : 'ok') : undefined,
  }));
  return (
    <div className="lk-timeline">
      <SectionTitle weight="regular" hint="ticks · dashed = blocked on the lock">Timeline</SectionTitle>
      <WideRegion minWidth={440} label="Timeline: scroll sideways to see all of it">
        <GanttLanes lanes={USERS.map((u) => ({ id: u, label: NAME[u] }))} bars={bars} domain={[0, Math.ceil(maxT) + 1]} now={w.now} axis size="md"
          labelMinPx={barLabelPx('timeout')} ariaLabel="Each user's steps over time" />
      </WideRegion>
    </div>
  );
}

// ── Over HTTP ───────────────────────────────────────────────────────────

function HttpScene({ picker }: { picker: ReactNode }) {
  const [requireIfMatch, setRequire] = useState(false);
  const [sends, setSends] = useState(true);
  const steps = useMemo(() => httpScript(requireIfMatch, sends), [requireIfMatch, sends]);
  const intro = useMemo(
    () => <>Both users load product 7 and sell one unit; Ben's save arrives second. The server {requireIfMatch ? 'requires' : "doesn't require"} If-Match, and Ben {sends ? 'sends' : "doesn't send"} one. Press play.</>,
    [requireIfMatch, sends],
  );
  const frames = useMemo(() => buildHttpFrames(steps, intro), [steps, intro]);
  const player = usePlayer<HttpFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const at = player.frame.at;
  const product = at < 0 ? { stock: START.stock, version: START.version } : steps[Math.min(at, steps.length - 1)].product;
  const messages = useMemo(() => httpLadder(steps), [steps]);

  return (
    <StageFrame
      player={player}
      height={460}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'Ana' }, { color: 'var(--violet)', label: 'Ben' }, { color: 'var(--hi)', label: 'current message' },
        { color: 'var(--ok)', label: '200 applied' }, { color: 'var(--orange)', label: '412 / 428' }, { color: 'var(--bad)', label: 'stale write applied' },
      ]} />}
      controls={[<>{picker}<Toggle label="Server" value={requireIfMatch} onChange={setRequire} off="Doesn't require If-Match" on="Requires If-Match" />
        <Toggle label="Ben" value={sends} onChange={setSends} off="Sends no If-Match" on="Sends If-Match" /></>]}
    >
      <div className="stage-pad lk">
        <SequenceDiagram actors={HTTP_ACTORS} messages={messages} step={Math.min(at, steps.length)} ariaLabel="Conditional PUT exchange" />
        <div className="lk-row">
          <SectionTitle weight="regular" hint="what the server holds">Product 7</SectionTitle>
          <table className="data-table">
            <thead><tr><th>stock</th><th>current ETag</th></tr></thead>
            <tbody><tr><td className="lk-stock">{product.stock}</td><td><code>{etag(product.version)}</code></td></tr></tbody>
          </table>
        </div>
        <Hint block>
          Simulated server. The ETag here is just the version; real servers derive it from the content or a version. If-Match compares strongly (RFC 9110 §13.1.1), and 412 and 428 are
          the answers for a failed and a missing precondition. The same check-the-version idea as the optimistic UPDATE, one HTTP layer up.
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Contention ──────────────────────────────────────────────────────────

const CURVE = contentionCurve();

function ContentionScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(8);
  const c = contention(n);
  const winner = c.optimisticLost < c.pessimisticLost ? 'optimistic' : 'pessimistic';
  useIntroCaption(
    <>{n} {n === 1 ? 'editor' : 'editors'} on one row: optimistic throws away <span className="hl">{decimal(c.optimisticLost, 1)} ticks</span> of redone work per editor ({decimal(c.retries, 2)} conflicts), pessimistic
      loses <span className="hl">{decimal(c.pessimisticLost, 1)} ticks</span> to the lock. {n === 1 ? 'Alone, optimistic pays nothing; the lock still costs a little.' : <>{winner === 'optimistic' ? 'Optimistic' : 'Pessimistic'} loses less here.</>}</>,
    [n],
  );
  return (
    <StageFrame
      height={420}
      legend={<Legend items={[{ color: 'var(--sky)', label: 'optimistic: work redone after conflicts' }, { color: 'var(--pink)', label: 'pessimistic: waiting + lock cost' }, { color: 'var(--hi)', label: 'chosen editors' }]} />}
      controls={[<>{picker}<Slider label="Concurrent editors" value={n} min={1} max={MAX_EDITORS} onChange={setN} /></>]}
    >
      <div className="stage-pad lk">
        <div className="lk-cols">
          <div className="lk-stats">
            <Stat label="Optimistic" value={`${decimal(c.optimisticLost, 1)} ticks`} sub={`${decimal(c.retries, 2)} conflicts per editor`} />
            <Stat label="Pessimistic" value={`${decimal(c.pessimisticLost, 1)} ticks`} sub="waiting for the lock, plus its fixed cost" />
          </div>
          <div className="lk-plot">
            <Plot2D x={{ domain: [1, MAX_EDITORS], label: 'concurrent editors' }} y={{ domain: [0, 20], label: 'ticks lost per editor' }} ariaLabel="Ticks lost per editor against concurrent editors, for both strategies">
              <Curve points={CURVE.map((p) => [p.editors, p.optimisticLost])} tone="sky" />
              <Curve points={CURVE.map((p) => [p.editors, p.pessimisticLost])} tone="pink" />
              <VLine at={n} tone="hi" />
              <Points data={[{ x: n, y: c.optimisticLost, tone: 'sky' }, { x: n, y: c.pessimisticLost, tone: 'pink' }]} />
            </Plot2D>
          </div>
        </div>
        <Hint block>
          Seeded model, averaged over {TRIALS} arrival patterns: each editor's read, edit and save takes 3 ticks, and editors arrive at random within 30 ticks.
          Optimistic redoes all 3 ticks on each conflict; pessimistic queues behind the lock and pays an illustrative 0.5 tick to take it. Real numbers depend on how long the lock is held and how often rows collide.
        </Hint>
      </div>
    </StageFrame>
  );
}
