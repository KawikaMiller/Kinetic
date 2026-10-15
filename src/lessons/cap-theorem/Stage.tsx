import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { Flyer } from '../../components/scene';
import { NA } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, valueLabel, type Pkt, type Place } from './frames';
import {
  choiceAfterNetSwitch, HEALTHY_ONE_WAY_MS, NODE_IDS, PARTITION, PARTITION_ONE_WAY_MS, runStory, type Choice, type Net,
} from './model';
import './styles.css';

const INTERVAL = 1500;

const POS: Record<Place, { x: number; y: number }> = {
  C1: { x: 9, y: 50 },
  N1: { x: 31, y: 50 },
  N2: { x: 68, y: 24 },
  N3: { x: 68, y: 76 },
  C2: { x: 91, y: 50 },
};
const LINKS: [Place, Place][] = [
  ['C1', 'N1'],
  ['N1', 'N2'],
  ['N1', 'N3'],
  ['N2', 'N3'],
  ['C2', 'N2'],
  ['C2', 'N3'],
];
const WALL_X = 49;
const crosses = (a: Place, b: Place) => (POS[a].x - WALL_X) * (POS[b].x - WALL_X) < 0;

export function Stage() {
  const [net, setNet] = useState<Net>('partition');
  const [choice, setChoice] = useState<Choice>('cp');
  const frames = useMemo(() => buildFrames(runStory(net, choice)), [net, choice]);
  const player = usePlayer(frames, { interval: INTERVAL });
  const f = player.frame;

  const switchNet = (n: Net) => {
    setNet(n);
    setChoice((c) => choiceAfterNetSwitch(n, c));
  };

  const identical = new Set(Object.values(f.values)).size === 1;

  return (
    <StageFrame minWidth={740}
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Replicas identical?" value={identical ? 'yes' : 'no'} color={identical ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Stale reads served" value={f.stale} color={f.stale ? 'var(--bad)' : undefined} />
          <Stat
            label="Unavailable"
            value={f.refusing.length ? f.refusing.join(', ') : 'none'}
            color={f.refusing.length ? 'var(--bad)' : undefined}
          />
          <Stat label="Write latency" value={f.latencyMs === null ? NA : `${f.latencyMs} ms`} />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--amber)', label: 'write', shape: 'dot' },
              { color: 'var(--violet)', label: 'read', shape: 'dot' },
              { color: 'var(--info)', label: 'replication', shape: 'dot' },
              { color: 'var(--ok)', label: 'ok / ack', shape: 'dot' },
              { color: 'var(--bad)', label: 'error / lost', shape: 'dot' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="simulated">
              three replicas on a network simulator; values, refusals and latencies are read back from the run
            </Provenance>
            <Provenance kind="scripted">
              {net === 'partition'
                ? `the partition (${PARTITION.from} to ${PARTITION.to} ms), the four client requests and fixed message delays, so all four stories play the same on every seed; the seeded search for the failing schedule runs in the tests`
                : 'the client requests and fixed message delays; the seeded search runs in the tests'}
            </Provenance>
            <Provenance kind="illustrative">{net === 'partition' ? PARTITION_ONE_WAY_MS : HEALTHY_ONE_WAY_MS} ms one-way delay</Provenance>
          </ProvenanceRow>
        </>
      }
      controls={
        <Controls>
          <Segmented
            label="Network"
            value={net}
            onChange={switchNet}
            options={[
              { value: 'partition', label: 'Partition (P)' },
              { value: 'healthy', label: 'Healthy (Else)' },
            ]}
          />
          {net === 'partition' ? (
            <Segmented
              label="During a partition, favour…"
              value={choice}
              onChange={setChoice}
              options={[
                { value: 'cp', label: 'Consistency (CP)' },
                { value: 'ap', label: 'Availability (AP)' },
              ]}
            />
          ) : (
            <Segmented
              label="Otherwise, favour…"
              value={choice}
              onChange={setChoice}
              options={[
                { value: 'ec', label: 'Consistency (EC)' },
                { value: 'el', label: 'Latency (EL)' },
              ]}
            />
          )}
        </Controls>
      }
    >
      <div className="cap">
        <div className="cap-scene">
          <svg className="cap-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {LINKS.map(([a, b]) => (
              <line
                key={a + b}
                x1={POS[a].x}
                y1={POS[a].y}
                x2={POS[b].x}
                y2={POS[b].y}
                className={`cap-link ${f.partitioned && crosses(a, b) ? 'cut' : ''}`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <AnimatePresence>
            {f.partitioned && (
              <motion.div
                className="cap-wall"
                style={{ left: `${WALL_X}%` }}
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0, opacity: 0 }}
                transition={{ duration: 0.45 }}
              >
                <span>✂ partition</span>
              </motion.div>
            )}
          </AnimatePresence>

          {(['C1', 'C2'] as const).map((c) => {
            const st = c === 'C1' ? f.c1 : f.c2;
            return (
              <div key={c} className="cap-client" style={{ left: `${POS[c].x}%`, top: `${POS[c].y}%` }}>
                <b>Client {c.slice(1)}</b>
                <motion.span key={st.text} className={st.tone} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                  {st.text}
                </motion.span>
              </div>
            );
          })}

          {NODE_IDS.map((n) => {
            const value = f.values[n];
            const refusing = f.refusing.includes(n);
            return (
              <motion.div
                key={n}
                className={`cap-node ${refusing ? 'refusing' : ''}`}
                style={{ left: `${POS[n].x}%`, top: `${POS[n].y}%`, x: '-50%', y: '-50%' }}
                animate={refusing ? { rotate: [0, -4, 4, 0] } : { rotate: 0 }}
                transition={{ duration: 0.4 }}
              >
                <span className="cap-node-name">{n}</span>
                <div className="cap-vals">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.b key={value} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                      {valueLabel(value)}
                    </motion.b>
                  </AnimatePresence>
                </div>
                {refusing && <span className="cap-flag">no quorum</span>}
              </motion.div>
            );
          })}

          <AnimatePresence>
            {f.pkts.map((p) => (
              <Packet key={`${net}-${choice}-${p.id}`} p={p} speed={player.speed} />
            ))}
          </AnimatePresence>
        </div>

        <aside className="cap-pacelc">
          <h4>PACELC</h4>
          <div className="cap-grid">
            <span className="cap-grid-head">if Partition</span>
            <span className={`cap-cell ${net === 'partition' && choice === 'ap' ? 'on' : ''}`}>A: stay up</span>
            <span className={`cap-cell ${net === 'partition' && choice === 'cp' ? 'on' : ''}`}>C: stay correct</span>
            <span className="cap-grid-head">Else</span>
            <span className={`cap-cell ${net === 'healthy' && choice === 'el' ? 'on' : ''}`}>L: be fast</span>
            <span className={`cap-cell ${net === 'healthy' && choice === 'ec' ? 'on' : ''}`}>C: stay correct</span>
          </div>
          <p>
            Not "pick 2 of 3". Partitions happen on real networks, so the real question is what you give up when they do,
            and what you trade the rest of the time. AP is stale-prone even with no partition: it acknowledges after a local write, so
            a read just after can miss it (try Healthy, Latency).
          </p>
          <Provenance kind="from-memory">
            CAP is Brewer's conjecture, proved by Gilbert and Lynch under narrow definitions of C and A; PACELC is Daniel Abadi's
            extension (an idea from 2010, a 2012 paper)
          </Provenance>
        </aside>
      </div>
    </StageFrame>
  );
}

/** Share of a frame's interval a packet spends in flight. */
const FLIGHT_SHARE = 0.8;

function Packet({ p, speed }: { p: Pkt; speed: number }) {
  const a = POS[p.from];
  const b = POS[p.to];
  const lost = p.kind === 'lost';
  // A lost message dies where its line crosses the partition wall.
  const end = lost ? { x: WALL_X, y: a.y + ((b.y - a.y) * (WALL_X - a.x)) / (b.x - a.x) } : b;
  return (
    <Flyer
      from={a}
      to={end}
      className={`cap-pkt kind-${p.kind}`}
      fade={lost ? 'lost' : 'arrive'}
      duration={(INTERVAL * FLIGHT_SHARE) / 1000 / speed}
    >
      {p.label}
    </Flyer>
  );
}
