import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { Flyer } from '../../components/scene';
import { NA } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { LAT, SCENARIOS, WRITE_MS, type Mode, type NodeId, type Pkt, type Place, type Scenario } from './scenarios';
import './styles.css';

const INTERVAL = 1500;

// Positions in % of the scene.
const POS: Record<Place, { x: number; y: number }> = {
  C: { x: 9, y: 50 },
  L: { x: 40, y: 50 },
  F1: { x: 78, y: 22 },
  F2: { x: 78, y: 78 },
};

const LINKS: [Place, Place, string][] = [
  ['C', 'L', `${LAT.client} ms`],
  ['L', 'F1', `${LAT.f1} ms`],
  ['L', 'F2', `${LAT.f2} ms · other region`],
];

const NODE_NAME: Record<NodeId, string> = { L: 'Leader', F1: 'Follower 1', F2: 'Follower 2' };

export function Stage() {
  const [scenario, setScenario] = useState<Scenario>('stale');
  const [mode, setMode] = useState<Mode>('async');
  const frames = useMemo(() => SCENARIOS[scenario](mode), [scenario, mode]);
  const player = usePlayer(frames, { interval: INTERVAL });
  const f = player.frame;
  const leaderLen = Math.max(...(Object.values(f.nodes).map((n) => n.log.length)));

  return (
    <StageFrame minWidth={740}
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat
            label="Write latency"
            value={f.latency === null ? NA : `${f.latency} ms`}
            color={f.latency === null ? undefined : f.latency > 20 ? 'var(--bad)' : 'var(--ok)'}
            sub={`async ${WRITE_MS.async} · sync ${WRITE_MS.sync}`}
          />
          <Stat label="F1 lag" value={leaderLen - f.nodes.F1.log.length} sub="entries behind" />
          <Stat
            label="F2 lag"
            value={leaderLen - f.nodes.F2.log.length}
            color={leaderLen - f.nodes.F2.log.length > 0 ? 'var(--hi)' : undefined}
            sub="entries behind"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'write', shape: 'dot' },
            { color: 'var(--info)', label: 'replication', shape: 'dot' },
            { color: 'var(--ok)', label: 'ack / reply', shape: 'dot' },
            { color: 'var(--violet)', label: 'read', shape: 'dot' },
            { color: 'var(--bad)', label: 'lost', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Scenario"
            value={scenario}
            onChange={setScenario}
            options={[
              { value: 'stale', label: 'Stale read' },
              { value: 'failover', label: 'Leader crash' },
            ]}
          />
          <Segmented
            label="Replication"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'async', label: 'Asynchronous' },
              { value: 'sync', label: 'Synchronous' },
            ]}
          />
        </Controls>
      }
    >
      <div className="rep">
        <svg className="rep-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {(['F1', 'F2'] as const).map((b) => (
            <line
              key={'read' + b}
              x1={POS.C.x}
              y1={POS.C.y}
              x2={POS[b].x}
              y2={POS[b].y}
              className="rep-link read"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {LINKS.map(([a, b]) => (
            <line
              key={a + b}
              x1={POS[a].x}
              y1={POS[a].y}
              x2={POS[b].x}
              y2={POS[b].y}
              className={`rep-link ${b === 'F2' ? 'slow' : ''}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {LINKS.map(([a, b, label]) => (
          <span
            key={a + b + 'l'}
            className="rep-link-label"
            style={{ left: `${(POS[a].x + POS[b].x) / 2}%`, top: `${(POS[a].y + POS[b].y) / 2}%` }}
          >
            {label}
          </span>
        ))}

        <div className="rep-client" style={{ left: `${POS.C.x}%`, top: `${POS.C.y}%` }}>
          <span className="rep-client-title">Client</span>
          <motion.span
            key={f.client.text}
            className={`rep-client-status ${f.client.tone}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {f.client.text}
          </motion.span>
        </div>

        {(Object.keys(NODE_NAME) as NodeId[]).map((id) => {
          const n = f.nodes[id];
          const role = n.role === 'promoted' ? 'new leader' : n.role;
          return (
            <motion.div
              key={id}
              className={`rep-node role-${n.role}`}
              style={{ left: `${POS[id].x}%`, top: `${POS[id].y}%`, x: '-50%', y: '-50%' }}
              animate={n.role === 'dead' ? { rotate: [0, -3, 3, 0] } : { rotate: 0 }}
            >
              <header>
                <b>{NODE_NAME[id]}</b>
                <span>{role}</span>
              </header>
              <ol className="rep-log">
                <AnimatePresence initial={false}>
                  {n.log.map((e, i) => (
                    <motion.li
                      key={e}
                      className={i === n.log.length - 1 && f.flash === id ? 'fresh' : ''}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      {e}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
              {n.role === 'dead' && <span className="rep-dead">💥 crashed</span>}
            </motion.div>
          );
        })}

        <AnimatePresence>
          {f.pkts.map((p) => (
            <Packet key={`${scenario}-${mode}-${p.id}`} p={p} speed={player.speed} />
          ))}
        </AnimatePresence>
      </div>
    </StageFrame>
  );
}

/** Share of a frame's interval a packet spends in flight (a `dur` of 1 = one frame). */
const FLIGHT_SHARE = 0.85;

function Packet({ p, speed }: { p: Pkt; speed: number }) {
  const a = POS[p.from];
  const b = POS[p.to];
  const lost = p.kind === 'lost';
  const seconds = ((p.dur ?? 1) * INTERVAL * FLIGHT_SHARE) / 1000 / speed;
  return (
    <Flyer
      from={a}
      to={lost ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : b}
      className={`rep-pkt kind-${p.kind}`}
      fade={lost ? 'lost' : 'arrive'}
      duration={seconds}
    >
      {p.label}
    </Flyer>
  );
}