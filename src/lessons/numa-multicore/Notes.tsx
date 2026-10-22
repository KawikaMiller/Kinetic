import { Legend } from '../../components/ui';

/** The colour key of every scene. */
export function NumaLegend() {
  return (
  <Legend
    items={[
      { color: 'var(--sky)', label: 'node 0 and its pages' },
      { color: 'var(--amber)', label: 'node 1 and its pages' },
      { color: 'var(--ok)', label: 'a thread whose accesses are all local' },
      { color: 'var(--bad)', label: 'a remote access, a saturated bar' },
    ]}
  />
  );
}

/** What the model leaves out, printed on every scene. */
export function ModelNotes() {
  return (
    <p className="numa-note">
      What the model leaves out: coherence traffic between sockets (more expensive than inside one socket; from memory), caches, queueing delay on a loaded link beyond the proportional
      share, chiplet processors that expose several nodes per socket (named, from memory) and automatic page migration (named). Nothing here is simulated or measured: each number is a formula
      over named constants.
    </p>
  );
}
