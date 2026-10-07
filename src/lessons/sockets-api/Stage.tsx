import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GraphView, type GraphEdge, type GraphNode, type GraphNodeMark } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { toneVar, type Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import {
  LIFECYCLE_INTRO, bindCaption, pileupCaption, queueIntro, realRanges, sceneFrames, type Occupant, type SocketFrame,
} from './frames';
import {
  CLIENT_CODE, ERRNO_TEXT, HOSTS, SERVER_CODE, SERVER_PORT, TIME_WAIT_S, TOY_RANGE, TRANSITIONS, acceptQueueScene, bindCheck,
  lifecycle, pileup, rangeSize, tupleText, type Change, type CodeSide, type HostId, type PortState, type Sock, type Step, type TcpState,
} from './model';
import './styles.css';

type SceneId = 'life' | 'queue' | 'tw' | 'bind';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'life', label: 'Lifecycle' },
  { value: 'queue', label: 'Accept queue' },
  { value: 'tw', label: 'TIME_WAIT' },
  { value: 'bind', label: 'bind() errors' },
];
const STEP_MS = 1700;
const HONEST = "Simulated kernel: nothing touches a real network. Real systems' backlog and TIME_WAIT values vary; the ones shown are illustrative.";

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'life' });
  if (scene === 'queue') return <QueueScene picker={picker} />;
  if (scene === 'tw') return <TimeWaitScene picker={picker} />;
  if (scene === 'bind') return <BindScene picker={picker} />;
  return <LifecycleScene picker={picker} />;
}

// ── Tones: one rule for tables, FD slots and the diagram ────────────────

const TONE_RANK: Tone[] = ['hi', 'orange', 'violet', 'info', 'dim'];
function sockTone(s: Sock, lit: ReadonlySet<number>): Tone {
  if (lit.has(s.id)) return 'hi';
  if (s.listener) return 'violet';
  if (s.state === 'TIME_WAIT') return 'orange';
  if (s.state === 'CLOSED') return 'dim';
  return 'info';
}
const litOf = (s: Step | null) => new Set(s ? [...s.changes.map((c) => c.sock), ...(s.conn ? [s.conn] : [])] : []);
const owner = (s: Sock) => (s.host === 'server' ? (s.listener ? 'listener' : 'server') : 'client');
const sockName = (s: Sock) => `${owner(s)} ${s.fd === null ? '(no fd)' : `fd ${s.fd}`}`;

const CURRENT = { color: 'var(--hi)', label: 'current call / state' };
const LISTENING = { color: 'var(--violet)', label: 'listening socket' };
const CONNECTED = { color: 'var(--info)', label: 'connected socket' };
const LIFE_LEGEND = <Legend items={[CURRENT, LISTENING, CONNECTED, { color: 'var(--orange)', label: 'TIME_WAIT' }]} />;
const QUEUE_LEGEND = <Legend items={[CURRENT, LISTENING, CONNECTED, { color: 'var(--bad)', label: 'dropped SYN' }]} />;

// ── Lifecycle ───────────────────────────────────────────────────────────

function LifecycleScene({ picker }: { picker: ReactNode }) {
  const steps = useMemo(() => lifecycle(), []);
  const frames = useMemo(() => sceneFrames(steps, LIFECYCLE_INTRO), [steps]);
  const player = usePlayer<SocketFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const i = player.frame.step;
  const step = i >= 0 ? steps[i] : null;
  const socks = step ? step.socks : [];
  const lit = litOf(step);

  return (
    <StageFrame player={player} height={520} legend={LIFE_LEGEND} controls={[<>{picker}</>]}>
      <div className="stage-pad so">
        <WideRegion minWidth={560} label="Client and server code: scroll sideways to see both">
          <div className="so-procs">
            <Process host="alice" side="client" code={CLIENT_CODE} steps={steps} at={i} socks={socks} lit={lit} />
            <Process host="server" side="server" code={SERVER_CODE} steps={steps} at={i} socks={socks} lit={lit} />
          </div>
        </WideRegion>
        <div className="so-row">
          <StateDiagram step={step} latest={steps.slice(0, i + 1).flatMap((s) => s.changes).at(-1)} />
          <div className="so-side">
            <SocketTable socks={socks} lit={lit} />
            <AcceptQueue socks={socks} />
            <WireLine step={step} />
          </div>
        </div>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

/** One process: its code with the current call, and its FD table. */
function Process({ host, side, code, steps, at, socks, lit }: {
  host: HostId; side: CodeSide; code: readonly string[]; steps: readonly Step[]; at: number; socks: readonly Sock[]; lit: ReadonlySet<number>;
}) {
  const ran = new Map<number, string | undefined>();
  for (const s of steps.slice(0, at + 1)) {
    const line = s.line[side];
    if (line !== undefined) ran.set(line, s.ret ?? ran.get(line));
  }
  const now = at >= 0 ? steps[at] : null;
  const state = (l: number): LineState => {
    if (now?.line[side] === l) return 'now';
    if (now?.blocked[side] === l) return 'pending';
    return ran.has(l) ? 'past' : 'idle';
  };
  const trailing = (l: number) => {
    if (now?.blocked[side] === l) return now.line[side] === l ? 'blocks…' : 'blocked';
    const r = ran.get(l);
    return r === undefined ? null : `→ ${r}`;
  };
  const fds = socks.filter((s) => s.host === host && s.fd !== null).sort((a, b) => a.fd! - b.fd!);
  return (
    <div className="so-proc">
      <SectionTitle weight="regular" hint={HOSTS[host].ip}>{side} process</SectionTitle>
      <CodePanel lines={code} stateOf={state} trailing={trailing} className="so-code" />
      <table className="data-table so-fds" aria-label={`${side} FD table`}>
        <thead><tr><th>fd</th><th>points at</th></tr></thead>
        <tbody>
          <tr className="so-std"><td>0-2</td><td>stdin, stdout, stderr</td></tr>
          {fds.map((s) => (
            <tr key={s.id} className={`tone-${sockTone(s, lit)} so-fd`}>
              <td>{s.fd}</td>
              <td>{s.listener ? 'listening socket' : 'TCP socket'} · {s.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every socket the kernel holds, FD or not, with its 4-tuple and state. */
function SocketTable({ socks, lit }: { socks: readonly Sock[]; lit: ReadonlySet<number> }) {
  const live = socks.filter((s) => s.state !== 'CLOSED' || s.fd !== null);
  return (
    <div className="so-panel">
      <SectionTitle weight="regular" hint="in the kernel">Sockets</SectionTitle>
      {live.length === 0 ? <p className="empty-note">none yet</p> : (
        <table className="data-table so-socks">
          <thead><tr><th>owner</th><th>4-tuple</th><th>state</th></tr></thead>
          <tbody>
            {live.map((s) => (
              <tr key={s.id} className={`tone-${sockTone(s, lit)} so-sock`}>
                <td>{sockName(s)}</td>
                <td className="so-tuple">{s.local || s.remote ? tupleText(s) : 'unbound'}</td>
                <td className="so-state">{s.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The listener's queue of finished connections, as backlog slots. */
function AcceptQueue({ socks }: { socks: readonly Sock[] }) {
  const listener = socks.find((s) => s.listener && s.state === 'LISTEN');
  if (!listener) return null;
  const queued = listener.queue.map((id) => socks.find((s) => s.id === id)!);
  return (
    <div className="so-panel">
      <SectionTitle weight="regular" hint={`${queued.length} of ${listener.backlog}`}>Accept queue</SectionTitle>
      <ol className="so-queue" aria-label={`Accept queue: ${queued.length} of ${listener.backlog}`}>
        {Array.from({ length: listener.backlog }, (_, k) => (
          <li key={k} className={queued[k] ? 'so-slot is-full' : 'so-slot'}>{queued[k] ? `${queued[k].remote!.ip}:${queued[k].remote!.port}` : 'empty'}</li>
        ))}
      </ol>
    </div>
  );
}

function WireLine({ step }: { step: Step | null }) {
  const seg = step?.segment;
  return (
    <p className="so-wire">
      <span className="so-wire-label">on the wire</span>{' '}
      {seg ? <><b>{seg.flags}</b> {HOSTS[seg.from].label} → {HOSTS[seg.to].label}</> : <span className="so-faint">nothing</span>}
    </p>
  );
}

// ── The TCP state diagram ───────────────────────────────────────────────

type NodeId = TcpState | 'CLOSED_END';
const AT: Record<NodeId, { x: number; y: number }> = {
  CLOSED: { x: 260, y: 30 },
  SYN_SENT: { x: 100, y: 100 }, LISTEN: { x: 420, y: 100 },
  SYN_RCVD: { x: 420, y: 170 },
  ESTABLISHED: { x: 260, y: 240 },
  FIN_WAIT_1: { x: 100, y: 310 }, CLOSE_WAIT: { x: 420, y: 310 },
  FIN_WAIT_2: { x: 100, y: 380 }, LAST_ACK: { x: 420, y: 380 },
  TIME_WAIT: { x: 100, y: 450 }, CLOSED_END: { x: 420, y: 450 },
};
const DIAGRAM_W = 520;
const DIAGRAM_H = 492;
const TAG_PX = 11;
const BOX = { w: 116, h: 30, rx: 8 };
const toNode = (from: TcpState, to: TcpState): NodeId => (to === 'CLOSED' && from !== 'CLOSED' ? 'CLOSED_END' : to);
const NODES: GraphNode<NodeId>[] = (Object.keys(AT) as NodeId[]).map((id) => ({ id, at: AT[id], shape: 'box', label: id === 'CLOSED_END' ? 'CLOSED' : id }));
const EDGES: GraphEdge<NodeId>[] = TRANSITIONS.map((t) => ({ from: t.from, to: toNode(t.from, t.to) }));

function StateDiagram({ step, latest }: { step: Step | null; latest: Change | undefined }) {
  const socks = step ? step.socks.filter((s) => s.state !== 'CLOSED' || s.fd !== null) : [];
  const lit = litOf(step);
  const where = new Map<NodeId, { tone: Tone; tags: string[] }>();
  const add = (id: NodeId, tone: Tone, tag: string) => {
    const cur = where.get(id) ?? { tone, tags: [] };
    if (TONE_RANK.indexOf(tone) < TONE_RANK.indexOf(cur.tone)) cur.tone = tone;
    cur.tags.push(tag);
    where.set(id, cur);
  };
  for (const s of socks) add(s.state, sockTone(s, lit), sockName(s));
  for (const c of step?.changes ?? []) if (toNode(c.from, c.to) === 'CLOSED_END') add('CLOSED_END', 'hi', `${c.host === 'server' ? 'server' : 'client'} (gone)`);
  const taken = new Set((step?.changes ?? []).map((c) => `${c.from}>${toNode(c.from, c.to)}`));
  const mark = (id: NodeId): GraphNodeMark | null => {
    const w = where.get(id);
    if (!w) return null;
    return { tone: w.tone, fill: w.tone === 'hi' ? 'solid' : 'tint', tint: 22 };
  };

  return (
    <div className="so-diagram">
      <SectionTitle weight="regular" hint="RFC 9293, simplified">TCP states</SectionTitle>
      <WideRegion minWidth={minWidthForText(DIAGRAM_W, TAG_PX)} label="TCP state diagram: scroll sideways to see all of it">
        <GraphView
          nodes={NODES}
          edges={EDGES}
          directed
          width={DIAGRAM_W}
          height={DIAGRAM_H}
          box={BOX}
          nodeMark={mark}
          edgeMark={(e) => (taken.has(`${e.from}>${e.to}`) ? { tone: 'hi', width: 3.5 } : null)}
          renderNode={(node, at, base) => (
            <>
              {base}
              {where.get(node.id)?.tags.map((t, k) => (
                <text key={t} x={at.x} y={at.y + BOX.h / 2 + 12 + k * 12} className="so-tag" textAnchor="middle" style={{ fill: toneVar(where.get(node.id)!.tone === 'dim' ? 'muted' : where.get(node.id)!.tone) }}>{t}</text>
              ))}
            </>
          )}
          className="so-graph"
          ariaLabel={`TCP state diagram. ${socks.map((s) => `${sockName(s)} is in ${s.state}`).join('; ') || 'No sockets yet'}.`}
        />
      </WideRegion>
      <p className="so-last">
        {latest ? <>{step?.changes.includes(latest) ? 'This step' : 'Latest change'}: <b>{latest.from} → {latest.to}</b> ({latest.host === 'server' ? 'server' : 'client'}, on {latest.event.replace(/-/g, ' ')})</> : <span className="so-faint">No state change yet.</span>}
      </p>
      <Hint block>Left out: simultaneous open and close (CLOSING), and closing before connecting.</Hint>
    </div>
  );
}

// ── Accept queue ────────────────────────────────────────────────────────

function QueueScene({ picker }: { picker: ReactNode }) {
  const [slow, setSlow] = useState(true);
  const steps = useMemo(() => acceptQueueScene(slow), [slow]);
  const frames = useMemo(() => sceneFrames(steps, queueIntro(slow)), [steps, slow]);
  const player = usePlayer<SocketFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const i = player.frame.step;
  const step = i >= 0 ? steps[i] : steps[0];
  const lit = litOf(i >= 0 ? step : null);
  const dropped = steps.slice(0, i + 1).filter((s) => s.kind === 'queue-drop');
  const retried = new Set(steps.slice(0, i + 1).filter((s) => s.kind === 'queue-retry').map((s) => s.socks.find((x) => x.id === s.conn)!.remote!.port));
  const clientSocks = step.socks.filter((s) => s.host !== 'server');

  return (
    <StageFrame
      player={player}
      height={420}
      legend={QUEUE_LEGEND}
      controls={[<>{picker}<Toggle label="Server" value={slow} onChange={setSlow} off="Calls accept()" on="Slow: not accepting" /></>]}
    >
      <div className="stage-pad so">
        <div className="so-row">
          <div className="so-side">
            <AcceptQueue socks={step.socks} />
            <SocketTable socks={step.socks.filter((s) => s.host === 'server')} lit={lit} />
          </div>
          <div className="so-side">
            <div className="so-panel">
              <SectionTitle weight="regular" hint="connect() calls">Clients</SectionTitle>
              <table className="data-table so-socks">
                <thead><tr><th>client</th><th>source port</th><th>state</th></tr></thead>
                <tbody>
                  {clientSocks.map((s) => {
                    const lost = dropped.some((d) => d.conn === s.id) && !retried.has(s.local!.port);
                    return (
                      <tr key={s.id} className={`tone-${lost ? 'bad' : sockTone(s, lit)} so-sock`}>
                        <td>{HOSTS[s.host].label} {HOSTS[s.host].ip}</td>
                        <td><span className="chip tone-violet so-port">{s.local!.port}</span></td>
                        <td className="so-state">{s.state}{lost ? ' · SYN dropped, retrying' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ConsolePanel
              title="client log"
              empty="(nothing refused yet)"
              lines={dropped.map((d) => ({ text: `${HOSTS[d.socks.find((x) => x.id === d.conn)!.host].label}: SYN to ${HOSTS.server.ip}:${SERVER_PORT} dropped (queue full), retrying`, tone: 'bad' as Tone }))}
            />
          </div>
        </div>
        <Hint block>Linux drops the SYN when the queue is full (with tcp_abort_on_overflow set it resets instead), admits one more than the backlog, and caps the backlog at somaxconn. {HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

// ── TIME_WAIT pile-up ───────────────────────────────────────────────────

const PORT_COLS = 16;
const PORT_TONE: Record<PortState, Tone> = { free: 'dim', open: 'info', 'time-wait': 'orange' };

function TimeWaitScene({ picker }: { picker: ReactNode }) {
  const [reuse, setReuse] = useState(false);
  const run = useMemo(() => pileup({ reuse }), [reuse]);
  const frames = useMemo(() => run.map((f, k) => ({ step: k, say: pileupCaption(f, k, run, reuse, TOY_RANGE), hold: f.firstFailure ? 2 : 1 })), [run, reuse]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = run[player.frame.step];
  const size = rangeSize(TOY_RANGE);
  const rows = Math.ceil(size / PORT_COLS);

  return (
    <StageFrame
      player={player}
      height={380}
      legend={<Legend items={[
        { color: 'var(--dim)', label: 'free port' },
        { color: 'var(--info)', label: 'open connection' },
        { color: 'var(--orange)', label: 'TIME_WAIT' },
        { color: 'var(--bad)', label: 'refused connect()' },
      ]} />}
      stats={
        <Stats>
          <Stat label="connections tried" value={f.attempted} />
          <Stat label="connected" value={f.ok} />
          <Stat label="refused" value={f.failed} color={f.failed ? toneVar('bad') : undefined} />
          <Stat label="clock" value={`${f.t.toFixed(1)} s`} />
        </Stats>
      }
      controls={[<>{picker}<Toggle label="Client" value={reuse} onChange={setReuse} off="New connection per request" on="Keep-alive: reuse one" /></>]}
    >
      <div className="stage-pad so">
        <SectionTitle weight="regular" hint={`${TOY_RANGE.lo}-${TOY_RANGE.hi}, shrunk to ${size} ports`}>Client's ephemeral ports</SectionTitle>
        <CellGrid
          rows={rows}
          cols={PORT_COLS}
          size="sm"
          cell={(r, c) => {
            const p = f.ports[r * PORT_COLS + c];
            return { tone: PORT_TONE[p], fill: p === 'free' ? 'outline' : 'solid' };
          }}
          cellTitle={(r, c) => `port ${TOY_RANGE.lo + r * PORT_COLS + c}: ${f.ports[r * PORT_COLS + c]}`}
          ariaLabel={`${size} ports: ${f.timeWait} in TIME_WAIT, ${f.ports.filter((p) => p === 'open').length} open`}
        />
        <Bar value={f.timeWait} max={size} tone="orange" label={`ports in TIME_WAIT: ${f.timeWait} of ${size}`} />
        <Hint block>{realRanges()}</Hint>
        <Hint block>
          The fixes: reuse connections (HTTP keep-alive, a connection pool) so there are fewer closes, or let the server close first so it
          holds the TIME_WAIT. <code>SO_REUSEADDR</code> isn't the client's fix: it's for a server binding its port after a restart (see bind() errors).
          TIME_WAIT is {TIME_WAIT_S} s here, as on Linux. {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── bind() errors ───────────────────────────────────────────────────────

const PORTS = [8080, 80] as const;
const OCCUPANTS: { value: Occupant; label: string; states: TcpState[] }[] = [
  { value: 'nothing', label: 'nothing', states: [] },
  { value: 'listener', label: 'another server listening', states: ['LISTEN'] },
  { value: 'time-wait', label: 'old connections in TIME_WAIT', states: ['TIME_WAIT', 'TIME_WAIT', 'TIME_WAIT'] },
];

function BindScene({ picker }: { picker: ReactNode }) {
  const [port, setPort] = useState<number>(8080);
  const [occupant, setOccupant] = useState<Occupant>('time-wait');
  const [reuse, setReuse] = useState(false);
  const [root, setRoot] = useState(false);
  const occ = OCCUPANTS.find((o) => o.value === occupant)!;
  const r = bindCheck(port, { privileged: root, reuseAddr: reuse, onPort: occ.states });
  useIntroCaption(bindCaption(port, occupant, root, reuse, r), [port, occupant, root, reuse]);
  const lines = [
    { text: 'fd = socket(AF_INET, SOCK_STREAM, 0)  → 3', tone: 'muted' as Tone },
    ...(reuse ? [{ text: 'setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, 1)  → 0', tone: 'muted' as Tone }] : []),
    r.ok
      ? { text: `bind(fd, ${HOSTS.server.ip}:${port})  → 0`, tone: 'ok' as Tone }
      : { text: `bind(fd, ${HOSTS.server.ip}:${port})  → -1 ${r.errno} (${ERRNO_TEXT[r.errno]})`, tone: 'bad' as Tone },
  ];

  return (
    <StageFrame
      height={300}
      legend={<Legend items={[{ color: 'var(--ok)', label: 'bind() succeeded' }, { color: 'var(--bad)', label: 'bind() failed (errno)' }]} />}
      controls={[
        <>{picker}</>,
        <>
          <ControlGroup label="Port" inline>
            {PORTS.map((p) => <ChipButton key={p} tone="info" on={port === p} onClick={() => setPort(p)}>:{p}</ChipButton>)}
          </ControlGroup>
          <ControlGroup label="Already on that port" inline>
            {OCCUPANTS.map((o) => <ChipButton key={o.value} tone="info" on={occupant === o.value} onClick={() => setOccupant(o.value)}>{o.label}</ChipButton>)}
          </ControlGroup>
        </>,
        <>
          <Toggle label="Server sets SO_REUSEADDR" value={reuse} onChange={setReuse} off="No" on="Yes" />
          <Toggle label="Runs as" value={root} onChange={setRoot} off="Ordinary user" on="Root" />
        </>,
      ]}
    >
      <div className="stage-pad so">
        <SectionTitle weight="regular" hint="Linux rules">A server starting up</SectionTitle>
        <ConsolePanel title="syscalls" lines={lines} />
        <Hint block>
          SO_REUSEADDR is set on every run, so the old connections had it too (Linux needs both). SO_REUSEPORT, which lets several sockets share one
          listening port on purpose, isn't modelled. {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}
