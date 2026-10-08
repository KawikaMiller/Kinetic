import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import lesson from './index';
import { addBigPod, changeImage, killNode, killPod, maxSurge, maxUnavailable, NOT_READY_TICKS, relabelPod, runTicks, settledCluster, tick } from './model';
import { rolloutNote, tickCaption } from './narrate';
import { advance, createWorld, crash, killSelected, overRequest, relabelSelected, rollOut, scaleTo, selectPod, stepOnce, TICK_SECONDS } from './sim';
import { liveSets, nodeLabel, podAt, podCell, podState, rings, unscheduled } from './view';

describe('podCell: what each pod state looks like', () => {
  it('maps every state to its tone and fill, and a down node turns its pods red', () => {
    const c = settledCluster(3);
    const p = c.pods[0];
    const at = () => podCell(c, p.node!, p.slot!);
    expect(podState(p)).toBe('Ready');
    expect(at()).toMatchObject({ tone: 'ok', fill: 'solid', text: 'v1' });
    p.ready = false;
    expect(at()).toMatchObject({ tone: 'hi', fill: 'outline' });
    p.phase = 'ContainerCreating';
    expect(at()).toMatchObject({ tone: 'hi', fill: 'tint' });
    p.phase = 'Terminating';
    expect(at()).toMatchObject({ tone: 'dim', fill: 'tint' });
    p.phase = 'Running';
    p.ready = true;
    killNode(c, p.node!);
    expect(at()).toMatchObject({ tone: 'bad', fill: 'tint' });
  });

  it('free slots are dashed outlines, and on a down node they are empty', () => {
    const c = settledCluster(3);
    expect(podCell(c, 0, 3)).toMatchObject({ tone: 'dim', fill: 'outline' });
    killNode(c, 0);
    expect(podCell(c, 0, 3)).toEqual({ fill: 'none' });
  });

  it('labels the node by its state', () => {
    const c = settledCluster(3);
    expect(nodeLabel(c, 1)).toBe('node-2');
    killNode(c, 1);
    expect(nodeLabel(c, 1)).toBe('node-2 silent');
    runTicks(c, NOT_READY_TICKS);
    expect(nodeLabel(c, 1)).toBe('node-2 NotReady');
  });
});

describe('rings', () => {
  it('selection beats the rollout colours, and the Service-excluded pods are dim', () => {
    const c = settledCluster(3);
    expect(rings(c, null)).toEqual([]);
    changeImage(c);
    runTicks(c, 2);
    const r = rings(c, null);
    expect(liveSets(c)).toHaveLength(2);
    expect(r.filter((x) => x.tone === 'violet').length).toBe(c.pods.filter((p) => p.owner === 'web-v1' && p.slot !== null).length);
    expect(r.filter((x) => x.tone === 'sky').length).toBe(c.pods.filter((p) => p.owner === 'web-v2' && p.slot !== null).length);
    const target = c.pods.find((p) => p.owner === 'web-v1')!;
    expect(rings(c, target.id).find((x) => x.r === target.slot && x.c === target.node)!.tone).toBe('amber');
    const back = settledCluster(3);
    const p = back.pods[1];
    relabelPod(back, p.id);
    expect(rings(back, null)).toEqual([{ r: p.slot, c: p.node, tone: 'dim' }]);
  });

  it('unscheduled pods are listed apart from the grid', () => {
    const c = settledCluster(3);
    addBigPod(c);
    expect(unscheduled(c)).toHaveLength(1);
    expect(podAt(c, 0, 0)?.node).toBe(0);
  });
});

describe('the try-this prompts, from the default state', () => {
  it('delete a Ready pod: the loop sees two, wants three, creates one, and recovers', () => {
    const w = createWorld();
    const pod = w.cluster.pods[0];
    selectPod(w, pod.id);
    expect(killSelected(w)).toBe(`You deleted pod ${pod.name}.`);
    const r = stepOnce(w);
    expect(r).toMatchObject({ observe: 'web-v1: 2 pods, want 3', diff: '1 missing', act: 'create 1 pod' });
    for (let i = 0; i < 8; i++) stepOnce(w);
    expect(w.cluster.pods.filter((p) => p.ready)).toHaveLength(3);
  });

  it('five replicas: a new pod goes Pending, ContainerCreating, Running, Ready', () => {
    const w = createWorld();
    scaleTo(w, 5);
    const states: string[] = [];
    for (let i = 0; i < 4; i++) {
      stepOnce(w);
      states.push(podState(w.cluster.pods.at(-1)!));
    }
    expect(states).toEqual(['Pending', 'ContainerCreating', 'Running', 'Ready']);
  });

  it('change image: never more than one extra pod, never fewer than 3 Ready', () => {
    const w = createWorld();
    rollOut(w);
    for (let i = 0; i < 25; i++) {
      stepOnce(w);
      const active = w.cluster.pods.filter((p) => p.owner && p.phase !== 'Terminating').length;
      expect(active).toBeLessThanOrEqual(3 + maxSurge(3));
      expect(w.cluster.pods.filter((p) => p.ready && p.phase === 'Running').length).toBeGreaterThanOrEqual(3 - maxUnavailable(3));
    }
  });

  it('crash node-2: requests to its pod fail until the node is marked NotReady', () => {
    const w = createWorld();
    crash(w);
    let failed = 0;
    for (let i = 1; i <= 8; i++) {
      const r = stepOnce(w);
      if (i < NOT_READY_TICKS) failed += r.traffic.filter((t) => !t.ok).length;
      if (i === NOT_READY_TICKS) expect(w.cluster.nodes[1].status).toBe('NotReady');
    }
    expect(failed).toBeGreaterThan(0);
    for (let i = 0; i < 14; i++) stepOnce(w);
    expect(w.cluster.pods.filter((p) => p.ready && p.phase === 'Running')).toHaveLength(3);
  });

  it("over-request CPU: a Pending pod with the scheduler's reason", () => {
    const w = createWorld();
    overRequest(w);
    stepOnce(w);
    stepOnce(w);
    expect(unscheduled(w.cluster)[0].pendingReason).toBe('0/3 nodes are available: 3 Insufficient cpu.');
  });

  it('relabel: the pod keeps running outside the Service', () => {
    const w = createWorld();
    selectPod(w, w.cluster.pods[0].id);
    relabelSelected(w);
    runTicks(w.cluster, 6);
    expect(w.cluster.pods.filter((p) => p.labels.app === 'web-debug' && p.ready)).toHaveLength(1);
  });
});

describe('the clock', () => {
  it('runs one tick per TICK_SECONDS of real time, however the time is sliced', () => {
    const a = createWorld();
    const b = createWorld();
    killPod(a.cluster, a.cluster.pods[0].id);
    killPod(b.cluster, b.cluster.pods[0].id);
    let ticksA = 0;
    for (let i = 0; i < 100; i++) ticksA += advance(a, 0.1).length;
    const ticksB = advance(b, 10).length;
    expect(ticksA).toBe(Math.floor(10 / TICK_SECONDS));
    expect(ticksB).toBe(ticksA);
    expect(JSON.stringify(a.cluster)).toBe(JSON.stringify(b.cluster));
  });

  it('actions with nothing selected do nothing', () => {
    const w = createWorld();
    expect(killSelected(w)).toBeNull();
    expect(relabelSelected(w)).toBeNull();
  });
});

describe('captions', () => {
  it('every tick caption reads cleanly and states what the report says', () => {
    const c = settledCluster(3);
    killPod(c, c.pods[0].id);
    for (let i = 0; i < 12; i++) {
      const r = tick(c);
      const text = expectCaption(tickCaption(r, i === 0 ? 'You deleted a pod.' : null));
      expect(text).toContain(`Observe: ${r.observe}`);
      expect(text).toContain(`Diff: ${r.diff}`);
      expect(text).toContain(`Act: ${r.act}`);
    }
  });

  it('the rollout note appears only while two ReplicaSets are live, with the real allowances', () => {
    const c = settledCluster(8);
    expect(rolloutNote(c)).toBeNull();
    changeImage(c);
    runTicks(c, 2);
    expect(expectCaption(rolloutNote(c))).toBe('Rolling update: at most 2 extra pods above 8 and at most 2 below 8 Ready at any moment.');
  });

  it('every action line reads cleanly', () => {
    const w = createWorld();
    selectPod(w, w.cluster.pods[0].id);
    const killed = killSelected(w);
    selectPod(w, w.cluster.pods.find((p) => p.phase !== 'Terminating')!.id);
    for (const text of [killed, relabelSelected(w), scaleTo(w, 4), rollOut(w), overRequest(w), crash(w)]) {
      expect(text).toBeTruthy();
      expectCaption(text);
    }
  });
});

describe('lesson text', () => {
  it('quiz 3: 8 replicas at 25% allow 10 pods and need 6 Ready', () => {
    const q = lesson.quiz[2];
    expect(q.options[q.answer]).toBe(`Up to ${8 + maxSurge(8)} pods, and at least ${8 - maxUnavailable(8)} stay Ready`);
  });
});
