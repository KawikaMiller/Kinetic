/**
 * A tiny dependency-injection container, as a pure model: registrations map a key to a
 * class, the keys it needs, and a lifetime. Resolving builds dependencies first (so the
 * creation order is topological), reuses singletons, and fails on a cycle.
 */

export type Lifetime = 'singleton' | 'transient';

export interface Registration {
  key: string;
  impl: string;
  deps: readonly string[];
  lifetime: Lifetime;
}

export type ContainerEvent =
  | { kind: 'resolve'; key: string; path: string[] }
  | { kind: 'create'; key: string; instance: number; path: string[] }
  | { kind: 'reuse'; key: string; instance: number; path: string[] }
  | { kind: 'cycle'; key: string; path: string[] }
  | { kind: 'missing'; key: string; path: string[] };

export interface Resolution {
  events: ContainerEvent[];
  /** Instances created per key, over every resolve. */
  created: Record<string, number>;
  /** The cycle that stopped resolution, first key repeated at the end, if any. */
  cycle: string[] | null;
  missing: string | null;
}

/** Resolve `root` `times` times in one container (singletons live across resolves). */
export function resolve(regs: readonly Registration[], root: string, times: number): Resolution {
  const byKey = new Map(regs.map((r) => [r.key, r]));
  const created: Record<string, number> = Object.fromEntries(regs.map((r) => [r.key, 0]));
  const singletons = new Map<string, number>();
  const events: ContainerEvent[] = [];
  let cycle: string[] | null = null;
  let missing: string | null = null;

  const build = (key: string, stack: string[]): boolean => {
    const path = [...stack, key];
    if (stack.includes(key)) {
      cycle = [...stack.slice(stack.indexOf(key)), key];
      events.push({ kind: 'cycle', key, path });
      return false;
    }
    const reg = byKey.get(key);
    if (!reg) {
      missing = key;
      events.push({ kind: 'missing', key, path });
      return false;
    }
    if (reg.lifetime === 'singleton' && singletons.has(key)) {
      events.push({ kind: 'reuse', key, instance: singletons.get(key)!, path });
      return true;
    }
    events.push({ kind: 'resolve', key, path });
    for (const d of reg.deps) if (!build(d, path)) return false;
    created[key] += 1;
    if (reg.lifetime === 'singleton') singletons.set(key, created[key]);
    events.push({ kind: 'create', key, instance: created[key], path });
    return true;
  };

  for (let t = 0; t < times; t++) if (!build(root, [])) break;
  return { events, created, cycle, missing };
}

/** The order classes were first created in: dependencies always come before their dependents. */
export const creationOrder = (r: Resolution) => [...new Set(r.events.flatMap((e) => (e.kind === 'create' ? [e.key] : [])))];

export type PresetId = 'shop' | 'cycle';

export const ROOT: Record<PresetId, string> = { shop: 'checkout', cycle: 'orders' };

export const PRESETS: Record<PresetId, Registration[]> = {
  shop: [
    { key: 'checkout', impl: 'CheckoutController', deps: ['orders', 'reports'], lifetime: 'transient' },
    { key: 'orders', impl: 'OrderService', deps: ['repo', 'mailer'], lifetime: 'transient' },
    { key: 'reports', impl: 'ReportService', deps: ['repo', 'clock'], lifetime: 'transient' },
    { key: 'repo', impl: 'InMemoryRepo', deps: [], lifetime: 'singleton' },
    { key: 'mailer', impl: 'ConsoleMailer', deps: [], lifetime: 'singleton' },
    { key: 'clock', impl: 'SystemClock', deps: [], lifetime: 'singleton' },
  ],
  cycle: [
    { key: 'orders', impl: 'OrderService', deps: ['repo', 'audit'], lifetime: 'transient' },
    { key: 'audit', impl: 'AuditLog', deps: ['orders'], lifetime: 'transient' },
    { key: 'repo', impl: 'InMemoryRepo', deps: [], lifetime: 'singleton' },
  ],
};

/** How many times the scene resolves the root, so singleton reuse shows. */
export const RESOLVES = 2;
