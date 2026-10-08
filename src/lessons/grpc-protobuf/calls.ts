/**
 * gRPC calls as the HTTP/2 messages they are: one stream per call, request HEADERS, then
 * length-prefixed protobuf messages in DATA frames, response HEADERS, DATA, and a trailing
 * HEADERS frame carrying `grpc-status`. Four shapes (unary, server streaming, client
 * streaming, bidirectional) and three endings (OK, an error status, the client's deadline).
 * Scripted and simplified: real calls add flow control, pings, compression and metadata.
 */
import type { Tone } from '../../core/tone';
import { emptyOrder, encode, type Order } from './model';

export type Mode = 'unary' | 'server' | 'client' | 'bidi';
export type Ending = 'ok' | 'not-found' | 'deadline';
export const MODES: Mode[] = ['unary', 'server', 'client', 'bidi'];
export const ENDINGS: Ending[] = ['ok', 'not-found', 'deadline'];

export const MODE_LABEL: Record<Mode, string> = { unary: 'Unary', server: 'Server streaming', client: 'Client streaming', bidi: 'Bidirectional' };
export const METHOD: Record<Mode, string> = { unary: 'GetOrder', server: 'WatchOrders', client: 'UploadOrders', bidi: 'SyncOrders' };
export const SERVICE = 'shop.Orders';
/** The call's deadline, sent as `grpc-timeout: 200m` (200 milliseconds). */
export const DEADLINE_MS = 200;

/** Status codes from the gRPC status-code list, the ones the lesson uses. */
export const STATUS = { OK: 0, DEADLINE_EXCEEDED: 4, NOT_FOUND: 5 } as const;
export const STATUS_NAME: Record<number, string> = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT', 4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED', 12: 'UNIMPLEMENTED', 13: 'INTERNAL', 14: 'UNAVAILABLE', 16: 'UNAUTHENTICATED',
};
/** The codes a caller most often branches on, with what they mean. */
export const STATUS_TABLE: { code: number; meaning: string }[] = [
  { code: 0, meaning: 'success' },
  { code: 3, meaning: 'the request was malformed: fix it, do not retry as is' },
  { code: 4, meaning: 'the deadline passed before the call finished' },
  { code: 5, meaning: 'the thing asked for is not there' },
  { code: 14, meaning: 'the service is unavailable right now: retrying may help' },
  { code: 16, meaning: 'no valid credentials' },
];

export type Kind = 'req-headers' | 'req-data' | 'resp-headers' | 'resp-data' | 'trailers' | 'trailers-only' | 'cancel';

export interface CallMessage {
  id: string;
  from: 'client' | 'server';
  kind: Kind;
  /** 1-based index among this direction's DATA messages. */
  n?: number;
  /** The frame's END_STREAM flag (an RST_STREAM has none: it resets the stream instead). */
  endStream: boolean;
  /** Protobuf bytes in a DATA frame. */
  payload?: number;
  /** gRPC length-prefixed bytes in a DATA frame: 5 + payload. */
  framed?: number;
  /** For trailers: the grpc-status code. */
  status?: number;
  tone: Tone;
}

/** The 5-byte prefix on every gRPC message: a compressed-flag byte and a 4-byte big-endian length. */
export const GRPC_PREFIX = 5;

export const grpcFrame = (payload: readonly number[]): number[] => {
  const n = payload.length;
  return [0, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...payload];
};

const order = (o: Partial<Order>): Order => ({ ...emptyOrder(), ...o });
/** The sample messages: each direction sends three small Orders. */
export const REQUESTS: Order[] = [order({ id: 7n, item: 'tea' }), order({ id: 8n, item: 'milk', qty: 2 }), order({ id: 9n, item: 'jam', qty: 1, delta: -1 })];
export const RESPONSES: Order[] = [order({ id: 7n, item: 'tea', qty: 3 }), order({ id: 8n, item: 'milk', qty: 12 }), order({ id: 9n, item: 'jam', qty: 5, tags: [3, 270] })];
const payloadOf = (list: Order[], n: number) => encode(list[n - 1]).bytes.length;

/** Steps in time order: c = a request message, s = a response message. */
const SHAPE: Record<Mode, ('c' | 's')[]> = {
  unary: ['c', 's'],
  server: ['c', 's', 's', 's'],
  client: ['c', 'c', 'c', 's'],
  bidi: ['c', 's', 'c', 's', 'c', 's'],
};

/** How many request and response messages a mode sends in the OK case. */
export const counts = (mode: Mode) => ({ requests: SHAPE[mode].filter((x) => x === 'c').length, responses: SHAPE[mode].filter((x) => x === 's').length });

/**
 * The messages of one call. With an error ending, the server (or the deadline) cuts in at the
 * first response step: a trailers-only NOT_FOUND, or the client's RST_STREAM(CANCEL) when the
 * server is too slow. Anything after that is never sent.
 */
export function buildCall(mode: Mode, ending: Ending): CallMessage[] {
  const out: CallMessage[] = [];
  const shape = SHAPE[mode];
  const lastC = shape.lastIndexOf('c');
  let c = 0;
  let s = 0;
  out.push({ id: 'h-req', from: 'client', kind: 'req-headers', endStream: false, tone: 'info' });
  for (let i = 0; i < shape.length; i++) {
    if (shape[i] === 'c') {
      c++;
      const payload = payloadOf(REQUESTS, c);
      out.push({ id: `c${c}`, from: 'client', kind: 'req-data', n: c, endStream: i === lastC, payload, framed: GRPC_PREFIX + payload, tone: 'info' });
      continue;
    }
    if (s === 0 && ending === 'not-found') {
      out.push({ id: 'trailers', from: 'server', kind: 'trailers-only', endStream: true, status: STATUS.NOT_FOUND, tone: 'bad' });
      return out;
    }
    if (s === 0 && ending === 'deadline') {
      out.push({ id: 'cancel', from: 'client', kind: 'cancel', endStream: false, status: STATUS.DEADLINE_EXCEEDED, tone: 'orange' });
      return out;
    }
    if (s === 0) out.push({ id: 'h-resp', from: 'server', kind: 'resp-headers', endStream: false, tone: 'violet' });
    s++;
    const payload = payloadOf(RESPONSES, s);
    out.push({ id: `s${s}`, from: 'server', kind: 'resp-data', n: s, endStream: false, payload, framed: GRPC_PREFIX + payload, tone: 'violet' });
  }
  out.push({ id: 'trailers', from: 'server', kind: 'trailers', endStream: true, status: STATUS.OK, tone: 'ok' });
  return out;
}

/** The text a message shows on the ladder. */
export function messageLabel(m: CallMessage, mode: Mode): string {
  switch (m.kind) {
    case 'req-headers': return `HEADERS POST /${SERVICE}/${METHOD[mode]}`;
    case 'req-data': return `DATA message ${m.n} (${m.framed} B)`;
    case 'resp-headers': return 'HEADERS :status 200';
    case 'resp-data': return `DATA message ${m.n} (${m.framed} B)`;
    case 'trailers': return `HEADERS grpc-status: ${m.status}`;
    case 'trailers-only': return `HEADERS :status 200, grpc-status: ${m.status}`;
    case 'cancel': return 'RST_STREAM CANCEL';
  }
}

/** The second line under a message. */
export function messageNote(m: CallMessage): string | undefined {
  switch (m.kind) {
    case 'req-headers': return `content-type: application/grpc, grpc-timeout: ${DEADLINE_MS}m`;
    case 'req-data': case 'resp-data': return `${GRPC_PREFIX} B prefix + ${m.payload} B protobuf${m.endStream ? ' · END_STREAM' : ''}`;
    case 'trailers': return `${STATUS_NAME[m.status!]} · END_STREAM`;
    case 'trailers-only': return `${STATUS_NAME[m.status!]} · END_STREAM`;
    case 'cancel': return `${DEADLINE_MS} ms passed with no answer`;
    default: return undefined;
  }
}

/** RFC 9113 §5.1 states, from the client's side: local = the client has finished sending, remote = the server has finished. */
export type StreamState = 'idle' | 'open' | 'half-closed (local)' | 'half-closed (remote)' | 'closed';

/** The HTTP/2 stream's state after the messages up to and including `step`. */
export function streamState(messages: readonly CallMessage[], step: number): StreamState {
  const seen = messages.slice(0, step + 1);
  if (!seen.length) return 'idle';
  const clientDone = seen.some((m) => m.from === 'client' && m.endStream);
  const serverDone = seen.some((m) => m.from === 'server' && m.endStream);
  if (seen.some((m) => m.kind === 'cancel') || (clientDone && serverDone)) return 'closed';
  if (clientDone) return 'half-closed (local)';
  return serverDone ? 'half-closed (remote)' : 'open';
}

export interface StatusReadout {
  /** The :status of the response, once the server's HEADERS have been seen. */
  http: number | null;
  /** The grpc-status once it exists, and who produced it. */
  grpc: { code: number; by: 'server' | 'client' } | null;
}

/** What the HTTP status and the grpc-status are after the messages up to `step`. */
export function statusAt(messages: readonly CallMessage[], step: number): StatusReadout {
  const seen = messages.slice(0, step + 1);
  const http = seen.some((m) => m.kind === 'resp-headers' || m.kind === 'trailers-only' || m.kind === 'trailers') ? 200 : null;
  const end = seen.find((m) => m.status !== undefined);
  return { http, grpc: end ? { code: end.status!, by: end.from } : null };
}
