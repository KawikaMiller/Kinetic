import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type Choice, type Net, type NodeId, type Pkt, type Place } from './scenarios';
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
  const frames = useMemo(() => buildFrames(net, choice), [net, choice]);
  const player = usePlayer(frames, { interval: INTERVAL });
  const f = player.frame;

  const switchNet = (n: Net) => {
    setNet(n);
    // keep the "same side" of the trade-off: C↔C, A↔L
    setChoice((c) => (n === 'healthy' ? (c === 'ap' || c === 'el' ? 'el' : 'ec') : c === 'el' || c === 'ap' ? 'ap' : 'cp'));
  };

  const all = Object.values(f.values).map((v) => v.join('|'));
  const agree = all.every((v) => v === all[0]) && !all[0].includes('|');

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Replicas agree?" value={agree ? 'yes' : 'no'} color={agree ? 'var(--ok)' : 'var(--bad)'} />
          <Stat
            label="Unavailable"
            value={f.refusing.length ? f.refusing.join(', ') : 'none'}
            color={f.refusing.length ? 'var(--bad)' : undefined}
          />
          <Stat label="Write latency" value={f.latency === null ? '–' : `${f.latency} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'write', shape: 'dot' },
            { color: 'var(--violet)', label: 'read', shape: 'dot' },
            { color: 'var(--info)', label: 'replication', shape: 'dot' },
            { color: 'var(--ok)', label: 'ok / ack', shape: 'dot' },
            { color: 'var(--bad)', label: 'error / lost', shape: 'dot' },
          ]}
        />
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

          {(['N1', 'N2', 'N3'] as NodeId[]).map((n) => {
            const vals = f.values[n];
            const conflict = vals.length > 1;
            const refusing = f.refusing.includes(n);
            return (
              <motion.div
                key={n}
                className={`cap-node ${refusing ? 'refusing' : ''} ${conflict ? 'conflict' : ''}`}
                style={{ left: `${POS[n].x}%`, top: `${POS[n].y}%`, x: '-50%', y: '-50%' }}
                animate={refusing ? { rotate: [0, -4, 4, 0] } : { rotate: 0 }}
                transition={{ duration: 0.4 }}
              >
                <span className="cap-node-name">{n}</span>
                <div className="cap-vals">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {vals.map((v) => (
                      <motion.b key={v} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                        {v}
                      </motion.b>
                    ))}
                  </AnimatePresence>
                </div>
                {conflict && <span className="cap-flag">conflict</span>}
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
            Not "pick 2 of 3". Partitions <b>will</b> happen, so the real question is what you give up when they do, and
            what you trade the rest of the time.
          </p>
        </aside>
      </div>
    </StageFrame>
  );
}

function Packet({ p, speed }: { p: Pkt; speed: number }) {
  const a = POS[p.from];
  const b = POS[p.to];
  const lost = p.kind === 'lost';
  const end = lost ? { x: WALL_X, y: a.y + ((b.y - a.y) * (WALL_X - a.x)) / (b.x - a.x) } : b;
  return (
    <motion.span
      className={`cap-pkt kind-${p.kind}`}
      style={{ x: '-50%', y: '-50%' }}
      initial={{ left: `${a.x}%`, top: `${a.y}%`, opacity: 0, scale: 0.6 }}
      animate={{ left: `${end.x}%`, top: `${end.y}%`, opacity: lost ? [1, 1, 0] : [0, 1, 1, 0], scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: (INTERVAL * 0.8) / 1000 / speed, ease: 'easeInOut' }}
    >
      {p.label}
    </motion.span>
  );
}
