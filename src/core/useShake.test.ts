import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHAKE } from './motion';
import { useShake } from './useShake';

let reduced = false;
vi.mock('motion/react', () => ({ useReducedMotion: () => reduced }));

/** Render a throwaway component once and hand back what the hook returned. */
function run(frames?: { x: number[] }) {
  const seen: ReturnType<typeof useShake>[] = [];
  const Probe = ({ report }: { report: (r: ReturnType<typeof useShake>) => void }) => {
    report(useShake(frames));
    return null;
  };
  renderToStaticMarkup(createElement(Probe, { report: (r) => seen.push(r) }));
  return seen[0];
}

describe('useShake', () => {
  beforeEach(() => {
    reduced = false;
  });

  it('shakes with the shared SHAKE when active, and holds at x: 0 otherwise', () => {
    const { shake, allowed } = run();
    expect(allowed).toBe(true);
    expect(shake(true)).toEqual(SHAKE);
    expect(shake(false)).toEqual({ x: 0 });
  });

  it('takes custom keyframes', () => {
    const hard = { x: [0, -10, 10, 0] };
    expect(run(hard).shake(true)).toEqual(hard);
  });

  it('holds still under prefers-reduced-motion, and says so for imperative animate() calls', () => {
    reduced = true;
    const { shake, allowed } = run();
    expect(allowed).toBe(false);
    expect(shake(true)).toEqual({ x: 0 });
  });
});
