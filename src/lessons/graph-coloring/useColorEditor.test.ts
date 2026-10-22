import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isPermutation } from './model';
import { useColorEditor } from './useColorEditor';

/**
 * Render a throwaway component that adds one node during its first render (a render-phase update re-renders it,
 * which is how a hook's state can be driven without a DOM) and report the order seen on every pass.
 */
function ordersAfterAddNode(extraPasses: number) {
  const seen: number[][] = [];
  const Probe = () => {
    const ed = useColorEditor('greedy');
    const [added, setAdded] = useState(false);
    const [pass, setPass] = useState(0);
    if (!added) {
      setAdded(true);
      ed.addNode();
    } else if (pass < extraPasses) setPass(pass + 1);
    seen.push(ed.order);
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return seen;
}

describe('useColorEditor order after Add node', () => {
  it('is a permutation of the grown graph that keeps its identity from one render to the next (usePlayer rewinds on a new frames array)', () => {
    const seen = ordersAfterAddNode(3);
    const settled = seen.slice(1);
    expect(settled.length).toBeGreaterThan(2);
    expect(isPermutation(settled[0], settled[0].length)).toBe(true);
    for (const order of settled) expect(order).toBe(settled[0]);
  });
});
