import { describe, expect, it } from 'vitest';
import { swapCaption, viewCaption } from './captions';
import type { Choices } from './model';

const c = (o: Partial<Choices>): Choices => ({ view: 'hexagon', design: 'clean', repo: 'postgres', driver: 'http', ...o });

describe('captions are computed from the deployed files', () => {
  it('view captions follow the checker', () => {
    expect(viewCaption(c({}))).toContain('nothing in the domain imports an adapter');
    expect(viewCaption(c({ design: 'orm' }))).toContain('placeOrder.ts → orm.ts points outward');
    expect(viewCaption(c({ view: 'layered' }))).toContain('every arrow pointing down');
  });

  it('swap captions report 0 or 1 core files changed, for every view × design × swap', () => {
    for (const view of ['layered', 'hexagon'] as const) {
      for (const design of ['clean', 'orm'] as const) {
        const before = c({ view, design });
        const db = swapCaption(before, { ...before, repo: 'memory' });
        const driver = swapCaption(before, { ...before, driver: 'cli' });
        if (view === 'hexagon' && design === 'clean') expect(db).toContain('0 domain files changed');
        if (view === 'hexagon' && design === 'orm') expect(db).toContain('The domain itself had to change (placeOrder.ts)');
        if (view === 'layered') expect(db).toContain('OrderService.ts had to change');
        expect(driver).not.toMatch(/had to change/);
      }
    }
  });
});
