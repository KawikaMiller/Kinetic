import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HORIZON_MS, scheduleConfig } from './check';
import { rowKeys } from './ops';
import { ReplicaCard } from './ReplicaCard';
import { runConfig } from './runs';
import { BROKEN_SEED_ARRIVAL } from './seeds';

/** The keys React would see on the item rows: ReplicaCard is a plain function, so call it and walk the element tree it returns. */
function itemRowKeys(node: ReactNode, out: (string | null)[] = []): (string | null)[] {
  if (Array.isArray(node)) node.forEach((n) => itemRowKeys(n, out));
  else if (isValidElement<{ className?: string; children?: ReactNode }>(node)) {
    if (typeof node.props.className === 'string' && /^ofs-item( |$)/.test(node.props.className)) out.push(node.key);
    itemRowKeys(node.props.children, out);
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe('arrival-order mode renders without React key errors', () => {
  it('the arrival-order run lists one id twice, and each card still renders with unique keys and no console error', () => {
    const run = runConfig(scheduleConfig(BROKEN_SEED_ARRIVAL, 'arrival', true, 0), HORIZON_MS);
    const repeated = (v: typeof run.views.phone) => new Set(v.items.map((i) => i.id)).size < v.items.length;
    expect(repeated(run.views.phone) || repeated(run.views.laptop) || repeated(run.views.server), 'the mode shows the same id twice').toBe(true);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const name of ['phone', 'laptop', 'server'] as const) {
      const html = renderToStaticMarkup(createElement(ReplicaCard, { name, view: run.views[name] }));
      expect(html.match(/<li class="ofs-item/g)?.length ?? 0).toBe(run.views[name].items.length);
      const keys = itemRowKeys(ReplicaCard({ name, view: run.views[name] }));
      expect(keys.length).toBe(run.views[name].items.length);
      expect(new Set(keys).size, `${name}: duplicate React keys ${keys.join(', ')}`).toBe(keys.length);
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('row keys keep a unique id as it is and number only the repeats', () => {
    expect(rowKeys([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'a' }])).toEqual(['a', 'b', 'a#1', 'a#2']);
    expect(rowKeys([])).toEqual([]);
  });
});
