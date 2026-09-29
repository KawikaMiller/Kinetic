import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, ORDERS, type ShardKey, type Strategy } from './model';
import './styles.css';

const SHARD_COLORS = ['#4cc9f0', '#a78bfa', '#3ddc97', '#f7b538', '#ff8c5a'];

export function Stage() {
  const [strategy, setStrategy] = useState<Strategy>('range');
  const [key, setKey] = useState<ShardKey>('time');
  const [added, setAdded] = useState(false);
  const { frames, rebalanceAt } = useMemo(() => buildFrames(strategy, key, added), [strategy, key, added]);
  const player = usePlayer(frames, { interval: 700 });
  const f = player.frame;

  const counts = f.shards.map((_, i) => Object.values(f.placed).filter((s) => s === i).length + (f.incoming && f.placed[f.incoming.id] === i ? -1 : 0));
  const maxCount = Math.max(1, ...counts);
  const avg = Object.keys(f.placed).length / f.shards.length;

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
            value={`${counts.length ? Math.round((Math.max(...counts) / Math.max(1, avg)) * 100) / 100 : 0}×`}
            color={Math.max(...counts) > avg * 2 ? 'var(--bad)' : 'var(--ok)'}
            sub="vs an even share"
          />
          <Stat
            label="Shards asked"
            value={f.query ? `${f.query.touched.length}/${f.shards.length}` : '–'}
            color={f.query ? (f.query.touched.length === 1 ? 'var(--ok)' : 'var(--bad)') : undefined}
            sub={f.query?.label ?? 'no query yet'}
          />
          <Stat label="Query latency" value={f.query ? `${f.query.latency} ms` : '–'} sub="slowest shard wins" />
          {f.phase === 'rebalance' && (
            <Stat label="Orders moved" value={`${f.moved.length}/${ORDERS.length}`} color={f.moved.length > 8 ? 'var(--bad)' : 'var(--ok)'} />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'incoming / queried' },
            { color: 'var(--bad)', label: 'hot shard' },
            { color: 'var(--violet)', label: 'moved in rebalance' },
          ]}
        />
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
              const hot = counts[i] > avg * 2 && counts[i] >= 4;
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
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
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
