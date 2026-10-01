import { describe, expect, it } from 'vitest';
import {
  apply, blame, DEFINITIONS, definitionOf, lineText, referencesOf, run, search, solved, START, symbolsOn, TASKS, type NavState,
} from './model';
import { FILES } from './repo';

const at = (file: string, line: number) => ({ file, line });

describe('the repo', () => {
  it('has about a dozen files across routes, controllers, services, repositories, config and tests', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(12);
    for (const dir of ['routes', 'controllers', 'services', 'repositories', 'config', 'tests']) {
      expect(FILES.some((f) => f.path.includes(`${dir}/`))).toBe(true);
    }
  });
});

describe('search', () => {
  it('finds every line containing the text, case-insensitively', () => {
    expect(search('402').map((h) => `${h.file}:${h.line}`)).toEqual([
      'src/controllers/checkoutController.ts:11', 'tests/checkout.test.ts:4', 'tests/checkout.test.ts:6',
    ]);
    expect(search('welcome10')).toHaveLength(3); // the code and two mentions in its test
    expect(search('  ')).toEqual([]);
  });

  it('matches a brute-force scan of the files', () => {
    for (const q of ['cart', 'TAX', 'db.', 'export', 'zzz']) {
      let count = 0;
      for (const f of FILES) for (const l of f.lines) if (l.toLowerCase().includes(q.toLowerCase())) count++;
      expect(search(q)).toHaveLength(count);
    }
  });
});

describe('go to definition and find references', () => {
  it('points every definition at the line that declares it', () => {
    expect(Object.keys(DEFINITIONS)).toEqual(expect.arrayContaining(['createCheckout', 'placeOrder', 'saveOrder', 'TAX_RATE', 'PaymentDeclined', 'Cart']));
    for (const [symbol, loc] of Object.entries(DEFINITIONS)) {
      expect(lineText(loc)).toMatch(new RegExp(`export\\s+(async\\s+)?(function|const|class|interface)\\s+${symbol}\\b`));
    }
  });

  it('lists the code that uses a symbol, but not string literals or its own definition', () => {
    expect(referencesOf('PaymentDeclined').map((h) => `${h.file}:${h.line}`)).toEqual([
      'src/controllers/checkoutController.ts:2', 'src/controllers/checkoutController.ts:10',
      'src/services/payments.ts:2', 'src/services/payments.ts:9',
    ]);
    expect(referencesOf('TAX_RATE').every((h) => h.file === 'src/services/pricing.ts')).toBe(true);
  });

  it('only offers symbols the repo defines', () => {
    expect(symbolsOn(at('src/services/orderService.ts', 8))).toEqual(['chargeCard']);
    expect(symbolsOn(at('src/server.ts', 6))).toEqual(['app']);
    expect(definitionOf('express')).toBeNull();
  });
});

describe('blame', () => {
  it('returns the last commit to touch a line', () => {
    expect(blame(at('src/config/tax.ts', 2)).author).toBe('Priya Natarajan');
    expect(blame(at('src/services/pricing.ts', 5)).message).toMatch(/WELCOME10/);
    expect(blame(at('src/server.ts', 1)).hash).toBe('e81b2c0');
  });
});

describe('tasks', () => {
  it('have answers that say what the task asks about', () => {
    const text = Object.fromEntries(TASKS.map((t) => [t.id, lineText(t.answer)]));
    expect(text.discount).toMatch(/WELCOME10.*0\.9/);
    expect(text.declined).toMatch(/throw new PaymentDeclined/);
    expect(text.tax).toMatch(/TAX_RATE = 0\.0825/);
    expect(text.save).toMatch(/INSERT INTO orders/);
  });

  for (const task of TASKS) {
    it(`"${task.question}" is solved by its reference path using only the tools`, () => {
      let s: NavState = START;
      for (const step of task.solution) {
        if (step.tool === 'open') {
          // Reachable: a line in the open file, a search or references result, or a file picked from the tree.
          const inHits = [...(s.search?.hits ?? []), ...(s.refs?.hits ?? [])].some((h) => h.file === step.at.file && h.line === step.at.line);
          const sameFile = s.at?.file === step.at.file;
          const fromTree = s.steps === 0;
          expect(inHits || sameFile || fromTree).toBe(true);
        } else if (step.tool === 'definition' || step.tool === 'references') {
          // Offered: the UI only shows symbol actions for symbols on the selected line.
          expect(s.at && s.at.line > 0 && symbolsOn(s.at)).toContain(step.symbol);
        } else if (step.tool === 'blame') {
          expect(s.at!.line).toBeGreaterThan(0);
        }
        const next = apply(s, step);
        expect(next.steps).toBe(s.steps + 1); // every step does something
        s = next;
      }
      expect(solved(task, s)).toBe(true);
    });
  }

  it('ignores blame with no line selected, and definitions of unknown symbols', () => {
    const opened = run([{ tool: 'open', at: at('src/config/tax.ts', 0) }]);
    expect(apply(opened, { tool: 'blame' })).toBe(opened);
    expect(apply(opened, { tool: 'definition', symbol: 'express' })).toBe(opened);
  });

  it("doesn't count a near miss as solved", () => {
    for (const task of TASKS) for (const n of task.near ?? []) expect(solved(task, run([{ tool: 'open', at: n.at }]))).toBe(false);
  });

  it('records the route → controller → service → repository path as breadcrumbs', () => {
    const s = run(TASKS.find((t) => t.id === 'save')!.solution);
    expect(s.trail).toEqual([
      'src/routes/checkout.ts', 'src/controllers/checkoutController.ts', 'src/services/orderService.ts', 'src/repositories/orderRepository.ts',
    ]);
  });
});
