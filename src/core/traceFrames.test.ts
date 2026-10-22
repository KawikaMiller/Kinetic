import { describe, expect, it } from 'vitest';
import { createCluster, forSeeds, type Safety } from './distSim';
import { explore } from './explore';
import { asDistNodes, networkExplorer, type PureProtocol } from './pureProtocol';
import { explorePathSteps, traceFrames, traceRowSteps, traceSignature, type TraceStep } from './traceFrames';

type Msg = { type: 'ping' };
const pingPong: PureProtocol<{ pinged: boolean }, Msg> = {
  nodes: ['a', 'b'],
  init: () => ({ pinged: false }),
  onTimeout: (id, s) => (id === 'a' && !s.pinged ? { state: { pinged: true }, send: [{ to: 'b', payload: { type: 'ping' } }] } : null),
  onMessage: (id, s) => ({ state: id === 'b' ? { pinged: true } : s, send: [] }),
};

describe('traceFrames', () => {
  it('frame 0 is the start and frame k is the state after step k, with who-did-what captions', () => {
    const steps: TraceStep<number>[] = [{ actor: 'T1', text: 'load head', state: 1 }, { text: 'done', state: 2 }];
    const frames = traceFrames(0, steps);
    expect(frames.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(frames.map((f) => f.state)).toEqual([0, 1, 2]);
    expect(frames.map((f) => f.say)).toEqual(['start', 'T1: load head', 'done']);
  });

  it('turns an explorer path into steps that keep the acting node', () => {
    const net = networkExplorer(pingPong, { network: 'multiset' });
    const r = explore({ ...net, invariant: (s) => (net.nodeState(s, 'b').pinged ? 'b was pinged' : null) });
    const steps = explorePathSteps(r.violation!.path);
    expect(steps.map((s) => s.actor)).toEqual(['a', 'b']);
    expect(steps[1].text).toBe('b receives ping from a');
  });

  it('turns a distSim violation trace into timed steps', () => {
    const safety: Safety<{ pinged: boolean }>[] = [(snap) => (snap.nodes.b.state?.pinged ? 'b was pinged' : null)];
    const verdict = forSeeds(5, (seed) => createCluster({ seed, nodes: asDistNodes(pingPong) }), safety);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const steps = traceRowSteps(verdict.trace);
    expect(steps.at(-1)?.text).toMatch(/^t=[\d.]+ms b receives ping from a$/);
    expect(steps.at(-1)?.actor).toBe('b');
    expect(steps.some((s) => /a sends ping to b/.test(s.text))).toBe(true);
  });

  it('the signature depends on the trace\'s value, not the identity of its arrays', () => {
    const key = (n: number) => String(n);
    const make = (): TraceStep<number>[] => [{ actor: 'x', text: 'one', state: 1 }];
    expect(traceSignature(0, make(), key)).toBe(traceSignature(0, make(), key));
    expect(traceSignature(0, make(), key)).not.toBe(traceSignature(0, [{ actor: 'x', text: 'one', state: 2 }], key));
    expect(traceSignature(0, make(), key)).not.toBe(traceSignature(1, make(), key));
  });
});
