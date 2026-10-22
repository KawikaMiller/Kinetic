import { useMemo, useState } from 'react';
import { TracePlayer } from '../components/TracePlayer';
import { Button, Segmented } from '../components/ui';
import { createCluster, forSeeds, type Safety } from '../core/distSim';
import { explore } from '../core/explore';
import { lockProtocol, twoHolders, type LockMsg, type LockState } from '../core/fixtures/lockProtocol';
import { atMostOneChosen, paxosProtocol, SPIKE_CONFIG, type PaxosConfig } from '../core/fixtures/paxosProtocol';
import { asDistNodes, networkExplorer } from '../core/pureProtocol';
import { explorePathSteps, traceRowSteps } from '../core/traceFrames';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 4 kit, agent D (#/dev/kit): core/explore, core/pureProtocol, TracePlayer, distSim v2. */

type Variant = 'broken' | 'fixed';
const VARIANTS = [{ value: 'broken' as Variant, label: 'Broken lock server' }, { value: 'fixed' as Variant, label: 'Fixed lock server' }];
const SEED_COUNT = 200;

const PAXOS_BUGS = [
  { value: 'safe', label: 'Paxos as written' },
  { value: 'accept', label: 'Accepts below its promise' },
  { value: 'ignore', label: 'Ignores promised values' },
] as const;
type PaxosBug = (typeof PAXOS_BUGS)[number]['value'];

const lockText = (s: LockState) => `${s.holder ?? '-'} ${s.held ? 'HELD' : ''}`.trim();

/** Both legs over one protocol: the exhaustive explorer, then seeded distSim schedules. */
function lockVerdict(variant: Variant) {
  const protocol = lockProtocol(variant === 'broken');
  const net = networkExplorer(protocol);
  const found = explore({ ...net, invariant: (s) => twoHolders(net.nodeStates(s)) });
  const safety: Safety<LockState>[] = [(snap) => twoHolders(Object.fromEntries(Object.entries(snap.nodes).map(([id, n]) => [id, n.state!])))];
  const seeded = forSeeds(SEED_COUNT, (seed) => createCluster<LockMsg, LockState>({ seed, nodes: asDistNodes(protocol), loss: 0.1, duplicate: 0.15 }), safety);
  return { net, found, seeded };
}

function LockDemo() {
  const [variant, setVariant] = useState<Variant>('broken');
  const { net, found, seeded } = useMemo(() => lockVerdict(variant), [variant]);
  const steps = found.violation ? explorePathSteps(found.violation.path) : [];
  return (
    <>
      <div className="controls">
        <Segmented ariaLabel="Lock server" options={VARIANTS} value={variant} onChange={setVariant} />
      </div>
      <p className="mono">
        explore: {found.violation ? `${found.violation.message} after ${found.violation.path.length} steps` : `holds in all ${found.states} states`} ({found.truncated ? 'truncated' : 'exhaustive'}) ·
        {' '}forSeeds: {seeded.ok ? `holds on ${seeded.seeds} seeds` : `fails on seed ${seeded.seed} at event ${seeded.step}`}
      </p>
      {found.violation && (
        // The explorer path is rebuilt on every render on purpose: TracePlayer memoises by value.
        <TracePlayer
          initial={net.init}
          steps={steps}
          renderState={(s) => <p className="mono">{['server', 'c1', 'c2'].map((id) => `${id}: ${lockText(net.nodeState(s, id))}`).join(' · ')} · on the wire: {s.net.length}</p>}
          stateKey={(s) => s.nodeKeys.join('|') + s.net.length}
          label="Shortest schedule that gives the lock to two clients"
        />
      )}
    </>
  );
}

/** The spike scenario, searched exhaustively when the button is pressed, with the shortest counterexample shown for the planted bugs. */
function PaxosDemo() {
  const [bug, setBug] = useState<PaxosBug>('safe');
  const [searched, setSearched] = useState(false);
  const config: PaxosConfig = { ...SPIKE_CONFIG, acceptBelowPromise: bug === 'accept', ignorePromised: bug === 'ignore' };
  const net = networkExplorer(paxosProtocol(config));
  const safe = atMostOneChosen(config);
  const result = searched ? explore({ ...net, invariant: (s) => safe(net.nodeStates(s)) }) : null;
  return (
    <>
      <div className="controls">
        <Segmented ariaLabel="Paxos variant" options={[...PAXOS_BUGS]} value={bug} onChange={(b) => { setBug(b); setSearched(false); }} />
        <Button variant="primary" onClick={() => setSearched(true)}>Search every schedule</Button>
      </div>
      {result && (
        <p className="mono">
          {result.violation ? `${result.violation.message}: shortest path ${result.violation.path.length} steps` : result.truncated ? `no violation in the first ${result.states} states, not exhaustive` : `holds in all ${result.states} reachable states (3 acceptors, 2 proposers, ballots 1 and 2; messages may be lost, duplicated or reordered)`}
        </p>
      )}
      {result?.violation && (
        <TracePlayer
          initial={net.init}
          steps={explorePathSteps(result.violation.path)}
          renderState={(s) => <p className="mono">{['a1', 'a2', 'a3'].map((id) => { const a = net.nodeState(s, id); return a.kind === 'acceptor' ? `${id}: promised ${a.promised}, votes ${a.votes.map(([b, v]) => `${v}@${b}`).join(' ') || 'none'}` : id; }).join(' · ')}</p>}
          stateKey={(s) => s.nodeKeys.join('|')}
          label="Shortest schedule that chooses two values"
        />
      )}
    </>
  );
}

function SeededTraceDemo() {
  const verdict = useMemo(() => lockVerdict('broken').seeded, []);
  if (verdict.ok) return null;
  return (
    <TracePlayer
      initial={null}
      steps={traceRowSteps(verdict.trace)}
      renderState={(row) => <p className="mono">{row ? `row ${row.id}, ${row.kind}` : 'before the first event'}</p>}
      stateKey={(row) => (row ? String(row.id) : '')}
      label={`distSim trace of seed ${verdict.seed}, cut at the violation`}
    />
  );
}

export function DevKitTier4b() {
  return (
    <>
      <Section title="core/explore + core/pureProtocol · one protocol, explored exhaustively and run on seeded schedules; TracePlayer steps the shortest path">
        <LockDemo />
      </Section>
      <Section title="Paxos over the non-consuming set network (K4-2 spike scenario) · exhaustive search and its planted-bug counterexamples">
        <PaxosDemo />
      </Section>
      <Section title="TracePlayer over a distSim violation trace (lowest failing seed of the broken lock server)">
        <SeededTraceDemo />
      </Section>
    </>
  );
}
