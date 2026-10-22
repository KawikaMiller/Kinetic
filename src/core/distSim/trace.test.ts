import { describe, expect, it } from 'vitest';
import { createCluster, type DistNode } from './cluster';
import { toSequence } from './trace';
import { sequenceLayout } from '../sequenceLayout';

type Msg = { type: 'hello'; n: number };

const talker = (to: string, count: number): DistNode<Msg> => {
  let n = 0;
  const go = (ctx: Parameters<DistNode<Msg>['init']>[0]) => {
    ctx.send(to, { type: 'hello', n: n++ });
    if (n < count) ctx.setTimer('go', 10);
  };
  return { init: go, onTimer: go, onMessage: () => {} };
};
const quiet: DistNode<Msg> = { init: () => {}, onTimer: () => {}, onMessage: () => {} };

describe('toSequence', () => {
  it('draws one arrow per message in send order, with actors in order of first appearance', () => {
    const c = createCluster<Msg>({ seed: 1, nodes: { a: talker('b', 3), b: quiet } });
    c.run();
    const { actors, messages } = toSequence(c.trace);
    expect(actors.map((a) => a.id)).toEqual(['a', 'b']);
    expect(messages.map((m) => [m.from, m.to, m.label])).toEqual([['a', 'b', 'hello'], ['a', 'b', 'hello'], ['a', 'b', 'hello']]);
    expect(new Set(messages.map((m) => m.id)).size).toBe(3);
    expect(messages.some((m) => m.lost)).toBe(false);
  });

  it('marks exactly the dropped messages as lost', () => {
    const c = createCluster<Msg>({ seed: 2, latency: { min: 3, max: 3 }, nodes: { a: talker('b', 10), b: quiet } });
    c.partition('a', 'b', 25, 55);
    c.run();
    const dropped = new Set(c.trace.filter((r) => r.kind === 'drop').map((r) => `m${r.msgId}`));
    const { messages } = toSequence(c.trace);
    expect(dropped.size).toBeGreaterThan(0);
    expect(new Set(messages.filter((m) => m.lost).map((m) => m.id))).toEqual(dropped);
  });

  it('draws a duplicate delivery as its own arrow and an inject at its delivery', () => {
    const c = createCluster<Msg>({ seed: 3, duplicate: 1, nodes: { a: talker('b', 1), b: quiet } });
    c.inject(5, 'a', { type: 'hello', n: 99 }, 'client');
    c.run();
    const { actors, messages } = toSequence(c.trace);
    expect(messages.filter((m) => m.label.endsWith('(duplicate)'))).toHaveLength(1);
    expect(messages.find((m) => m.from === 'client')).toMatchObject({ to: 'a', label: 'hello' });
    expect(actors.map((a) => a.id)).toContain('client');
  });

  it('shows crash, restart and pause as self-messages unless asked not to, and timers only on request', () => {
    const c = createCluster<Msg>({ seed: 4, nodes: { a: talker('b', 3), b: quiet } });
    c.crash('b', 5);
    c.restart('b', 15);
    c.pause('a', 20, 30);
    c.run();
    const labels = (o?: Parameters<typeof toSequence<Msg>>[1]) => toSequence(c.trace, o).messages.filter((m) => m.from === m.to).map((m) => m.label);
    expect(labels()).toEqual(['crash', 'restart', 'pause', 'resume']);
    expect(labels({ events: false })).toEqual([]);
    expect(labels({ timers: true })).toContain('timer go');
  });

  it('takes custom actors, labels and time notes, and a trace prefix replays the diagram', () => {
    const c = createCluster<Msg>({ seed: 5, latency: { min: 4, max: 4 }, nodes: { a: talker('b', 2), b: quiet } });
    c.run();
    const out = toSequence(c.trace, { actors: [{ id: 'b', label: 'Bee' }, { id: 'a', label: 'Ay' }], label: (p) => `#${p.n}`, times: true });
    expect(out.actors.map((a) => a.label)).toEqual(['Bee', 'Ay']);
    expect(out.messages.map((m) => m.label)).toEqual(['#0', '#1']);
    expect(out.messages[0].note).toBe('sent 0ms, arrived 4ms');
    expect(toSequence(c.trace.slice(0, 2)).messages).toHaveLength(1);
  });

  it('rounds the times in a note to one decimal place, so a fractional latency never prints 65.925117517123ms', () => {
    const c = createCluster<Msg>({ seed: 5, latency: { min: 4.123456, max: 4.123456 }, nodes: { a: talker('b', 1), b: quiet } });
    c.run();
    const note = toSequence(c.trace, { times: true }).messages[0].note!;
    expect(note).toBe('sent 0ms, arrived 4.1ms');
    expect(note).not.toMatch(/\d\.\d{2,}/);
  });

  it('feeds SequenceDiagram: its layout accepts the output', () => {
    const c = createCluster<Msg>({ seed: 6, nodes: { a: talker('b', 4), b: quiet } });
    c.run();
    const { actors, messages } = toSequence(c.trace);
    const layout = sequenceLayout(actors, messages);
    expect(layout.rows).toHaveLength(messages.length);
  });
});
