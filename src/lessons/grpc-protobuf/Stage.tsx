import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { toBits, chunkGroups } from '../../core/bits';
import { useSetCaption } from '../../core/caption';
import type { ByteField } from '../../core/bytes';
import { NA } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import {
  DEADLINE_MS, MODES, MODE_LABEL, STATUS_NAME, STATUS_TABLE, buildCall, messageLabel, messageNote, statusAt, streamState, type Ending, type Mode,
} from './calls';
import { callFrames, encodeCaption } from './frames';
import {
  FIELD_NAMES, INT64_MAX, PROTO_LINE, emptyOrder, presentFields, protoLines, type DeltaType, type FieldName, type Order,
} from './model';
import { READERS, analyse, parseId, parseInt32, parseTags, sizeTones, sizeVerdict, traceRows, varintBreakdown, type ReaderId, type SizeVerdict } from './scene';
import './styles.css';

type SceneId = 'encode' | 'calls';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'encode', label: 'Bytes on the wire' },
  { value: 'calls', label: 'gRPC calls' },
];

/** A plain category per field; the tag and length bytes are violet, the value bytes take the field's colour. */
const FIELD_TONE: Record<FieldName, Tone> = { id: 'sky', item: 'amber', qty: 'orange', delta: 'pink', tags: 'muted' };
const CALL_STEP_MS = 1500;
const HONEST_ENCODE = 'Encoder written for this lesson, matching the protobuf wire format for the field types shown. JSON is the compact proto3 JSON mapping, uncompressed; real sizes depend on the data.';
const HONEST_CALLS = 'Scripted, simplified exchange: real calls add flow control, metadata and compression, and many calls share one HTTP/2 connection.';

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'encode' });
  return scene === 'encode' ? <EncodeScene picker={picker} /> : <CallsScene picker={picker} />;
}

// ── Bytes on the wire ───────────────────────────────────────────────────

const DEFAULT_ORDER: Order = { id: 150n, item: 'testing', qty: 3, delta: -1, tags: [3, 270, 86942] };
const PRESETS: { label: string; order: Order }[] = [
  { label: 'The default message', order: DEFAULT_ORDER },
  { label: 'Docs example: id = 150', order: { ...emptyOrder(), id: 150n } },
  { label: 'Negative numbers', order: { id: -2n, item: '', qty: -1, delta: -1, tags: [-1] } },
  { label: 'Biggest int64', order: { ...emptyOrder(), id: INT64_MAX, item: 'big' } },
  { label: 'Unicode string', order: { ...emptyOrder(), item: 'café 😀', qty: 1 } },
  { label: 'Twelve −1 tags', order: { ...emptyOrder(), tags: Array(12).fill(-1) } },
  { label: 'All defaults', order: emptyOrder() },
];

interface Texts {
  id: string;
  item: string;
  qty: string;
  delta: string;
  tags: string;
}
const textsOf = (o: Order): Texts => ({ id: o.id.toString(), item: o.item, qty: String(o.qty), delta: String(o.delta), tags: o.tags.join(', ') });

/** The cheaper side of the size comparison is green, the costlier red; equal sizes stay plain. */
const sizeColor = (v: SizeVerdict, side: 'protobuf' | 'json'): string | undefined => {
  const tone = sizeTones(v)[side];
  return tone ? `var(--${tone})` : undefined;
};

const toneOf = (role: 'tag' | 'length' | 'value', f: FieldName): Tone => (role === 'value' ? FIELD_TONE[f] : 'violet');

function EncodeScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [order, setOrder] = useState<Order>(DEFAULT_ORDER);
  const [texts, setTexts] = useState<Texts>(textsOf(DEFAULT_ORDER));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [deltaType, setDeltaType] = useState<DeltaType>('sint32');
  const [readerId, setReaderId] = useState<ReaderId>('same');
  const [picked, setPicked] = useState<string | null>(null);

  const a = useMemo(() => analyse(order, deltaType, readerId), [order, deltaType, readerId]);
  const present = presentFields(order);
  const varint = a.encoded.varints.find((v) => v.label === picked) ?? a.encoded.varints[0] ?? null;
  const caption = useMemo(() => encodeCaption(order, a, readerId), [order, a, readerId]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const load = (o: Order) => {
    setOrder(o);
    setTexts(textsOf(o));
    setErrors({});
    setPicked(null);
  };
  /** Keep the text as typed; adopt the value only when it parses, so a bad entry never changes the bytes. */
  const edit = <K extends FieldName>(key: K, text: string, parse: (t: string) => { ok: true; value: Order[K] } | { ok: false; error: string }) => {
    setTexts((t) => ({ ...t, [key]: text }));
    const r = parse(text);
    setErrors((e) => ({ ...e, [key]: r.ok ? undefined : r.error }));
    if (r.ok) setOrder((o) => ({ ...o, [key]: r.value }));
  };

  const fields = useMemo((): ByteField[] => {
    const unknown = a.decoded.ok ? a.decoded.decoded.unknown : [];
    const inUnknown = (i: number) => unknown.some((u) => i >= u.from && i <= u.to);
    const own = a.encoded.segments
      .filter((s) => !inUnknown(s.from))
      .map((s) => ({ from: s.from, to: s.to, tone: toneOf(s.role, s.field), label: s.role === 'value' ? s.field : `${s.field} ${s.role}` }));
    /** Packed list elements are separate varints but one run of the same field: one key entry. */
    const merged = own.reduce<ByteField[]>((out, f) => {
      const last = out.at(-1);
      if (last && last.label === f.label && last.to + 1 === f.from) last.to = f.to;
      else out.push({ ...f });
      return out;
    }, []);
    return [...unknown.map((u) => ({ from: u.from, to: u.to, tone: 'dim' as Tone, label: `skipped: field ${u.field}` })), ...merged].sort((x, y) => x.from - y.from);
  }, [a]);

  const rows = traceRows(a);
  const size = sizeVerdict(a.encoded.bytes.length, a.jsonBytes);
  const n = a.encoded.bytes.length;
  const lines = protoLines(a.writer);
  const fieldOfLine = (i: number) => FIELD_NAMES.find((f) => PROTO_LINE[f] === i);
  const sentBytes = (f: FieldName) => {
    const sp = a.encoded.span[f];
    return sp ? sp.to - sp.from + 1 : 0;
  };

  return (
    <StageFrame
      height={460}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'tag and length bytes' },
            ...FIELD_NAMES.map((f) => ({ color: `var(--${FIELD_TONE[f] === 'muted' ? 'muted' : FIELD_TONE[f]})`, label: `${f} value` })),
            { color: 'var(--dim)', label: 'skipped by the reader' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="pb-presets" role="group" aria-label="Presets">
            {PRESETS.map((p) => <ChipButton key={p.label} tone="info" onClick={() => load(p.order)}>{p.label}</ChipButton>)}
          </div>
        </>,
        <>
          <Toggle label="delta is declared" value={deltaType === 'int32'} onChange={(v) => setDeltaType(v ? 'int32' : 'sint32')} off="sint32 (zigzag)" on="int32" />
          <Segmented label="Who reads the bytes" value={readerId} onChange={setReaderId} options={READERS} />
        </>,
      ]}
    >
      <div className="stage-pad pb">
        <div className="pb-top">
          <CodePanel
            title="order.proto"
            lines={lines}
            gutter="none"
            stateOf={(i) => {
              const f = fieldOfLine(i);
              if (!f) return 'idle';
              if (varint && varint.field === f) return 'now';
              return present.includes(f) ? 'idle' : 'past';
            }}
            marker={(i) => {
              const f = fieldOfLine(i);
              return f ? <span className={`pb-dot tone-${FIELD_TONE[f]}`} aria-hidden="true" /> : null;
            }}
            trailing={(i) => {
              const f = fieldOfLine(i);
              return f ? <span className="pb-trail">{present.includes(f) ? `${sentBytes(f)} B` : 'default: 0 B'}</span> : null;
            }}
            className="pb-proto"
          />
          <Box className="pb-fields">
            <SectionTitle weight="regular">The message</SectionTitle>
            <div className="pb-inputs">
              <Field label="id" error={errors.id}>
                <TextField label="id" value={texts.id} onChange={(v) => edit('id', v, parseId)} width={200} spellCheck={false} />
              </Field>
              <Field label="item" error={errors.item}>
                <TextField label="item" value={texts.item} onChange={(v) => edit('item', v, (t) => ({ ok: true, value: t }))} width={170} maxLength={40} />
              </Field>
              <Field label="qty" error={errors.qty}>
                <TextField label="qty" value={texts.qty} onChange={(v) => edit('qty', v, (t) => parseInt32(t))} width={120} spellCheck={false} />
              </Field>
              <Field label="delta" error={errors.delta}>
                <TextField label="delta" value={texts.delta} onChange={(v) => edit('delta', v, (t) => parseInt32(t))} width={120} spellCheck={false} />
              </Field>
              <Field label="tags" error={errors.tags}>
                <TextField label="tags (empty = none)" value={texts.tags} onChange={(v) => edit('tags', v, parseTags)} width={190} spellCheck={false} />
              </Field>
            </div>
            <Hint block>A zero, an empty string or an empty list is a default: proto3 doesn't send it. A bad entry is refused here and the last good value stays.</Hint>
          </Box>
        </div>

        <div className="pb-bytes">
          <SectionTitle weight="regular" hint={n ? `${n} bytes · click a byte to expand its varint` : 'nothing to send'}>On the wire</SectionTitle>
          {n ? (
            <ByteGrid
              bytes={a.encoded.bytes}
              fields={fields}
              highlight={varint ? Array.from({ length: varint.to - varint.from + 1 }, (_, k) => ({ i: varint.from + k, tone: 'hi' as Tone })) : []}
              onByteClick={(i) => setPicked(a.encoded.varints.find((v) => i >= v.from && i <= v.to)?.label ?? picked)}
              ariaLabel="Encoded Order bytes"
            />
          ) : (
            <p className="empty-note">An empty message is zero bytes.</p>
          )}
        </div>

        <div className="pb-mid">
          <Box className="pb-varint">
            <SectionTitle weight="regular" hint={varint ? `${varint.label}: ${varint.to - varint.from + 1} ${varint.to === varint.from ? 'byte' : 'bytes'}` : undefined}>A varint, bit by bit</SectionTitle>
            {varint ? <VarintView a={a} varint={varint} onPick={setPicked} /> : <p className="empty-note">No varint fields are set.</p>}
          </Box>
          <Box className="pb-size">
            <SectionTitle weight="regular">Same data as JSON</SectionTitle>
            <code className="pb-json">{a.json}</code>
            <Stats>
              <Stat label="protobuf" value={`${n} B`} color={sizeColor(size, 'protobuf')} />
              <Stat label="JSON" value={`${a.jsonBytes} B`} color={sizeColor(size, 'json')} />
              <Stat label="JSON ÷ protobuf" value={size.ratio === null ? NA : `${size.ratio.toFixed(1)}×`} />
            </Stats>
          </Box>
        </div>

        <div className="pb-trace">
          <SectionTitle weight="regular" hint={`read with ${readerId === 'older' ? 'an older .proto (no tags)' : readerId === 'renumbered' ? 'the old numbers (qty = 3)' : 'the same .proto'}`}>What the reader makes of it</SectionTitle>
          <div className="pb-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th scope="col">field no.</th><th scope="col">wire type</th><th scope="col">bytes</th><th scope="col">read as</th></tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((r, i) => (
                  <tr key={i} className={r.skipped ? 'pb-skipped' : undefined}>
                    <td>{r.field}</td><td>{r.wire}</td><td className="pb-hex">{r.hex}</td><td>{r.meaning}</td>
                  </tr>
                )) : <tr><td colSpan={4}>nothing on the wire</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <Hint block>{HONEST_ENCODE}</Hint>
      </div>
    </StageFrame>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="pb-field" data-field={label}>
      {children}
      {error && <span className="pb-error" role="alert">{error}</span>}
    </div>
  );
}

function VarintView({ a, varint, onPick }: { a: ReturnType<typeof analyse>; varint: NonNullable<ReturnType<typeof analyse>['encoded']['varints'][number]>; onPick: (label: string) => void }) {
  const bytes = a.encoded.bytes.slice(varint.from, varint.to + 1);
  const bits = bytes.flatMap((b) => toBits(b, 8));
  const b = varintBreakdown(bytes);
  const items = a.encoded.varints;
  return (
    <div className="pb-varint-body">
      {items.length > 1 && (
        <Segmented ariaLabel="Which varint to expand" value={varint.label} onChange={onPick} options={items.map((v) => ({ value: v.label, label: v.label }))} />
      )}
      <BitStrip
        bits={bits}
        size="sm"
        groups={chunkGroups(bits.length, 8, { label: (k) => `byte ${k + 1}` })}
        toneOf={(i) => (i % 8 === 0 ? 'hi' : 'info')}
        ariaLabel={`Bits of ${varint.label}: a continuation bit then seven payload bits, per byte`}
      />
      <p className="pb-varint-text">
        First bit of each byte (yellow): <b>1</b> = another byte follows, <b>0</b> = last. The other 7 bits (blue) are the payload, least significant group
        first: <code>{b.groups.join(' · ')}</code>. Reversed: <code>{b.reversed.join(' ')}</code> = <b>{b.value.toString()}</b>
        {b.value > INT64_MAX ? ' (as a signed 64-bit number, a negative one: its sign bits fill all ten bytes)' : ''}.
      </p>
    </div>
  );
}

// ── gRPC calls ──────────────────────────────────────────────────────────

const ENDING_OPTIONS: { value: Ending; label: string }[] = [
  { value: 'ok', label: 'OK' },
  { value: 'not-found', label: 'NOT_FOUND' },
  { value: 'deadline', label: `deadline missed (${DEADLINE_MS} ms)` },
];

function CallsScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>('bidi');
  const [ending, setEnding] = useState<Ending>('ok');
  const messages = useMemo(() => buildCall(mode, ending), [mode, ending]);
  const frames = useMemo(() => callFrames(mode, ending), [mode, ending]);
  const player = usePlayer(frames, { interval: CALL_STEP_MS, autoplayOnChange: false });
  const step = player.frame.step;
  const state = streamState(messages, step);
  const status = statusAt(messages, step);

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'client to server' },
            { color: 'var(--violet)', label: 'server to client' },
            { color: 'var(--ok)', label: 'grpc-status OK' },
            { color: 'var(--bad)', label: 'error status' },
            { color: 'var(--orange)', label: 'client gives up (RST_STREAM)' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Stream 1 (client's view)" value={state} />
          <Stat label="HTTP status" value={status.http ?? NA} />
          <Stat
            label="grpc-status"
            value={status.grpc ? `${status.grpc.code} ${STATUS_NAME[status.grpc.code]}` : NA}
            sub={status.grpc?.by === 'client' ? 'made by the client' : status.grpc ? 'sent in trailers' : undefined}
            color={status.grpc ? (status.grpc.code === 0 ? 'var(--ok)' : status.grpc.by === 'client' ? 'var(--orange)' : 'var(--bad)') : undefined}
          />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Call shape" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
        </>,
        <Segmented key="ending" label="How it ends" value={ending} onChange={setEnding} options={ENDING_OPTIONS} />,
      ]}
    >
      <div className="stage-pad pb">
        <div className="pb-calls">
          <div className="pb-ladder">
            <SequenceDiagram
              actors={[{ id: 'client', label: 'Client', tone: 'info' }, { id: 'server', label: 'Server: shop.Orders' }]}
              messages={messages.map((m) => ({
                id: m.id, from: m.from, to: m.from === 'client' ? 'server' : 'client', label: messageLabel(m, mode), note: messageNote(m), tone: m.tone,
              }))}
              step={step}
              ariaLabel={`${MODE_LABEL[mode]} gRPC call as HTTP/2 frames on one stream`}
            />
          </div>
          <div className="pb-codes">
            <SectionTitle weight="regular" hint="a few of the codes">grpc-status</SectionTitle>
            <div className="pb-table-wrap">
              <table className="data-table">
                <tbody>
                  {STATUS_TABLE.map((s) => (
                    <tr key={s.code}>
                      <th scope="row" className="keep-case">{s.code} {STATUS_NAME[s.code]}</th>
                      <td>{s.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <Hint block>{HONEST_CALLS} Deadlines and retries in general belong to a later lesson on timeouts; here a deadline is just the header and what a missed one looks like.</Hint>
      </div>
    </StageFrame>
  );
}
