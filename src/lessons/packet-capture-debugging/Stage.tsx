import { useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram, type SequenceMessage } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, TextField, Toggle } from '../../components/ui';
import { useRadioGroup } from '../../components/useRadioGroup';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { ipToString } from '../../core/ipv4';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { CAPTURES, CLIENT, RESOLVER, SERVER, type Captured, type DiagnosisId, type Tag } from './captures';
import { FILTER_EXAMPLES, FILTER_MAX, parseFilter } from './filter';
import { captureIntro, guessCaption, packetCaption, traceFrames } from './frames';
import { PATH, traceroute } from './trace';
import { DIAGNOSES, appFields, tcpdumpHost, tcpdumpLine } from './views';
import { SNAPLEN, decode, type Field, type Layer } from './wire';
import './styles.css';

type SceneId = 'capture' | 'trace';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'capture', label: 'Capture viewer' },
  { value: 'trace', label: 'Traceroute' },
];
/** Wide enough that every Info cell stays on one line; narrower screens scroll the list sideways. */
const LIST_MIN_W = 860;
const HONEST = 'Pre-built captures from a simulated network: documentation addresses, made-up MACs, no real traffic captured.';

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'capture' });
  return scene === 'trace' ? <TraceScene picker={picker} /> : <CaptureScene picker={picker} />;
}

// ── Colours by what a packet is ─────────────────────────────────────────

const TAG_TONE: Record<Tag, Tone | null> = {
  dns: 'violet', handshake: 'info', ack: null, data: null, fin: null, rst: 'bad', retransmission: 'orange', 'dup-ack': 'orange', 'tls-alert': 'bad',
};
const LAYER_TONE: Record<Layer, Tone> = { eth: 'sky', ip: 'amber', tcp: 'pink', udp: 'pink', app: 'muted' };
const LAYER_NAME: Record<Layer, string> = { eth: 'Ethernet II', ip: 'Internet Protocol v4', tcp: 'Transmission Control Protocol', udp: 'User Datagram Protocol', app: 'Application' };

// ── Capture viewer ──────────────────────────────────────────────────────

function CaptureScene({ picker }: { picker: ReactNode }) {
  const [captureId, setCaptureId] = useState(CAPTURES[0].id);
  const capture = CAPTURES.find((c) => c.id === captureId)!;
  const [filterText, setFilterText] = useState('');
  const [selectedNo, setSelectedNo] = useState<number | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [guess, setGuess] = useState<DiagnosisId | null>(null);
  const [lastAction, setLastAction] = useState<'intro' | 'packet' | 'guess'>('intro');
  const [tcpdump, setTcpdump] = useState(false);

  const parsed = parseFilter(filterText);
  // A refused filter keeps the list as the last filter that parsed left it.
  const [lastGood, setLastGood] = useState('');
  if (parsed.ok && filterText !== lastGood) setLastGood(filterText);
  const active = parsed.ok ? parsed : parseFilter(lastGood);
  const visible = active.ok ? capture.packets.filter(active.value) : capture.packets;
  const selected = capture.packets.find((p) => p.no === selectedNo) ?? null;

  const pickCapture = (id: string) => {
    setCaptureId(id);
    setSelectedNo(null);
    setFieldId(null);
    setGuess(null);
    setLastAction('intro');
  };
  const pickPacket = (p: Captured) => {
    setSelectedNo(p.no);
    setFieldId(null);
    setLastAction('packet');
  };
  const caption =
    lastAction === 'guess' && guess ? guessCaption(guess, capture.answer)
      : lastAction === 'packet' && selected ? packetCaption(selected, capture.packets)
        : captureIntro(capture);
  useIntroCaption(caption, [captureId, selectedNo, guess, lastAction]);

  return (
    <StageFrame
      height={520}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'selected packet / field' },
        { color: 'var(--info)', label: 'handshake (SYN, SYN-ACK, ACK)' },
        { color: 'var(--violet)', label: 'DNS' },
        { color: 'var(--orange)', label: 'retransmission / dup ACK' },
        { color: 'var(--bad)', label: 'RST / TLS alert' },
      ]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Mystery capture" inline>
            {CAPTURES.map((c) => <ChipButton key={c.id} tone="info" on={c.id === captureId} onClick={() => pickCapture(c.id)}>{c.label}</ChipButton>)}
          </ControlGroup>
        </>,
        <>
          <TextField label="Display filter" value={filterText} onChange={setFilterText} width={260} spellCheck={false} sanitize={(s) => s.slice(0, FILTER_MAX + 1)} />
          <ControlGroup label="Try" inline>
            {FILTER_EXAMPLES.map((f) => <ChipButton key={f} tone="violet" on={filterText === f} onClick={() => setFilterText(filterText === f ? '' : f)}>{f}</ChipButton>)}
          </ControlGroup>
          <Toggle label="View" value={tcpdump} onChange={setTcpdump} off="Packet list" on="tcpdump lines" />
        </>,
        <ControlGroup key="d" label="Diagnosis" inline>
          {DIAGNOSES.map((d) => (
            <ChipButton key={d.id} size="md" tone={guess === d.id ? (d.id === capture.answer ? 'ok' : 'bad') : 'info'} on={guess === d.id} onStyle="solid"
              onClick={() => { setGuess(d.id); setLastAction('guess'); }}>
              {d.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pc">
        <p className={`pc-filter-msg ${parsed.ok ? '' : 'is-error'}`} role="status">
          {parsed.ok
            ? filterText.trim() ? `Showing ${visible.length} of ${capture.packets.length} packets.` : `All ${capture.packets.length} packets. A display filter only hides packets that were captured.`
            : `${parsed.error} Still showing the last filter that worked.`}
        </p>
        {tcpdump ? <TcpdumpView packets={capture.packets} /> : (
          <WideRegion minWidth={LIST_MIN_W} label="Packet list: scroll sideways to see every column">
            <PacketList packets={visible} selected={selectedNo} onSelect={pickPacket} />
          </WideRegion>
        )}
        {selected ? <PacketDetail key={selected.no} packet={selected} fieldId={fieldId} setFieldId={setFieldId} /> : <p className="empty-note">Select a packet to see its layers and bytes.</p>}
        <div className="pc-ladder">
          <SectionTitle weight="regular" hint={selected ? `up to packet ${selected.no}` : 'whole capture'}>Ladder</SectionTitle>
          <Ladder packets={capture.packets} selected={selected} />
        </div>
        <Hint block>{HONEST} TLS is 1.2 here, so the certificate and the alert are readable (TLS 1.3 encrypts them).</Hint>
      </div>
    </StageFrame>
  );
}

function PacketList({ packets, selected, onSelect }: { packets: readonly Captured[]; selected: number | null; onSelect: (p: Captured) => void }) {
  const index = packets.findIndex((p) => p.no === selected);
  const radio = useRadioGroup(packets.length, index, (i) => onSelect(packets[i]));
  return (
    <div className="pc-list" role="radiogroup" aria-label="Captured packets">
      <div className="pc-row pc-head" aria-hidden="true"><span>No.</span><span>Time</span><span>Source</span><span>Destination</span><span>Protocol</span><span>Info</span></div>
      {packets.length === 0 && <p className="empty-note">No packet matches this filter.</p>}
      {packets.map((p, i) => {
        const d = decode(p.frame);
        const tone = TAG_TONE[p.tag];
        return (
          <button key={p.no} type="button" {...radio.itemProps(i)} onClick={() => onSelect(p)}
            className={`pc-row ${tone ? `tone-${tone} is-toned` : ''} ${p.no === selected ? 'is-selected' : ''}`}
            aria-label={`Packet ${p.no}, ${p.t.toFixed(6)} s, ${ipToString(d.src)} to ${ipToString(d.dst)}, ${p.protocol}: ${p.info}`}>
            <span>{p.no}</span><span>{p.t.toFixed(6)}</span><span>{ipToString(d.src)}</span><span>{ipToString(d.dst)}</span><span>{p.protocol}</span>
            <span className="pc-info">{p.info}</span>
          </button>
        );
      })}
    </div>
  );
}

function PacketDetail({ packet, fieldId, setFieldId }: { packet: Captured; fieldId: string | null; setFieldId: (id: string | null) => void }) {
  const d = decode(packet.frame);
  const fields: Field[] = [...d.fields, ...appFields(packet)];
  const layers = [...new Set(fields.map((f) => f.layer))];
  const field = fields.find((f) => f.id === fieldId) ?? null;
  const index = fields.findIndex((f) => f.id === fieldId);
  const radio = useRadioGroup(fields.length, index, (i) => setFieldId(fields[i].id));
  const captured = packet.captured.length;
  const byteFields = layers.map((l) => {
    const fs = fields.filter((f) => f.layer === l);
    return { from: Math.min(...fs.map((f) => f.from)), to: Math.min(captured - 1, Math.max(...fs.map((f) => f.to))), tone: LAYER_TONE[l], label: LAYER_NAME[l] };
  }).filter((f) => f.from < captured);

  return (
    <div className="pc-detail">
      <div className="pc-layers" role="radiogroup" aria-label={`Packet ${packet.no} fields`}>
        <SectionTitle weight="regular" hint={`frame ${packet.frame.length} bytes, ${captured} captured${packet.frame.length > SNAPLEN ? ` (snaplen ${SNAPLEN})` : ''}`}>
          Packet {packet.no}
        </SectionTitle>
        {layers.map((l) => (
          <div key={l} className={`pc-layer tone-${LAYER_TONE[l]}`}>
            <span className="pc-layer-name">{l === 'app' ? (packet.dns ? 'Domain Name System' : 'Transport Layer Security') : LAYER_NAME[l]}</span>
            {fields.map((f, i) => f.layer !== l ? null : (
              <button key={f.id} type="button" {...radio.itemProps(i)} onClick={() => setFieldId(f.id)} className={`pc-field ${f.id === fieldId ? 'is-selected' : ''}`}>
                <span className="pc-field-name">{f.name}</span> <span className="pc-field-value">{f.value}</span>
                {f.from >= captured && <span className="pc-cut"> (not captured)</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="pc-bytes">
        <SectionTitle weight="regular" hint={field ? `${field.name}: bytes ${field.from}-${Math.min(field.to, captured - 1)}` : 'click a byte or a field'}>Bytes</SectionTitle>
        <WideRegion minWidth={300} label="Frame bytes: scroll sideways to see all of them">
          <ByteGrid
            bytes={packet.captured}
            fields={byteFields}
            toneOf={(i) => (field && i >= field.from && i <= field.to ? 'hi' : undefined)}
            highlight={field ? Array.from({ length: Math.max(0, Math.min(field.to, captured - 1) - field.from + 1) }, (_, k) => ({ i: field.from + k, tone: 'hi' as const })) : []}
            onByteClick={(i) => setFieldId([...fields].reverse().find((f) => i >= f.from && i <= f.to)?.id ?? null)}
            ascii
            ariaLabel={`Packet ${packet.no}: ${captured} captured bytes`}
          />
        </WideRegion>
      </div>
    </div>
  );
}

function TcpdumpView({ packets }: { packets: readonly Captured[] }) {
  const kept = tcpdumpHost(packets);
  return (
    <div className="pc-tcpdump">
      <ConsolePanel title="$ tcpdump -n host 203.0.113.10" empty="(nothing to or from that host was captured)"
        lines={kept.map((p) => ({ text: tcpdumpLine(p), tone: TAG_TONE[p.tag] ?? 'muted' }))} />
      <Hint block>
        "host 203.0.113.10" is a capture filter (BPF syntax): tcpdump records only matching packets, so the DNS lookups, which go to the resolver,
        were never kept ({packets.length - kept.length} of {packets.length} left out). Display filters like ip.addr == 203.0.113.10 only hide what
        was already captured. Lines are in the style of tcpdump -n, simplified.
      </Hint>
    </div>
  );
}

function ladderLabel(p: Captured): string {
  if (p.dns) return p.dns.response ? (p.dns.rcode === 3 ? `${p.dns.type}: NXDOMAIN` : `${p.dns.type} ${p.dns.answer}`) : `${p.dns.type}? ${p.dns.name}`;
  const t = p.tcp!;
  const what = p.tls ? (p.tls.alert ? `Alert: ${p.tls.alert}` : p.tls.record.split(',')[0]) : t.flags.filter((f) => f !== 'PSH').join(',');
  return `${p.tag === 'retransmission' ? 'retransmit: ' : p.tag === 'dup-ack' ? 'dup ' : ''}${what}`;
}

function Ladder({ packets, selected }: { packets: readonly Captured[]; selected: Captured | null }) {
  const actors = [
    { id: 'client', label: `client ${ipToString(CLIENT)}` },
    { id: 'resolver', label: `resolver ${ipToString(RESOLVER)}` },
    { id: 'server', label: `server ${ipToString(SERVER)}` },
  ];
  const messages: SequenceMessage[] = packets.map((p) => ({ id: `${p.no}`, from: p.from, to: p.to, label: `${p.no} ${ladderLabel(p)}`, tone: TAG_TONE[p.tag] ?? undefined }));
  const step = selected ? packets.indexOf(selected) : undefined;
  return <SequenceDiagram actors={actors} messages={messages} step={step} currentStyle="tone" fit={step === undefined ? 'all' : 'shown'} ariaLabel="Ladder of the captured packets" />;
}

// ── Traceroute ──────────────────────────────────────────────────────────

const TRACE_STEP_MS = 1600;

function TraceScene({ picker }: { picker: ReactNode }) {
  const trace = useMemo(() => traceroute(), []);
  const frames = useMemo(() => traceFrames(trace), [trace]);
  const player = usePlayer(frames, { interval: TRACE_STEP_MS, autoplayOnChange: false });
  const shown = player.frame.shown;
  const actors = [{ id: 'me', label: 'client' }, ...PATH.map((_, i) => ({ id: `h${i}`, label: i === PATH.length - 1 ? 'server' : `hop ${i + 1}` }))];
  const messages: SequenceMessage[] = trace.flatMap((h) => {
    const probe: SequenceMessage = { id: `p${h.ttl}`, from: 'me', to: `h${h.at}`, label: `TTL=${h.ttl}`, tone: 'info', note: h.from === null ? 'no reply: * * *' : undefined };
    if (h.from === null) return [probe];
    return [probe, { id: `r${h.ttl}`, from: `h${h.at}`, to: 'me', label: h.reply === 'port-unreachable' ? 'Port Unreachable' : 'Time Exceeded', tone: h.reply === 'port-unreachable' ? 'ok' : 'violet' }];
  });
  const lastMessage = shown === 0 ? -1 : messages.findLastIndex((m) => m.id.slice(1) === `${trace[shown - 1].ttl}`);

  return (
    <StageFrame
      player={player}
      height={380}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'probe' },
        { color: 'var(--violet)', label: 'ICMP Time Exceeded' },
        { color: 'var(--ok)', label: 'Port Unreachable (destination)' },
        { color: 'var(--dim)', label: 'no answer' },
      ]} />}
      controls={[<>{picker}</>]}
    >
      <div className="stage-pad pc">
        <SequenceDiagram actors={actors} messages={messages} step={lastMessage} currentStyle="tone" ariaLabel="traceroute probes and replies" />
        <table className="data-table pc-hops">
          <thead><tr><th>TTL</th><th>reply from</th><th>hop</th><th>round trips (3 probes)</th></tr></thead>
          <tbody>
            {trace.slice(0, shown).map((h) => (
              <tr key={h.ttl} className={h.from === null ? 'is-silent' : ''}>
                <td>{h.ttl}</td>
                <td>{h.from === null ? '*' : ipToString(h.from)}</td>
                <td>{PATH[h.at].name}</td>
                <td className="pc-rtts">{h.rtts.map((r, k) => <span key={k}>{r === null ? '*' : `${r} ms`}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint block>
          Simulated path; round-trip times are illustrative. Classic traceroute sends UDP probes to high ports, so the destination answers Port
          Unreachable. No real probes are sent: the path, its routers and their addresses (documentation ranges) are made up.
        </Hint>
      </div>
    </StageFrame>
  );
}
