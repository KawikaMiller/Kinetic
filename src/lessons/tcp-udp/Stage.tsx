import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { LATENCY, MAX_WIN, N, simulate, type FlightView, type SimEvent, type Tick } from './sim';
import './styles.css';

type Scenario = 'file' | 'video';
interface TuFrame extends Frame, Tick {}

const INTERVAL = 260;

function narrate(e: SimEvent, scenario: Scenario): ReactNode {
  switch (e.kind) {
    case 'tcp-loss':
      return <>TCP packet <span className="hl bad">#{e.seq}</span> just vanished. The sender has no idea yet: it only finds out when the ACK never comes.</>;
    case 'udp-loss':
      return <>UDP lost <span className="hl bad">#{e.seq}</span>. No ACKs, no retries: the app will simply never see it.</>;
    case 'retx':
      return <>No ACK for <span className="hl violet">#{e.seq}</span> before the timeout → TCP <b>resends</b> it and slams its window down to 1 (congestion control: loss means the network is struggling).</>;
    case 'hol':
      return (
        <>
          {e.held.map((s) => `#${s}`).join(', ')} arrived, but <span className="hl">#{e.waiting}</span> is missing. TCP holds everything behind
          the gap: <b>head-of-line blocking</b>.{scenario === 'video' ? ' On a call, that is a frozen picture.' : ''}
        </>
      );
    case 'release':
      return <>#{e.seqs[0]} finally made it → TCP releases <span className="hl ok">#{e.seqs[0]}–#{e.seqs[e.seqs.length - 1]}</span> to the app in one burst.</>;
    case 'udp-reorder':
      return <>UDP handed <span className="hl">#{e.seq}</span> to the app <i>after</i> #{e.before}: out of order. The app has to cope with that itself.</>;
    case 'udp-done':
      return <>UDP is done. Everything that survived arrived immediately, in whatever order the network produced.</>;
    case 'tcp-done':
      return <>TCP has delivered all {N}, perfectly in order.</>;
  }
}

function buildFrames(ticks: Tick[], scenario: Scenario): TuFrame[] {
  const seen = new Set<string>();
  let lastStatus = '';
  const frames: TuFrame[] = ticks.map((tick) => {
    // one caption per tick, first-of-its-kind events win (retx/release always narrate)
    const e = tick.events.find((ev) => ev.kind === 'retx' || ev.kind === 'release' || !seen.has(ev.kind));
    tick.events.forEach((ev) => seen.add(ev.kind));
    if (e) {
      lastStatus = '';
      return { ...tick, say: narrate(e, scenario), hold: 3.2 };
    }
    // No event: show where both protocols stand, but only when that changes,
    // so an old event's caption never lingers over unrelated frames.
    const status = `${tick.tcp.delivered.length}|${tick.udp.delivered.length}|${tick.udp.lost.length}`;
    if (status === lastStatus) return { ...tick, say: undefined, hold: 1 };
    lastStatus = status;
    return {
      ...tick,
      hold: 1,
      say: (
        <>
          TCP has handed <b>{tick.tcp.delivered.length}/{N}</b> to the app, in order. UDP: <b>{tick.udp.delivered.length}</b> arrived
          {tick.udp.lost.length > 0 && <>, <span className="hl bad">{tick.udp.lost.length} lost</span></>}.
        </>
      ),
    };
  });
  frames[0].say = (
    <>
      The same {N} packets, sent over <b>TCP</b> (top) and <b>UDP</b> (bottom), across a link that loses and reorders
      packets. Press play.
    </>
  );
  frames[0].hold = 2;
  const last = frames[frames.length - 1];
  const { tcp, udp } = last;
  last.hold = 3;
  last.say =
    scenario === 'file' ? (
      <>
        File download: TCP delivered <span className="hl ok">all {N} in order</span> (it took {tcp.doneAt} ticks);{' '}
        UDP finished at {udp.doneAt} but the file is <span className="hl bad">missing {udp.lost.length} chunk{udp.lost.length === 1 ? '' : 's'}</span>.
        For files, correctness wins: use TCP.
      </>
    ) : (
      <>
        Video call: TCP's longest freeze was <span className="hl bad">{tcp.longestStall} ticks</span> waiting on retransmits.{' '}
        UDP just skipped {udp.lost.length} frame{udp.lost.length === 1 ? '' : 's'} and kept going. A late frame is useless, so real-time apps pick{' '}
        <span className="hl ok">UDP</span>.
      </>
    );
  return frames;
}

// Scene geometry (SVG units)
const LINK_X0 = 250;
const LINK_X1 = 700;
const CELL = 24;
const lanes = { tcp: 18, udp: 222 };

export function Stage() {
  const [scenario, setScenario] = useState<Scenario>('file');
  const [loss, setLoss] = useState(15);
  const [reorder, setReorder] = useState(20);
  // seed 19 at the default settings: one TCP retransmit, two UDP losses, one visible reorder
  const [seed, setSeed] = useState(19);
  const ticks = useMemo(() => simulate(seed, loss / 100, reorder / 100), [seed, loss, reorder]);
  const frames = useMemo(() => buildFrames(ticks, scenario), [ticks, scenario]);
  const player = usePlayer(frames, { interval: INTERVAL, autoplayOnChange: false });
  const f = player.frame;
  const { tcp, udp } = f;

  const tcpFrozen = scenario === 'video' && !tcp.done && tcp.delivered.length > 0 && (tcp.buffer.length > 0 || f.t - tcp.lastDeliver > 6);

  return (
    <StageFrame
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
            { color: 'var(--hi)', label: 'held back / out of order' },
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
        </Controls>
      }
    >
      <div className="tu">
        <svg className="tu-scene" viewBox="0 0 960 420" role="img" aria-label="TCP and UDP transfers side by side">
          <Lane y={lanes.tcp} name="TCP" tag="reliable · ordered · connection" tagColor="var(--ok)">
            <SenderGrid y={lanes.tcp} status={tcp.status} />
            <text x={30} y={lanes.tcp + 136} className="tu-small">
              window <tspan className="tu-strong">{Math.floor(tcp.cwnd)}</tspan> packet{Math.floor(tcp.cwnd) === 1 ? '' : 's'} in flight
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

          <Lane y={lanes.udp} name="UDP" tag="fire and forget · no ACKs" tagColor="var(--info)">
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
              orderOf={(i) => (i > 0 && udp.delivered[i] < Math.max(...udp.delivered.slice(0, i)) ? 'hi' : 'ok')}
              missing={udp.done ? udp.lost : []}
              appLabel={scenario === 'file' ? 'file.zip' : 'video frames'}
              badge={
                udp.done && udp.lost.length
                  ? scenario === 'file'
                    ? { text: `corrupt: ${udp.lost.length} missing`, tone: 'bad' }
                    : { text: `${udp.lost.length} glitch${udp.lost.length === 1 ? '' : 'es'}, no freeze`, tone: 'hi' }
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

function Lane({ y, name, tag, tagColor, children }: { y: number; name: string; tag: string; tagColor: string; children: ReactNode }) {
  return (
    <g>
      <rect x={10} y={y} width={940} height={180} rx={14} className="tu-lane" />
      <text x={28} y={y + 26} className="tu-name">{name}</text>
      <text x={72} y={y + 26} className="tu-tag" fill={tagColor}>{tag}</text>
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
  orderOf: (i: number) => 'ok' | 'hi';
  missing: number[];
  appLabel: string;
  badge: { text: string; tone: 'ok' | 'bad' | 'hi' } | null;
}) {
  const x0 = 722;
  const size = 15;
  const step = size + 3;
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
          <rect x={x0} y={y + 148} width={badge.text.length * 6.6 + 16} height={20} rx={6} className={`tu-badge tu-badge-${badge.tone}`} />
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
