// The layer model behind the lesson: which layer adds which header, how big the
// headers are, and what changes hop by hop. Pure data and arithmetic, tested in
// model.test.ts. Header sizes are the real minimums (no IP or TCP options).

import type { Tone } from '../../core/tone';

export type LayerId = 'app' | 'transport' | 'internet' | 'link';

export interface Layer {
  id: LayerId;
  /** TCP/IP layer name. */
  name: string;
  /** The protocol this lesson's request uses at that layer. */
  protocol: string;
  /** What one unit is called at this layer. */
  unit: string;
  /** OSI layers (number and name) this TCP/IP layer covers, top first. */
  osi: { n: number; name: string }[];
  /** Header bytes this layer adds in front of what it carries. */
  header: number;
  /** Trailer bytes this layer adds after it (only Ethernet's FCS). */
  trailer: number;
  tone: Tone;
}

/** Top to bottom: the order a message goes down the sender's stack. */
export const LAYERS: Layer[] = [
  {
    id: 'app', name: 'Application', protocol: 'HTTP', unit: 'message', header: 0, trailer: 0, tone: 'info',
    osi: [{ n: 7, name: 'Application' }, { n: 6, name: 'Presentation' }, { n: 5, name: 'Session' }],
  },
  { id: 'transport', name: 'Transport', protocol: 'TCP', unit: 'segment', header: 20, trailer: 0, tone: 'violet', osi: [{ n: 4, name: 'Transport' }] },
  { id: 'internet', name: 'Internet', protocol: 'IPv4', unit: 'packet', header: 20, trailer: 0, tone: 'ok', osi: [{ n: 3, name: 'Network' }] },
  {
    id: 'link', name: 'Link', protocol: 'Ethernet', unit: 'frame', header: 14, trailer: 4, tone: 'orange',
    osi: [{ n: 2, name: 'Data link' }, { n: 1, name: 'Physical' }],
  },
];

export const layer = (id: LayerId) => LAYERS.find((l) => l.id === id)!;
export const layerIndex = (id: LayerId) => LAYERS.findIndex((l) => l.id === id);

/** The request the lesson sends: plain HTTP, so the stack stays four layers (HTTPS adds TLS). */
export const HTTP_REQUEST = 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n';
export const httpBytes = (text = HTTP_REQUEST) => new TextEncoder().encode(text).length;

export const MTU = 1500; // Ethernet's default maximum IP packet size
export const IP_HEADER = layer('internet').header;
export const TCP_HEADER = layer('transport').header;
export const ETH_HEADER = layer('link').header;
export const ETH_FCS = layer('link').trailer;
/** Largest TCP payload that fits one Ethernet frame without fragmenting. */
export const MSS = MTU - IP_HEADER - TCP_HEADER;
/** Ethernet frames carry at least this much; shorter IP packets are padded. */
export const ETH_MIN_PAYLOAD = 46;
/** Header bytes around every full segment: TCP + IP + Ethernet header + FCS. */
export const PER_FRAME_OVERHEAD = TCP_HEADER + IP_HEADER + ETH_HEADER + ETH_FCS;

/** Header + trailer bytes of the given layers. */
export const headerBytesFor = (ids: LayerId[]) => ids.reduce((sum, id) => sum + layer(id).header + layer(id).trailer, 0);

/** Padding Ethernet adds so a short IP packet still makes a 64-byte frame. */
export const ethernetPadding = (ipPacketBytes: number) => Math.max(0, ETH_MIN_PAYLOAD - ipPacketBytes);

export interface Sizes {
  message: number;
  segment: number;
  packet: number;
  /** Header + payload (+ padding) + FCS. Excludes the preamble and gap on the wire. */
  frame: number;
  padding: number;
}

/** Sizes of one message wrapped layer by layer (a message that fits one segment). */
export function encapsulate(messageBytes: number): Sizes {
  const segment = messageBytes + TCP_HEADER;
  const packet = segment + IP_HEADER;
  const padding = ethernetPadding(packet);
  return { message: messageBytes, segment, packet, padding, frame: ETH_HEADER + packet + padding + ETH_FCS };
}

export interface Overhead {
  segments: number;
  headerBytes: number;
  paddingBytes: number;
  wireBytes: number;
  /** Payload ÷ everything sent: how much of the traffic is your data. */
  efficiency: number;
}

/** Overhead of sending `messageBytes` as full-MSS TCP segments, one Ethernet frame each. */
export function overhead(messageBytes: number): Overhead {
  const segments = Math.max(1, Math.ceil(messageBytes / MSS));
  const last = messageBytes - (segments - 1) * MSS;
  const paddingBytes = ethernetPadding(last + TCP_HEADER + IP_HEADER);
  const headerBytes = segments * PER_FRAME_OVERHEAD;
  const wireBytes = messageBytes + headerBytes + paddingBytes;
  return { segments, headerBytes, paddingBytes, wireBytes, efficiency: messageBytes / wireBytes };
}

// ── The journey: laptop → two routers → server ────────────────────────────

export type DeviceKind = 'host' | 'router';
export interface Device {
  name: string;
  kind: DeviceKind;
  /** Layers this device opens: hosts use all four, routers stop at Internet. */
  layers: LayerId[];
}

export const DEVICES: Device[] = [
  { name: 'Laptop', kind: 'host', layers: ['app', 'transport', 'internet', 'link'] },
  { name: 'Router 1', kind: 'router', layers: ['internet', 'link'] },
  { name: 'Router 2', kind: 'router', layers: ['internet', 'link'] },
  { name: 'Server', kind: 'host', layers: ['app', 'transport', 'internet', 'link'] },
];

// Documentation addresses (RFC 5737), so nothing here is a real host.
export const SRC_IP = '198.51.100.7';
export const DST_IP = '203.0.113.10';
export const SRC_PORT = 51000;
export const DST_PORT = 80;
export const INITIAL_TTL = 64;

/** One Ethernet link between two neighbouring devices: whose MACs its frames carry. */
export interface EthernetLink {
  from: number;
  to: number;
  srcMac: string;
  dstMac: string;
}

export const LINKS: EthernetLink[] = [
  { from: 0, to: 1, srcMac: '3c:22:fb:10:4a:01', dstMac: '00:1b:21:aa:00:01' },
  { from: 1, to: 2, srcMac: '00:1b:21:aa:00:02', dstMac: '00:50:56:bb:00:01' },
  { from: 2, to: 3, srcMac: '00:50:56:bb:00:02', dstMac: 'f0:18:98:5e:7c:9d' },
];

/** Every router a packet crosses takes one off its TTL. */
export const ttlAfterHops = (routers: number) => INITIAL_TTL - routers;

// ── "Which layer is broken?" ──────────────────────────────────────────────

export interface Symptom {
  id: string;
  text: string;
  answer: LayerId;
  why: string;
}

/** Reviewed answer key, placed in the TCP/IP model (OSI notes in `why`). */
export const SYMPTOMS: Symptom[] = [
  {
    id: 'dns', text: 'DNS lookup fails: "server not found"', answer: 'app',
    why: 'DNS is an application-layer protocol: it turns a name into an IP before any connection is made.',
  },
  {
    id: 'refused', text: 'Connection refused on port 80', answer: 'transport',
    why: 'The machine answered, but nothing is listening on that port, so TCP resets the connection.',
  },
  {
    id: '404', text: 'The page loads but says 404 Not Found', answer: 'app',
    why: 'Every layer below worked: the server got the request and replied. HTTP says the path doesn\'t exist.',
  },
  {
    id: 'cable', text: 'Cable unplugged: no link light', answer: 'link',
    why: 'Nothing leaves the network card. In OSI terms this is layer 1, Physical, part of TCP/IP\'s Link layer.',
  },
  {
    id: 'tls', text: 'Browser warns: certificate not valid', answer: 'app',
    why: 'TLS sits above TCP. TCP/IP counts it as application; OSI would call it presentation (6).',
  },
  {
    id: 'route', text: 'Ping says "destination host unreachable"', answer: 'internet',
    why: 'The last router reached the destination\'s network but got no ARP reply from the host (it\'s down or not there). "Network unreachable" is the no-route case. Either way IP can\'t deliver the packet: an Internet-layer problem.',
  },
];

/** How many symptoms have been placed on the right layer. */
export function score(placed: Partial<Record<string, LayerId>>): number {
  return SYMPTOMS.filter((s) => placed[s.id] === s.answer).length;
}
