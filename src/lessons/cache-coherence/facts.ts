/** The numbers the try-this entries and the quiz quote, computed from each scene's opening state by the models the scenes draw. */
import { COUNTEREXAMPLE } from './counterexample';
import { press, mesiOpening, withProtocol } from './session';
import { runSharing, sharingOpening, type SharingConfig } from './sharing';

/** Try-this 1 as written: from a fresh machine, read on core 0, write on core 0, read on core 1. */
export function mesiFacts() {
  let s = mesiOpening();
  const after: { states: string; bus: number; memory: number; latest: number }[] = [];
  for (const op of [{ core: 0, access: 'read' }, { core: 0, access: 'write' }, { core: 1, access: 'read' }] as const) {
    s = press(s, op);
    after.push({ states: s.machine.caches.map((c) => c.state).join(''), bus: s.machine.busCount, memory: s.machine.memory, latest: s.machine.latest });
  }
  return after;
}

/** Try-this 2 as written: invalidation off, read on core 0, write on core 1, read on core 0; then the same with invalidation on. */
export function brokenFacts() {
  const run = (protocol: 'mesi' | 'no-invalidate') => {
    let s = withProtocol(protocol);
    for (const op of [{ core: 0, access: 'read' }, { core: 1, access: 'write' }, { core: 0, access: 'read' }] as const) s = press(s, op);
    return { read: s.last!.readValue, latest: s.machine.latest, stale: s.last!.stale, core0: s.machine.caches[0].state };
  };
  return { broken: run('no-invalidate'), correct: run('mesi'), shortest: COUNTEREXAMPLE.length };
}

const at = (patch: Partial<SharingConfig>) => runSharing({ ...sharingOpening(), ...patch });

export function sharingFacts() {
  const open = sharingOpening();
  const adjacent = at({});
  const padded = at({ layout: 'padded' });
  const atomic = at({ layout: 'atomic' });
  const merged = at({ layout: 'merged' });
  const apart = at({ offsetB: 64 });
  const apartWide = at({ offsetB: 64, lineBytes: 128 });
  const burst8 = at({ burst: 8 });
  return {
    writes: open.writes,
    adjacent: { transfers: adjacent.transfers, cost: adjacent.cost, hits: adjacent.hits },
    padded: { transfers: padded.transfers, cost: padded.cost },
    atomic: { transfers: atomic.transfers, cost: atomic.cost },
    merged: { transfers: merged.transfers, reads: merged.readTransfers, cost: merged.cost },
    apart: { transfers: apart.transfers },
    apartWide: { transfers: apartWide.transfers },
    burst8: { transfers: burst8.transfers, cost: burst8.cost },
  };
}
