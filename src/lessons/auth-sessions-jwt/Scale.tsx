import { motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { scaleFrames, type ScFrame } from './frames';

const P = { client: { x: 70, y: 75 }, lb: { x: 220, y: 75 }, store: { x: 720, y: 75 } };
const SERVERS = [30, 75, 120].map((y) => ({ x: 450, y }));
const BOX = { client: { w: 88, h: 36, rx: 9 }, lb: { w: 68, h: 36, rx: 9 }, server: { w: 104, h: 32, rx: 9 }, store: { w: 140, h: 44, rx: 10 } } as const;
/** Single-line labels sit 4 units below centre. */
const LABEL_DY = 4;

export function Scale({ modePicker }: { modePicker: ReactNode }) {
  const frames = useMemo(() => scaleFrames(), []);
  const player = usePlayer(frames, { interval: 2200 });
  const f = player.frame;
  return (
    <StageFrame minWidth={760}
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Session store hops" value={f.sessHops} color="var(--violet)" />
          <Stat label="JWT store hops" value={0} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request path', shape: 'line' },
            { color: 'var(--violet)', label: 'store lookup', shape: 'line' },
            { color: 'var(--ok)', label: 'accepted correctly' },
            { color: 'var(--bad)', label: 'failed / wrongly accepted' },
          ]}
        />
      }
      controls={
        <Controls>
          {modePicker}
          <Hint block>A scripted scenario: three requests and two incidents, not measured traffic.</Hint>
        </Controls>
      }
    >
      <div className="aj-scale">
        <Lane title="Sessions" sessions f={f} index={player.index} />
        <Lane title="JWT" f={f} index={player.index} />
      </div>
    </StageFrame>
  );
}

function Lane({ title, sessions = false, f, index }: { title: string; sessions?: boolean; f: ScFrame; index: number }) {
  const outcome = sessions ? f.sess : f.jwt;
  const t = f.target;
  const down = sessions && f.storeDown;
  const verdict =
    outcome === 'ok' ? (f.revoked && sessions ? '401 · banned user refused ✓' : '200 ✓')
      : outcome === 'bad' ? '500 · store unreachable'
        : outcome === 'warn' ? '200 · banned user let in ✗'
          : '';
  const tone = outcome === 'warn' ? 'bad' : outcome;
  return (
    <div className="aj-lane">
      <span className="aj-lane-title">{title}</span>
      <svg viewBox="0 0 860 150" className="aj-lane-svg" role="img" aria-label={`${title} lane`}>
        <line x1={P.client.x} y1={P.client.y} x2={P.lb.x} y2={P.lb.y} className={`aj-l ${t !== null ? 'on' : ''}`} />
        {SERVERS.map((s, i) => (
          <line key={i} x1={P.lb.x} y1={P.lb.y} x2={s.x} y2={s.y} className={`aj-l ${t === i ? 'on' : ''}`} />
        ))}
        {sessions &&
          SERVERS.map((s, i) => (
            <line key={`st${i}`} x1={s.x} y1={s.y} x2={P.store.x} y2={P.store.y} className={`aj-l aj-l-store ${t === i ? (down ? 'fail' : 'on') : ''}`} />
          ))}

        <SceneNode at={P.client} {...BOX.client} titleDy={LABEL_DY} title="client" />
        <SceneNode at={P.lb} {...BOX.lb} titleDy={LABEL_DY} title="LB" />
        {SERVERS.map((s, i) => (
          <SceneNode key={i} at={s} {...BOX.server} titleDy={LABEL_DY} title={<>server {'ABC'[i]} {sessions ? '' : '🔑'}</>} on={t === i} />
        ))}
        {sessions && (
          <SceneNode
            at={P.store}
            {...BOX.store}
            titleDy={-1}
            subDy={14}
            title="🗄 session store"
            sub={down ? '✗ DOWN' : f.revoked ? 'user 42 rows deleted' : 'shared by all servers'}
            variant={down ? 'bad' : 'default'}
            className="aj-store-node"
          />
        )}
        {!sessions && (
          <text x={P.store.x} y={P.store.y + 4} textAnchor="middle" className="scene-node-sub">
            no store: each server verifies locally
          </text>
        )}

        {t !== null && (
          <motion.circle
            key={`${title}-${index}`}
            r={7}
            fill="var(--info)"
            initial={{ cx: P.client.x, cy: P.client.y }}
            animate={{
              cx: sessions ? [P.client.x, P.lb.x, SERVERS[t].x, down ? (SERVERS[t].x + P.store.x) / 2 : P.store.x, SERVERS[t].x] : [P.client.x, P.lb.x, SERVERS[t].x],
              cy: sessions ? [P.client.y, P.lb.y, SERVERS[t].y, down ? (SERVERS[t].y + P.store.y) / 2 : P.store.y, SERVERS[t].y] : [P.client.y, P.lb.y, SERVERS[t].y],
              fill: sessions ? ['var(--info)', 'var(--info)', 'var(--violet)', down ? 'var(--bad)' : 'var(--violet)', 'var(--violet)'] : ['var(--info)', 'var(--info)', 'var(--info)'],
            }}
            transition={{ duration: sessions ? 1.6 : 0.9, ease: 'easeInOut' }}
          />
        )}
      </svg>
      <motion.span key={`${title}-v-${index}`} className={`aj-verdict ${tone ?? ''}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: verdict ? 1 : 0, scale: 1 }} transition={{ delay: sessions ? 1.5 : 0.9 }}>
        {verdict}
      </motion.span>
    </div>
  );
}
