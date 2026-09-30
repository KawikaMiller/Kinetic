import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { pillWidth } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, EDGES, LAYOUT, TEAMS, type Arch, type Box, type Hop, type Scenario } from './scenarios';
import './styles.css';

const HOP_COLOR: Record<Hop, string> = { call: 'var(--violet)', net: 'var(--info)', db: 'var(--text)' };
const HOP_TIME: Record<Hop, number> = { call: 0.35, net: 0.6, db: 0.45 };

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** The scenario note floats centred above the diagram. */
const NOTE = { cx: 410, y: -32, h: 26, charW: 7.2, pad: 28 } as const;

export function Stage() {
  const [arch, setArch] = useState<Arch>('mono');
  const [scenario, setScenario] = useState<Scenario>('request');
  const frames = useMemo(() => buildFrames(arch, scenario), [arch, scenario]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const boxes = LAYOUT[arch];
  const byId = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);

  const packet = f.packet && byId.get(f.packet.from) && byId.get(f.packet.to)
    ? { a: center(byId.get(f.packet.from)!), b: center(byId.get(f.packet.to)!), hop: f.packet.hop }
    : null;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Latency" value={f.latency === null ? '–' : `${f.latency.toFixed(f.latency < 1 ? 2 : 1)} ms`} color="var(--hi)" sub="internal only" />
          <Stat label="Network hops" value={f.hops} color="var(--info)" />
          <Stat label="Deploy unit" value={<span className="mm-small">{f.deployUnit}</span>} />
          <Stat label="Blast radius" value={<span className="mm-small">{f.blast}</span>} color={f.blast.includes('down') ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'healthy' },
            { color: 'var(--info)', label: 'deploying' },
            { color: 'var(--hi)', label: 'degraded' },
            { color: 'var(--bad)', label: 'down' },
            { color: 'var(--violet)', label: 'in-process call', shape: 'dot' },
            { color: 'var(--info)', label: 'network call', shape: 'dot' },
            { color: 'var(--text)', label: 'DB query', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Architecture"
            value={arch}
            onChange={setArch}
            options={[
              { value: 'mono', label: 'Monolith' },
              { value: 'micro', label: 'Microservices' },
              { value: 'dist', label: 'Distributed monolith' },
            ]}
          />
          <Segmented
            label="Scenario"
            value={scenario}
            onChange={setScenario}
            options={[
              { value: 'request', label: 'Checkout request' },
              { value: 'deploy', label: 'Deploy a change' },
              { value: 'bug', label: 'Ship a bug' },
              { value: 'teams', label: 'Teams' },
            ]}
          />
        </Controls>
      }
    >
      <svg className="mm-svg" viewBox="0 -34 820 434" role="img" aria-label="Architecture diagram">
        {EDGES[arch].map(([a, b]) => {
          const p = byId.get(a);
          const q = byId.get(b);
          if (!p || !q) return null;
          const s = center(p);
          const t = center(q);
          const net = arch !== 'mono' && q.kind !== 'db';
          return <line key={`${arch}-${a}-${b}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} className={`mm-edge ${net ? 'net' : ''}`} />;
        })}

        {boxes.map((b) => (
          <BoxView
            key={`${arch}-${b.id}`}
            box={b}
            status={f.status[b.id] ?? 'ok'}
            active={f.active === b.id}
            showTeam={f.teams}
          />
        ))}

        {packet && (
          <motion.circle
            key={`${arch}-${scenario}-${player.index}`}
            r={7}
            fill={HOP_COLOR[packet.hop]}
            className="mm-packet"
            initial={{ cx: packet.a.x, cy: packet.a.y, opacity: 0 }}
            animate={{ cx: packet.b.x, cy: packet.b.y, opacity: 1 }}
            transition={{ duration: HOP_TIME[packet.hop], ease: 'easeInOut' }}
          />
        )}

        {f.note && (
          <g className="mm-note">
            <rect x={NOTE.cx - pillWidth(f.note, NOTE.charW, NOTE.pad) / 2} y={NOTE.y} width={pillWidth(f.note, NOTE.charW, NOTE.pad)} height={NOTE.h} rx={NOTE.h / 2} />
            <text x={NOTE.cx} y={NOTE.y + 17} textAnchor="middle">
              {f.note}
            </text>
          </g>
        )}

        {f.teams && (
          <g className="mm-teams">
            {Object.entries(TEAMS).map(([id, t], i) => (
              <g key={id} transform={`translate(${16 + i * 112}, 382)`}>
                <circle r={6} cx={6} cy={0} fill={t.color} />
                <text x={18} y={4}>
                  {t.name}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </StageFrame>
  );
}

function BoxView({ box, status, active, showTeam }: { box: Box; status: string; active: boolean; showTeam: boolean }) {
  const team = box.team ? TEAMS[box.team] : null;
  if (box.kind === 'container') {
    return (
      <g className={`mm-container ${status}`}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={18} />
        <text x={box.x + 16} y={box.y + 24}>
          {box.label}
        </text>
      </g>
    );
  }
  if (box.kind === 'db') {
    const rx = box.w / 2;
    return (
      <g className={`mm-box mm-db ${status}`}>
        <path
          d={`M ${box.x} ${box.y + 8} v ${box.h - 16} a ${rx} 8 0 0 0 ${box.w} 0 v ${-(box.h - 16)}`}
        />
        <ellipse cx={box.x + rx} cy={box.y + 8} rx={rx} ry={8} />
        <text x={box.x + rx} y={box.y + box.h / 2 + 8} textAnchor="middle">
          {box.label}
        </text>
      </g>
    );
  }
  return (
    <g
      className={`mm-box ${status} ${active ? 'active' : ''} ${box.kind}`}
      style={showTeam && team ? { ['--team' as string]: team.color } : undefined}
    >
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} className={showTeam && team ? 'teamed' : ''} />
      <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 5} textAnchor="middle">
        {box.label}
      </text>
      {showTeam && team && <circle cx={box.x + box.w - 10} cy={box.y + 10} r={6} fill={team.color} />}
      {status === 'down' && (
        <text x={box.x + box.w - 12} y={box.y + box.h - 8} textAnchor="middle" className="mm-x">
          ✕
        </text>
      )}
    </g>
  );
}
