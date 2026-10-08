import { describe, expect, it } from 'vitest';
import { CliDriver } from './app/adapters/CliDriver';
import { EmailNotifier } from './app/adapters/EmailNotifier';
import { HttpController } from './app/adapters/HttpController';
import { InMemoryOrderRepo } from './app/adapters/InMemoryOrderRepo';
import { PostgresOrderRepo } from './app/adapters/PostgresOrderRepo';
import { StripeLikePayments } from './app/adapters/StripeLikePayments';
import { APPROVAL_LIMIT } from './app/domain/order';
import type { OrderRepository } from './app/domain/OrderRepository';
import { placeOrder } from './app/domain/placeOrder';
import {
  APP_FILES, changedFiles, coreChanged, domainTestNeedsOrm, filesFor, importEdges, importsOf, rankIn, resolveSpecifier, violations,
  type Choices, type Design, type DriverChoice, type RepoChoice, type View,
} from './model';

const ALL: Choices[] = (['layered', 'hexagon'] as View[]).flatMap((view) =>
  (['clean', 'orm'] as Design[]).flatMap((design) =>
    (['postgres', 'memory'] as RepoChoice[]).flatMap((repo) => (['http', 'cli'] as DriverChoice[]).map((driver) => ({ view, design, repo, driver }))),
  ),
);
const hex = (o: Partial<Choices> = {}): Choices => ({ view: 'hexagon', design: 'clean', repo: 'postgres', driver: 'http', ...o });
const layered = (o: Partial<Choices> = {}): Choices => ({ view: 'layered', design: 'clean', repo: 'postgres', driver: 'http', ...o });

describe('the domain runs, unchanged, with both repository adapters (real code)', () => {
  const repos: [string, () => OrderRepository][] = [
    ['Postgres (simulated ORM)', () => new PostgresOrderRepo()],
    ['in-memory', () => new InMemoryOrderRepo()],
  ];
  for (const [name, make] of repos) {
    it(`${name}: a small order is charged, saved as paid and notified`, () => {
      const pay = new StripeLikePayments();
      const notify = new EmailNotifier();
      const order = placeOrder(30, make(), pay, notify);
      expect(order.status).toBe('paid');
      expect(pay.charged).toEqual([30]);
      expect(notify.sent).toEqual([`Order ${order.id} confirmed`]);
    });
    it(`${name}: an order over the approval limit waits, uncharged; one at the limit is paid`, () => {
      const pay = new StripeLikePayments();
      const notify = new EmailNotifier();
      expect(placeOrder(APPROVAL_LIMIT + 1, make(), pay, notify).status).toBe('needs-approval');
      expect(placeOrder(APPROVAL_LIMIT, make(), pay, notify).status).toBe('paid');
      expect(pay.charged).toEqual([APPROVAL_LIMIT]);
    });
  }

  it('both driving adapters call the same use case', () => {
    const wire = () => {
      const repo = new InMemoryOrderRepo();
      const pay = new StripeLikePayments();
      const notify = new EmailNotifier();
      return (total: number) => placeOrder(total, repo, pay, notify);
    };
    const http = new HttpController(wire());
    const cli = new CliDriver(wire());
    expect(http.post({ total: 600 })).toEqual({ status: 201, body: { id: 1, total: 600, status: 'needs-approval' } });
    expect(cli.run(['40'])).toBe('order 1: paid');
  });
});

describe('import edges are parsed from the shown source', () => {
  it('resolves relative specifiers', () => {
    expect(resolveSpecifier('adapters/HttpController.ts', '../domain/placeOrder')).toBe('domain/placeOrder.ts');
    expect(resolveSpecifier('domain/placeOrder.ts', './order')).toBe('domain/order.ts');
    expect(resolveSpecifier('main.ts', './adapters/CliDriver')).toBe('adapters/CliDriver.ts');
  });

  it('reads the real placeOrder.ts imports, with their line numbers', () => {
    expect(importsOf('domain/placeOrder.ts', APP_FILES['domain/placeOrder.ts'])).toEqual([
      { from: 'domain/placeOrder.ts', to: 'domain/Notifier.ts', line: 0 },
      { from: 'domain/placeOrder.ts', to: 'domain/order.ts', line: 1 },
      { from: 'domain/placeOrder.ts', to: 'domain/OrderRepository.ts', line: 2 },
      { from: 'domain/placeOrder.ts', to: 'domain/PaymentPort.ts', line: 3 },
    ]);
  });

  it('the real domain depends on nothing outside the domain', () => {
    const domain = Object.fromEntries(Object.entries(APP_FILES).filter(([p]) => p.startsWith('domain/')));
    expect(Object.keys(domain)).toHaveLength(5);
    expect(importEdges(domain).filter((e) => !e.to.startsWith('domain/'))).toEqual([]);
  });

  it('every import of every deployment resolves to a file that is deployed (16 combinations)', () => {
    for (const c of ALL) {
      const files = filesFor(c);
      for (const e of importEdges(files)) expect(Object.keys(files), `${JSON.stringify(c)} ${e.from} → ${e.to}`).toContain(e.to);
    }
  });
});

describe('the dependency-rule checker', () => {
  it('finds nothing in the clean hexagon or the layered app, for every adapter choice', () => {
    for (const c of ALL.filter((x) => x.view === 'layered' || x.design === 'clean')) {
      expect(violations(importEdges(filesFor(c)), (p) => rankIn(c.view, p)), JSON.stringify(c)).toEqual([]);
    }
  });

  it('flags the domain importing the ORM, and the in-memory store after the swap', () => {
    const v = (repo: RepoChoice) =>
      violations(importEdges(filesFor(hex({ design: 'orm', repo }))), (p) => rankIn('hexagon', p)).map((e) => `${e.from} → ${e.to}`);
    expect(v('postgres')).toEqual(['domain/placeOrder.ts → lib/orm.ts']);
    expect(v('memory')).toEqual(['domain/placeOrder.ts → lib/memoryAudit.ts']);
  });

  it('flags a planted upward import in the layered app', () => {
    const edges = [{ from: 'layered/PostgresOrderRepo.ts', to: 'layered/OrderService.ts', line: 0 }];
    expect(violations(edges, (p) => rankIn('layered', p))).toEqual(edges);
  });
});

describe('what a swap changes', () => {
  it('hexagon, clean: swapping the database edits main.ts and swaps adapters, but 0 domain files', () => {
    const a = filesFor(hex());
    const b = filesFor(hex({ repo: 'memory' }));
    expect(coreChanged(a, b)).toEqual([]);
    expect(changedFiles(a, b)).toEqual(['adapters/InMemoryOrderRepo.ts', 'adapters/PostgresOrderRepo.ts', 'lib/orm.ts', 'main.ts']);
  });

  it('hexagon, clean: swapping HTTP for CLI also leaves the domain alone', () => {
    expect(coreChanged(filesFor(hex()), filesFor(hex({ driver: 'cli' })))).toEqual([]);
  });

  it('hexagon, domain imports the ORM: the same swap forces a domain edit', () => {
    expect(coreChanged(filesFor(hex({ design: 'orm' })), filesFor(hex({ design: 'orm', repo: 'memory' })))).toEqual(['domain/placeOrder.ts']);
  });

  it('layered: swapping the database edits the service that holds the business rule; swapping the driver does not', () => {
    expect(coreChanged(filesFor(layered()), filesFor(layered({ repo: 'memory' })))).toEqual(['layered/OrderService.ts']);
    expect(coreChanged(filesFor(layered()), filesFor(layered({ driver: 'cli' })))).toEqual([]);
  });

  it('the design picker has no effect on the layered app (it is hidden there)', () => {
    for (const repo of ['postgres', 'memory'] as RepoChoice[]) {
      expect(filesFor(layered({ design: 'orm', repo }))).toEqual(filesFor(layered({ repo })));
    }
  });
});

describe('review fixes, pinned', () => {
  it('the business-rule test needs the ORM exactly when the rule reaches lib/orm.ts, in all 16 deployments', () => {
    const expected = (c: Choices) => c.repo === 'postgres' && (c.view === 'layered' || c.design === 'orm');
    for (const c of ALL) expect(domainTestNeedsOrm(filesFor(c)), JSON.stringify(c)).toBe(expected(c));
  });

  it('the default layered deployment has no database-free business-rule test, and the clean hexagon has one', () => {
    expect(domainTestNeedsOrm(filesFor(layered()))).toBe(true);
    expect(domainTestNeedsOrm(filesFor(hex()))).toBe(false);
    expect(domainTestNeedsOrm(filesFor(hex({ design: 'orm' })))).toBe(true);
  });

  it('the violating domain really contains the ORM import and the audit write (the text edit did not silently no-op)', () => {
    for (const repo of ['postgres', 'memory'] as RepoChoice[]) {
      const text = filesFor(hex({ design: 'orm', repo }))['domain/placeOrder.ts'];
      const lib = repo === 'postgres' ? "from '../lib/orm'" : "from '../lib/memoryAudit'";
      expect(text.split('\n')[0]).toContain(lib);
      expect(text).toContain(repo === 'postgres' ? "db.insert('order_audit'" : 'memoryAudit.push(');
      expect(text).toContain('It also talks to storage directly.');
      expect(text).not.toContain('never the adapters');
      expect(text).not.toBe(APP_FILES['domain/placeOrder.ts']);
    }
  });

  it('the layered view is presented as the usual naive variant, not as inherent', async () => {
    const { viewCaption } = await import('./captions');
    expect(viewCaption(layered())).toContain('usual naive variant');
    expect(viewCaption(layered())).toContain('could instead own that interface');
    const { default: lesson } = await import('./index');
    expect(lesson.summary.what).toContain('naive version');
    expect(lesson.summary.what).toContain('can invert that dependency');
    expect(lesson.summary.what).not.toContain('so the business rules end up depending on storage. Hexagonal');
  });

  it('try-this 4 names the hexagon view, which is where the Domain selector exists', async () => {
    const { default: lesson } = await import('./index');
    expect(lesson.tryThis[3]).toContain('In the hexagon view');
  });
});
