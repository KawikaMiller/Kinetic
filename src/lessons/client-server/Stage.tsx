import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Box } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { midpoint } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import { script } from './frames';
import { CLIENT_LABEL, CLIENTS, COLOR, ENDPOINTS, endpointFor, POS, type Client, type Msg, type NodeId, type Scenario, type Screen } from './model';
import './styles.css';

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: 'request', label: 'A request' },
  { value: 'scale', label: 'Scale out' },
  { value: 'down', label: 'Server down' },
  { value: 'breaking', label: 'Breaking change' },
];

export function Stage() {
  const [scenario, setScenario] = useState<Scenario>('request');
  const frames = useMemo(() => script(scenario), [scenario]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const scaled = scenario === 'scale';
  const servers: NodeId[] = scaled ? ['api2', 'api1', 'api3'] : ['api1'];
  const active = new Set<NodeId>(f.msg ? [f.msg.from, f.msg.to] : []);

  const endpoints = ENDPOINTS[f.version];
  const calling = f.msg?.kind === 'req' ? endpointFor(f.msg, endpoints) : -1;

  return (
    <StageFrame minWidth={880}
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Requests" value={f.sent} color="var(--info)" />
          <Stat label="Errors" value={f.errors} color={f.errors ? 'var(--bad)' : 'var(--muted)'} />
          <Stat label="Servers up" value={`${f.down ? 0 : servers.length}/${servers.length}`} color={f.down ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: COLOR.req, label: 'request', shape: 'dot' },
            { color: COLOR.db, label: 'database query', shape: 'dot' },
            { color: COLOR.ok, label: 'response', shape: 'dot' },
            { color: COLOR.bad, label: 'failure', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Scenario" value={scenario} onChange={setScenario} options={SCENARIOS} />
        </Controls>
      }
    >
      <div className="cs">
        <svg className="cs-scene" viewBox="0 0 920 350" role="img" aria-label="Clients calling a server API">
          <text x={95} y={20} textAnchor="middle" className="scene-zone">CLIENTS</text>
          <text x={scaled ? 545 : 640} y={20} textAnchor="middle" className="scene-zone">SERVER SIDE (yours)</text>
          <rect x={scaled ? 385 : 560} y={32} width={scaled ? 530 : 355} height={306} rx={16} className="cs-boundary" />

          {CLIENTS.map((c) => (
            <line key={c} x1={POS[c].x + 70} y1={POS[c].y} x2={scaled ? POS.lb.x - 34 : POS.api1.x - 50} y2={scaled ? POS.lb.y : POS.api1.y} className="scene-edge" />
          ))}
          {scaled && servers.map((s) => <line key={s} x1={POS.lb.x + 34} y1={POS.lb.y} x2={POS[s].x - 50} y2={POS[s].y} className="scene-edge" />)}
          {servers.map((s) => (
            <line key={`db-${s}`} x1={POS[s].x + 50} y1={POS[s].y} x2={POS.db.x - 42} y2={POS.db.y} className="scene-edge cs-edge-db" />
          ))}

          {CLIENTS.map((c) => (
            <ClientBox key={c} id={c} on={active.has(c)} screen={f.screens[c]} version={c === 'mobile' ? 'v1 · installed months ago' : c === 'browser' && f.version !== 'v1' ? 'updated today' : ''} />
          ))}

          {scaled && (
            <g className={`cs-node ${active.has('lb') ? 'on' : ''}`}>
              <polygon points={hexagon(POS.lb.x, POS.lb.y, 32)} />
              <text x={POS.lb.x} y={POS.lb.y + 4} textAnchor="middle" className="cs-node-label">LB</text>
            </g>
          )}

          {servers.map((s) => (
            <SceneNode
              key={s}
              at={POS[s]}
              w={100}
              h={56}
              titleDy={-4}
              title={s === 'api1' ? 'api-1' : s === 'api2' ? 'api-2' : 'api-3'}
              sub={f.down ? '✗ down' : scaled ? 'stateless' : f.version === 'both' ? '/v1 + /v2' : f.version}
              on={active.has(s)}
              variant={f.down ? 'bad' : 'default'}
            />
          ))}

          <g className={`cs-node cs-db ${active.has('db') ? 'on' : ''}`}>
            <ellipse cx={POS.db.x} cy={POS.db.y - 26} rx={40} ry={10} />
            <rect x={POS.db.x - 40} y={POS.db.y - 26} width={80} height={52} />
            <ellipse cx={POS.db.x} cy={POS.db.y + 26} rx={40} ry={10} />
            <text x={POS.db.x} y={POS.db.y + 5} textAnchor="middle" className="cs-node-label">DB</text>
          </g>

          {f.msg && <MessagePill key={player.index} msg={f.msg} />}
        </svg>

        <div className="cs-panels">
          <Box className="cs-panel">
            <span className="cs-panel-title">API contract</span>
            {endpoints.map((e, i) => (
              <motion.code key={e} className={`cs-endpoint ${i === calling ? 'on' : ''}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                {e}
              </motion.code>
            ))}
          </Box>
          <Box className="cs-panel">
            <span className="cs-panel-title">Last response body</span>
            <AnimatePresence mode="wait">
              <motion.code key={f.json ?? 'none'} className="cs-json" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {f.json ?? '(nothing yet)'}
              </motion.code>
            </AnimatePresence>
          </Box>
        </div>
        <Hint block>Scripted scenarios: a simplified illustration, not live traffic.</Hint>
      </div>
    </StageFrame>
  );
}

function hexagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

function ClientBox({ id, on, screen, version }: { id: Client; on: boolean; screen: Screen; version: string }) {
  const { x, y } = POS[id];
  const icon = id === 'browser' ? '🌐' : id === 'mobile' ? '📱' : '⌨';
  return (
    <g className={`cs-node cs-client ${on ? 'on' : ''}`}>
      <rect x={x - 70} y={y - 34} width={140} height={68} rx={10} />
      <text x={x - 58} y={y - 14} className="cs-client-title">
        {icon} {CLIENT_LABEL[id]}
      </text>
      <rect x={x - 60} y={y - 6} width={120} height={22} rx={5} className={`cs-screen ${screen.tone ?? ''}`} />
      <text x={x - 54} y={y + 9} className={`cs-screen-text ${screen.tone ?? ''}`}>
        {screen.text.length > 22 ? screen.text.slice(0, 21) + '…' : screen.text}
      </text>
      {version && (
        <text x={x} y={y + 48} textAnchor="middle" className="cs-node-sub cs-client-ver">
          {version}
        </text>
      )}
    </g>
  );
}

/** Offset past the midpoint where a failed request "falls into the void". */
const VOID_OFFSET = 40;

function MessagePill({ msg }: { msg: Msg }) {
  const a = POS[msg.from];
  const b = POS[msg.to];
  const mid = midpoint(a, b);
  const end = msg.fail ? { x: mid.x + VOID_OFFSET, y: mid.y } : b;
  // Travel, then fade on arrival so the target's screen stays readable.
  return <Packet path={[a, end]} label={msg.label} color={COLOR[msg.fail ? 'bad' : msg.kind]} duration={1.15} height={22} charW={6.4} />;
}
