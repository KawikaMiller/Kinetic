// Frame builder for "Follow a request": the GET goes down the laptop's stack,
// across two routers (which only open Ethernet and IP), and up the server's stack.
import type { Frame } from '../../core/types';
import {
  DEVICES, DST_IP, DST_PORT, encapsulate, httpBytes, INITIAL_TTL, LINKS, SRC_PORT, TCP_HEADER, IP_HEADER, ETH_HEADER, ETH_FCS,
  type LayerId,
} from './model';

export type Action = 'wrap' | 'unwrap' | 'read' | 'travel';

export interface JourneyFrame extends Frame {
  /** Device the data is at (for travel: the device it's leaving). */
  device: number;
  /** Envelope layers currently wrapped around the message, innermost first. */
  layers: LayerId[];
  /** Layer being added, removed or read right now. */
  active: LayerId | null;
  action: Action;
  ttl: number;
  /** Which link's MAC pair the Ethernet header carries (null while there's no Ethernet header). */
  link: number | null;
  /** Link the frame is travelling across. */
  travel: number | null;
  /** Fields a router just rewrote (flash --hi). */
  changed: ('ttl' | 'mac')[];
}

const ALL: LayerId[] = ['app', 'transport', 'internet', 'link'];
const upTo = (n: number) => ALL.slice(0, n);

export function buildFrames(): JourneyFrame[] {
  const msg = httpBytes();
  const s = encapsulate(msg);
  const frames: JourneyFrame[] = [];
  let ttl = INITIAL_TTL;
  const push = (f: Omit<JourneyFrame, 'ttl'>) => frames.push({ ...f, ttl });

  // Down the laptop's stack.
  push({
    device: 0, layers: upTo(1), active: 'app', action: 'wrap', link: null, travel: null, changed: [],
    say: <>The browser writes an <b>HTTP</b> request: <span className="hl info">{msg} bytes</span> of plain text. That's the whole message; everything below just delivers it.</>,
  });
  push({
    device: 0, layers: upTo(2), active: 'transport', action: 'wrap', link: null, travel: null, changed: [],
    say: <><b>TCP</b> puts a {TCP_HEADER}-byte header in front: source port {SRC_PORT}, destination port {DST_PORT}, a sequence number. Now it's a <span className="hl violet">segment</span> ({s.segment} B).</>,
  });
  push({
    device: 0, layers: upTo(3), active: 'internet', action: 'wrap', link: null, travel: null, changed: [],
    say: <><b>IP</b> adds {IP_HEADER} bytes: from our address to <span className="hl ok">{DST_IP}</span>, TTL {INITIAL_TTL}. Now it's a <b>packet</b> ({s.packet} B), addressed end to end.</>,
  });
  push({
    device: 0, layers: upTo(4), active: 'link', action: 'wrap', link: 0, travel: null, changed: [],
    say: <><b>Ethernet</b> adds {ETH_HEADER} bytes in front and a {ETH_FCS}-byte checksum behind. Its destination MAC is <b>Router 1</b>, not the server: a frame only crosses one link. <span className="hl">{s.frame} B</span> in total.</>,
  });

  // Across each link, then through each router.
  LINKS.forEach((l, i) => {
    push({
      device: l.from, layers: upTo(4), active: null, action: 'travel', link: i, travel: i, changed: [], hold: 1.4,
      say: i === 0
        ? <>The physical layer turns the frame into signals on the wire. Only the device at the other end of <b>this</b> link receives it.</>
        : <>Off to {DEVICES[l.to].name} on link {i + 1}: same packet inside, new Ethernet frame around it.</>,
    });
    const at = l.to;
    const dev = DEVICES[at];
    if (dev.kind === 'router') {
      push({
        device: at, layers: upTo(3), active: 'link', action: 'unwrap', link: null, travel: null, changed: [],
        say: <>{dev.name} checks the frame is for its MAC and the checksum is right, then throws the whole <b>Ethernet</b> frame away.</>,
      });
      ttl -= 1;
      push({
        device: at, layers: upTo(3), active: 'internet', action: 'read', link: null, travel: null, changed: ['ttl'],
        say: at === 1
          ? <>It reads the <b>IP</b> header only: {DST_IP} → next hop {DEVICES[at + 1].name}. <span className="hl">TTL {ttl + 1} → {ttl}</span>. The TCP segment and the HTTP inside stay sealed. (A home router doing NAT also rewrites IP addresses: the exception.)</>
          : <>Same again: read the IP destination, pick the next hop, <span className="hl">TTL {ttl + 1} → {ttl}</span>. A router never looks at your HTTP.</>,
      });
      push({
        device: at, layers: upTo(4), active: 'link', action: 'wrap', link: i + 1, travel: null, changed: ['mac'],
        say: <>A brand-new Ethernet header with <span className="hl">new source and destination MACs</span> for the next link. MACs are local to one link; the IP addresses stay the same end to end.</>,
      });
    }
  });

  // Up the server's stack.
  push({
    device: 3, layers: upTo(3), active: 'link', action: 'unwrap', link: null, travel: null, changed: [],
    say: <>The server's network card sees its own MAC, checks the checksum and strips the <b>Ethernet</b> frame.</>,
  });
  push({
    device: 3, layers: upTo(2), active: 'internet', action: 'unwrap', link: null, travel: null, changed: [],
    say: <><b>IP</b>: the destination is this machine's address and the protocol field says TCP, so the segment goes up to TCP.</>,
  });
  push({
    device: 3, layers: upTo(1), active: 'transport', action: 'unwrap', link: null, travel: null, changed: [],
    say: <><b>TCP</b>: destination port {DST_PORT} belongs to the web server process, so the bytes go to it (and TCP acknowledges them, not shown).</>,
  });
  push({
    device: 3, layers: upTo(1), active: 'app', action: 'read', link: null, travel: null, changed: [], hold: 2,
    say: <>The web server reads the same {msg} bytes the browser wrote. {s.frame - msg} bytes of headers carried them 3 links; only the Ethernet header and the TTL (plus the IP checksum that covers it) changed on the way.</>,
  });
  return frames;
}
