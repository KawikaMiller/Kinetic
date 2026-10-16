/**
 * Round trips before the first byte. Each stack is a list of flights (a message from one side), and each flight is sent
 * when the flight it follows arrives, so every count in the lesson comes from walking the messages, not from a typed table.
 * DNS is left out. Real handshakes carry more detail (extensions, certificates split over packets, acknowledgements);
 * this keeps the flights that decide the count.
 */
export type Stack = 'tcp-tls12' | 'tcp-tls13' | 'quic' | 'quic-0rtt';
export type Side = 'client' | 'server';
export type FlightKind = 'transport' | 'crypto' | 'request' | 'response';

export interface Flight {
  id: string;
  from: Side;
  label: string;
  kind: FlightKind;
  /** The flight whose arrival triggers this one, or null for a flight sent at the start. */
  after: string | null;
  /** The server works on the request this long before it answers. */
  thinks?: boolean;
}

export const STACKS: readonly Stack[] = ['tcp-tls12', 'tcp-tls13', 'quic', 'quic-0rtt'];
export const STACK_LABEL: Record<Stack, string> = {
  'tcp-tls12': 'TCP + TLS 1.2',
  'tcp-tls13': 'TCP + TLS 1.3',
  quic: 'QUIC',
  'quic-0rtt': 'QUIC 0-RTT',
};

const REQUEST = 'HTTP request';
const RESPONSE = 'first byte of the response';

export const FLIGHTS: Record<Stack, readonly Flight[]> = {
  'tcp-tls12': [
    { id: 'syn', from: 'client', label: 'SYN', kind: 'transport', after: null },
    { id: 'synack', from: 'server', label: 'SYN-ACK', kind: 'transport', after: 'syn' },
    { id: 'hello', from: 'client', label: 'ACK + ClientHello', kind: 'crypto', after: 'synack' },
    { id: 'shello', from: 'server', label: 'ServerHello, Certificate, ServerHelloDone', kind: 'crypto', after: 'hello' },
    { id: 'cke', from: 'client', label: 'ClientKeyExchange, Finished', kind: 'crypto', after: 'shello' },
    { id: 'sfin', from: 'server', label: 'ChangeCipherSpec, Finished', kind: 'crypto', after: 'cke' },
    { id: 'req', from: 'client', label: REQUEST, kind: 'request', after: 'sfin' },
    { id: 'resp', from: 'server', label: RESPONSE, kind: 'response', after: 'req', thinks: true },
  ],
  'tcp-tls13': [
    { id: 'syn', from: 'client', label: 'SYN', kind: 'transport', after: null },
    { id: 'synack', from: 'server', label: 'SYN-ACK', kind: 'transport', after: 'syn' },
    { id: 'hello', from: 'client', label: 'ACK + ClientHello', kind: 'crypto', after: 'synack' },
    { id: 'shello', from: 'server', label: 'ServerHello ... Finished', kind: 'crypto', after: 'hello' },
    { id: 'req', from: 'client', label: `Finished + ${REQUEST}`, kind: 'request', after: 'shello' },
    { id: 'resp', from: 'server', label: RESPONSE, kind: 'response', after: 'req', thinks: true },
  ],
  quic: [
    { id: 'initial', from: 'client', label: 'Initial: ClientHello', kind: 'crypto', after: null },
    { id: 'shello', from: 'server', label: 'Initial + Handshake: ServerHello ... Finished', kind: 'crypto', after: 'initial' },
    { id: 'req', from: 'client', label: `Handshake Finished + ${REQUEST}`, kind: 'request', after: 'shello' },
    { id: 'resp', from: 'server', label: RESPONSE, kind: 'response', after: 'req', thinks: true },
  ],
  'quic-0rtt': [
    { id: 'initial', from: 'client', label: 'Initial: ClientHello', kind: 'crypto', after: null },
    { id: 'req', from: 'client', label: `0-RTT: ${REQUEST}`, kind: 'request', after: null },
    { id: 'shello', from: 'server', label: 'Initial + Handshake: ServerHello ... Finished', kind: 'crypto', after: 'initial' },
    { id: 'resp', from: 'server', label: RESPONSE, kind: 'response', after: 'req', thinks: true },
  ],
};

export interface Timed extends Flight {
  sentAt: number;
  arrivesAt: number;
}

export interface Schedule {
  flights: Timed[];
  /** When the client's first request leaves. */
  requestAt: number;
  /** When the first byte of the response reaches the client. */
  firstByteAt: number;
}

/** Walk the flights: a flight leaves when the one it follows has arrived (plus the server's think time), and takes half a round trip. */
export function schedule(stack: Stack, rttMs: number, thinkMs: number): Schedule {
  const done = new Map<string, Timed>();
  for (const f of FLIGHTS[stack]) {
    const trigger = f.after === null ? null : done.get(f.after);
    if (f.after !== null && !trigger) throw new RangeError(`flight ${f.id} follows ${f.after}, which is listed after it`);
    const sentAt = (trigger?.arrivesAt ?? 0) + (f.thinks ? thinkMs : 0);
    done.set(f.id, { ...f, sentAt, arrivesAt: sentAt + rttMs / 2 });
  }
  const flights = [...done.values()];
  const req = done.get('req') as Timed;
  const resp = done.get('resp') as Timed;
  return { flights, requestAt: req.sentAt, firstByteAt: resp.arrivesAt };
}

/** Round trips the client waits before it can send the request, counted on a unit round trip with no think time. */
export const roundTripsBeforeRequest = (stack: Stack): number => schedule(stack, 1, 0).requestAt;
/** Round trips until the first byte of the response, with no think time. */
export const roundTripsToFirstByte = (stack: Stack): number => schedule(stack, 1, 0).firstByteAt;

/** The last moment of any stack's timeline (the slowest stack's first byte), the length of scene 1's clock. */
export const timelineEnd = (rttMs: number, thinkMs: number): number => Math.max(...STACKS.map((s) => schedule(s, rttMs, thinkMs).firstByteAt));
