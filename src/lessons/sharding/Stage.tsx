import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { NA } from '../../core/format';
import { cssVar } from '../../core/palette';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { BASE_MS, HOT_MS, isHot, loadOf, ORDERS, type ShardKey, type Strategy } from './model';
import './styles.css';

/** One hue per shard, none of them a status colour: red means hot, violet means moved, yellow means asked. */
const SHARD_COLORS = [cssVar('sky'), cssVar('trkHw'), cssVar('trkMath'), cssVar('trkLang'), cssVar('trkWeb')];
/** More orders moving than this in a rebalance is a bad sign (half of them). */
const MANY_MOVED = ORDERS.length / 2;
/** Order chips glide between shards on this spring. */
const CHIP_SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const;

export function Stage() {
  const [strategy, setStrategy] = useState<Strategy>('range');
  const [key, setKey] = useState<ShardKey>('time');
  const [added, setAdded] = useState(false);
  const { frames, rebalanceAt } = useMemo(() => buildFrames(strategy, key, added), [strategy, key, added]);
  const player = usePlayer(frames, { interval: 700 });
  const f = player.frame;

  const { counts, even, busiest } = loadOf(f.placed, f.shards.length, f.incoming?.id);
  const maxCount = Math.max(1, ...counts);
  const busiestHot = isHot(Math.max(...counts), even);

  const change = (s: Strategy, k: ShardKey) => {
    setStrategy(s);
    setKey(k);
    setAdded(false);
  };
  const addShard = () => {
    player.queueNext({ play: true, from: rebalanceAt });
    setAdded(true);
  };

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat
            label="Busiest shard"
            value={`${busiest.toFixed(2)}×`}
            color={busiestHot ? 'var(--bad)' : undefined}
            sub="vs an even share"
          />
          <Stat
            label="Shards asked"
            value={f.query ? `${f.query.touched.length}/${f.shards.length}` : NA}
            color={f.query ? (f.query.touched.length === 1 ? 'var(--ok)' : 'var(--bad)') : undefined}
            sub={f.query?.label ?? 'no query yet'}
          />
          <Stat label="Query latency" value={f.query ? `${f.query.latency} ms` : NA} sub="slowest shard wins" />
          {f.phase === 'rebalance' && (
            <Stat label="Orders moved" value={`${f.moved.length}/${ORDERS.length}`} color={f.moved.length > MANY_MOVED ? 'var(--bad)' : 'var(--ok)'} />
          )}
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--hi)', label: 'incoming / queried' },
              { color: 'var(--bad)', label: 'hot shard' },
              { color: 'var(--violet)', label: 'moved in rebalance' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="toy">{ORDERS.length} made-up orders, hashed with FNV-1a; shard counts are exact for these orders</Provenance>
            <Provenance kind="illustrative">query times ({BASE_MS} ms, {HOT_MS} ms on a hot shard) are made up, not measured</Provenance>
          </ProvenanceRow>
        </>
      }
      controls={
        <Controls>
          <Segmented
            label="Strategy"
            value={strategy}
            onChange={(s) => change(s, key)}
            options={[
              { value: 'range', label: 'Range' },
              { value: 'hash', label: 'Hash' },
            ]}
          />
          <Segmented
            label="Shard key"
            value={key}
            onChange={(k) => change(strategy, k)}
            options={[
              { value: 'time', label: 'created_at (time)' },
              { value: 'user', label: 'user_id' },
            ]}
          />
          <Button variant="primary" onClick={addShard} disabled={added}>
            + Add a shard
          </Button>
        </Controls>
      }
    >
      <LayoutGroup id={`sh-${strategy}-${key}-${added}`}>
        <div className="sh">
          <div className="sh-router">
            <span className="sh-router-title">Router</span>
            <div className="sh-router-slot">
              <AnimatePresence mode="popLayout">
                {f.incoming && (
                  <motion.span
                    key={f.incoming.id}
                    layoutId={`o-${f.incoming.id}`}
                    className="sh-chip incoming"
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {f.incoming.time} · {f.incoming.user}
                  </motion.span>
                )}
                {f.query && (
                  <motion.span key={f.query.label} className="sh-query" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    SELECT {f.query.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <code className="sh-rule">
              {strategy === 'hash' ? `shard = hash(${key === 'time' ? 'created_at' : 'user_id'}) % ${f.shards.length}` : `shard = range containing ${key === 'time' ? 'created_at' : 'user_id'}`}
            </code>
          </div>

          <div className="sh-shards" style={{ '--n': f.shards.length } as CSSProperties}>
            {f.shards.map((s, i) => {
              const hot = isHot(counts[i], even);
              const queried = f.query?.touched.includes(i);
              const isNew = f.newShard === i;
              return (
                <motion.div
                  key={s.name}
                  layout
                  className={`sh-shard ${hot ? 'hot' : ''} ${queried ? 'queried' : ''} ${isNew ? 'new' : ''}`}
                  style={{ '--c': SHARD_COLORS[i] } as CSSProperties}
                  initial={{ opacity: 0, y: 12 }}
                  animate={queried ? { opacity: 1, y: [0, -6, 0] } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <header>
                    <b>{s.name}</b>
                    <span>{s.range}</span>
                  </header>
                  <div className="sh-load">
                    <motion.i initial={false} animate={{ width: `${(counts[i] / maxCount) * 100}%` }} />
                  </div>
                  <div className="sh-chips">
                    {ORDERS.filter((o) => f.placed[o.id] === i && f.incoming?.id !== o.id).map((o) => (
                      <motion.span
                        key={o.id}
                        layoutId={`o-${o.id}`}
                        className={`sh-chip ${f.moved.includes(o.id) ? 'moved' : ''}`}
                        transition={CHIP_SPRING}
                      >
                        {key === 'time' ? o.time : o.user}
                        <small>{key === 'time' ? o.user : o.time}</small>
                      </motion.span>
                    ))}
                  </div>
                  {queried && <span className="sh-tag">queried</span>}
                  {hot && <span className="sh-tag hot">🔥 hot</span>}
                </motion.div>
              );
            })}
          </div>
        </div>
      </LayoutGroup>
    </StageFrame>
  );
}
