import { describe, expect, it } from 'vitest';
import { mulberry32, pick, type Rnd } from '../../core/random';
import {
  addBigPod, BIG_CPU, changeImage, cpuUsed, DEFAULT_REPLICAS, drainNode, endpoints, EVICT_TICKS, killNode, killPod, maxSurge, maxUnavailable, NODE_CPU,
  NOT_READY_TICKS, ownedBy, relabelPod, restoreNode, runTicks, schedule, settledCluster, setReplicas, SLOTS, tick, unschedulableReason, type Cluster,
} from './model';

const activeOwned = (c: Cluster) => c.pods.filter((p) => p.owner !== null && p.phase !== 'Terminating');
const readyServing = (c: Cluster) => c.pods.filter((p) => p.labels.app === 'web' && p.phase === 'Running' && p.ready);

/** Facts that hold after every tick, whatever happened before. */
function expectInvariants(c: Cluster, traffic: { pod: number | null; ok: boolean }[]) {
  // The Service's endpoints are exactly the Ready pods that match its selector.
  expect(endpoints(c).map((p) => p.id).sort()).toEqual(readyServing(c).map((p) => p.id).sort());
  for (const t of traffic) if (t.pod !== null) expect(endpoints(c).some((p) => p.id === t.pod)).toBe(true);
  // The scheduler never overcommits a node, and no two pods share a slot.
  c.nodes.forEach((_, i) => {
    expect(cpuUsed(c, i)).toBeLessThanOrEqual(NODE_CPU);
    const slots = c.pods.filter((p) => p.node === i).map((p) => p.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots.every((s) => s !== null && s < SLOTS)).toBe(true);
  });
  // Pending is reported exactly when no node fits; a pod without a reason was only just created.
  for (const p of c.pods.filter((x) => x.node === null)) {
    if (p.pendingReason !== null) expect(c.nodes.some((_, i) => c.nodes[i].status !== 'NotReady' && !c.nodes[i].cordoned && NODE_CPU - cpuUsed(c, i) >= p.cpu)).toBe(false);
    else expect(p.age).toBe(0);
  }
}

describe('rolling update arithmetic', () => {
  it('maxSurge rounds up and maxUnavailable rounds down at 25%', () => {
    const table: [number, number, number][] = [[0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 1, 1], [5, 2, 1], [6, 2, 1], [7, 2, 1], [8, 2, 2]];
    for (const [replicas, surge, unavailable] of table) {
      expect(maxSurge(replicas)).toBe(surge);
      expect(maxUnavailable(replicas)).toBe(unavailable);
    }
  });

  it('never has more than replicas + maxSurge pods or fewer than replicas - maxUnavailable ready, and ends on the new image', () => {
    for (let r = 1; r <= 8; r++) {
      const c = settledCluster(r);
      expect(readyServing(c)).toHaveLength(r);
      const image = changeImage(c);
      let peak = 0;
      let lowest = r;
      for (let t = 0; t < 60; t++) {
        const report = tick(c);
        expectInvariants(c, report.traffic);
        peak = Math.max(peak, activeOwned(c).length);
        lowest = Math.min(lowest, readyServing(c).length);
        expect(activeOwned(c).length).toBeLessThanOrEqual(r + maxSurge(r));
        expect(readyServing(c).length).toBeGreaterThanOrEqual(r - maxUnavailable(r));
      }
      expect(activeOwned(c).every((p) => p.image === image)).toBe(true);
      expect(readyServing(c)).toHaveLength(r);
      expect(c.pods.filter((p) => p.phase === 'Terminating')).toEqual([]);
      // The rollout used the whole surge allowance, and the whole unavailability allowance.
      expect(peak).toBe(r + maxSurge(r));
      expect(lowest).toBe(r - maxUnavailable(r));
    }
  });

  it('replicas 3 (surge 1, unavailable 0): a new pod is Ready by the time the first old pod is deleted', () => {
    const c = settledCluster(3);
    changeImage(c);
    let firstDeletion = -1;
    let firstNewReady = -1;
    for (let t = 1; t <= 30; t++) {
      tick(c);
      if (firstNewReady < 0 && c.pods.some((p) => p.image === 'v2' && p.phase === 'Running' && p.ready)) firstNewReady = t;
      if (firstDeletion < 0 && c.pods.some((p) => p.image === 'v1' && p.phase === 'Terminating')) firstDeletion = t;
    }
    expect(firstNewReady).toBeGreaterThan(0);
    expect(firstDeletion).toBeGreaterThanOrEqual(firstNewReady);
  });

  it('keeps the old ReplicaSet at 0 for rollback and reuses it when the image goes back', () => {
    const c = settledCluster(3);
    changeImage(c);
    runTicks(c, 30);
    expect(c.sets.map((s) => [s.name, s.spec])).toEqual([['web-v1', 0], ['web-v2', 3]]);
    changeImage(c);
    runTicks(c, 40);
    expect(c.sets.map((s) => [s.name, s.spec])).toEqual([['web-v2', 0], ['web-v3', 3]]);
  });
});

describe('the control loop', () => {
  it('starts settled: three Ready pods spread over three nodes, all Service endpoints', () => {
    const c = settledCluster();
    expect(readyServing(c)).toHaveLength(DEFAULT_REPLICAS);
    expect(new Set(c.pods.map((p) => p.node)).size).toBe(3);
    expect(endpoints(c)).toHaveLength(3);
  });

  it('a pod created this tick is Pending, then bound, then created, then running, then Ready', () => {
    const c = settledCluster(3);
    setReplicas(c, 4);
    const seen: string[] = [];
    for (let t = 0; t < 6; t++) {
      tick(c);
      const p = c.pods.find((x) => x.id === c.nextPodId - 1)!;
      seen.push(p.phase === 'Running' ? (p.ready ? 'Ready' : 'Running') : p.phase);
    }
    expect(seen).toEqual(['Pending', 'ContainerCreating', 'Running', 'Ready', 'Ready', 'Ready']);
  });

  it('the report names what it saw, the gap and the action', () => {
    const c = settledCluster(3);
    setReplicas(c, 4);
    const r = tick(c);
    expect(r).toMatchObject({ observe: 'web-v1: 3 pods, want 4', diff: '1 missing', act: 'create 1 pod' });
    expect(tick(c)).toMatchObject({ diff: 'none', act: 'nothing to do' });
    setReplicas(c, 1);
    runTicks(c, 6);
    expect(readyServing(c)).toHaveLength(1);
  });

  it('killing a pod is not permanent: the ReplicaSet notices and recreates it', () => {
    const c = settledCluster(3);
    const victim = c.pods[0];
    killPod(c, victim.id);
    expect(readyServing(c)).toHaveLength(2);
    const r = tick(c);
    expect(r.diff).toBe('1 missing');
    runTicks(c, 8);
    expect(readyServing(c)).toHaveLength(3);
    expect(c.pods.some((p) => p.id === victim.id)).toBe(false);
  });

  it('scaling changes the Deployment, and the controllers create or delete the pods', () => {
    const c = settledCluster(3);
    for (const n of [0, 8, 5, 2, 8, 0, 3]) {
      setReplicas(c, n);
      runTicks(c, 12);
      expect(readyServing(c)).toHaveLength(n);
      expect(c.pods.filter((p) => p.phase === 'Terminating')).toEqual([]);
    }
    setReplicas(c, 99);
    expect(c.deployment.replicas).toBe(8);
    setReplicas(c, -4);
    expect(c.deployment.replicas).toBe(0);
  });

  it('relabelling pulls a pod out of the Service without killing it, and its ReplicaSet makes a replacement', () => {
    const c = settledCluster(3);
    const p = c.pods[0];
    relabelPod(c, p.id);
    expect(endpoints(c).some((e) => e.id === p.id)).toBe(false);
    expect(p.phase).toBe('Running');
    runTicks(c, 8);
    expect(c.pods.find((x) => x.id === p.id)).toMatchObject({ phase: 'Running', ready: true, owner: null });
    expect(endpoints(c)).toHaveLength(3);
    expect(endpoints(c).every((e) => e.id !== p.id)).toBe(true);
    expect(ownedBy(c, c.sets[0])).toHaveLength(3);
  });
});

describe('nodes', () => {
  it('a crashed node keeps its pods in the Service until the control plane notices, then they are replaced elsewhere', () => {
    const c = settledCluster(6);
    const doomed = c.pods.filter((p) => p.node === 1).map((p) => p.id);
    expect(doomed.length).toBe(2);
    killNode(c, 1);
    for (let t = 1; t <= NOT_READY_TICKS + EVICT_TICKS + 14; t++) {
      const r = tick(c);
      expectInvariants(c, r.traffic);
      const stillThere = doomed.filter((id) => c.pods.some((p) => p.id === id));
      if (t < NOT_READY_TICKS) {
        expect(c.nodes[1].status).toBe('Unreachable');
        expect(endpoints(c).filter((p) => p.node === 1)).toHaveLength(2);
      }
      if (t === NOT_READY_TICKS) {
        expect(c.nodes[1].status).toBe('NotReady');
        expect(endpoints(c).filter((p) => p.node === 1)).toHaveLength(0);
        expect(stillThere).toHaveLength(2);
      }
      if (t === NOT_READY_TICKS + EVICT_TICKS) expect(stillThere).toHaveLength(0);
    }
    expect(readyServing(c)).toHaveLength(6);
    expect(c.pods.every((p) => p.node !== 1)).toBe(true);
  });

  it('requests that the Service sends to an undetected dead node fail; after detection none do', () => {
    const c = settledCluster(3);
    killNode(c, 0);
    let failedBefore = 0;
    let failedAfter = 0;
    for (let t = 1; t <= NOT_READY_TICKS + EVICT_TICKS + 12; t++) {
      const r = tick(c);
      const bad = r.traffic.filter((x) => !x.ok).length;
      if (t < NOT_READY_TICKS) failedBefore += bad;
      else if (t > NOT_READY_TICKS + EVICT_TICKS + 8) failedAfter += bad;
    }
    expect(failedBefore).toBeGreaterThan(0);
    expect(failedAfter).toBe(0);
  });

  it('draining evicts its pods gracefully, nothing lands there while it is cordoned, and restore lets it be used again', () => {
    const c = settledCluster(6);
    drainNode(c, 1);
    runTicks(c, 12);
    expect(c.pods.filter((p) => p.node === 1)).toEqual([]);
    expect(readyServing(c)).toHaveLength(6);
    setReplicas(c, 8);
    runTicks(c, 12);
    expect(c.pods.filter((p) => p.node === 1)).toEqual([]);
    restoreNode(c, 1);
    setReplicas(c, 8);
    changeImage(c);
    runTicks(c, 40);
    expect(c.pods.some((p) => p.node === 1)).toBe(true);
  });
});

describe('scheduler', () => {
  it('spreads pods by most free CPU, lowest node first on a tie', () => {
    const c = settledCluster(3);
    expect(c.pods.map((p) => p.node).sort()).toEqual([0, 1, 2]);
    setReplicas(c, 4);
    runTicks(c, 4);
    expect(c.pods.filter((p) => p.node === 0)).toHaveLength(2);
  });

  it('a pod bigger than any node stays Pending with the real-looking reason', () => {
    const c = settledCluster(3);
    const big = addBigPod(c);
    expect(big.cpu).toBe(BIG_CPU);
    runTicks(c, 5);
    expect(big.phase).toBe('Pending');
    expect(big.node).toBeNull();
    expect(big.pendingReason).toBe('0/3 nodes are available: 3 Insufficient cpu.');
  });

  it('reasons count each kind of node', () => {
    const c = settledCluster(3);
    const big = addBigPod(c);
    drainNode(c, 0);
    killNode(c, 1);
    runTicks(c, NOT_READY_TICKS);
    expect(unschedulableReason(c, big)).toBe('0/3 nodes are available: 1 Insufficient cpu, 1 node(s) unschedulable, 1 node(s) not ready.');
  });

  it('with replicas that cannot all fit, exactly the extra ones are Pending: "insufficient cpu"', () => {
    const c = settledCluster(8);
    killNode(c, 0);
    killNode(c, 1);
    runTicks(c, NOT_READY_TICKS + EVICT_TICKS + 10);
    const pending = c.pods.filter((p) => p.node === null);
    expect(readyServing(c)).toHaveLength(SLOTS);
    expect(pending).toHaveLength(8 - SLOTS);
    expect(pending.every((p) => p.pendingReason?.includes('Insufficient cpu'))).toBe(true);
  });

  it('schedule() alone leaves no unscheduled pod that some node could take', () => {
    const c = settledCluster(8);
    c.pods.push(...Array.from({ length: 5 }, () => addBigPod(c)));
    schedule(c);
    for (const p of c.pods.filter((x) => x.node === null)) {
      expect(c.nodes.some((_, i) => NODE_CPU - cpuUsed(c, i) >= p.cpu)).toBe(false);
    }
  });
});

describe('random histories', () => {
  function randomAction(c: Cluster, rnd: Rnd, budget: { images: number; relabels: number }) {
    const choice = Math.floor(rnd() * 12);
    if (choice <= 1 && c.pods.length) killPod(c, pick(c.pods, rnd).id);
    else if (choice === 2) killNode(c, Math.floor(rnd() * 3));
    else if (choice === 3) drainNode(c, Math.floor(rnd() * 3));
    else if (choice === 4) restoreNode(c, Math.floor(rnd() * 3));
    else if (choice === 5 || choice === 6) setReplicas(c, Math.floor(rnd() * 9));
    else if (choice === 7 && budget.images > 0) {
      budget.images -= 1;
      changeImage(c);
    } else if (choice === 8 && budget.relabels > 0 && c.pods.some((p) => p.owner)) {
      budget.relabels -= 1;
      relabelPod(c, pick(c.pods.filter((p) => p.owner), rnd).id);
    } else if (choice === 9 && !c.pods.some((p) => p.cpu === BIG_CPU)) addBigPod(c);
  }

  it('after any history, once nodes are back the loop converges to the desired Ready pods within a bound', () => {
    let maxTicks = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = mulberry32(seed * 104729);
      const c = settledCluster(1 + Math.floor(rnd() * 8));
      const budget = { images: 2, relabels: 1 };
      for (let step = 0; step < 40; step++) {
        randomAction(c, rnd, budget);
        for (let k = 0; k < Math.floor(rnd() * 3); k++) {
          const r = tick(c);
          expectInvariants(c, r.traffic);
        }
      }
      for (let n = 0; n < c.nodes.length; n++) restoreNode(c, n);
      let ticks = 0;
      const settled = () =>
        activeOwned(c).length === c.deployment.replicas &&
        activeOwned(c).every((p) => p.image === c.deployment.image && p.phase === 'Running' && p.ready) &&
        c.pods.every((p) => p.phase !== 'Terminating') &&
        c.sets.every((s) => s.image === c.deployment.image || s.spec === 0);
      while (!settled() && ticks < 80) {
        expectInvariants(c, tick(c).traffic);
        ticks += 1;
      }
      expect(settled()).toBe(true);
      expect(endpoints(c).filter((p) => p.owner !== null)).toHaveLength(c.deployment.replicas);
      maxTicks = Math.max(maxTicks, ticks);
    }
    expect(maxTicks).toBeLessThanOrEqual(40);
  });

  it('is deterministic: the same actions give the same cluster', () => {
    const run = () => {
      const rnd = mulberry32(99);
      const c = settledCluster(4);
      const budget = { images: 2, relabels: 1 };
      for (let step = 0; step < 40; step++) {
        randomAction(c, rnd, budget);
        runTicks(c, 2);
      }
      return JSON.stringify(c);
    };
    expect(run()).toBe(run());
  });
});
