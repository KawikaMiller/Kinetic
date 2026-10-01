import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Box } from '../../components/Panel';
import { Packet, Pulse, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type WrFrame } from './frames';
import { ACTORS, EDGES, PHASES, phaseColor, phaseLabel, SERVER_IP, setOpt, type Actor, type ActorId, type Elapsed, type Leg, type Opts } from './model';
import './styles.css';

export function Stage() {
  const [opts, setOpts] = useState<Opts>({ dnsCached: false, reuse: false, tls13: true });
  const set = <K extends keyof Opts>(key: K) => (v: Opts[K]) => setOpts((o) => setOpt(o, key, v));
  const { frames, total } = useMemo(() => buildFrames(opts), [opts]);
  const player = usePlayer(frames, { interval: 1150 });
  const f = player.frame;
  const msg = f.leg;
  const active = new Set<ActorId>(msg ? [msg.from, msg.to] : []);

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Elapsed" value={`${f.ms} ms`} color="var(--hi)" />
          <Stat label="Round trips" value={f.rtts} color="var(--info)" />
          <Stat
            label="Phase"
            value={msg ? phaseLabel(msg.phase) : f.painted ? 'Done' : '·'}
            color={msg ? phaseColor(msg.phase) : 'var(--ok)'}
          />
        </Stats>
      }
      legend={<Legend items={PHASES.map((p) => ({ color: p.color, label: p.label }))} />}
      controls={
        <Controls>
          <Toggle label="DNS" value={opts.dnsCached} onChange={set('dnsCached')} off="Cold lookup" on="Cached" />
          <Toggle label="Connection" value={opts.reuse} onChange={set('reuse')} off="New" on="Reused (keep-alive)" />
          <Toggle label="TLS version" value={opts.tls13} onChange={set('tls13')} off="TLS 1.2" on="TLS 1.3" />
        </Controls>
      }
    >
      <div className="wr">
        <WideRegion minWidth={840}>
        <svg className="wr-scene" viewBox="0 0 920 320" role="img" aria-label="Network diagram of a web request">
          <text x={250} y={36} className="scene-zone">① FINDING THE ADDRESS</text>
          <text x={470} y={300} textAnchor="middle" className="scene-zone">② TALKING TO IT</text>

          {EDGES.map(([a, b]) => (
            <line
              key={a + b}
              x1={ACTORS[a].x}
              y1={ACTORS[a].y}
              x2={ACTORS[b].x}
              y2={ACTORS[b].y}
              className={`scene-edge wr-edge ${active.has(a) && active.has(b) ? 'on' : ''}`}
            />
          ))}

          {/* The browser ↔ server link changes character as the connection comes up. */}
          <line
            x1={ACTORS.browser.x + ACTORS.browser.w / 2}
            y1={ACTORS.browser.y}
            x2={ACTORS.server.x - ACTORS.server.w / 2}
            y2={ACTORS.server.y}
            className={`wr-link ${f.tls ? 'tls' : f.tcp ? 'tcp' : ''}`}
          />
          <AnimatePresence>
            {f.tls && (
              <motion.g
                key="lock"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <rect x={454} y={226} width={32} height={22} rx={6} className="wr-lock-bg" />
                <text x={470} y={242} textAnchor="middle" className="wr-lock">
                  🔒
                </text>
              </motion.g>
            )}
          </AnimatePresence>

          {(Object.keys(ACTORS) as ActorId[])
            .filter((id) => id !== 'browser')
            .map((id) => (
              <ActorBox key={id} actor={ACTORS[id]} on={active.has(id)} color={msg ? phaseColor(msg.phase) : ''} />
            ))}
          <BrowserBox frame={f} on={active.has('browser')} color={msg ? phaseColor(msg.phase) : ''} />

          {msg && msg.from === msg.to && (
            <Pulse key={`busy-${player.index}`} at={ACTORS[msg.from]} {...BUSY_RIPPLE} color={phaseColor(msg.phase)} />
          )}

          {msg && msg.from !== msg.to && <MessagePill key={player.index} msg={msg} />}
        </svg>
        </WideRegion>

        <Waterfall elapsed={f.elapsed} total={total} />
        <Hint block>
          Illustrative timings, not measurements. The cold lookup walks the whole tree from the root; a real resolver
          usually has the .com servers (and often the answer) cached already.
        </Hint>
      </div>
    </StageFrame>
  );
}

/** "Doing work here" ripple for a step that stays on one actor. */
const BUSY_RIPPLE = { from: 30, to: 80, duration: 1, opacity: 0.9 } as const;
/** Waterfall segments grow a touch softer than SPRING.soft. */
const SEGMENT_SPRING = { type: 'spring', stiffness: 160, damping: 24 } as const;

function ActorBox({ actor, on, color }: { actor: Actor; on: boolean; color: string }) {
  const { x, y, w, h, label, sub } = actor;
  return <SceneNode at={{ x, y }} w={w} h={h} title={label} sub={sub} on={on} color={on ? color : undefined} />;
}
function BrowserBox({ frame, on, color }: { frame: WrFrame; on: boolean; color: string }) {
  const { x, y, w, h } = ACTORS.browser;
  const left = x - w / 2;
  const top = y - h / 2;
  const bars = [0.9, 0.55, 0.75, 0.4];
  return (
    <g className={`scene-node wr-browser ${on ? 'on' : ''}`} style={on ? { ['--c' as string]: color } : undefined}>
      <rect x={left} y={top} width={w} height={h} rx={10} className="scene-node-box" />
      <circle cx={left + 12} cy={top + 12} r={3} fill="var(--bad)" />
      <circle cx={left + 22} cy={top + 12} r={3} fill="var(--amber)" />
      <circle cx={left + 32} cy={top + 12} r={3} fill="var(--ok)" />
      <rect x={left + 42} y={top + 5} width={w - 50} height={15} rx={7} className="wr-urlbar" />
      <text x={left + 52} y={top + 16} className="wr-url">
        {frame.tls ? '🔒 ' : ''}example.com
      </text>
      <AnimatePresence>
        {frame.ip && (
          <motion.text
            key="ip"
            x={left + 12}
            y={top + 36}
            className="wr-ip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            → {SERVER_IP}
          </motion.text>
        )}
      </AnimatePresence>
      {bars.map((b, i) => (
        <motion.rect
          key={i}
          x={left + 12}
          y={top + 46 + i * 14}
          height={8}
          rx={4}
          className={i === 0 ? 'wr-skel wr-skel-h' : 'wr-skel'}
          initial={false}
          animate={{ width: frame.painted ? (w - 24) * b : 0, opacity: frame.painted ? 1 : 0 }}
          transition={{ delay: frame.painted ? i * 0.15 : 0, duration: 0.4 }}
        />
      ))}
      {!frame.painted && (
        <text x={x} y={top + 76} textAnchor="middle" className="scene-node-sub">
          {frame.ip ? 'waiting for page…' : 'where is example.com?'}
        </text>
      )}
    </g>
  );
}

/** A pill that travels to the next actor and stays there, drawing its route behind it. */
function MessagePill({ msg }: { msg: Leg }) {
  return (
    <Packet
      path={[ACTORS[msg.from], ACTORS[msg.to]]}
      label={msg.label}
      color={phaseColor(msg.phase)}
      arrive="stay"
      trail
      duration={0.7}
      height={24}
      charW={6.6}
      pad={20}
    />
  );
}
function Waterfall({ elapsed, total }: { elapsed: Elapsed; total: number }) {
  return (
    <Box className="wr-fall">
      <div className="wr-fall-head">
        <span>Waterfall</span>
        <span className="wr-fall-total">
          {Object.values(elapsed).reduce((a, b) => a + b, 0)} / {total} ms
        </span>
      </div>
      <div className="wr-fall-bar">
        {PHASES.map((p) => (
          <motion.div
            key={p.id}
            className="wr-seg"
            style={{ background: p.color }}
            initial={false}
            animate={{ width: `${total ? (elapsed[p.id] / total) * 100 : 0}%` }}
            transition={SEGMENT_SPRING}
          />
        ))}
      </div>
      <div className="wr-fall-legend">
        {PHASES.map((p) => (
          <span key={p.id} className={elapsed[p.id] ? 'on' : ''}>
            <i style={{ background: p.color }} />
            {p.label} <b>{elapsed[p.id]}ms</b>
          </span>
        ))}
      </div>
    </Box>
  );
}
