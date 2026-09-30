import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Packet } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Pt } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import {
  saga, twoPhaseCommit, type Msg, type NodeId, type Protocol, type SagaCase, type SagaStyle, type Tone, type TwoPcCase,
} from './frames';
import './styles.css';

const TONE: Record<Tone, string> = {
  idle: 'var(--cell-line)', work: 'var(--info)', ok: 'var(--ok)', bad: 'var(--bad)', hi: 'var(--hi)', violet: 'var(--violet)', dim: 'var(--dim)',
};

const POS: Record<NodeId, Pt> = {
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
/** Customers and the coordinator are shorter boxes: no status chip. */
const SMALL_NODES: NodeId[] = ['client', 'coord', 'client2'];
const SMALL_SHRINK = 32;
const isSmall = (id: NodeId) => SMALL_NODES.includes(id);
const nodeHeight = (id: NodeId) => (isSmall(id) ? H - SMALL_SHRINK : H);

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
          const small = isSmall(id);
          const h = nodeHeight(id);
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

/** Where a message leaves or enters a node's box: its side if level, otherwise its top or bottom. */
function edge(id: NodeId, towards: Pt): Pt {
  const p = POS[id];
  const h = nodeHeight(id);
  if (Math.abs(towards.y - p.y) < 20) return { x: p.x + Math.sign(towards.x - p.x) * (W / 2), y: p.y };
  return { x: p.x, y: p.y + Math.sign(towards.y - p.y) * (h / 2) };
}

/** Direct messages stop this fraction of the way, so parallel ones don't stack on each other. */
const STOP_SHORT = 0.7;
/** Bus messages come to rest this far above the receiving node. */
const BUS_REST_GAP = 26;
const DIRECT_SECONDS = 0.9;
const BUS_SECONDS = 1.3;

const PILL_CLASSES = { pill: 'dt-pill', text: 'dt-pill-text' };

function Pill({ m }: { m: Msg }) {
  const from = edge(m.from, POS[m.to]);
  const to = edge(m.to, POS[m.from]);
  // Bus messages ride up to the bus, along it, then drop to rest above the receiver.
  const path = m.viaBus
    ? [from, { x: POS[m.from].x, y: BUS_Y }, { x: POS[m.to].x, y: BUS_Y }, { x: POS[m.to].x, y: to.y - BUS_REST_GAP }]
    : [from, to];
  return (
    <Packet
      path={path}
      stopAt={m.viaBus ? undefined : STOP_SHORT}
      arrive="stay"
      fadeIn={m.viaBus ? 'first-hop' : 'full'}
      scaleIn={null}
      variant="outline"
      classes={PILL_CLASSES}
      label={m.label}
      color={TONE[m.tone]}
      duration={m.viaBus ? BUS_SECONDS : DIRECT_SECONDS}
      height={22}
      charW={6.9}
      pad={18}
    />
  );
}