import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type Scenario } from './frames';
import { FORCED_TCP_LOSS, FORCED_UDP_LOSS, LATENCY, MAX_WIN, N, simulate, type FlightView } from './sim';
import './styles.css';

/** Milliseconds per tick at 1× speed. */
const INTERVAL = 260;

// Scene geometry (SVG units)
const SCENE_W = 960;
/** Smallest scene text: the receiver's cell numbers (.tu-num-sm). */
const SMALLEST_TEXT_PX = 9;
/** .tu's horizontal padding, which the scene doesn't get to use. */
const SCENE_PAD_X = 36;
const STAGE_MIN_WIDTH = minWidthForText(SCENE_W, SMALLEST_TEXT_PX) + SCENE_PAD_X;
const LINK_X0 = 250;
const LINK_X1 = 700;
const CELL = 24;
const lanes = { tcp: 18, udp: 222 };
/** Left edge of the receiver column, just right of the link. */
const RECEIVER_X = 722;
/** Receiver cells: size and gap. */
const RX_CELL = 15;
const RX_GAP = 3;
/** Badge width per character of its text (mono 11px). */
const BADGE_CHAR_W = 6.6;

export function Stage() {
  const [scenario, setScenario] = useState<Scenario>('file');
  const [loss, setLoss] = useState(15);
  const [reorder, setReorder] = useState(20);
  // seed 19 at the default settings: one TCP retransmit, two UDP losses, one visible reorder
  const [seed, setSeed] = useState(19);
  const ticks = useMemo(() => simulate(seed, loss / 100, reorder / 100), [seed, loss, reorder]);
  const frames = useMemo(() => buildFrames(ticks, scenario, { loss: loss / 100, reorder: reorder / 100 }), [ticks, scenario, loss, reorder]);
  const player = usePlayer(frames, { interval: INTERVAL, autoplayOnChange: false });
  const f = player.frame;
  const { tcp, udp } = f;

  const tcpFrozen = scenario === 'video' && !tcp.done && tcp.delivered.length > 0 && (tcp.buffer.length > 0 || f.t - tcp.lastDeliver > 6);

  return (
    <StageFrame minWidth={STAGE_MIN_WIDTH}
      player={player}
      height={500}
      style={{ ['--dur' as string]: `${INTERVAL / player.speed}ms` } as CSSProperties}
      stats={
        <Stats>
          <Stat label="TCP delivered" value={`${tcp.delivered.length}/${N}`} color="var(--ok)" sub={`${tcp.retransmits} resent`} />
          <Stat label="TCP longest stall" value={`${tcp.longestStall}`} color="var(--hi)" sub="ticks with nothing new" />
          <Stat label="UDP delivered" value={`${udp.delivered.length}/${N}`} color="var(--info)" sub={`${udp.lost.length} lost for good`} />
          <Stat label="Tick" value={f.t} sub={`link: ${LATENCY} ticks each way`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'packet' },
            { color: 'var(--violet)', label: 'retransmit' },
            { color: 'var(--ok)', label: 'ACK / delivered' },
            { color: 'var(--orange)', label: 'held back / out of order' },
            { color: 'var(--bad)', label: 'lost' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="The app is a…"
            value={scenario}
            onChange={setScenario}
            options={[
              { value: 'file', label: 'File download' },
              { value: 'video', label: 'Video call' },
            ]}
          />
          <Slider label="Packet loss" value={loss} min={0} max={40} onChange={setLoss} format={(v) => `${v}%`} />
          <Slider label="Reordering" value={reorder} min={0} max={50} onChange={setReorder} format={(v) => `${v}%`} />
          <Button onClick={() => setSeed((s) => s + 1)}>New random network</Button>
          <Hint block>
            A simulated link, timed in ticks rather than milliseconds. Whenever loss is above 0%, the first send of TCP #{FORCED_TCP_LOSS} and
            UDP #{FORCED_UDP_LOSS} is always dropped so the story shows up; every other loss and delay is seeded random (New random network
            changes the seed). TCP is simplified: one packet per tick, a window capped at {MAX_WIN}, one timer, go back and resend from the
            first gap on a timeout, no fast retransmit on duplicate ACKs, and ACKs are never lost.
          </Hint>
        </Controls>
      }
    >
      <div className="tu">
        <svg className="tu-scene" viewBox={`0 0 ${SCENE_W} 420`} role="img" aria-label="TCP and UDP transfers side by side">
          <Lane y={lanes.tcp} name="TCP" tag="reliable · ordered · connection">
            <SenderGrid y={lanes.tcp} status={tcp.status} />
            <text x={30} y={lanes.tcp + 136} className="tu-small">
              window <tspan className="tu-strong">{Math.floor(tcp.cwnd)}</tspan>: max unACKed in flight
            </text>
            <Link y={lanes.tcp} acks />
            {tcp.flights.map((fl) => (
              <Packet key={fl.id} fl={fl} y={lanes.tcp + 64} />
            ))}
            {tcp.acks.map((a) => (
              <g key={a.id} className="tu-move" style={{ transform: `translate(${LINK_X1 - a.p * (LINK_X1 - LINK_X0)}px, ${lanes.tcp + 108}px)` }}>
                <rect x={-24} y={-10} width={48} height={20} rx={10} className="tu-ack" />
                <text x={0} y={4} textAnchor="middle" className="tu-ack-text">ACK {a.ack}</text>
              </g>
            ))}
            <Receiver
              y={lanes.tcp}
              buffer={tcp.buffer}
              delivered={tcp.delivered}
              orderOf={() => 'ok'}
              missing={[]}
              appLabel={scenario === 'file' ? 'file.zip' : 'video frames'}
              badge={
                tcp.done ? (scenario === 'file' ? { text: 'file OK ✓', tone: 'ok' } : { text: 'call caught up', tone: 'ok' })
                  : tcpFrozen ? { text: '❚❚ frozen', tone: 'bad' }
                    : null
              }
            />
          </Lane>

          <Lane y={lanes.udp} name="UDP" tag="fire and forget · no ACKs">
            <SenderGrid y={lanes.udp} status={Array.from({ length: N }, (_, i) => (i < udp.sent ? 'sent' : 'unsent'))} />
            <text x={30} y={lanes.udp + 136} className="tu-small">sends at full speed, never looks back</text>
            <Link y={lanes.udp} />
            {udp.flights.map((fl) => (
              <Packet key={fl.id} fl={fl} y={lanes.udp + 64} />
            ))}
            <Receiver
              y={lanes.udp}
              buffer={null}
              delivered={udp.delivered}
              orderOf={(i) => (i > 0 && udp.delivered[i] < Math.max(...udp.delivered.slice(0, i)) ? 'orange' : 'ok')}
              missing={udp.done ? udp.lost : []}
              appLabel={scenario === 'file' ? 'file.zip' : 'video frames'}
              badge={
                udp.done && udp.lost.length
                  ? scenario === 'file'
                    ? { text: `corrupt: ${udp.lost.length} missing`, tone: 'bad' }
                    : { text: `${plural(udp.lost.length, 'glitch', 'glitches')}, no freeze`, tone: 'orange' }
                  : udp.done
                    ? { text: 'all arrived', tone: 'ok' }
                    : null
              }
            />
          </Lane>
        </svg>

        <CwndChart cwnd={f.cwnd} total={frames.length} />
      </div>
    </StageFrame>
  );
}

function Lane({ y, name, tag, children }: { y: number; name: string; tag: string; children: ReactNode }) {
  return (
    <g>
      <rect x={10} y={y} width={940} height={180} rx={14} className="tu-lane" />
      <text x={28} y={y + 26} className="tu-name">{name}</text>
      <text x={72} y={y + 26} className="tu-tag">{tag}</text>
      {children}
    </g>
  );
}

function SenderGrid({ y, status }: { y: number; status: string[] }) {
  return (
    <g>
      <text x={30} y={y + 48} className="tu-small">SENDER</text>
      {status.map((s, i) => {
        const x = 30 + (i % 6) * (CELL + 5);
        const cy = y + 58 + Math.floor(i / 6) * (CELL + 5);
        return (
          <g key={i}>
            <rect x={x} y={cy} width={CELL} height={CELL} rx={5} className={`tu-cell tu-${s}`} />
            <text x={x + CELL / 2} y={cy + 16} textAnchor="middle" className="tu-num">{i + 1}</text>
          </g>
        );
      })}
    </g>
  );
}

function Link({ y, acks = false }: { y: number; acks?: boolean }) {
  return (
    <g>
      <line x1={LINK_X0} y1={y + 64} x2={LINK_X1} y2={y + 64} className="tu-wire" />
      <text x={(LINK_X0 + LINK_X1) / 2} y={y + 44} textAnchor="middle" className="tu-small">data →</text>
      {acks && (
        <>
          <line x1={LINK_X0} y1={y + 108} x2={LINK_X1} y2={y + 108} className="tu-wire tu-wire-ack" />
          <text x={(LINK_X0 + LINK_X1) / 2} y={y + 140} textAnchor="middle" className="tu-small">← ACKs (&quot;next one I expect&quot;)</text>
        </>
      )}
    </g>
  );
}

function Packet({ fl, y }: { fl: FlightView; y: number }) {
  const x = LINK_X0 + fl.p * (LINK_X1 - LINK_X0);
  const cls = fl.lost ? (fl.dead ? 'tu-pkt dead' : 'tu-pkt lost') : fl.retx ? 'tu-pkt retx' : 'tu-pkt';
  return (
    <g className="tu-move" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <rect x={-14} y={-12} width={28} height={24} rx={6} className={cls} />
      <text x={0} y={4} textAnchor="middle" className="tu-pkt-text">
        {fl.dead ? '✕' : fl.seq}
      </text>
    </g>
  );
}

function Receiver({
  y, buffer, delivered, orderOf, missing, appLabel, badge,
}: {
  y: number;
  buffer: number[] | null;
  delivered: number[];
  orderOf: (i: number) => 'ok' | 'orange';
  missing: number[];
  appLabel: string;
  badge: { text: string; tone: 'ok' | 'bad' | 'orange' } | null;
}) {
  const x0 = RECEIVER_X;
  const size = RX_CELL;
  const step = RX_CELL + RX_GAP;
  return (
    <g>
      <text x={x0} y={y + 48} className="tu-small">RECEIVER</text>
      {buffer && (
        <>
          <text x={x0} y={y + 72} className="tu-small tu-dim">held back (waiting for a gap)</text>
          {buffer.map((s, i) => (
            <g key={s}>
              <rect x={x0 + i * step} y={y + 78} width={size} height={size} rx={3} className="tu-cell tu-held" />
              <text x={x0 + i * step + size / 2} y={y + 89} textAnchor="middle" className="tu-num tu-num-sm">{s}</text>
            </g>
          ))}
        </>
      )}
      <text x={x0} y={y + 118} className="tu-small tu-dim">delivered to app → {appLabel}</text>
      {delivered.map((s, i) => (
        <g key={`${s}-${i}`}>
          <rect x={x0 + i * step} y={y + 124} width={size} height={size} rx={3} className={`tu-cell tu-got-${orderOf(i)}`} />
          <text x={x0 + i * step + size / 2} y={y + 135} textAnchor="middle" className="tu-num tu-num-sm">{s}</text>
        </g>
      ))}
      {missing.map((s, i) => (
        <g key={`m${s}`}>
          <rect x={x0 + (delivered.length + i) * step} y={y + 124} width={size} height={size} rx={3} className="tu-cell tu-missing" />
          <text x={x0 + (delivered.length + i) * step + size / 2} y={y + 135} textAnchor="middle" className="tu-num tu-num-sm">{s}</text>
        </g>
      ))}
      {badge && (
        <g>
          <rect x={x0} y={y + 148} width={badge.text.length * BADGE_CHAR_W + 16} height={20} rx={6} className={`tu-badge tu-badge-${badge.tone}`} />
          <text x={x0 + 8} y={y + 162} className="tu-badge-text">{badge.text}</text>
        </g>
      )}
    </g>
  );
}

function CwndChart({ cwnd, total }: { cwnd: number[]; total: number }) {
  const w = 920;
  const h = 56;
  const pts = cwnd.map((c, i) => `${(i / Math.max(1, total - 1)) * w},${h - (c / MAX_WIN) * (h - 6)}`).join(' ');
  return (
    <div className="tu-cwnd">
      <span className="tu-cwnd-label">
        TCP congestion window: grows fast (<b>slow start</b>), then collapses to 1 on a timeout
      </span>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="tu-cwnd-svg">
        {[2, 4, 6, 8].map((v) => (
          <line key={v} x1={0} x2={w} y1={h - (v / MAX_WIN) * (h - 6)} y2={h - (v / MAX_WIN) * (h - 6)} className="tu-grid" />
        ))}
        <polyline points={pts} className="tu-cwnd-line" />
      </svg>
    </div>
  );
}
