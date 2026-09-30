import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Packet } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { bytes, NA, pct, plural } from '../../core/format';
import { toneVar } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type JourneyFrame } from './frames';
import {
  DEVICES, DST_IP, DST_PORT, encapsulate, headerBytesFor, HTTP_REQUEST, httpBytes, LAYERS, LINKS, MSS, overhead, PER_FRAME_OVERHEAD, SRC_IP,
  SRC_PORT, type Layer, type LayerId,
} from './model';

// Scene geometry (viewBox units).
const VIEW_W = 900;
const VIEW_H = 470;
const COL_X = [110, 340, 560, 790];
const BOX_W = 156;
const STACK_TOP = 62;
const ROW_GAP = 4;
/** Row height per layer; OSI mode subdivides these into its 7 layers. */
const ROW_H: Record<LayerId, number> = { app: 60, transport: 30, internet: 30, link: 40 };
const WIRE_Y = 258;
const MIN_WIDTH = 720; // smallest scene text is 10px: 900 × 8 / 10

/** Fixed envelope geometry: every layer keeps its place while outer ones come and go. */
const ENVELOPE: Record<LayerId, { x: number; y: number; w: number; h: number }> = {
  link: { x: 150, y: 288, w: 600, h: 172 },
  internet: { x: 164, y: 322, w: 514, h: 128 },
  transport: { x: 178, y: 356, w: 486, h: 84 },
  app: { x: 192, y: 390, w: 458, h: 44 },
};
const FCS_BOX = { x: 690, y: 322, w: 46, h: 128 };

const rowTop = (id: LayerId) => {
  let y = STACK_TOP;
  for (const l of LAYERS) {
    if (l.id === id) return y;
    y += ROW_H[l.id] + ROW_GAP;
  }
  return y;
};

const MESSAGE_SIZES = [
  { value: 'get', label: 'GET / (37 B)', bytes: httpBytes() },
  { value: 'kb', label: '1 KB', bytes: 1024 },
  { value: 'page', label: '64 KB page', bytes: 64 * 1024 },
  { value: 'mb', label: '1 MB image', bytes: 1024 * 1024 },
] as const;
type SizeId = (typeof MESSAGE_SIZES)[number]['value'];

export function Journey({ picker }: { picker: ReactNode }) {
  const frames = useMemo(() => buildFrames(), []);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;
  const [osi, setOsi] = useState(false);
  const [messageSize, setMessageSize] = useState<SizeId>('get');

  const sizes = encapsulate(httpBytes());
  const headers = headerBytesFor(f.layers);
  const size = f.layers.includes('link') ? sizes.frame : sizes.message + headers;

  return (
    <StageFrame
      player={player}
      height={VIEW_H}
      stats={
        <Stats>
          <Stat label="Where" value={DEVICES[f.device].name} color="var(--hi)" sub={f.action === 'travel' ? `on link ${f.travel! + 1}` : 'in the stack'} />
          <Stat label="Size" value={`${size} B`} color="var(--info)" sub={`${headers} B of headers`} />
          <Stat label="TTL" value={f.ttl} color={f.changed.includes('ttl') ? 'var(--hi)' : undefined} sub="−1 per router" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...LAYERS.map((l) => ({ color: toneVar(l.tone), label: `${l.name} (${l.protocol})` })),
            { color: 'var(--hi)', label: 'added / removed / rewritten now' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Layer names" value={osi} onChange={setOsi} off="TCP/IP (4)" on="OSI (7)" />
        </>,
        <Hint key="note" block>
          Minimum header sizes (no IP or TCP options). Plain HTTP on port {DST_PORT}; HTTPS would add TLS between HTTP and TCP.
          Ethernet's preamble and inter-frame gap aren't counted.
        </Hint>,
      ]}
    >
      <div className="osi-stage">
        <WideRegion minWidth={MIN_WIDTH} label="Layer diagram: scroll sideways to see all of it">
          <svg className="osi-scene" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Network stacks and the packet's envelopes">
            {LINKS.map((l, i) => (
              <g key={i}>
                <line x1={COL_X[l.from]} y1={WIRE_Y} x2={COL_X[l.to]} y2={WIRE_Y} className={`osi-wire ${f.travel === i ? 'is-on' : ''}`} />
                <text x={(COL_X[l.from] + COL_X[l.to]) / 2} y={WIRE_Y - 8} textAnchor="middle" className="scene-zone">link {i + 1}</text>
              </g>
            ))}
            {DEVICES.map((d, i) => (
              <DeviceStack key={d.name} index={i} osi={osi} current={f.device === i && f.action !== 'travel'} active={f.device === i ? f.active : null} />
            ))}
            {f.travel !== null && (
              <Packet
                key={player.index}
                path={[{ x: COL_X[f.travel], y: WIRE_Y }, { x: COL_X[f.travel + 1], y: WIRE_Y }]}
                label={`frame · ${sizes.frame} B`}
                color="var(--orange)"
                duration={1.6}
              />
            )}
            <Envelope frame={f} />
          </svg>
        </WideRegion>
        {osi && <OsiNote />}
        <OverheadPanel size={messageSize} onSize={setMessageSize} />
      </div>
    </StageFrame>
  );
}

function DeviceStack({ index, osi, current, active }: { index: number; osi: boolean; current: boolean; active: LayerId | null }) {
  const d = DEVICES[index];
  const x = COL_X[index] - BOX_W / 2;
  const unusedTop = rowTop('app');
  const unusedH = rowTop('internet') - ROW_GAP - unusedTop;
  return (
    <g className="osi-device">
      <text x={COL_X[index]} y={40} textAnchor="middle" className={`osi-device-title ${current ? 'is-current' : ''}`}>
        {d.name}
      </text>
      {d.kind === 'router' && (
        <g>
          <rect x={x} y={unusedTop} width={BOX_W} height={unusedH} rx={8} className="osi-sealed" />
          <text x={COL_X[index]} y={unusedTop + unusedH / 2 - 4} textAnchor="middle" className="osi-sealed-text">never opened</text>
          <text x={COL_X[index]} y={unusedTop + unusedH / 2 + 11} textAnchor="middle" className="osi-sealed-text">by a router</text>
        </g>
      )}
      {LAYERS.filter((l) => d.layers.includes(l.id)).map((l) => (
        <LayerBox key={l.id} layer={l} x={x} y={rowTop(l.id)} osi={osi} active={active === l.id} />
      ))}
    </g>
  );
}

function LayerBox({ layer: l, x, y, osi, active }: { layer: Layer; x: number; y: number; osi: boolean; active: boolean }) {
  const h = ROW_H[l.id];
  const cx = x + BOX_W / 2;
  const rows = osi ? l.osi : null;
  return (
    <g className={`osi-layer tone-${l.tone} ${active ? 'is-active' : ''}`}>
      <rect x={x} y={y} width={BOX_W} height={h} rx={8} className="osi-layer-box" />
      {rows ? (
        rows.map((r, i) => (
          <g key={r.n}>
            {i > 0 && <line x1={x + 8} x2={x + BOX_W - 8} y1={y + (h / rows.length) * i} y2={y + (h / rows.length) * i} className="osi-osi-rule" />}
            <text x={cx} y={y + (h / rows.length) * (i + 0.5) + 4} textAnchor="middle" className="osi-layer-name">
              {r.n} · {r.name}
            </text>
          </g>
        ))
      ) : (
        <text x={cx} y={y + h / 2 + 4} textAnchor="middle" className="osi-layer-name">
          {l.name} · {l.protocol}
        </text>
      )}
    </g>
  );
}

function Envelope({ frame: f }: { frame: JourneyFrame }) {
  const link = f.link !== null ? LINKS[f.link] : null;
  const has = (id: LayerId) => f.layers.includes(id);
  const macChanged = f.changed.includes('mac');
  const ttlChanged = f.changed.includes('ttl');
  return (
    <g className="osi-envelope">
      <text x={450} y={280} textAnchor="middle" className="scene-zone">what's actually sent: envelopes inside envelopes</text>
      <EnvelopeLayer id="link" show={has('link')} active={f.active === 'link'} title="Ethernet header · 14 B">
        <tspan className={macChanged ? 'osi-changed' : undefined}>dst {link?.dstMac ?? NA}  src {link?.srcMac ?? NA}</tspan>
        <tspan>  type 0x0800 (IPv4)</tspan>
      </EnvelopeLayer>
      <motion.g initial={false} animate={{ opacity: has('link') ? 1 : 0 }} className="tone-orange">
        <rect {...FCS_BOX} rx={6} className={`osi-fcs ${f.active === 'link' ? 'is-active' : ''}`} />
        <text x={FCS_BOX.x + FCS_BOX.w / 2} y={FCS_BOX.y + FCS_BOX.h / 2 - 3} textAnchor="middle" className="osi-env-title">FCS</text>
        <text x={FCS_BOX.x + FCS_BOX.w / 2} y={FCS_BOX.y + FCS_BOX.h / 2 + 12} textAnchor="middle" className="osi-env-fields">4 B</text>
      </motion.g>
      <EnvelopeLayer id="internet" show={has('internet')} active={f.active === 'internet'} title="IPv4 header · 20 B">
        <tspan>src {SRC_IP}  dst {DST_IP}  </tspan>
        <tspan className={ttlChanged ? 'osi-changed' : undefined}>TTL {f.ttl}</tspan>
        <tspan>  protocol 6 (TCP)</tspan>
      </EnvelopeLayer>
      <EnvelopeLayer id="transport" show={has('transport')} active={f.active === 'transport'} title="TCP header · 20 B">
        <tspan>src port {SRC_PORT}  dst port {DST_PORT}  seq 1  flags PSH ACK</tspan>
      </EnvelopeLayer>
      <EnvelopeLayer id="app" show={has('app')} active={f.active === 'app'} title={`HTTP · ${httpBytes()} B`} body>
        {HTTP_REQUEST.split('\r\n').filter(Boolean).join('  ⏎  ')}
      </EnvelopeLayer>
    </g>
  );
}

function EnvelopeLayer({
  id, show, active, title, body = false, children,
}: {
  id: LayerId;
  show: boolean;
  active: boolean;
  title: string;
  body?: boolean;
  children: ReactNode;
}) {
  const g = ENVELOPE[id];
  const tone = LAYERS.find((l) => l.id === id)!.tone;
  return (
    <motion.g initial={false} animate={{ opacity: show ? 1 : 0 }} transition={{ duration: 0.35 }} className={`tone-${tone}`}>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={9} className={`osi-env ${active ? 'is-active' : ''}`} />
      <text x={g.x + 10} y={g.y + 15} className="osi-env-title">{title}</text>
      <text x={g.x + 10} y={g.y + (body ? 33 : 29)} className="osi-env-fields">{children}</text>
    </motion.g>
  );
}

function OsiNote() {
  return (
    <p className="osi-note">
      <b>OSI</b> is a 7-layer teaching model from the 1980s. The internet actually runs on the 4-layer <b>TCP/IP</b> suite: its
      Application layer covers OSI 7-5 and its Link layer covers OSI 2-1. Engineers still say "layer 4" and "layer 7" in OSI numbers.
    </p>
  );
}

function OverheadPanel({ size, onSize }: { size: SizeId; onSize: (s: SizeId) => void }) {
  const msg = MESSAGE_SIZES.find((m) => m.value === size)!.bytes;
  const o = overhead(msg);
  return (
    <div className="osi-overhead box">
      <Segmented label="Message size" value={size} onChange={onSize} options={MESSAGE_SIZES.map(({ value, label }) => ({ value, label }))} />
      <div className="osi-overhead-read">
        <span>
          {plural(o.segments, 'frame')} (up to {MSS} B each) × {PER_FRAME_OVERHEAD} B of headers = <b>{bytes(o.headerBytes, { base: 1000, dp: o.headerBytes < 1000 ? 0 : 1 })}</b>
          {o.paddingBytes > 0 && <> + {o.paddingBytes} B padding</>}
        </span>
        <Bar value={o.efficiency} max={1} tone={o.efficiency < 0.5 ? 'bad' : 'ok'} height={8}
          label={<>your data is <b>{pct(o.efficiency, 1)}</b> of the bytes sent</>} />
      </div>
    </div>
  );
}
