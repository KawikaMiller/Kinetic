import { DEFAULT_SOCKETS, LINK_GBPS, LOCAL_NS, NODE_GBPS, REMOTE_NS, THREAD_GBPS, bandwidth, defaultMachine, gbps, latency, nsText, place, type Machine, type Node } from './numa';

const withHomes = (homes: Node[]): Machine => ({ sockets: [...DEFAULT_SOCKETS], homes });
const mean = (homes: Node[], pattern: 'own' | 'all' | 'hot' = 'own') => latency(withHomes(homes), pattern).mean;
const movedToNode0 = (pages: number[]) => defaultMachine().homes.map((h, p) => (pages.includes(p) ? (0 as Node) : h));

/** Every number the lesson text quotes, computed from the model at import time. */
export const FACTS = {
  local: nsText(LOCAL_NS),
  remote: nsText(REMOTE_NS),
  default: nsText(latency(defaultMachine(), 'own').mean),
  t2Moved: nsText(mean(movedToNode0([4, 5]))),
  t2t3Moved: nsText(mean(movedToNode0([4, 5, 6, 7]))),
  serial: nsText(mean(place('first-touch', 'serial', DEFAULT_SOCKETS))),
  serialRemote: latency(withHomes(place('first-touch', 'serial', DEFAULT_SOCKETS)), 'own').remoteShare * 100,
  parallel: nsText(mean(place('first-touch', 'parallel', DEFAULT_SOCKETS))),
  everyone: nsText(mean(defaultMachine().homes, 'all')),
  boundTotal: gbps(bandwidth(withHomes(place('bind0', 'serial', DEFAULT_SOCKETS))).total),
  interleavedTotal: gbps(bandwidth(withHomes(place('interleave', 'serial', DEFAULT_SOCKETS))).total),
  demand: gbps(4 * THREAD_GBPS),
  node: gbps(NODE_GBPS),
  link: gbps(LINK_GBPS),
};
