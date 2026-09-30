import { describe, expect, it } from 'vitest';
import {
  AT_TARGET, BUBBLING, CAPTURING, DEFAULT_LISTENERS, pathTo, predict, tour, type Listeners, type NodeId,
} from './model';

const withListener = (base: Listeners, node: NodeId, patch: Partial<Listeners[NodeId]>): Listeners => ({
  ...base,
  [node]: { ...base[node], ...patch },
});

describe('pathTo', () => {
  it('runs from the card down to the target', () => {
    expect(pathTo('span')).toEqual(['card', 'section', 'button', 'span']);
    expect(pathTo('check')).toEqual(['card', 'section', 'check']);
    expect(pathTo('card')).toEqual(['card']);
  });
});

describe('predict (DOM dispatch order)', () => {
  it('default preset, click the span: capture on card, target, then bubble up', () => {
    expect(predict('span', DEFAULT_LISTENERS).fired).toEqual([
      { node: 'card', phase: CAPTURING },
      { node: 'span', phase: AT_TARGET },
      { node: 'button', phase: BUBBLING },
      { node: 'section', phase: BUBBLING },
    ]);
  });

  it('a capture listener on the target still runs in the target phase', () => {
    const l = withListener(DEFAULT_LISTENERS, 'span', { mode: 'capture' });
    expect(predict('span', l).fired).toContainEqual({ node: 'span', phase: AT_TARGET });
  });

  it('stopPropagation cuts everything after the listener that called it', () => {
    const l = withListener(DEFAULT_LISTENERS, 'button', { stop: true });
    const p = predict('span', l);
    expect(p.fired.map((f) => f.node)).toEqual(['card', 'span', 'button']);
    expect(p.stoppedAt).toBe('button');
  });

  it('stopping in capture means the target never hears the click', () => {
    const l = withListener(DEFAULT_LISTENERS, 'card', { stop: true });
    expect(predict('span', l).fired).toEqual([{ node: 'card', phase: CAPTURING }]);
  });

  it('preventDefault does not stop propagation', () => {
    const l = withListener(DEFAULT_LISTENERS, 'check', { prevent: true });
    const p = predict('check', l);
    expect(p.defaultPrevented).toBe(true);
    expect(p.stoppedAt).toBeNull();
    expect(p.fired.map((f) => f.node)).toEqual(['card', 'check', 'section']);
  });

  it('listeners that are off never fire', () => {
    const l = withListener(DEFAULT_LISTENERS, 'section', { mode: 'off' });
    expect(predict('span', l).fired.map((f) => f.node)).not.toContain('section');
  });
});

describe('tour', () => {
  it('visits every node down and back up, marking what fired and what was cut', () => {
    const l = withListener(DEFAULT_LISTENERS, 'button', { stop: true });
    const p = predict('span', l);
    const steps = tour(pathTo('span'), p.fired, p.stoppedAt);
    expect(steps.map((s) => `${s.node}:${s.phase}`)).toEqual([
      'card:1', 'section:1', 'button:1', 'span:2', 'button:3', 'section:3', 'card:3',
    ]);
    expect(steps.filter((s) => s.fired).map((s) => s.node)).toEqual(['card', 'span', 'button']);
    expect(steps.filter((s) => s.cut).map((s) => `${s.node}:${s.phase}`)).toEqual(['section:3', 'card:3']);
  });

  it('nothing is cut when nobody stops propagation', () => {
    const p = predict('span', DEFAULT_LISTENERS);
    expect(tour(pathTo('span'), p.fired, p.stoppedAt).some((s) => s.cut)).toBe(false);
  });
});
