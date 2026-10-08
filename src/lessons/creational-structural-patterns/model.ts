/**
 * creational-structural-patterns: the pure model. The factory's touched-site count is computed
 * by generating the code before and after adding a provider and diffing it; the builder's
 * validation is the one rule list the caption prints; the adapter and the decorator stack are
 * real JavaScript that the stage replays from a recorded trace.
 */

// ── Factory ────────────────────────────────────────────────────────

export const PROVIDERS = ['stripe', 'paypal'] as const;
export const NEW_PROVIDER = 'adyen';
const CLASS: Record<string, string> = { stripe: 'StripeClient', paypal: 'PaypalClient', adyen: 'AdyenClient' };

/** The four places in the app that need a payment client. */
export const CALL_SITES = ['checkout.ts', 'refunds.ts', 'subscriptions.ts', 'webhooks.ts'];
export const FACTORY_FILE = 'payments.ts';

export interface SourceFile {
  name: string;
  lines: string[];
}

/** The app's code for a set of providers, with or without a factory. */
export function appCode(providers: readonly string[], factory: boolean): SourceFile[] {
  const pick = providers.map((p, i) => (i < providers.length - 1 ? `config.provider === '${p}' ? new ${CLASS[p]}(config) :` : `new ${CLASS[p]}(config)`)).join(' ');
  if (!factory) return CALL_SITES.map((name) => ({ name, lines: [`const client = ${pick};`] }));
  return [
    {
      name: FACTORY_FILE,
      lines: ['export function createPaymentClient(config) {', ...providers.map((p) => `  if (config.provider === '${p}') return new ${CLASS[p]}(config);`), "  throw new Error('unknown provider');", '}'],
    },
    ...CALL_SITES.map((name) => ({ name, lines: ['const client = createPaymentClient(config);'] })),
  ];
}

/** Files whose text changes when the new provider is added: the places a reviewer has to touch. */
export function touchedFiles(factory: boolean): string[] {
  const before = appCode(PROVIDERS, factory);
  const after = appCode([...PROVIDERS, NEW_PROVIDER], factory);
  return after.filter((f) => before.find((b) => b.name === f.name)?.lines.join('\n') !== f.lines.join('\n')).map((f) => f.name);
}

// ── Builder ────────────────────────────────────────────────────────

export const ARG_NAMES = ['url', 'method', 'body', 'followRedirects', 'retries', 'timeoutMs', 'cache'];
export const REQUEST_URL = 'https://api.example.com/users';
const BODY_TEXT = '{"name":"Ada"}';

export interface RequestSpec {
  url: string;
  method: 'GET' | 'POST';
  body: string | null;
  followRedirects: boolean;
  retries: number;
  timeoutMs: number;
  cache: boolean;
}

/** The rules build() enforces, in the order it checks them. The caption lists exactly these. */
export const BUILD_RULES: { id: string; text: string; broken: (r: RequestSpec) => boolean }[] = [
  { id: 'getBody', text: 'a GET request cannot have a body (this builder, like fetch, refuses it)', broken: (r) => r.method === 'GET' && r.body !== null },
  { id: 'postBody', text: 'a POST request needs a body', broken: (r) => r.method === 'POST' && r.body === null },
  { id: 'retries', text: 'retries must be 0 to 5', broken: (r) => r.retries < 0 || r.retries > 5 },
  { id: 'timeout', text: 'the timeout must be above 0 ms', broken: (r) => r.timeoutMs <= 0 },
];

export class RequestBuilder {
  private spec: RequestSpec;
  constructor(url: string) {
    this.spec = { url, method: 'GET', body: null, followRedirects: true, retries: 0, timeoutMs: 10_000, cache: false };
  }
  method(m: RequestSpec['method']) {
    this.spec.method = m;
    return this;
  }
  body(b: string) {
    this.spec.body = b;
    return this;
  }
  followRedirects(on: boolean) {
    this.spec.followRedirects = on;
    return this;
  }
  retries(n: number) {
    this.spec.retries = n;
    return this;
  }
  timeout(ms: number) {
    this.spec.timeoutMs = ms;
    return this;
  }
  cache(on: boolean) {
    this.spec.cache = on;
    return this;
  }
  /** Validates the whole request at once: every broken rule, or the finished request. */
  build(): { ok: true; request: RequestSpec } | { ok: false; errors: string[] } {
    const errors = BUILD_RULES.filter((r) => r.broken(this.spec)).map((r) => r.text);
    return errors.length ? { ok: false, errors } : { ok: true, request: { ...this.spec } };
  }
}

export interface BuilderChoice {
  method: 'GET' | 'POST';
  body: boolean;
  retries: 3 | 9;
  timeoutMs: 5000 | 0;
}
export const DEFAULT_CHOICE: BuilderChoice = { method: 'GET', body: false, retries: 3, timeoutMs: 5000 };
/** The two settings the controls leave alone: both versions say so, so the requests match argument for argument. */
export const FIXED = { followRedirects: true, cache: false } as const;

/** The seven positional arguments, as source text, for the current choice. */
export const positionalArgs = (c: BuilderChoice): string[] => [
  `'${REQUEST_URL}'`,
  `'${c.method}'`,
  c.body ? `'${BODY_TEXT}'` : 'null',
  String(FIXED.followRedirects),
  String(c.retries),
  String(c.timeoutMs),
  String(FIXED.cache),
];

export function buildFrom(c: BuilderChoice) {
  const b = new RequestBuilder(REQUEST_URL).method(c.method).followRedirects(FIXED.followRedirects).retries(c.retries).timeout(c.timeoutMs).cache(FIXED.cache);
  if (c.body) b.body(BODY_TEXT);
  return b.build();
}

export function builderLines(c: BuilderChoice): string[] {
  return [
    `const req = new RequestBuilder('${REQUEST_URL}')`,
    `  .method('${c.method}')`,
    ...(c.body ? [`  .body('${BODY_TEXT}')`] : []),
    `  .followRedirects(${FIXED.followRedirects})`,
    `  .retries(${c.retries})`,
    `  .timeout(${c.timeoutMs})`,
    `  .cache(${FIXED.cache})`,
    '  .build();',
  ];
}

export const ALL_CHOICES: BuilderChoice[] = (['GET', 'POST'] as const).flatMap((method) =>
  [false, true].flatMap((body) => ([3, 9] as const).flatMap((retries) => ([5000, 0] as const).map((timeoutMs) => ({ method, body, retries, timeoutMs })))),
);

// ── Adapter ────────────────────────────────────────────────────────

/** What the app's code expects from any weather source. */
export interface Weather {
  tempC: number;
  sky: string;
}

/** The legacy client: a fixed XML report, in Fahrenheit. */
export const LEGACY_XML = '<report><temp unit="F">68</temp><sky>clear</sky></report>';
export const legacyWeather = { fetchReport: () => LEGACY_XML };

/** The adapter: the interface the app wants, implemented on top of the one it has. */
export function xmlWeatherAdapter(legacy: { fetchReport(): string }) {
  return {
    current(): Weather {
      const xml = legacy.fetchReport();
      const f = Number(/<temp unit="F">([\d.-]+)<\/temp>/.exec(xml)![1]);
      const sky = /<sky>(\w+)<\/sky>/.exec(xml)![1];
      return { tempC: Math.round(((f - 32) * 5) / 9), sky };
    },
  };
}

export const ADAPTER_CODE = [
  'const weather = {',
  '  current() {',
  '    const xml = legacy.fetchReport();',
  '    const f = Number(/<temp unit="F">([\\d.-]+)<\\/temp>/.exec(xml)[1]);',
  '    const sky = /<sky>(\\w+)<\\/sky>/.exec(xml)[1];',
  '    return { tempC: Math.round(((f - 32) * 5) / 9), sky };',
  '  },',
  '};',
];

// ── Decorator ──────────────────────────────────────────────────────

export type LayerId = 'logging' | 'caching' | 'retry' | 'timing';
export const LAYERS: LayerId[] = ['logging', 'caching', 'retry', 'timing'];

/** Illustrative simulated times, in ms (labelled so on screen). */
export const TIME = { coreOk: 120, coreFail: 300, backoff: 100, cacheHit: 1 } as const;
/** The fixed failure script: the core's first call times out, every later one succeeds. */
export const CORE_FAILS_ON = [1];
/** The scenario: fetchUser(42) is called twice in a row. */
export const CALLS = 2;
export const MAX_ATTEMPTS = 2;

export type TraceEvent =
  | { kind: 'enter'; layer: LayerId | 'core'; call: number }
  | { kind: 'exit'; layer: LayerId | 'core'; call: number; ok: boolean }
  | { kind: 'hit'; layer: 'caching'; call: number }
  | { kind: 'store'; layer: 'caching'; call: number }
  | { kind: 'retry'; layer: 'retry'; call: number; attempt: number }
  | { kind: 'log'; layer: LayerId | 'core'; call: number; text: string };

type Fetch = (id: number) => { name: string };

/** Run the scenario with the layers in `order` (outermost first). Real higher-order functions. */
export function runStack(order: readonly LayerId[]): { trace: TraceEvent[]; coreCalls: number; results: string[]; logs: string[] } {
  const trace: TraceEvent[] = [];
  const logs: string[] = [];
  let clock = 0;
  let coreCalls = 0;
  let call = 0;
  const say = (layer: LayerId | 'core', text: string) => {
    logs.push(`${layer}: ${text}`);
    trace.push({ kind: 'log', layer, call, text });
  };

  const core: Fetch = (id) => {
    coreCalls++;
    trace.push({ kind: 'enter', layer: 'core', call });
    if (CORE_FAILS_ON.includes(coreCalls)) {
      clock += TIME.coreFail;
      trace.push({ kind: 'exit', layer: 'core', call, ok: false });
      say('core', `fetchUser(${id}) timed out`);
      throw new Error('timeout');
    }
    clock += TIME.coreOk;
    trace.push({ kind: 'exit', layer: 'core', call, ok: true });
    say('core', `fetchUser(${id}) → Ada`);
    return { name: 'Ada' };
  };

  const wrap: Record<LayerId, (next: Fetch) => Fetch> = {
    logging: (next) => (id) => {
      trace.push({ kind: 'enter', layer: 'logging', call });
      say('logging', `→ fetchUser(${id})`);
      try {
        const r = next(id);
        trace.push({ kind: 'exit', layer: 'logging', call, ok: true });
        say('logging', `← ${r.name}`);
        return r;
      } catch (e) {
        trace.push({ kind: 'exit', layer: 'logging', call, ok: false });
        say('logging', `✕ ${(e as Error).message}`);
        throw e;
      }
    },
    caching: (next) => {
      const cache = new Map<number, { name: string }>();
      return (id) => {
        trace.push({ kind: 'enter', layer: 'caching', call });
        const hit = cache.get(id);
        if (hit) {
          clock += TIME.cacheHit;
          trace.push({ kind: 'hit', layer: 'caching', call });
          say('caching', `hit for ${id}`);
          trace.push({ kind: 'exit', layer: 'caching', call, ok: true });
          return hit;
        }
        say('caching', `miss for ${id}`);
        try {
          const r = next(id);
          cache.set(id, r);
          trace.push({ kind: 'store', layer: 'caching', call });
          trace.push({ kind: 'exit', layer: 'caching', call, ok: true });
          return r;
        } catch (e) {
          trace.push({ kind: 'exit', layer: 'caching', call, ok: false });
          throw e;
        }
      };
    },
    retry: (next) => (id) => {
      trace.push({ kind: 'enter', layer: 'retry', call });
      for (let attempt = 1; ; attempt++) {
        try {
          const r = next(id);
          trace.push({ kind: 'exit', layer: 'retry', call, ok: true });
          return r;
        } catch (e) {
          if (attempt >= MAX_ATTEMPTS) {
            trace.push({ kind: 'exit', layer: 'retry', call, ok: false });
            throw e;
          }
          clock += TIME.backoff;
          trace.push({ kind: 'retry', layer: 'retry', call, attempt: attempt + 1 });
          say('retry', `attempt ${attempt} failed, retrying after ${TIME.backoff} ms`);
        }
      }
    },
    timing: (next) => (id) => {
      trace.push({ kind: 'enter', layer: 'timing', call });
      const start = clock;
      let ok = false;
      try {
        const r = next(id);
        ok = true;
        return r;
      } finally {
        trace.push({ kind: 'exit', layer: 'timing', call, ok });
        say('timing', `${clock - start} ms`);
      }
    },
  };

  // Wrap from the inside out, so order[0] ends up outermost.
  const fetchUser = [...order].reverse().reduce<Fetch>((inner, layer) => wrap[layer](inner), core);
  const results: string[] = [];
  for (call = 1; call <= CALLS; call++) {
    try {
      results.push(fetchUser(42).name);
    } catch (e) {
      results.push(`error: ${(e as Error).message}`);
    }
  }
  return { trace, coreCalls, results, logs };
}

/** Every ordering of the given layers. */
export function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export const DECORATOR_PRESETS: { id: string; label: string; order: LayerId[] }[] = [
  { id: 'cacheOut', label: 'caching outside retry', order: ['logging', 'caching', 'retry', 'timing'] },
  { id: 'retryOut', label: 'retry outside caching', order: ['logging', 'retry', 'caching', 'timing'] },
  { id: 'logIn', label: 'logging inside caching', order: ['timing', 'caching', 'logging', 'retry'] },
];

// ── Recognise it ───────────────────────────────────────────────────

export type PatternId = 'factory' | 'builder' | 'adapter' | 'decorator';
export const SIGHTINGS: { pattern: PatternId; where: string; code: string }[] = [
  { pattern: 'factory', where: 'Array.from and document.createElement', code: "Array.from(set) · document.createElement('div')" },
  { pattern: 'builder', where: 'query builders (Knex-style)', code: "db('users').where({ id: 42 }).limit(1)" },
  { pattern: 'adapter', where: 'a wrapper giving an old API the shape you need', code: 'const fetchLike = adaptXhr(xhr)' },
  { pattern: 'decorator', where: 'Express middleware (decorator-like: a chain of handlers), React higher-order components', code: 'app.use(logger) · withAuth(Profile)' },
];
