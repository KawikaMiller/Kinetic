import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import {
  saga, twoPhaseCommit, type Msg, type NodeId, type Protocol, type SagaCase, type SagaStyle, type Tone, type TwoPcCase,
} from './frames';
import './styles.css';

const TONE: Record<Tone, string> = {
  idle: 'var(--cell-line)', work: 'var(--info)', ok: 'var(--ok)', bad: 'var(--bad)', hi: 'var(--hi)', violet: 'var(--violet)', dim: 'var(--dim)',
};

const POS: Record<NodeId, { x: number; y: number }> = {
  client: { x: 130, y: 66 },
  coord: { x: 450, y: 66 },
  client2: { x: 770, y: 66 },
  orders: { x: 150, y: 340 },
  payments: { x: 450, y: 340 },
  inventory: { x: 750, y: 340 },
};
const BUS_Y = 204;
const W = 210;
const H = 100;

export function Stage() {
  const [protocol, setProtocol] = useState<Protocol>('2pc');
  const [twoPc, setTwoPc] = useState<TwoPcCase>('happy');
  const [sagaCase, setSagaCase] = useState<SagaCase>('fail');
  const [style, setStyle] = useState<SagaStyle>('orch');

  const frames = useMemo(
    () => (protocol === '2pc' ? twoPhaseCommit(twoPc) : saga(sagaCase, style)),
    [protocol, twoPc, sagaCase, style],
  );
  const player = usePlayer(frames, { interval: 1800 });
  const f = player.frame;
  const chor = protocol === 'saga' && style === 'chor';

  const titles: Record<NodeId, string> = {
    client: 'Customer',
    coord: protocol === '2pc' ? 'Coordinator' : 'Saga orchestrator',
    client2: 'Customer #2',
    orders: 'Orders',
    payments: 'Payments',
    inventory: 'Inventory',
  };

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Protocol" value={protocol === '2pc' ? '2PC' : 'Saga'} color={protocol === '2pc' ? 'var(--info)' : 'var(--violet)'} sub={protocol === '2pc' ? 'atomic, blocking' : 'available, eventual'} />
          <Stat label="Messages" value={f.sent} />
          <Stat label="Locks held" value={f.locks} color={f.locks ? 'var(--hi)' : 'var(--ok)'} sub="across services" />
          <Stat label="Consistency" value={<span className="dt-cons">{f.consistency.label}</span>} color={TONE[f.consistency.tone]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'working / request' },
            { color: 'var(--hi)', label: 'prepared, holding locks' },
            { color: 'var(--ok)', label: 'committed' },
            { color: 'var(--bad)', label: 'failed / abort' },
            { color: 'var(--violet)', label: 'compensated' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Protocol"
            options={[{ value: '2pc', label: 'Two-phase commit' }, { value: 'saga', label: 'Saga' }]}
            value={protocol}
            onChange={setProtocol}
          />
          {protocol === '2pc' ? (
            <Segmented
              label="What happens"
              options={[
                { value: 'happy', label: 'Everyone votes yes' },
                { value: 'no', label: 'Inventory votes no' },
                { value: 'crash', label: 'Coordinator crashes' },
              ]}
              value={twoPc}
              onChange={setTwoPc}
            />
          ) : (
            <>
              <Segmented
                label="What happens"
                options={[{ value: 'happy', label: 'All steps succeed' }, { value: 'fail', label: 'Step 3 fails' }]}
                value={sagaCase}
                onChange={setSagaCase}
              />
              <Segmented
                label="Style"
                options={[{ value: 'orch', label: 'Orchestration' }, { value: 'chor', label: 'Choreography' }]}
                value={style}
                onChange={setStyle}
              />
            </>
          )}
        </Controls>
      }
    >
      <svg className="dt" viewBox="0 0 900 430" role="img" aria-label="Services exchanging transaction messages">
        <text x={18} y={24} className="dt-phase">
          {f.phase}
        </text>

        {/* wiring */}
        {chor ? (
          <g>
            <rect x={60} y={BUS_Y - 14} width={780} height={28} rx={14} className="dt-bus" />
            <text x={78} y={BUS_Y + 4} className="dt-bus-label">
              event bus
            </text>
            {(['orders', 'payments', 'inventory'] as NodeId[]).map((id) => (
              <line key={id} x1={POS[id].x} y1={BUS_Y + 14} x2={POS[id].x} y2={POS[id].y - H / 2} className="dt-wire" />
            ))}
            <line x1={POS.client.x} y1={POS.client.y + H / 2 - 16} x2={POS.orders.x} y2={POS.orders.y - H / 2} className="dt-wire" />
          </g>
        ) : (
          <g>
            <line x1={POS.client.x + W / 2} y1={POS.client.y} x2={POS.coord.x - W / 2} y2={POS.coord.y} className="dt-wire" />
            {(['orders', 'payments', 'inventory'] as NodeId[]).map((id) => (
              <line key={id} x1={POS.coord.x} y1={POS.coord.y + H / 2 - 16} x2={POS[id].x} y2={POS[id].y - H / 2} className="dt-wire" />
            ))}
            {!f.nodes.client2.hidden && (
              <line x1={POS.client2.x} y1={POS.client2.y + H / 2 - 16} x2={POS.inventory.x} y2={POS.inventory.y - H / 2} className="dt-wire dt-wire-bad" />
            )}
          </g>
        )}

        {(Object.keys(POS) as NodeId[]).map((id) => {
          const n = f.nodes[id];
          if (n.hidden) return null;
          const p = POS[id];
          const small = id === 'client' || id === 'coord' || id === 'client2';
          const h = small ? H - 32 : H;
          return (
            <g key={id} transform={`translate(${p.x - W / 2}, ${p.y - h / 2})`}>
              <rect width={W} height={h} rx={12} className={`dt-node ${n.crashed ? 'crashed' : ''}`} style={{ stroke: TONE[n.tone] }} />
              <text x={14} y={22} className="dt-title">
                {titles[id]}
              </text>
              {n.lock && (
                <motion.text x={W - 16} y={23} className="dt-lock" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}>
                  🔒
                </motion.text>
              )}
              {n.crashed && (
                <text x={W - 16} y={23} className="dt-lock">
                  💥
                </text>
              )}
              {!small && (
                <g transform="translate(14, 36)">
                  <rect width={Math.max(60, n.status.length * 7.4 + 16)} height={22} rx={11} style={{ fill: TONE[n.tone] }} className="dt-chip" />
                  <text x={8} y={15} className="dt-chip-text" style={n.tone === 'idle' || n.tone === 'dim' ? { fill: 'var(--text)' } : undefined}>
                    {n.status}
                  </text>
                </g>
              )}
              <text x={14} y={small ? 48 : 80} className="dt-detail" style={{ fill: n.crashed ? 'var(--bad)' : undefined }}>
                {n.crashed ? 'crashed ' + n.detail : n.detail}
              </text>
            </g>
          );
        })}

        {f.stall && (
          <motion.g key={f.stall} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <rect x={340} y={BUS_Y - 18} width={220} height={36} rx={18} className="dt-stall" />
            <text x={450} y={BUS_Y + 5} className="dt-stall-text">
              ⏳ blocked for {f.stall}
            </text>
          </motion.g>
        )}

        {f.msgs.map((m, i) => (
          <Pill key={`${player.index}-${i}`} m={m} />
        ))}
      </svg>
    </StageFrame>
  );
}

function edge(id: NodeId, towards: { x: number; y: number }) {
  const p = POS[id];
  const small = id === 'client' || id === 'coord' || id === 'client2';
  const h = small ? H - 32 : H;
  if (Math.abs(towards.y - p.y) < 20) return { x: p.x + Math.sign(towards.x - p.x) * (W / 2), y: p.y };
  return { x: p.x, y: p.y + Math.sign(towards.y - p.y) * (h / 2) };
}

function Pill({ m }: { m: Msg }) {
  const from = edge(m.from, POS[m.to]);
  const to = edge(m.to, POS[m.from]);
  const w = m.label.length * 6.9 + 18;
  const color = TONE[m.tone];
  const transition = { duration: 0.9, ease: 'easeInOut' } as const;

  let animate;
  if (m.viaBus) {
    const fromTop = { x: POS[m.from].x, y: BUS_Y };
    const end = { x: POS[m.to].x, y: to.y - 26 };
    animate = { x: [from.x, fromTop.x, end.x, end.x], y: [from.y, fromTop.y, BUS_Y, end.y], opacity: [0, 1, 1, 1] };
  } else {
    // stop short of the target so parallel messages don't stack on top of each other
    const t = 0.7;
    animate = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, opacity: 1 };
  }

  return (
    <motion.g initial={{ x: from.x, y: from.y, opacity: 0 }} animate={animate} transition={m.viaBus ? { ...transition, duration: 1.3 } : transition}>
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} className="dt-pill" style={{ stroke: color }} />
      <text y={4} className="dt-pill-text" style={{ fill: color }}>
        {m.label}
      </text>
    </motion.g>
  );
}

