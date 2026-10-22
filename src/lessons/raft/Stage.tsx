import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import {
  Button, ClaimLabel, Controls, Hint, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats,
} from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { times } from '../../core/format';
import { useLoop } from '../../core/hooks';
import { cssVar, type TokenName } from '../../core/palette';
import { useSimulation } from '../../core/useSimulation';
import { SCHEDULE_SEEDS } from './check';
import { DEFAULT_SEED, LiveRaft } from './live';
import { SafetyPanel } from './SafetyPanel';
import { HEARTBEAT, LATENCY, MAJORITY, N, nodeName, TIMEOUT_MAX, TIMEOUT_MIN, type Raft, type RaftEvent, type RaftVariant, type Role } from './sim';
import {
  clusterView, CX, CY, deg, motionView, NODE_R, pos, RING, TIMER_R, VIEW_H, VIEW_W,
  type ClusterView, type MotionView, type NodeView,
} from './view';
import './styles.css';

const WIDE_MIN_PX = 420; // the narrowest width where the cluster ring and the log table still read
const SNAPSHOT_EVERY_S = 0.1; // roles, terms and logs; the moving parts update every frame
const BEAT_MS = 500; // how long a leader's heartbeat pulse lasts
const LOG_COLS = 12;

const ROLE_COLOR: Record<Role | 'dead', string> = {
  follower: 'var(--info)',
  candidate: 'var(--hi)',
  leader: 'var(--ok)',
  dead: 'var(--bad)',
};
const TERM_HUES: TokenName[] = ['info', 'violet', 'hi', 'orange', 'ok', 'pink', 'sky', 'amber'];
const termColor = (t: number) => cssVar(TERM_HUES[t % TERM_HUES.length]);

const EVENT_STYLE: Record<RaftEvent['kind'], { cls: string; label: string }> = {
  election: { cls: 'hl', label: 'election' },
  leader: { cls: 'hl ok', label: 'leader' },
  step: { cls: 'hl violet', label: 'step down' },
  commit: { cls: 'hl ok', label: 'commit' },
  crash: { cls: 'hl bad', label: 'crash' },
  client: { cls: 'hl info', label: 'client' },
  partition: { cls: 'hl bad', label: 'network' },
};

const roleColor = (n: { role: Role; alive: boolean }) => (n.alive ? ROLE_COLOR[n.role] : ROLE_COLOR.dead);
const NO_MOTION: MotionView = { msgs: [], rings: [] };

const VARIANT_OPTIONS: { value: RaftVariant; label: string }[] = [
  { value: 'raft', label: 'Real rules' },
  { value: 'commit-without-majority', label: 'Commit without a majority' },
  { value: 'vote-without-log-check', label: 'Vote without a log check' },
];

/** What the partition caption says about the cut-off pair and about the rest, from the cluster's actual state. */
function partitionCaption(raft: Raft) {
  const rest = raft.nodes.filter((n) => n.alive && !raft.minority?.has(n.id)).length;
  const cut = [...(raft.minority ?? [])].map(nodeName).join(' + ');
  const commits =
    raft.variant === 'commit-without-majority'
      ? 'The bug lets it commit on 2 of 5 servers, short of a majority.'
      : `It can take commands but cannot reach ${MAJORITY} of ${N} to commit them.`;
  const others =
    rest >= MAJORITY
      ? `The other ${rest} live servers are a majority and can elect a new leader.`
      : `Only ${rest} live servers are on the other side: not a majority, so nobody there can win an election.`;
  return (
    <>
      <span className="hl bad">Partition!</span> {cut} are cut off. {commits} {others}
    </>
  );
}

export function Stage() {
  const setCaption = useSetCaption();
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [variant, setVariant] = useState<RaftVariant>('raft');

  useIntroCaption(
    <>
      Five servers, no leader yet. Each ring is an <b>election timer</b>: whoever runs out first asks the others for
      votes.
    </>,
  );

  const { world, snap: view, paused, togglePause, refresh, reset } = useSimulation({
    create: () => {
      const live = new LiveRaft(seed, variant);
      live.raft.onEvent = (e) => {
        const s = EVENT_STYLE[e.kind];
        setCaption(
          <>
            <span className={s.cls}>{s.label}</span> {e.text}
          </>,
        );
      };
      return live;
    },
    step: (live, dt) => live.advance(dt * 1000 * speed),
    snapshot: (live) => clusterView(live.raft, live.monitor),
    snapshotEvery: SNAPSHOT_EVERY_S,
  });
  const raftOf = useCallback(() => world().raft, [world]);

  // A new seed or rule set starts a new run; the first render already built the right one.
  const runKey = useRef(`${seed}/${variant}`);
  useEffect(() => {
    const key = `${seed}/${variant}`;
    if (runKey.current === key) return;
    runKey.current = key;
    reset();
    setCaption(
      <>
        New run: seed {seed}, {VARIANT_OPTIONS.find((o) => o.value === variant)?.label.toLowerCase()}. Five servers, no leader yet.
      </>,
    );
  }, [seed, variant, reset, setCaption]);

  const send = () => {
    if (!raftOf().clientCommand()) setCaption(<>No leader right now, so the client has nobody to talk to. Wait for an election to finish.</>);
    refresh();
  };

  const togglePartition = () => {
    const raft = raftOf();
    const cutting = !raft.minority;
    raft.setPartition(cutting);
    if (cutting) setCaption(partitionCaption(raft));
    refresh();
  };

  const toggleNode = (i: number) => {
    raftOf().toggleNode(i);
    refresh();
  };

  if (!view) return null;
  const partitioned = view.minority !== null;
  const leader = view.nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0];
  const maxTerm = Math.max(...view.nodes.map((n) => n.term));
  const committed = Math.max(...view.nodes.map((n) => n.commit));

  return (
    <StageFrame
      height={0}
      stats={
        <Stats>
          <Stat label="Term" value={maxTerm} color={termColor(maxTerm)} />
          <Stat label="Leader" value={leader ? nodeName(leader.id) : 'none'} color={leader ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Committed" value={committed} color="var(--ok)" sub="log entries" />
          <Stat label="In flight" value={view.msgCount} sub="messages" />
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
          <Slider label="Sim speed" value={speed} min={0.25} max={2} step={0.25} onChange={setSpeed} format={times} />
          <PauseButton paused={paused} onToggle={togglePause} />
          <Segmented label="Rules" value={variant} onChange={setVariant} options={VARIANT_OPTIONS} />
          <SeedField seed={seed} onSeed={setSeed} />
          <Hint>click a server (or focus it and press Enter) to crash / restart it</Hint>
        </Controls>
      }
    >
      <WideRegion minWidth={WIDE_MIN_PX}>
      <div className="rf">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="rf-svg">
          <circle cx={CX} cy={CY} r={RING} className="rf-orbit" />
          <MotionLayer world={raftOf} running={!paused} view={view} />
          <PartitionWall minority={view.minority} />
          {view.nodes.map((n) => (
            <NodeBody key={n.id} n={n} onClick={() => toggleNode(n.id)} />
          ))}
        </svg>
        <div className="rf-side">
          <LogTable nodes={view.nodes} leaderId={leader?.id ?? null} />
          <EventLog events={view.events} />
        </div>
      </div>
      </WideRegion>
      <SafetyPanel safety={view.safety} variant={variant} />
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>
          a model of Raft, slowed so you can watch: latency about {LATENCY} ms, heartbeat {HEARTBEAT} ms, election timeouts {TIMEOUT_MIN / 1000} to {TIMEOUT_MAX / 1000} s. Same seed, same timeouts; your clicks change the rest
        </Provenance>
        <Provenance kind="simulated">
          safety is sampled over {SCHEDULE_SEEDS} seeded schedules by the Check button, not searched exhaustively
        </Provenance>
        <Provenance kind="from-memory">
          etcd, Consul, CockroachDB and TiKV as Raft users: verify against each project's docs
        </Provenance>
        <ClaimLabel kind="research">the current-term commit rule is from the Raft paper (Ongaro and Ousterhout, 2014, from memory): verify against the paper</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}

/**
 * Everything that moves continuously: message dots, election-timer rings and the
 * leader's heartbeat pulse. Re-renders every frame on its own; also re-reads the sim
 * whenever the cluster view changes, so actions taken while paused show up.
 */
function MotionLayer({ world, running, view }: { world: () => Raft; running: boolean; view: ClusterView }) {
  const [m, setM] = useState<MotionView>(NO_MOTION);
  const read = useCallback(() => setM(motionView(world())), [world]);
  useLoop(read, running);
  // One extra read on the next frame whenever the cluster view changes: covers the
  // first frame and actions taken while paused, when the loop isn't running.
  useEffect(() => {
    const id = requestAnimationFrame(read);
    return () => cancelAnimationFrame(id);
  }, [read, view]);

  const circ = 2 * Math.PI * TIMER_R;
  return (
    <g className="rf-motion">
      {m.msgs.map((d) => (
        <circle key={d.id} cx={d.x} cy={d.y} r={d.r} fill={d.color} opacity={d.opacity} className="rf-msg">
          {d.vote && <title>RequestVote</title>}
        </circle>
      ))}
      {m.rings.map((n) => {
        if (!n.alive) return null;
        const p = pos(n.id);
        const style = { '--c': roleColor(n) } as CSSProperties;
        if (n.role !== 'leader') {
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={TIMER_R}
              className="rf-timer"
              style={style}
              strokeDasharray={`${circ * n.timerLeft} ${circ}`}
              transform={`rotate(-90 ${p.x} ${p.y})`}
            />
          );
        }
        const beat = Math.max(0, 1 - n.sinceBeat / BEAT_MS);
        return <circle key={n.id} cx={p.x} cy={p.y} r={NODE_R + 6 + beat * -4 + (1 - beat) * 10} className="rf-beat" opacity={beat * 0.8} />;
      })}
    </g>
  );
}

/** Two adjacent nodes cut off: a dashed wall between them and the other three. */
function PartitionWall({ minority }: { minority: number[] | null }) {
  if (!minority) return null;
  const [a, b] = minority;
  const first = (b - a + N) % N === 1 ? a : b;
  const mid = ((deg(first) + 180 / N) * Math.PI) / 180;
  const u = { x: Math.cos(mid), y: Math.sin(mid) };
  const v = { x: -u.y, y: u.x };
  const c = { x: CX + u.x * 40, y: CY + u.y * 40 };
  const half = 200;
  return (
    <g className="rf-wall">
      <line x1={c.x + v.x * half} y1={c.y + v.y * half} x2={c.x - v.x * half} y2={c.y - v.y * half} />
      <text x={c.x + v.x * half * 0.72 + u.x * 18} y={c.y + v.y * half * 0.72 + u.y * 18 + 4} textAnchor="middle">
        partition
      </text>
    </g>
  );
}

function NodeBody({ n, onClick }: { n: NodeView; onClick: () => void }) {
  const p = pos(n.id);
  const color = roleColor(n);
  return (
    <g
      className="rf-node"
      role="button"
      tabIndex={0}
      aria-label={`${nodeName(n.id)}, ${n.alive ? `${n.role}, term ${n.term}. Press Enter to crash it` : 'crashed. Press Enter to restart it'}`}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClick();
      }}
      style={{ '--c': color } as CSSProperties}
    >
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
}

function EventLog({ events }: { events: RaftEvent[] }) {
  return (
    <div className="rf-events">
      <h4>Event log</h4>
      <ul>
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.li key={e.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <i className={`rf-ev-dot rf-ev-${e.kind}`} />
              <span className="rf-ev-time">{(e.t / 1000).toFixed(1)} s</span>
              {e.text}
            </motion.li>
          ))}
        </AnimatePresence>
        {!events.length && <li className="muted">Waiting for the first timeout…</li>}
      </ul>
    </div>
  );
}

function LogTable({ nodes, leaderId }: { nodes: NodeView[]; leaderId: number | null }) {
  const longest = Math.max(1, ...nodes.map((n) => n.log.length));
  const start = Math.max(0, longest - LOG_COLS);
  const cols = Array.from({ length: Math.min(LOG_COLS, longest) }, (_, k) => start + k);

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
          <LogRow key={n.id} n={n} cols={cols} isLeader={n.id === leaderId} />
        ))}
      </div>
    </div>
  );
}

function LogRow({ n, cols, isLeader }: { n: NodeView; cols: number[]; isLeader: boolean }) {
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
