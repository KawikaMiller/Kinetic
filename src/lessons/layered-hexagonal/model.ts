/**
 * The app as files. The hexagonal app is real TypeScript in ./app (Vitest runs its domain);
 * the stage shows those files' own source, read raw. The layered app, the violating
 * variant and main.ts are lesson-authored text. Every arrow, every violation and every
 * "files changed" count is computed from the import lines of whichever files are shown.
 */

const RAW = import.meta.glob<string>('./app/**/*.ts', { query: '?raw', import: 'default', eager: true });
/** The real app's files by path relative to app/ ("domain/placeOrder.ts"). */
export const APP_FILES: Record<string, string> = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.replace('./app/', ''), v]));

export type View = 'layered' | 'hexagon';
export type Design = 'clean' | 'orm';
export type RepoChoice = 'postgres' | 'memory';
export type DriverChoice = 'http' | 'cli';

export interface Choices {
  view: View;
  design: Design;
  repo: RepoChoice;
  driver: DriverChoice;
}

export type FileSet = Record<string, string>;

// ---- import edges, parsed from source ----

const IMPORT = /^import\s.*?from\s+'([^']+)';/gm;

/** Resolve a relative specifier against the importing file's folder; '.ts' added. */
export function resolveSpecifier(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return `${parts.join('/')}.ts`;
}

export interface ImportEdge {
  from: string;
  to: string;
  /** 0-based line of the import in the importing file. */
  line: number;
}

export function importsOf(path: string, text: string): ImportEdge[] {
  const lines = text.split('\n');
  return [...text.matchAll(IMPORT)].map((m) => ({
    from: path,
    to: resolveSpecifier(path, m[1]),
    line: lines.findIndex((l) => l === m[0].split('\n')[0]),
  }));
}

export const importEdges = (files: FileSet): ImportEdge[] => Object.entries(files).flatMap(([p, t]) => importsOf(p, t));

// ---- rings and the dependency rule ----

/**
 * How far out a file sits. Hexagon: domain (ports included) 0, adapters and outside
 * libraries 1, the composition root 2. Layered: database access 0, repositories 1,
 * services 2, controllers 3. One rule covers both: a file may import only files at its own
 * rank or lower (inward, or downward).
 */
export function rankOf(path: string): number {
  if (path.startsWith('domain/')) return 0;
  if (path.startsWith('adapters/')) return 1;
  if (path === 'main.ts') return 2;
  if (path.startsWith('lib/')) return HEX_LIB_RANK;
  if (path.startsWith('layered/')) {
    const name = path.replace('layered/', '');
    if (name.endsWith('Repo.ts')) return 1;
    if (name === 'OrderService.ts') return 2;
    return 3;
  }
  throw new Error(`no ring for ${path}`);
}
/** Outside libraries sit in the outer ring next to the adapters (hexagon) and in the bottom band (layered). */
const HEX_LIB_RANK = 1;
export const rankIn = (view: View, path: string) => (view === 'layered' && path.startsWith('lib/') ? 0 : rankOf(path));

/** The pure checker: the import edges that point outward (or upward), given a ring assignment. */
export const violations = (edges: readonly ImportEdge[], rank: (path: string) => number) => edges.filter((e) => rank(e.to) > rank(e.from));

// ---- variants ----

const ADAPTER_REPO: Record<RepoChoice, string> = { postgres: 'PostgresOrderRepo', memory: 'InMemoryOrderRepo' };
const ADAPTER_DRIVER: Record<DriverChoice, string> = { http: 'HttpController', cli: 'CliDriver' };

/** The composition root: the one file that names concrete adapters. */
export function mainText(repo: RepoChoice, driver: DriverChoice): string {
  const r = ADAPTER_REPO[repo];
  const d = ADAPTER_DRIVER[driver];
  return [
    `import { ${d} } from './adapters/${d}';`,
    "import { EmailNotifier } from './adapters/EmailNotifier';",
    `import { ${r} } from './adapters/${r}';`,
    "import { StripeLikePayments } from './adapters/StripeLikePayments';",
    "import { placeOrder } from './domain/placeOrder';",
    '',
    `const repo = new ${r}();`,
    'const pay = new StripeLikePayments();',
    'const notify = new EmailNotifier();',
    `export const app = new ${d}((total: number) => placeOrder(total, repo, pay, notify));`,
    '',
  ].join('\n');
}

/** The violating domain: placeOrder writes an audit row through the ORM (or, once the DB is swapped, an in-memory store) itself. */
export function ormPlaceOrder(repo: RepoChoice): string {
  const clean = APP_FILES['domain/placeOrder.ts'];
  const importLine = repo === 'postgres' ? "import { db } from '../lib/orm';" : "import { memoryAudit } from '../lib/memoryAudit';";
  const auditLine = repo === 'postgres' ? "  db.insert('order_audit', { orderId: order.id, total });" : '  memoryAudit.push({ orderId: order.id, total });';
  return [importLine, ...clean.split('\n')]
    .join('\n')
    .replace('  notify.orderPlaced(order);', `${auditLine}\n  notify.orderPlaced(order);`)
    .replace('It knows the ports, never the adapters.', 'It also talks to storage directly.');
}

const MEMORY_AUDIT = "/** A simulated in-memory audit store. */\nexport const memoryAudit: { orderId: number; total: number }[] = [];\n";

function hexagonFiles(c: Choices): FileSet {
  const files: FileSet = {};
  for (const [p, t] of Object.entries(APP_FILES)) if (p.startsWith('domain/')) files[p] = t;
  files[`adapters/${ADAPTER_DRIVER[c.driver]}.ts`] = APP_FILES[`adapters/${ADAPTER_DRIVER[c.driver]}.ts`];
  files[`adapters/${ADAPTER_REPO[c.repo]}.ts`] = APP_FILES[`adapters/${ADAPTER_REPO[c.repo]}.ts`];
  files['adapters/StripeLikePayments.ts'] = APP_FILES['adapters/StripeLikePayments.ts'];
  files['adapters/EmailNotifier.ts'] = APP_FILES['adapters/EmailNotifier.ts'];
  if (c.repo === 'postgres') files['lib/orm.ts'] = APP_FILES['lib/orm.ts'];
  if (c.design === 'orm') {
    files['domain/placeOrder.ts'] = ormPlaceOrder(c.repo);
    if (c.repo === 'memory') files['lib/memoryAudit.ts'] = MEMORY_AUDIT;
  }
  files['main.ts'] = mainText(c.repo, c.driver);
  return files;
}

const LAYERED_REPO: Record<RepoChoice, string> = {
  postgres: [
    "import { db } from '../lib/orm';",
    '',
    'export class PostgresOrderRepo {',
    '  save(order: { total: number; status: string }) {',
    "    return db.insert('orders', order);",
    '  }',
    '}',
    '',
  ].join('\n'),
  memory: [
    'export class InMemoryOrderRepo {',
    '  orders: { id: number; total: number; status: string }[] = [];',
    '  save(order: { total: number; status: string }) {',
    '    const saved = { ...order, id: this.orders.length + 1 };',
    '    this.orders.push(saved);',
    '    return saved;',
    '  }',
    '}',
    '',
  ].join('\n'),
};

const layeredService = (repo: RepoChoice) =>
  [
    `import { ${ADAPTER_REPO[repo]} } from './${ADAPTER_REPO[repo]}';`,
    '',
    'export class OrderService {',
    `  private repo = new ${ADAPTER_REPO[repo]}();`,
    '  place(total: number) {',
    "    // the business rule lives here, next to a concrete repository",
    "    const status = total > 500 ? 'needs-approval' : 'paid';",
    '    return this.repo.save({ total, status });',
    '  }',
    '}',
    '',
  ].join('\n');

const LAYERED_TOP: Record<DriverChoice, [string, string]> = {
  http: [
    'OrderController',
    [
      "import { OrderService } from './OrderService';",
      '',
      'export class OrderController {',
      '  private service = new OrderService();',
      '  post(body: { total: number }) {',
      '    return { status: 201, body: this.service.place(body.total) };',
      '  }',
      '}',
      '',
    ].join('\n'),
  ],
  cli: [
    'OrderCli',
    [
      "import { OrderService } from './OrderService';",
      '',
      'export class OrderCli {',
      '  private service = new OrderService();',
      '  run(args: string[]) {',
      '    return this.service.place(Number(args[0])).status;',
      '  }',
      '}',
      '',
    ].join('\n'),
  ],
};

function layeredFiles(c: Choices): FileSet {
  const [top, topText] = LAYERED_TOP[c.driver];
  const files: FileSet = {
    [`layered/${top}.ts`]: topText,
    'layered/OrderService.ts': layeredService(c.repo),
    [`layered/${ADAPTER_REPO[c.repo]}.ts`]: LAYERED_REPO[c.repo],
  };
  if (c.repo === 'postgres') files['lib/orm.ts'] = APP_FILES['lib/orm.ts'];
  return files;
}

/** Every file of the app as the current choices deploy it. */
export const filesFor = (c: Choices): FileSet => (c.view === 'layered' ? layeredFiles(c) : hexagonFiles(c));

/** Files holding the business rule: the domain ring, or the service layer in the layered app. */
export const isCore = (path: string) => path.startsWith('domain/') || path === 'layered/OrderService.ts';

/** Files that differ between two deployments: edited, added or removed. */
export function changedFiles(a: FileSet, b: FileSet): string[] {
  const all = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return all.filter((p) => a[p] !== b[p]);
}

/** Of those, the ones that hold the business rule. */
export const coreChanged = (a: FileSet, b: FileSet) => changedFiles(a, b).filter(isCore);

/** Illustrative test durations, for the speed strip (not measured). */
export const ILLUSTRATIVE_MS = { domain: 2, integration: 180 } as const;
