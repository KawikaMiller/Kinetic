/**
 * Fixed, lesson-authored JavaScript for scenes 1 and 2. The code panels show these lines
 * and run.ts runs exactly these lines, so what passes or fails on screen is real.
 * Postgres and SMTP are simulated: their classes just throw "connection refused".
 */

export type Wiring = 'hardwired' | 'injected' | 'locator';

/** Simulated infrastructure: the real thing would open a socket; these throw as if nothing answered. */
export const INFRA = [
  'class PostgresRepo {',
  '  save(order) {',
  "    throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (simulated)');",
  '  }',
  '}',
  'class SmtpMailer {',
  '  send(to, text) {',
  "    throw new Error('SMTP connection refused (simulated)');",
  '  }',
  '}',
];

const PLACE = [
  '  place(order) {',
  '    const saved = this.repo.save(order);',
  '    this.mailer.send(order.email, `Order ${saved.id} confirmed`);',
  '    return saved;',
  '  }',
];

export const ORDER_SERVICE: Record<Wiring, string[]> = {
  hardwired: [
    'class OrderService {',
    '  constructor() {',
    '    this.repo = new PostgresRepo();',
    '    this.mailer = new SmtpMailer();',
    '  }',
    ...PLACE,
    '}',
  ],
  injected: ['class OrderService {', '  constructor(repo, mailer) {', '    this.repo = repo;', '    this.mailer = mailer;', '  }', ...PLACE, '}'],
  locator: [
    'class OrderService {',
    '  constructor() {}',
    '  place(order) {',
    "    const saved = Registry.get('repo').save(order);",
    "    Registry.get('mailer').send(order.email, `Order ${saved.id} confirmed`);",
    '    return saved;',
    '  }',
    '}',
    '// a global registry, wired for production',
    'const Registry = {',
    '  services: { repo: new PostgresRepo(), mailer: new SmtpMailer() },',
    '  get(name) { return this.services[name]; },',
    '};',
  ],
};

/** Test doubles: an in-memory fake repository and a spy mailer that records what it was asked to send. */
export const DOUBLES = [
  'class FakeRepo {',
  '  constructor() { this.rows = []; }',
  '  save(order) {',
  '    const row = { ...order, id: this.rows.length + 1 };',
  '    this.rows.push(row);',
  '    return row;',
  '  }',
  '}',
  'class SpyMailer {',
  '  constructor() { this.sent = []; }',
  '  send(to, text) { this.sent.push({ to, text }); }',
  '}',
];

const TEST_NAME = "test('place() saves the order and emails a receipt', () => {";
const ORDER = "  const saved = service.place({ email: 'ada@example.com', total: 30 });";

export const TESTS: Record<Wiring, string[]> = {
  hardwired: [TEST_NAME, '  const service = new OrderService();', ORDER, '  expect(saved.id).toBe(1);', '});'],
  injected: [
    TEST_NAME,
    '  const repo = new FakeRepo();',
    '  const mailer = new SpyMailer();',
    '  const service = new OrderService(repo, mailer);',
    ORDER,
    '  expect(saved.id).toBe(1);',
    '  expect(mailer.sent.length).toBe(1);',
    '});',
  ],
  locator: [TEST_NAME, '  const service = new OrderService();', ORDER, '  expect(saved.id).toBe(1);', '});'],
};

/** A ten-line stand-in for a test framework: enough for test() and expect().toBe(). */
export const HARNESS = [
  'function expect(actual) {',
  '  return { toBe(expected) {',
  '    if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);',
  '  } };',
  '}',
  'function test(name, fn) {',
  '  try { fn(); log(`✓ ${name}`, "ok"); passed.push(true); }',
  '  catch (e) { log(`✗ ${name}`, "bad"); log(`  ${e.message}`, "bad"); passed.push(false); }',
  '}',
];

// ---- scene 2: the composition root ----

export type RepoChoice = 'postgres' | 'memory';
export type MailerChoice = 'smtp' | 'console';

export const LOCAL_IMPLS = [
  'class InMemoryRepo {',
  '  constructor() { this.rows = []; }',
  '  save(order) {',
  '    const row = { ...order, id: this.rows.length + 1 };',
  '    this.rows.push(row);',
  '    return row;',
  '  }',
  '}',
  'class ConsoleMailer {',
  '  send(to, text) { log(`mail to ${to}: ${text}`, "ok"); }',
  '}',
];

export const REPO_CLASS: Record<RepoChoice, string> = { postgres: 'PostgresRepo', memory: 'InMemoryRepo' };
export const MAILER_CLASS: Record<MailerChoice, string> = { smtp: 'SmtpMailer', console: 'ConsoleMailer' };

/** main(): the one place that knows the concrete classes. Each choice picks one fixed line. */
export function mainLines(repo: RepoChoice, mailer: MailerChoice): string[] {
  return [
    'function main() {',
    `  const repo = new ${REPO_CLASS[repo]}();`,
    `  const mailer = new ${MAILER_CLASS[mailer]}();`,
    '  return new OrderService(repo, mailer);',
    '}',
    'try {',
    "  const saved = main().place({ email: 'ada@example.com', total: 30 });",
    '  log(`saved order ${saved.id}`, "ok"); passed.push(true);',
    '} catch (e) { log(e.message, "bad"); passed.push(false); }',
  ];
}

/** Classes a block of code constructs with `new`, in order of appearance. */
export const newsIn = (lines: readonly string[]) => [...lines.join('\n').matchAll(/\bnew (\w+)\(/g)].map((m) => m[1]);
