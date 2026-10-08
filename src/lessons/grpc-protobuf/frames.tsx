import type { ReactNode } from 'react';
import { bytes as formatBytes, pct, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  DEADLINE_MS, GRPC_PREFIX, METHOD, MODE_LABEL, SERVICE, STATUS_NAME, buildCall, type CallMessage, type Ending, type Mode,
} from './calls';
import type { Order } from './model';
import { lostFields, sizeTones, sizeVerdict, type Analysis, type ReaderId } from './scene';

const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

/** The live caption of the encode scene, from the numbers the model computed for the current message. */
export function encodeCaption(order: Order, a: Analysis, readerId: ReaderId): ReactNode {
  const n = a.encoded.bytes.length;
  const size = sizeVerdict(n, a.jsonBytes);
  const tones = sizeTones(size);
  const tenByte = a.encoded.varints.some((v) => v.to - v.from + 1 === 10);
  const sizes =
    n === 0 ? (
      <>Every field is at its default, so the message is <b>0 bytes</b>: proto3 never sends a default. (As JSON it would still be {a.jsonBytes} bytes: <code>{a.json}</code>.)</>
    ) : (
      <>This Order is <span className={`hl ${tones.protobuf ?? ''}`}>{plural(n, 'byte')}</span> in protobuf and <span className={`hl ${tones.json ?? ''}`}>{a.jsonBytes} bytes</span> as JSON
        {size.smaller === 'protobuf' ? ` (${pct(size.saving)} smaller)` : size.smaller === 'json' ? ` (protobuf is ${pct(size.overhead!)} larger here)` : ' (the same size)'}
        {size.smaller === 'protobuf' ? ': only field numbers and values travel, never the names.' : '.'}
        {tenByte ? ' A negative int32 or int64 is sign-extended to 64 bits and takes 10 bytes, which is why a number like -1 costs more than its JSON text.' : null}</>
    );
  const delta = a.encoded.varints.find((v) => v.field === 'delta');
  const deltaNote = delta ? (
    <> <b>delta = {signed(order.delta)}</b> takes {plural(delta.to - delta.from + 1, 'byte')} as {a.writer.deltaType}
      {a.writer.deltaType === 'sint32' ? ' (zigzag keeps small magnitudes small)' : order.delta < 0 ? ' (a negative int32 is sign-extended to 64 bits: always 10 bytes)' : ''}.</>
  ) : null;
  const lost = lostFields(order, a);
  const unknown = a.decoded.ok ? a.decoded.decoded.unknown : [];
  let reader: ReactNode = null;
  if (readerId === 'older') {
    reader = unknown.length
      ? <> The older reader skipped <span className="hl">field {unknown[0].field}</span> ({unknown[0].to - unknown[0].from + 1} bytes, by its length) and kept it: nothing it knew was lost.</>
      : <> No field 5 is on the wire here, so the older reader sees every field.</>;
  } else if (readerId === 'renumbered') {
    reader = lost.includes('qty')
      ? <> <span className="hl bad">The reader lost qty</span>: the writer moved it to field {unknown.map((u) => u.field).join(', ')}, which the reader skips, so it reads {a.decoded.ok ? a.decoded.decoded.order.qty : 0} instead of {order.qty}. Never renumber a field.</>
      : <> qty is 0 here, so nothing is lost this time: give it a value to see the renumbering break the reader.</>;
  }
  return <>{sizes}{deltaNote}{reader}</>;
}

// ── gRPC call ladder ────────────────────────────────────────────────────

export interface CallFrame extends Frame {
  /** Index of the current message on the ladder; -1 before the first. */
  step: number;
}

const INTRO: Record<Mode, ReactNode> = {
  unary: <>Unary: one request message, one response message, like an ordinary function call. Press play to see it as HTTP/2 frames on one stream.</>,
  server: <>Server streaming: one request, then a stream of responses. Press play: every message rides the same HTTP/2 stream.</>,
  client: <>Client streaming: a stream of requests, then one response. Press play: the client half-closes when it is done sending.</>,
  bidi: <>Bidirectional streaming: both sides send whenever they like on the one stream. Press play.</>,
};

export function messageCaption(m: CallMessage, mode: Mode): ReactNode {
  switch (m.kind) {
    case 'req-headers':
      return <>The client opens stream 1 with HEADERS: <code>POST /{SERVICE}/{METHOD[mode]}</code>, <code>content-type: application/grpc</code> and{' '}
        <code>grpc-timeout: {DEADLINE_MS}m</code>, a {DEADLINE_MS} ms deadline for the whole call. gRPC always uses POST over HTTP/2.</>;
    case 'req-data':
      return <>Request message {m.n}: {m.payload} B of protobuf behind a {GRPC_PREFIX}-byte gRPC prefix (a compressed flag and a length) is {m.framed} B in a DATA frame.
        {m.endStream ? <> It carries <b>END_STREAM</b>: the client is done sending, but can still receive.</> : null}</>;
    case 'resp-headers':
      return <>The server answers with HEADERS <code>:status 200</code>. The HTTP status is 200 whatever happens next: a gRPC call's real outcome comes at the end, in the trailers.</>;
    case 'resp-data':
      return <>Response message {m.n}: {m.payload} B of protobuf and the {GRPC_PREFIX}-byte prefix, {m.framed} B in a DATA frame.</>;
    case 'trailers':
      return <>Trailers: a last HEADERS frame with <span className="hl ok">grpc-status: {m.status} ({STATUS_NAME[m.status!]})</span> and END_STREAM closes the stream. That is why gRPC needs HTTP/2 trailers.</>;
    case 'trailers-only':
      return <><span className="hl bad">NOT_FOUND ({m.status})</span>: the server has no answer, so one HEADERS frame carries both <code>:status 200</code> and <code>grpc-status: {m.status}</code>{' '}
        and END_STREAM. gRPC errors travel as a status code, not as an HTTP 404.
        {mode === 'bidi' ? <> The client has not finished sending, so the server can also send RST_STREAM with NO_ERROR to tell it to stop (RFC 9113 §8.1).</> : null}</>;
    case 'cancel':
      return <><span className="hl orange">{DEADLINE_MS} ms passed with no answer</span>. The client sends RST_STREAM(CANCEL) so the server can stop working, and its own call fails with{' '}
        <b>DEADLINE_EXCEEDED ({m.status})</b>. In this script the server never answered, so the client made that status itself; the server is told the deadline too, and could also return it.</>;
  }
}

export function callSummary(mode: Mode, ending: Ending): ReactNode {
  const ms = buildCall(mode, ending);
  const req = ms.filter((m) => m.kind === 'req-data').length;
  const resp = ms.filter((m) => m.kind === 'resp-data').length;
  const last = ms.at(-1)!;
  const bytes = ms.reduce((s, m) => s + (m.framed ?? 0), 0);
  return <>{MODE_LABEL[mode]} call finished: {plural(req, 'request message')} and {plural(resp, 'response message')} ({formatBytes(bytes, { base: 1000 })} of
    length-prefixed protobuf) on one stream, ending with {last.kind === 'cancel' ? 'the client\'s RST_STREAM' : `grpc-status ${last.status}`} ({STATUS_NAME[last.status ?? 0]}).
    Scripted, simplified exchange: real calls also have flow control, metadata and compression. Many calls like this share one HTTP/2 connection (see `http-versions`).</>;
}

export function callFrames(mode: Mode, ending: Ending): CallFrame[] {
  const ms = buildCall(mode, ending);
  return [
    { step: -1, say: INTRO[mode] },
    ...ms.map((m, i) => ({ step: i, say: messageCaption(m, mode) })),
    { step: ms.length - 1, say: callSummary(mode, ending), hold: 2 },
  ];
}
