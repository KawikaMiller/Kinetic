import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { times } from '../../core/format';
import { useLoop } from '../../core/hooks';
import { cssVar, type TokenName } from '../../core/palette';
import { useSimulation } from '../../core/useSimulation';
import { N, nodeName, Raft, type RaftEvent, type Role } from './sim';
import {
  clusterView, CX, CY, deg, motionView, NODE_R, pos, RING, TIMER_R, VIEW_H, VIEW_W,
  type ClusterView, type MotionView, type NodeView,
} from './view';
import './styles.css';

const STAGE_HEIGHT = 470;
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

export function Stage() {
  const setCaption = useSetCaption();
  const [speed, setSpeed] = useState(1);
  const [partitioned, setPartitioned] = useState(false);

  useIntroCaption(
    <>
      Five servers, no leader yet. Each ring is an <b>election timer</b>: whoever runs out first asks the others for
      votes.
    </>,
  );

  const { world, snap: view, paused, togglePause, refresh } = useSimulation({
    create: () => {
      const r = new Raft();
      r.onEvent = (e) => {
        const s = EVENT_STYLE[e.kind];
        setCaption(
          <>
            <span className={s.cls}>{s.label}</span> {e.text}
          </>,
        );
      };
      return r;
    },
    step: (r, dt) => r.step(dt * 1000 * speed),
    snapshot: clusterView,
    snapshotEvery: SNAPSHOT_EVERY_S,
  });

  const send = () => {
    if (!world().clientCommand()) setCaption(<>No leader right now, so the client has nobody to talk to. Wait for an election to finish.</>);
    refresh();
  };

  const togglePartition = () => {
    world().setPartition(!partitioned);
    setPartitioned(!partitioned);
    if (!partitioned) {
      setCaption(
        <>
          <span className="hl bad">Partition!</span> The leader is stuck with only 1 friend. It can take commands but
          never reach <b>3/5</b> to commit them. The other 3 will elect a new leader.
        </>,
      );
    }
    refresh();
  };

  const toggleNode = (i: number) => {
    world().toggleNode(i);
    refresh();
  };

  if (!view) return null;
  const leader = view.nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0];
  const maxTerm = Math.max(...view.nodes.map((n) => n.term));
  const committed = Math.max(...view.nodes.map((n) => n.commit));

  return (
    <StageFrame
      minWidth={420}
      height={STAGE_HEIGHT}
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
          <Hint>click a server to crash / restart it</Hint>
        </Controls>
      }
    >
      <div className="rf">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="rf-svg">
          <circle cx={CX} cy={CY} r={RING} className="rf-orbit" />
          <MotionLayer world={world} running={!paused} view={view} />
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
    <g className="rf-node" onClick={onClick} style={{ '--c': color } as CSSProperties}>
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
