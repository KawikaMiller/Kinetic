import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useLoop } from '../../core/hooks';
import { N, nodeName, Raft, type Entry, type Msg, type RaftEvent, type Role } from './sim';
import './styles.css';

const ROLE_COLOR: Record<Role | 'dead', string> = {
  follower: 'var(--info)',
  candidate: 'var(--hi)',
  leader: 'var(--ok)',
  dead: 'var(--bad)',
};
const TERM_HUES = ['#4cc9f0', '#a78bfa', '#ffd166', '#ff8c5a', '#3ddc97', '#ff5d8f', '#8fb8ff', '#f7b538'];
const termColor = (t: number) => TERM_HUES[t % TERM_HUES.length];

const EVENT_STYLE: Record<RaftEvent['kind'], { cls: string; label: string }> = {
  election: { cls: 'hl', label: 'election' },
  leader: { cls: 'hl ok', label: 'leader' },
  step: { cls: 'hl violet', label: 'step down' },
  commit: { cls: 'hl ok', label: 'commit' },
  crash: { cls: 'hl bad', label: 'crash' },
  client: { cls: 'hl info', label: 'client' },
  partition: { cls: 'hl bad', label: 'network' },
};

// cluster geometry (SVG units)
const CX = 230;
const CY = 208;
const RING = 150;
const NODE_R = 32;
const deg = (i: number) => -90 + i * (360 / N);
const pos = (i: number, r = RING) => {
  const a = (deg(i) * Math.PI) / 180;
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
};

interface NodeView {
  id: number;
  role: Role;
  term: number;
  alive: boolean;
  log: Entry[];
  commit: number;
  votes: number;
  votedFor: number | null;
  timerLeft: number; // 0..1
  sinceBeat: number; // ms since last heartbeat broadcast (leaders)
}

interface View {
  now: number;
  nodes: NodeView[];
  msgs: Msg[];
  events: RaftEvent[];
  minority: number[] | null;
}

function snapshot(r: Raft): View {
  return {
    now: r.now,
    nodes: r.nodes.map((n) => ({
      id: n.id, role: n.role, term: n.term, alive: n.alive, log: n.log.slice(), commit: n.commit,
      votes: n.votes.size, votedFor: n.votedFor,
      timerLeft: Math.max(0, Math.min(1, (n.timeoutAt - r.now) / n.timeoutDur)),
      sinceBeat: r.now - (n.nextHeartbeat - 800),
    })),
    msgs: r.msgs.map((m) => ({ ...m })),
    events: r.events.slice(-7).reverse(),
    minority: r.minority ? [...r.minority] : null,
  };
}

export function Stage() {
  const setCaption = useSetCaption();
  const simRef = useRef<Raft | null>(null);
  const raft = () => (simRef.current ??= new Raft());
  const [view, setView] = useState<View | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [partitioned, setPartitioned] = useState(false);

  useEffect(() => {
    const r = raft();
    r.onEvent = (e) => {
      const s = EVENT_STYLE[e.kind];
      setCaption(
        <>
          <span className={s.cls}>{s.label}</span> {e.text}
        </>,
      );
    };
    setCaption(
      <>
        Five servers, no leader yet. Each ring is an <b>election timer</b>: whoever runs out first asks the others for
        votes.
      </>,
    );
    setView(snapshot(r));
    // raft() is a stable lazy accessor over a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCaption]);

  useLoop((dt) => {
    const r = raft();
    r.step(dt * 1000 * speed);
    setView(snapshot(r));
  }, !paused);

  const send = () => {
    const r = raft();
    const n = r.clientCommand();
    if (!n) setCaption(<>No leader right now, so the client has nobody to talk to. Wait for an election to finish.</>);
    setView(snapshot(r));
  };

  const togglePartition = () => {
    const r = raft();
    r.setPartition(!partitioned);
    setPartitioned(!partitioned);
    if (!partitioned) {
      setCaption(
        <>
          <span className="hl bad">Partition!</span> The leader is stuck with only 1 friend. It can take commands but
          never reach <b>3/5</b> to commit them. The other 3 will elect a new leader.
        </>,
      );
    }
    setView(snapshot(r));
  };

  const toggleNode = (i: number) => {
    const r = raft();
    r.toggleNode(i);
    setView(snapshot(r));
  };

  if (!view) return null;
  const leader = view.nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0];
  const maxTerm = Math.max(...view.nodes.map((n) => n.term));
  const committed = Math.max(...view.nodes.map((n) => n.commit));

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Term" value={maxTerm} color={termColor(maxTerm)} />
          <Stat label="Leader" value={leader ? nodeName(leader.id) : 'none'} color={leader ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Committed" value={committed} color="var(--ok)" sub="log entries" />
          <Stat label="In flight" value={view.msgs.length} sub="messages" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: ROLE_COLOR.follower, label: 'follower', shape: 'dot' },
            { color: ROLE_COLOR.candidate, label: 'candidate', shape: 'dot' },
            { color: ROLE_COLOR.leader, label: 'leader', shape: 'dot' },
            { color: 'var(--violet)', label: 'vote request', shape: 'dot' },
            { color: 'var(--info)', label: 'heartbeat', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Button variant="primary" onClick={send}>
            ✉ Send command
          </Button>
          <Button variant={partitioned ? 'primary' : 'danger'} onClick={togglePartition}>
            {partitioned ? '⛓ Heal network' : '✂ Partition network'}
          </Button>
          <Slider label="Sim speed" value={speed} min={0.25} max={2} step={0.25} onChange={setSpeed} format={(v) => `${v}×`} />
          <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
          <span className="rf-hint">click a server to crash / restart it</span>
        </Controls>
      }
    >
      <div className="rf">
        <Cluster view={view} onNode={toggleNode} />
        <div className="rf-side">
          <LogTable nodes={view.nodes} leaderId={leader?.id ?? null} />
          <div className="rf-events">
            <h4>Event log</h4>
            <ul>
              <AnimatePresence initial={false}>
                {view.events.map((e) => (
                  <motion.li
                    key={`${e.t}-${e.text}`}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <i className={`rf-ev-dot rf-ev-${e.kind}`} />
                    {e.text}
                  </motion.li>
                ))}
              </AnimatePresence>
              {!view.events.length && <li className="muted">Waiting for the first timeout…</li>}
            </ul>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function Cluster({ view, onNode }: { view: View; onNode: (i: number) => void }) {
  const wall = (() => {
    if (!view.minority) return null;
    // minority is two adjacent nodes; the wall is a line perpendicular to their midpoint
    // direction, placed roughly halfway between them and the other three
    const [a, b] = view.minority;
    const first = (b - a + N) % N === 1 ? a : b;
    const mid = ((deg(first) + 180 / N) * Math.PI) / 180;
    const u = { x: Math.cos(mid), y: Math.sin(mid) };
    const v = { x: -u.y, y: u.x };
    const c = { x: CX + u.x * 40, y: CY + u.y * 40 };
    const half = 200;
    return {
      p: { x: c.x + v.x * half, y: c.y + v.y * half },
      q: { x: c.x - v.x * half, y: c.y - v.y * half },
      label: { x: c.x + v.x * half * 0.72 + u.x * 18, y: c.y + v.y * half * 0.72 + u.y * 18 + 4 },
    };
  })();

  return (
    <svg viewBox="0 0 460 420" className="rf-svg">
      <circle cx={CX} cy={CY} r={RING} className="rf-orbit" />

      {view.msgs.map((m) => {
        const a = pos(m.from);
        const b = pos(m.to);
        const raw = (view.now - m.sentAt) / (m.arriveAt - m.sentAt);
        const p = m.lost ? Math.min(raw, 0.5) : raw;
        const x = a.x + (b.x - a.x) * p;
        const y = a.y + (b.y - a.y) * p;
        const fading = m.lost && raw > 0.5 ? Math.max(0, 1 - (raw - 0.5) * 2) : 1;
        const { r } = msgStyle(m);
        const color = m.lost && raw > 0.5 ? 'var(--bad)' : msgStyle(m).color;
        return (
          <circle key={m.id} cx={x} cy={y} r={r} fill={color} opacity={fading} className="rf-msg">
            {m.type === 'vote' && <title>RequestVote</title>}
          </circle>
        );
      })}

      {wall && (
        <g className="rf-wall">
          <line x1={wall.p.x} y1={wall.p.y} x2={wall.q.x} y2={wall.q.y} />
          <text x={wall.label.x} y={wall.label.y} textAnchor="middle">
            partition
          </text>
        </g>
      )}

      {view.nodes.map((n) => {
        const p = pos(n.id);
        const color = n.alive ? ROLE_COLOR[n.role] : ROLE_COLOR.dead;
        const circ = 2 * Math.PI * (NODE_R + 8);
        const beat = n.role === 'leader' ? Math.max(0, 1 - n.sinceBeat / 500) : 0;
        return (
          <g key={n.id} className="rf-node" onClick={() => onNode(n.id)} style={{ '--c': color } as CSSProperties}>
            {n.alive && n.role !== 'leader' && (
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE_R + 8}
                className="rf-timer"
                strokeDasharray={`${circ * n.timerLeft} ${circ}`}
                transform={`rotate(-90 ${p.x} ${p.y})`}
              />
            )}
            {n.alive && n.role === 'leader' && (
              <circle cx={p.x} cy={p.y} r={NODE_R + 6 + beat * -4 + (1 - beat) * 10} className="rf-beat" opacity={beat * 0.8} />
            )}
            <circle cx={p.x} cy={p.y} r={NODE_R} className={`rf-body ${n.alive ? '' : 'dead'}`} />
            <text x={p.x} y={p.y - 2} textAnchor="middle" className="rf-name">
              {n.alive ? nodeName(n.id) : '✕'}
            </text>
            <text x={p.x} y={p.y + 14} textAnchor="middle" className="rf-term">
              term {n.term}
            </text>
            <text x={p.x} y={p.y + NODE_R + 24} textAnchor="middle" className="rf-role" style={{ fill: color }}>
              {n.alive ? (n.role === 'candidate' ? `candidate · ${n.votes}/${N} votes` : n.role) : `${nodeName(n.id)} crashed`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function msgStyle(m: Msg): { color: string; r: number } {
  switch (m.type) {
    case 'vote':
      return { color: 'var(--violet)', r: 5 };
    case 'voteResp':
      return { color: m.granted ? 'var(--ok)' : 'var(--bad)', r: 4 };
    case 'append':
      return m.entries.length ? { color: 'var(--hi)', r: 5.5 } : { color: 'var(--info)', r: 3.5 };
    case 'appendResp':
      return { color: m.success ? 'var(--ok)' : 'var(--bad)', r: 2.5 };
  }
}

const MAX_COLS = 12;

function LogTable({ nodes, leaderId }: { nodes: NodeView[]; leaderId: number | null }) {
  const longest = Math.max(1, ...nodes.map((n) => n.log.length));
  const start = Math.max(0, longest - MAX_COLS);
  const cols = Array.from({ length: Math.min(MAX_COLS, longest) }, (_, k) => start + k);

  return (
    <div className="rf-logs">
      <h4>
        Logs <span>number = term the entry was written in · solid = committed</span>
      </h4>
      <div className="rf-log-grid" style={{ '--cols': cols.length } as CSSProperties}>
        <span />
        {cols.map((c) => (
          <span key={c} className="rf-idx">
            {c + 1}
          </span>
        ))}
        {nodes.map((n) => (
          <Row key={n.id} n={n} cols={cols} isLeader={n.id === leaderId} />
        ))}
      </div>
    </div>
  );
}

function Row({ n, cols, isLeader }: { n: NodeView; cols: number[]; isLeader: boolean }) {
  return (
    <>
      <span className={`rf-row-name ${isLeader ? 'lead' : ''} ${n.alive ? '' : 'dead'}`}>
        {nodeName(n.id)}
        {isLeader && ' ★'}
      </span>
      {cols.map((c) => {
        const e = n.log[c];
        if (!e) return <span key={c} className="rf-slot" />;
        const done = c < n.commit;
        return (
          <motion.span
            key={`${c}-${e.term}-${e.cmd}`}
            className={`rf-entry ${done ? 'done' : ''}`}
            style={{ '--tc': termColor(e.term) } as CSSProperties}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: n.alive ? 1 : 0.4 }}
            title={`${e.cmd} (term ${e.term}${done ? ', committed' : ''})`}
          >
            {e.term}
          </motion.span>
        );
      })}
    </>
  );
}
