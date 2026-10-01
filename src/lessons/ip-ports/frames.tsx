// Captions for model.ts's simulation steps.
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { DEVICES, ep, simulate, type IpStep, type Trip } from './model';

export type IpFrame = IpStep & Frame;

export function buildFrames(trips: Trip[]): IpFrame[] {
  return simulate(trips).map((s) => ({ ...s, say: caption(s) }));
}

function caption(s: IpStep): ReactNode {
  if (!s.trip) {
    return (
      <>
        Every machine has an <b>IP address</b> (which machine) and every program talking on the network has a{' '}
        <b>port</b> (which program). Press play, or send your own packet below.
      </>
    );
  }
  const { port } = s.trip;
  const d = DEVICES[s.trip.dev];
  const dev = d.name.toLowerCase();
  switch (s.beat) {
    case 'loopSend':
      return (
        <>
          <span className="hl violet">127.0.0.1</span> (<b>localhost</b>) means <i>this machine</i>. The packet loops back
          inside the {dev} and never touches the network or the router.
        </>
      );
    case 'loopDelivered':
      return <>Delivered to the <span className="hl ok">{s.svc}</span> listening on :{port}. Same idea as a server, just local.</>;
    case 'loopRefused':
      return <>Nothing on the {dev} is listening on :{port} → <span className="hl bad">connection refused</span>.</>;
    case 'send':
      return (
        <>
          The {dev} sends to <span className="hl info">{ep(s.dst!)}</span>. Its own address,{' '}
          <span className="hl">{d.ip}</span>, is <b>private</b>: it only means something inside this home.
        </>
      );
    case 'natOut':
      return s.sharedPort ? (
        <>
          Both devices picked source port <b>{s.priv!.port}</b>! The router gives each a <span className="hl">different public port</span>{' '}
          ({s.pub!.port}), which is how it tells the replies apart.
        </>
      ) : (
        <>
          <b>NAT</b>: the router swaps the private source for its one public IP{' '}
          <span className="hl">{ep(s.pub!)}</span> and writes the mapping in its table.
        </>
      );
    case 'internet':
      return <>Across the internet, routers only read the <b>destination IP</b> to decide where to forward it.</>;
    case 'deliver':
      return port === 5432 ? (
        <>Port 5432 → <span className="hl ok">postgres</span>. (In real life you'd firewall a database off from the internet!)</>
      ) : (
        <>
          The server's OS reads the <b>port</b>: :{port} → <span className="hl ok">{s.svc}</span>. The IP found the machine;
          the port found the program.
        </>
      );
    case 'refused':
      return (
        <>
          Nothing is listening on :{port}. The server's OS answers with a reset (<span className="hl bad">RST</span>):{' '}
          connection refused.
        </>
      );
    case 'replyOut':
      return <>The {s.svc ? 'reply' : 'reset'} is addressed to the router's public address <span className="hl">{ep(s.pub!)}</span>.</>;
    case 'natIn':
      return (
        <>
          Router looks up port <b>{s.pub!.port}</b> in its NAT table → it belongs to the {dev} at{' '}
          <span className="hl">{ep(s.priv!)}</span>. Rewrite and forward.
        </>
      );
    case 'home':
      return s.svc ? (
        <>Home again. Two numbers did all the work: <b>IP</b> → which machine, <b>port</b> → which program.</>
      ) : (
        <>The {dev} gets <span className="hl bad">connection refused</span>: right machine, but no program on that port.</>
      );
    default:
      return null;
  }
}
