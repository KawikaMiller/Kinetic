// Captions for model.ts's timeline: one frame per leg, plus the opening and the summary.
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { SERVER_IP, timeline, type LegId, type Opts, type WrStep } from './model';

export interface WrFrame extends WrStep, Frame {}

const CAPTION: Record<LegId, (o: Opts) => ReactNode> = {
  askOsCached: () => <>Browser asks the OS: <span className="hl violet">where is example.com?</span></>,
  osHit: () => <>Cache hit. The OS already knows the IP. <b>Zero network trips.</b></>,
  askOs: () => <>Browser cache miss. Ask the OS: <span className="hl violet">where is example.com?</span></>,
  askResolver: () => <>OS doesn't know either. It asks the <b>recursive resolver</b> to do the legwork.</>,
  askRoot: () => <>The resolver starts at the top of the tree: a <b>root</b> server.</>,
  rootSays: () => <>Root: “No idea, but here are the <span className="hl violet">.com</span> servers.”</>,
  askTld: () => <>Ask the <b>.com TLD</b> server.</>,
  tldSays: () => <>TLD: “example.com's own nameserver is <span className="hl violet">ns1.example.com</span>.”</>,
  askAuth: () => <>Ask the <b>authoritative</b> nameserver: the source of truth.</>,
  authSays: () => <>Answer: <span className="hl violet">{SERVER_IP}</span>.</>,
  resolverSays: () => <>Resolver caches it (so the next person is fast) and passes it back…</>,
  osSays: () => <>…to the browser. <b>Now</b> we know where to go.</>,
  reuse: () => (
    <>
      There's already an open, encrypted connection to example.com in the browser's pool.{' '}
      <span className="hl ok">No DNS lookup, no TCP, no TLS.</span>
    </>
  ),
  syn: () => <>TCP handshake. <span className="hl info">SYN</span>: “Can we talk?”</>,
  synAck: () => <><span className="hl info">SYN-ACK</span>: “Yes. Can you hear me?”</>,
  ack: () => <><span className="hl info">ACK</span>: “Loud and clear.” Connection open. It rides with the next packet, so it's ~free.</>,
  clientHello: (o) => <>TLS. <span className="hl">ClientHello</span>: ciphers I support{o.tls13 ? ' + my half of the key' : ''}.</>,
  serverHello13: () => <>Server picks a cipher and sends its <b>certificate</b> + its key half.</>,
  finished13: () => <>Cert checks out; both sides derive the same secret. <span className="hl">Encrypted.</span> TLS 1.3 took 1 round trip.</>,
  serverHello12: () => <>Server picks a cipher and sends its <b>certificate</b>.</>,
  keyExchange: () => <>Browser sends its key exchange. TLS 1.2 needs an <b>extra</b> trip for this.</>,
  finished12: () => <>Server Finished. <span className="hl">Encrypted.</span> TLS 1.2 took 2 round trips.</>,
  get: () => <>Finally, the actual request: <span className="hl ok">GET /</span></>,
  work: () => <>Server does its work: routing, database queries, templates…</>,
  ok: () => <><span className="hl ok">200 OK</span>, and the HTML streams back.</>,
  render: () => <>Browser parses HTML, fetches CSS & JS, lays out and <b>paints</b>.</>,
};

export function buildFrames(opts: Opts): { frames: WrFrame[]; total: number } {
  const { steps, total, setup } = timeline(opts);
  const frames: WrFrame[] = steps.map((s) =>
    s.leg
      ? { ...s, say: CAPTION[s.leg.id](opts), hold: s.leg.from === s.leg.to ? 1.2 : 1 }
      : { ...s, say: <>You type <span className="hl">example.com</span> and hit Enter. The browser has no idea where that is yet.</> },
  );
  const end = steps.at(-1)!;
  frames.push({
    ...end,
    leg: null,
    hold: 2,
    say: (
      <>
        Page up in <span className="hl ok">{end.ms} ms</span> (illustrative timings) over <b>{end.rtts}</b> round trips.{' '}
        {setup > 0 ? (
          <>
            <span className="hl bad">{setup} ms</span> of that was setup before we even asked for the page.
          </>
        ) : (
          <>Zero setup cost. That's what caching and connection reuse buy you.</>
        )}
      </>
    ),
  });
  return { frames, total };
}
