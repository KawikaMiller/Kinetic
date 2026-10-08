import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { NA, bytes } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, delayText, handshakeFrames, rateText, sec } from './frames';
import {
  BACK, CLIENT_STOPS, DROP, DURATION, POLL_INTERVALS, SSE_HANDSHAKE, TRANSPORTS, TRANSPORT_NAME, WS_HANDSHAKE, counters, delays, simulate,
  type BarKind, type Lane, type Params, type Rate, type ServerEvent,
} from './model';
import './styles.css';

type SceneId = 'lanes' | 'handshake';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'lanes', label: 'Four lanes' },
  { value: 'handshake', label: 'Handshakes' },
];
const STEP_MS = 260;
const HS_STEP_MS = 1700;
const LANES_MIN_W = 520;
/** Bars shorter than this are drawn this wide, so a 100 ms request is visible on a 60 s axis. */
const MIN_VISIBLE = 0.4;
const HONEST = 'Simulated server and network; latencies and byte counts are illustrative.';

const BAR_STYLE: Record<BarKind, { tone: Tone; kind: GanttBar['kind']; label: string }> = {
  request: { tone: 'info', kind: 'work', label: 'request with events' },
  empty: { tone: 'dim', kind: 'work', label: 'empty 200: nothing new' },
  failed: { tone: 'bad', kind: 'blocked', label: 'request failed: network down' },
  hanging: { tone: 'violet', kind: 'wait', label: 'request held open by the server' },
  timeout: { tone: 'dim', kind: 'work', label: 'empty 200 after the timeout' },
  stream: { tone: 'info', kind: 'wait', label: 'connection open' },
  handshake: { tone: 'info', kind: 'work', label: 'connect' },
  send: { tone: 'sky', kind: 'work', label: 'client sends a message' },
};

/** What a lane shows by `now`: pieces that have started, cut at now, never thinner than MIN_VISIBLE. */
function laneBars(lane: Lane, now: number): GanttBar[] {
  const out: GanttBar[] = [];
  lane.bars.forEach((b, i) => {
    if (b.from > now) return;
    const s = BAR_STYLE[b.kind];
    const end = Math.max(Math.min(b.to, now), b.from + MIN_VISIBLE);
    out.push({ id: `${lane.transport}-b${i}`, lane: lane.transport, start: b.from, end, tone: s.tone, kind: s.kind, label: `${s.label}, ${sec(b.from)}–${sec(b.to)}` });
  });
  const ds = delays(lane);
  const mean = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
  lane.deliveries.forEach((d) => {
    if (d.delivered > now) return;
    const slow = d.delivered - d.at > mean + 1e-9;
    out.push({
      id: `${lane.transport}-d${d.id}`, lane: lane.transport, start: d.delivered, end: d.delivered + MIN_VISIBLE, tone: slow ? 'orange' : 'ok',
      label: `message #${d.id} delivered after ${delayText(d.delivered - d.at)}${slow ? ' (slower than this lane\'s mean)' : ''}`,
    });
  });
  lane.missed.forEach((e) => {
    if (e.t > now) return;
    out.push({ id: `${lane.transport}-m${e.id}`, lane: lane.transport, start: e.t, end: e.t + MIN_VISIBLE * 2, tone: 'bad', label: `✕ message #${e.id} missed` });
  });
  return out;
}

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'lanes' });
  return scene === 'lanes' ? <LanesScene picker={picker} /> : <HandshakeScene picker={picker} />;
}

function LanesScene({ picker }: { picker: ReactNode }) {
  const [interval, setPollEvery] = useState(5);
  const [rate, setRate] = useState<Rate>('normal');
  const [clientIndex, setClientIndex] = useState(0);
  const [disconnect, setDisconnect] = useState(false);
  const [resync, setResync] = useState(false);
  const [clientSends, setClientSends] = useState(false);
  const params: Params = useMemo(() => ({ interval, rate, disconnect, resync, clientSends }), [interval, rate, disconnect, resync, clientSends]);
  const { events, lanes } = useMemo(() => simulate(params), [params]);
  const frames = useMemo(() => buildFrames(events, lanes, params), [events, lanes, params]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;
  const clients = CLIENT_STOPS[clientIndex];

  const ganttLanes = [
    { id: 'events', label: 'server events' },
    ...(disconnect ? [{ id: 'network', label: 'network' }] : []),
    ...TRANSPORTS.map((t) => ({ id: t, label: TRANSPORT_NAME[t] })),
  ];
  const bars: GanttBar[] = [
    ...eventBars(events, now),
    ...(disconnect && now >= DROP ? [{ id: 'down', lane: 'network', start: DROP, end: Math.min(BACK, now), tone: 'bad' as Tone, kind: 'blocked' as const, label: 'network down' }] : []),
    ...TRANSPORTS.flatMap((t) => laneBars(lanes[t], now)),
  ];

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'event at the server' },
            { color: 'var(--info)', label: 'request / open connection (hatched)' },
            { color: 'var(--violet)', label: 'long poll held (hatched)' },
            { color: 'var(--dim)', label: 'empty response' },
            { color: 'var(--ok)', label: 'delivered' },
            { color: 'var(--orange)', label: 'delivered slower than the lane mean' },
            { color: 'var(--bad)', label: 'network down / failed / missed ✕' },
            ...(clientSends ? [{ color: 'var(--sky)', label: 'client sends' }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Poll every" value={interval} onChange={setPollEvery} options={POLL_INTERVALS.map((n) => ({ value: n, label: `${n} s` }))} />
        </>,
        <>
          <Segmented label="Messages" value={rate} onChange={setRate} options={[{ value: 'rare', label: 'rare' }, { value: 'normal', label: 'normal' }, { value: 'chatty', label: 'chatty' }]} />
          <Toggle label="Network" value={disconnect} onChange={setDisconnect} off="steady" on={`drop ${DROP}–${BACK} s`} />
          <Toggle label="WebSocket resync" value={resync} onChange={setResync} off="none" on="ask for missed" />
          <Toggle label="Client sends too?" value={clientSends} onChange={setClientSends} off="no" on="yes" />
        </>,
        <Slider key="clients" label="Clients" value={clientIndex} min={0} max={CLIENT_STOPS.length - 1} onChange={setClientIndex} format={(i) => CLIENT_STOPS[i].toLocaleString('en-US')} />,
      ]}
    >
      <div className="stage-pad rt">
        <WideRegion minWidth={LANES_MIN_W} label="Transport lanes: scroll sideways to see all of them">
          <GanttLanes
            lanes={ganttLanes}
            bars={bars}
            domain={[0, DURATION + 1]}
            now={now}
            unit=" s"
            axis
            size="md"
            labelWidth={132}
            labelMinPx={Number.POSITIVE_INFINITY}
            markers={disconnect && now >= DROP ? [{ at: DROP, label: 'drop', tone: 'bad' }, ...(now >= BACK ? [{ at: BACK, label: 'back', tone: 'bad' as Tone }] : [])] : []}
            ariaLabel={`Four transports delivering ${events.length} messages over ${DURATION} seconds`}
          />
        </WideRegion>
        <Hint block>
          Bars shorter than {MIN_VISIBLE} s (a 100 ms request) are drawn {MIN_VISIBLE} s wide so you can see them. {HONEST} &quot;Busy&quot; means a request is in flight or a stream is held open:
          with HTTP keep-alive a polling client usually keeps an idle socket open between requests too, so what differs is requests per second and how much each held connection must stay
          healthy (heartbeats, state), not whether a socket exists.
        </Hint>
        <div className="rt-cards">
          {TRANSPORTS.map((t) => <Card key={t} lane={lanes[t]} clients={clients} />)}
        </div>
      </div>
    </StageFrame>
  );
}

function eventBars(events: ServerEvent[], now: number): GanttBar[] {
  return events.filter((e) => e.t <= now).map((e) => ({ id: `ev${e.id}`, lane: 'events', start: e.t, end: e.t + MIN_VISIBLE, tone: 'amber', label: `message #${e.id} at ${sec(e.t)}` }));
}

function Card({ lane, clients }: { lane: Lane; clients: number }) {
  const c = counters(lane, clients);
  const delay = (v: number | null) => (v === null ? NA : delayText(v));
  return (
    <Box className="rt-card">
      <SectionTitle weight="regular">{TRANSPORT_NAME[lane.transport]}</SectionTitle>
      <Stats>
        <Stat label="Requests" value={c.requests} sub={c.failed ? `${c.failed} failed` : undefined} />
        <Stat label="Empty" value={c.wasted} color={c.wasted ? 'var(--muted)' : undefined} />
        <Stat label="Avg delay" value={delay(c.meanDelay)} />
        <Stat label="Max delay" value={delay(c.maxDelay)} />
        <Stat label="Missed" value={c.missed ? `✕ ${c.missed}` : 0} color={c.missed ? 'var(--bad)' : undefined} />
        <Stat label="Header + framing" value={bytes(c.headerBytes, { base: 1000 })} />
      </Stats>
      <p className="rt-server">
        Server, {clients.toLocaleString('en-US')} {clients === 1 ? 'client' : 'clients'}: <b>{rateText(c.requestsPerSec)}</b> steady-state HTTP requests (connection setup not counted),{' '}
        <b>{Math.round(c.openConnections).toLocaleString('en-US')}</b> connections busy with a request or stream on average
      </p>
    </Box>
  );
}

function HandshakeScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<'ws' | 'sse'>('ws');
  const steps = kind === 'ws' ? WS_HANDSHAKE : SSE_HANDSHAKE;
  const frames = useMemo(() => handshakeFrames(kind, steps), [kind, steps]);
  const player = usePlayer(frames, { interval: HS_STEP_MS, autoplayOnChange: false });
  const step = player.frame.step;
  const shown = steps.slice(0, step + 1).flatMap((s, i) => [...(i ? [''] : []), ...s.lines]);
  return (
    <StageFrame
      player={player}
      height={360}
      controls={[<>{picker}<Segmented label="Show" value={kind} onChange={setKind} options={[{ value: 'ws', label: 'WebSocket upgrade' }, { value: 'sse', label: 'SSE stream' }]} /></>]}
    >
      <div className="stage-pad rt rt-hs">
        <div className="rt-hs-ladder">
          <SequenceDiagram
            actors={[{ id: 'client', label: 'Browser', tone: 'info' }, { id: 'server', label: 'chat.example' }]}
            messages={steps.map((s, i) => ({
              id: `h${i}`, from: s.from, to: s.from === 'client' ? 'server' : 'client', label: s.label, note: s.note,
              tone: (i === 1 ? 'ok' : s.from === 'client' ? 'info' : 'violet') as Tone,
            }))}
            step={step}
            ariaLabel={kind === 'ws' ? 'WebSocket upgrade handshake' : 'Server-Sent Events stream'}
          />
        </div>
        <CodePanel title="On the wire" lines={shown.length ? shown : ['(nothing yet)']} gutter="none" className="rt-wire" />
        <Hint block>
          Key and accept values are the RFC 6455 example. The WebSocket frame byte layout (opcode, mask, length) is out of scope here; the 2- and
          6-byte header sizes are for messages under 126 bytes.
        </Hint>
      </div>
    </StageFrame>
  );
}
