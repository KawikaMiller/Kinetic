import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { expectCaption } from '../../core/testing/captions';
import { ORDER_LABELS, pushFrames, runFor, sampledCounts, type Order } from './frames';
import lesson from './index';
import {
  PRESETS, UNLUCKY_K, applyPath, arcBetween, backEdges, bottleneck, crossingEdges, cutCapacity, edmondsKarp, flowValue, isMaximum, presetById, reachableSet, shortestPath, unluckyNetwork,
  zeroFlow, type Arc, type Network,
} from './model';
import { augmentCaption, cutCaption, matchingLine, pathText, pipelineLine } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const textbook = presetById('textbook').net;
const idx = (net: Network, n: string) => net.names.indexOf(n);

/** The learner pressing Shortest path then Push, once. */
function pressShortestAndPush(net: Network, flow: number[]): number[] {
  const path = shortestPath(net, flow)!;
  return applyPath(flow, path, bottleneck(path));
}

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: Shortest path then Push three times reaches flow 23, and the caption then says no path is left', () => {
    let flow = zeroFlow(textbook);
    for (let i = 0; i < 3; i++) flow = pressShortestAndPush(textbook, flow);
    expect(flowValue(textbook, flow)).toBe(23);
    expect(isMaximum(textbook, flow)).toBe(true);
    expect(edmondsKarp(textbook).steps).toHaveLength(3);
    const caption = augmentCaption({ net: textbook, flow, value: 23, pushes: 3, walk: [0], arcs: [], complete: false, delta: 0 });
    expect(caption).toContain('flow 23 is a maximum flow after 3 pushes');
    expect(caption).toContain('add up to 23');
    expect(lesson.tryThis[0]).toContain('after 3 pushes the flow is 23');
  });

  it('try-this 2: on the unlucky preset, s-a-b-t then s-b-a-t is legal, the second step is a backward arrow, and the flow reaches 2', () => {
    const net = presetById('unlucky').net;
    const [s, a, b, t] = [0, 1, 2, 3];
    const arcsOf = (flow: number[], walk: number[]): Arc[] => walk.slice(1).map((v, i) => arcBetween(net, flow, walk[i], v)!);
    let flow = zeroFlow(net);
    const first = arcsOf(flow, [s, a, b, t]);
    expect(first.every(Boolean)).toBe(true);
    expect(bottleneck(first)).toBe(1);
    flow = applyPath(flow, first, 1);
    const second = arcsOf(flow, [s, b, a, t]);
    expect(second.every(Boolean)).toBe(true);
    expect(second[1]).toMatchObject({ from: b, to: a, back: true });
    expect(bottleneck(second)).toBe(1);
    const caption = augmentCaption({ net, flow, value: 1, pushes: 1, walk: [s, b, a, t], arcs: second, complete: true, delta: 1 });
    expect(caption).toContain('s → b ⇠ a → t');
    expect(caption).toContain('Push 1 raises the flow from 1 to 2');
    expect(caption).toContain('1 backward arrow');
    flow = applyPath(flow, second, 1);
    expect(flowValue(net, flow)).toBe(2);
    expect(lesson.tryThis[1]).toContain('click s, b, a, t');
  });

  it('try-this 3: at capacity 1,000 the adversarial order needs 2,000 and shortest-path-first 2, and the last frame says so', () => {
    for (const order of ['adversarial', 'shortest'] as Order[]) {
      const frames = pushFrames(order, UNLUCKY_K);
      const last = text(frames[frames.length - 1].say);
      const mine = order === 'adversarial' ? '2,000 augmentations' : '2 augmentations';
      const theirs = order === 'adversarial' ? '2 augmentations' : '2,000 augmentations';
      expect(last).toContain(`after ${mine} in this order`);
      expect(last).toContain(`needs ${theirs}`);
      expect(frames[frames.length - 1].value).toBe(2000);
    }
    expect(lesson.tryThis[2]).toContain('needs 2,000 augmentations');
    expect(lesson.tryThis[2]).toContain('it needs 2.');
  });

  it('try-this 4: dragging v1, v2 and v4 onto the S side reads cut capacity 23 = 12 + 7 + 4, with v3→v2 listed back and not counted', () => {
    const side = new Set(['s', 'v1', 'v2', 'v4'].map((n) => idx(textbook, n)));
    expect(cutCapacity(textbook, side)).toBe(23);
    const cap = (i: number) => textbook.edges[i].cap;
    expect(crossingEdges(textbook, side).map(cap).sort((x, y) => x - y)).toEqual([4, 7, 12]);
    expect(backEdges(textbook, side).map((i) => `${textbook.names[textbook.edges[i].from]}>${textbook.names[textbook.edges[i].to]} ${cap(i)}`)).toEqual(['v3>v2 9']);
    const caption = cutCaption({ net: textbook, side, flowValue: 0, maximum: false, showing: false });
    expect(caption).toContain('v1→v3 12 + v4→v3 7 + v4→t 4 = 23');
    expect(caption).toContain('23 above the flow 0');
    expect(lesson.tryThis[3]).toContain('reads 23 (12 + 7 + 4)');
  });

  it('try-this 5: after Finish the flow, the minimum cut shown is {s v1 v2 v4}, its edges are full, and it equals the flow', () => {
    const run = edmondsKarp(textbook);
    const side = reachableSet(textbook, run.flow);
    const names = textbook.names.filter((_, v) => side.has(v)).join(' ');
    expect(names).toBe('s v1 v2 v4');
    const caption = cutCaption({ net: textbook, side, flowValue: run.value, maximum: true, showing: true });
    expect(caption).toContain('S = {s, v1, v2, v4}');
    expect(caption).toContain('equal to the flow 23');
    expect(lesson.tryThis[4]).toContain('S side is {s v1 v2 v4}');
    expect(lesson.tryThis[4]).toContain('equals the flow 23');
  });
});

describe('every caption reads cleanly and is computed from the state', () => {
  it('walks every preset through empty, half-pushed and finished flows: no NaN, no glued sentence, flow quoted correctly', () => {
    for (const p of PRESETS) {
      const run = edmondsKarp(p.net);
      let flow = zeroFlow(p.net);
      const states = [flow];
      for (const s of run.steps) {
        flow = applyPath(flow, s.path, s.delta);
        states.push(flow);
      }
      for (const f of states) {
        const value = flowValue(p.net, f);
        const c = augmentCaption({ net: p.net, flow: f, value, pushes: 0, walk: [p.net.source], arcs: [], complete: false, delta: 0 });
        expect(c).not.toMatch(/NaN|undefined|null/);
        expect(c).toContain(String(value));
        const side = isMaximum(p.net, f) ? reachableSet(p.net, f) : new Set([p.net.source]);
        const cut = cutCaption({ net: p.net, side, flowValue: value, maximum: isMaximum(p.net, f), showing: isMaximum(p.net, f) });
        expect(cut).not.toMatch(/NaN|undefined|null/);
        expect(cut).toContain(String(cutCapacity(p.net, side)));
      }
    }
  });

  it('every frame of the unlucky scene, for every capacity and order, quotes the model: counts, flow and the order label', () => {
    let frames = 0;
    for (const k of [1, 5, 10, 100, UNLUCKY_K]) {
      for (const order of ['adversarial', 'shortest'] as Order[]) {
        const list = pushFrames(order, k);
        const run = runFor(order, k);
        const net = unluckyNetwork(k);
        expect(list[list.length - 1].count).toBe(run.steps.length);
        expect(list[list.length - 1].value).toBe(2 * k);
        for (const f of list) {
          expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
          expect(f.value).toBe(flowValue(net, f.flow));
          frames++;
        }
        expect(ORDER_LABELS[order].length).toBeGreaterThan(0);
        expect(list).toHaveLength(sampledCounts(run.steps.length).length + 2);
      }
    }
    expect(frames).toBeGreaterThan(60);
  });

  it('the scripted adversarial count follows the capacity while shortest-path-first stays at two (the hidden capacity control only feeds this scene)', () => {
    for (const k of [1, 5, 10, 100, UNLUCKY_K]) {
      expect(runFor('adversarial', k).steps).toHaveLength(2 * k);
      expect(runFor('shortest', k).steps).toHaveLength(2);
    }
    // The shared network editor never sees this control: the textbook run is the same whatever capacity the scene holds.
    expect(edmondsKarp(textbook).value).toBe(23);
  });

  it('path text writes forward arrows as → and backward ones as ⇠', () => {
    const net = unluckyNetwork(1);
    const flow = applyPath(zeroFlow(net), [0, 2, 4].map((i) => ({ edge: i, from: net.edges[i].from, to: net.edges[i].to, res: 1, back: false })), 1);
    const arcs = [arcBetween(net, flow, 0, 2)!, arcBetween(net, flow, 2, 1)!, arcBetween(net, flow, 1, 3)!];
    expect(pathText(net, [0, 2, 1, 3], arcs)).toBe('s → b ⇠ a → t');
  });

  it('the matching and pipeline lines quote the runs', () => {
    expect(matchingLine()).toContain('Max flow 2');
    expect(pipelineLine()).toContain('Max flow 4');
    expect(pipelineLine()).toContain('a→b (4)');
  });
});

describe('claims on screen that the tests have to back', () => {
  it('"widening any other pipe changes nothing" holds for the pipeline preset', () => {
    const net = presetById('pipeline').net;
    net.edges.forEach((e, i) => {
      if (e.cap === 4) return;
      const wider = { ...net, edges: net.edges.map((x, j) => (j === i ? { ...x, cap: x.cap + 50 } : x)) };
      expect(edmondsKarp(wider).value).toBe(4);
    });
  });
});

describe('the closing caption of the unlucky run colours the costly count red and the cheap count green, in either order', () => {
  const classOf = (markup: string, count: number) => new RegExp(`class="hl (bad|ok)">${count.toLocaleString('en-US')} augmentations?<`).exec(markup)?.[1];
  it.each([[2], [7], [UNLUCKY_K]])('k = %i', (k) => {
    const adversarial = runFor('adversarial', k).steps.length;
    const shortest = runFor('shortest', k).steps.length;
    expect(adversarial).toBeGreaterThan(shortest);
    for (const order of ['adversarial', 'shortest'] as const) {
      const last = pushFrames(order, k).at(-1)!.say;
      const markup = renderToStaticMarkup(last);
      expect(classOf(markup, adversarial), `${order} k=${k}: the many-augmentation count`).toBe('bad');
      expect(classOf(markup, shortest), `${order} k=${k}: the few-augmentation count`).toBe('ok');
    }
  });
});
