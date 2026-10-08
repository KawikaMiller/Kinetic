import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { mulberry32 } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, ladder, type IkFrame } from './frames';
import {
  BODY, FAILURES, OTHER_BODY, POLICIES, TTL_H, duplicateRows, money, newServer, raceScenario, retryScenario, retryTimes, reuseScenario, roundSpread, type Failure,
  type Policy, type Server, type Step,
} from './model';
import './styles.css';

type SceneId = 'retry' | 'race' | 'reuse' | 'policy';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'retry', label: 'Retry' },
  { value: 'race', label: 'Concurrent retries' },
  { value: 'reuse', label: 'Reuse & expiry' },
  { value: 'policy', label: 'Retry policy' },
];
const HONEST = 'Simulated payment API; the key store is in memory. The Idempotency-Key header comes from an IETF Internet-Draft (not a published standard) that many APIs follow.';
const STEP_MS = 1400;
const ACTORS = [
  { id: 'client', label: 'Client', tone: 'info' as const },
  { id: 'api', label: 'Payment API' },
  { id: 'ledger', label: 'Ledger' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'retry' });
  if (scene === 'race') return <RaceScene picker={picker} />;
  if (scene === 'reuse') return <ReuseScene picker={picker} />;
  if (scene === 'policy') return <PolicyScene picker={picker} />;
  return <RetryScene picker={picker} />;
}

const LEGEND = (
  <Legend items={[
    { color: 'var(--info)', label: 'request' }, { color: 'var(--hi)', label: 'current / key in progress' }, { color: 'var(--bad)', label: 'lost ✕ / duplicate charge' },
    { color: 'var(--ok)', label: 'ledger row' }, { color: 'var(--violet)', label: 'stored response replayed' }, { color: 'var(--orange)', label: '409 / 422 refusal' },
  ]} />
);

/** The ladder, the ledger and the key store for one scripted exchange, stepped by a player. */
function Exchange({ steps, intro, controls, extra }: { steps: Step[]; intro: ReactNode; controls: ReactNode[]; extra?: ReactNode }) {
  const frames = useMemo(() => buildFrames(steps, intro), [steps, intro]);
  const player = usePlayer<IkFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const at = player.frame.at;
  const server: Server = at < 0 ? newServer(steps[0]?.server.lockFirst) : steps[Math.min(at, steps.length - 1)].server;
  const current = at >= 0 && at < steps.length ? steps[at] : null;
  const messages = useMemo(() => ladder(steps), [steps]);

  return (
    <StageFrame player={player} height={480} legend={LEGEND} controls={controls}>
      <div className="stage-pad ik">
        <SequenceDiagram actors={ACTORS} messages={messages} step={Math.min(at, steps.length)} ariaLabel="Payment exchange" />
        <div className="ik-tables">
          <Ledger server={server} />
          <KeyStore server={server} replaying={current?.kind === 'replay'} />
        </div>
        {extra}
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

function Ledger({ server }: { server: Server }) {
  const dups = duplicateRows(server);
  return (
    <div className="ik-table">
      <SectionTitle weight="regular" hint={`${server.ledger.length} ${server.ledger.length === 1 ? 'charge' : 'charges'}`}>Ledger</SectionTitle>
      {server.ledger.length ? (
        <table className="data-table">
          <thead><tr><th>payment</th><th>amount</th><th>from attempt</th></tr></thead>
          <tbody>{server.ledger.map((r, i) => (
            <tr key={r.id} className={dups.includes(i) ? 'ik-dup' : 'ik-ok'}><td>{r.id}{dups.includes(i) ? ' · duplicate' : i > 0 ? ' · a different payment' : ''}</td><td>{money(r.amount)}</td><td>{r.attempt}</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="empty-note">no charges</p>}
    </div>
  );
}

function KeyStore({ server, replaying }: { server: Server; replaying: boolean }) {
  const keys = Object.entries(server.keys);
  return (
    <div className="ik-table">
      <SectionTitle weight="regular" hint={server.lockFirst ? 'claimed before work' : 'written after work'}>Key store</SectionTitle>
      {keys.length ? (
        <table className="data-table">
          <thead><tr><th>key</th><th>body</th><th>state</th><th>stored response</th></tr></thead>
          <tbody>{keys.map(([k, r]) => (
            <tr key={k} className={r.state === 'in-progress' ? 'ik-lock' : ''}>
              <td><code>{k.slice(0, 8)}…</code></td><td>{money(Number(r.fingerprint.split(' ')[0]))}</td>
              <td>{r.state === 'in-progress' ? '🔒 in progress' : 'done'}</td>
              <td className={replaying ? 'ik-replay' : ''}>{r.response ? `201 ${r.response.payment}` : '–'}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="empty-note">no keys</p>}
    </div>
  );
}

// ── Retry ───────────────────────────────────────────────────────────────

const NATURAL: [string, string, boolean][] = [
  ['GET /orders/7', 'safe and idempotent', false],
  ['PUT /orders/7/status = shipped', 'idempotent: same end state', false],
  ['DELETE /orders/7', 'idempotent: gone is gone', false],
  ['POST /payments', 'neither: each one charges', true],
  ['POST /accounts/7/credits { add: 10 }', 'neither: each one adds', true],
  ['PATCH /accounts/7 { credits: "+10" }', 'this patch is not idempotent', true],
];

function RetryScene({ picker }: { picker: ReactNode }) {
  const [failure, setFailure] = useState<Failure>('response-lost');
  const [withKey, setWithKey] = useState(false);
  const [fails, setFails] = useState(1);
  const steps = useMemo(() => retryScenario(failure, withKey, fails), [failure, withKey, fails]);
  const intro = useMemo(() => <>{FAILURES.find((f) => f.id === failure)!.label.slice(4)}, {withKey ? 'with an Idempotency-Key' : 'no key'}: the client keeps retrying until it gets an answer. Press play.</>, [failure, withKey]);
  return (
    <Exchange
      steps={steps}
      intro={intro}
      controls={[
        <>{picker}</>,
        <ControlGroup key="f" label="Inject a failure" inline>
          {FAILURES.map((f) => <ChipButton key={f.id} tone="bad" size="md" on={failure === f.id} onClick={() => setFailure(f.id)}>{f.label}</ChipButton>)}
        </ControlGroup>,
        <>
          <Toggle label="Idempotency-Key" value={withKey} onChange={setWithKey} off="No key" on="Send a key" />
          <Slider label={failure === 'client-timeout' ? 'Retries while still running' : 'Times it fails'} value={fails} min={1} max={3} onChange={setFails} />
        </>,
      ]}
      extra={
        <div className="ik-table">
          <SectionTitle weight="regular" hint="safe to retry as is?">Which requests need a key</SectionTitle>
          <table className="data-table ik-natural">
            <thead><tr><th>request</th><th>why</th><th>needs a key</th></tr></thead>
            <tbody>{NATURAL.map(([r, why, need]) => (
              <tr key={r}><td><code>{r}</code></td><td>{why}</td><td className={need ? 'ik-need' : 'ik-free'}>{need ? 'yes' : 'no'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      }
    />
  );
}

// ── Concurrent retries ──────────────────────────────────────────────────

function RaceScene({ picker }: { picker: ReactNode }) {
  const [lockFirst, setLockFirst] = useState(true);
  const steps = useMemo(() => raceScenario(lockFirst), [lockFirst]);
  const intro = useMemo(() => <>A double-click: two requests with the same key arrive, the second while the first is still charging. Key store: {lockFirst ? 'claim the key first' : 'look it up, write it after'}. Press play.</>, [lockFirst]);
  return (
    <Exchange
      steps={steps}
      intro={intro}
      controls={[<>{picker}<Toggle label="Key store" value={!lockFirst} onChange={(v) => setLockFirst(!v)} off="Claim the key first" on="Look up, write after" /></>]}
      extra={<Hint block>The test runs all 6 orderings of two requests: claiming the key first charges once in every one; looking up and writing afterwards charges twice in the 4 where both look before either writes. That is a check-then-act race (<code>race-conditions</code>): the claim must be one atomic insert, such as a unique key in the database. "Never double-processes" holds while the first handler is alive: a real server also expires an in-progress key after a timeout, since a crashed handler would otherwise leave it locked forever.</Hint>}
    />
  );
}

// ── Reuse & expiry ──────────────────────────────────────────────────────

const AFTER = [0.1, 1, 23, 25, 72] as const;
const afterLabel = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

function ReuseScene({ picker }: { picker: ReactNode }) {
  const [same, setSame] = useState(true);
  const [ai, setAi] = useState(1);
  const after = AFTER[ai];
  const body = same ? BODY : OTHER_BODY;
  const steps = useMemo(() => reuseScenario(after, body), [after, body]);
  const intro = useMemo(() => <>The first payment's response is lost; the client retries {afterLabel(after)} later with {same ? 'the same body' : `a different amount (${money(OTHER_BODY.amount)})`}. Keys are kept {TTL_H} h here. Press play.</>, [after, same]);
  return (
    <Exchange
      steps={steps}
      intro={intro}
      controls={[
        <>{picker}<Toggle label="The retry sends" value={!same} onChange={(v) => setSame(!v)} off="The same body" on="A different amount" /></>,
        <Slider key="a" label="Retry arrives after" value={ai} min={0} max={AFTER.length - 1} onChange={setAi} format={(i) => afterLabel(AFTER[i])} />,
      ]}
      extra={<Hint block>Keep keys longer than the client's whole retry window, or a late retry is charged again. {TTL_H} h is illustrative (Stripe documents at least 24 h). The draft answers a reused key with a different body with 422; some APIs use 400 or 409.</Hint>}
    />
  );
}

// ── Retry policy ────────────────────────────────────────────────────────

const CLIENTS = 6;
const RETRIES = 5;
const SEED = 11;
const BAR_S = 0.35;

function PolicyScene({ picker }: { picker: ReactNode }) {
  const [policy, setPolicy] = useState<Policy>('exponential');
  const times = useMemo(() => {
    const rnd = mulberry32(SEED);
    return Array.from({ length: CLIENTS }, () => retryTimes(policy, RETRIES, rnd));
  }, [policy]);
  const end = Math.max(...times.flat());
  const domain: [number, number] = [0, Math.max(4, Math.ceil(end + 1))];
  const bars: GanttBar[] = times.flatMap((ts, c) => ts.map((t, k) => ({ id: `c${c}-${k}`, lane: `c${c}`, start: t, end: t + BAR_S, tone: 'info' as const })));
  const spread = roundSpread(times, RETRIES - 1);
  useIntroCaption(
    <>{CLIENTS} clients failed at the same moment. {policy === 'jitter'
      ? <>With jitter their last retries spread over <span className="hl ok">{spread.toFixed(1)} s</span>, so a recovering server sees a trickle, not a wall.</>
      : <>Every client sends each retry at <span className="hl bad">the same instant</span>{policy === 'immediate' ? ', with no pause at all' : ''}: a recovering server is hit by all {CLIENTS} at once, every round.</>}</>,
    [policy],
  );
  return (
    <StageFrame height={360} legend={<Legend items={[{ color: 'var(--info)', label: 'retry attempt' }]} />}
      controls={[<>{picker}<Segmented label="Retry policy" value={policy} onChange={setPolicy} options={POLICIES.map((p) => ({ value: p.id, label: p.label }))} /></>]}>
      <div className="stage-pad ik">
        <SectionTitle weight="regular" hint={`seconds after the failure · seeded (${SEED})`}>{RETRIES} retries per client</SectionTitle>
        <WideRegion minWidth={480} label="Retry timeline: scroll sideways to see all of it">
          <GanttLanes lanes={times.map((_, c) => ({ id: `c${c}`, label: `client ${c + 1}` }))} bars={bars} domain={domain} unit=" s" axis ariaLabel="Retry times per client" />
        </WideRegion>
        <Hint block>
          Exponential backoff doubles the wait (1, 2, 4, 8 s, capped at 16); full jitter picks a random wait between 0 and that. Retries still need the key:
          backoff spaces them out, the key makes them harmless. When the server is clearly down, a circuit breaker stops retrying altogether (<code>circuit-breakers</code>).
          Seeded randomness; illustrative timings.
        </Hint>
      </div>
    </StageFrame>
  );
}
