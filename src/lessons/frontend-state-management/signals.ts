/**
 * A small signals implementation, enough to teach the idea: `signal` holds a value, `computed` derives
 * one lazily and caches it, `effect` re-runs when what it read changes.
 *
 * Updates are push-then-pull. A write marks everything downstream stale (push), then queued effects run
 * and pull the values they read (pull): a computed recomputes only if one of its own inputs really
 * changed, and an effect runs once per write however many of its inputs changed, so a "diamond"
 * (two computeds sharing one signal, read by one effect) never shows an effect a half-updated mix.
 */

interface Source {
  version: number;
  observers: Set<Observer>;
}

interface Observer {
  notify(): void;
}

let current: Tracker | null = null;
let batchDepth = 0;
const queue = new Set<Effect>();

/** Anything that reads sources: it records which, with the version it saw. */
class Tracker {
  deps = new Map<Source, number>();
  protected collecting: Map<Source, number> | null = null;

  protected begin(self: Tracker): Tracker | null {
    const outer = current;
    current = self;
    this.collecting = new Map();
    return outer;
  }

  protected end(outer: Tracker | null, self: Observer): void {
    current = outer;
    const next = this.collecting!;
    this.collecting = null;
    for (const dep of this.deps.keys()) if (!next.has(dep)) dep.observers.delete(self);
    for (const dep of next.keys()) dep.observers.add(self);
    this.deps = next;
  }

  record(source: Source): void {
    this.collecting?.set(source, source.version);
  }

  /** Pulls every computed this one read, then says whether any input's version moved. */
  protected inputsChanged(): boolean {
    let changed = false;
    for (const [dep, seen] of this.deps) {
      if (dep instanceof Computed) dep.refresh();
      if (dep.version !== seen) changed = true;
    }
    return changed;
  }
}

export class Signal<T> implements Source {
  version = 0;
  observers = new Set<Observer>();
  private value: T;
  constructor(value: T) {
    this.value = value;
  }

  get(): T {
    current?.record(this);
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.version++;
    batch(() => [...this.observers].forEach((o) => o.notify()));
  }
}

export class Computed<T> extends Tracker implements Source, Observer {
  version = 0;
  observers = new Set<Observer>();
  /** How many times the function has actually run. */
  runs = 0;
  private value!: T;
  private stale = true;
  private started = false;
  private fn: () => T;
  private onRun?: () => void;
  constructor(fn: () => T, onRun?: () => void) {
    super();
    this.fn = fn;
    this.onRun = onRun;
  }

  get(): T {
    this.refresh();
    current?.record(this);
    return this.value;
  }

  refresh(): void {
    if (!this.stale) return;
    if (this.started && !this.inputsChanged()) {
      this.stale = false;
      return;
    }
    const outer = this.begin(this);
    let next: T;
    try {
      next = this.fn();
    } finally {
      this.end(outer, this);
    }
    this.runs++;
    this.onRun?.();
    if (!this.started || !Object.is(next, this.value)) {
      this.value = next;
      this.version++;
    }
    this.started = true;
    this.stale = false;
  }

  notify(): void {
    if (this.stale) return;
    this.stale = true;
    this.observers.forEach((o) => o.notify());
  }
}

export class Effect extends Tracker implements Observer {
  /** How many times the function has run. */
  runs = 0;
  private disposed = false;
  private fn: () => void;
  constructor(fn: () => void) {
    super();
    this.fn = fn;
    this.execute();
  }

  notify(): void {
    if (!this.disposed) queue.add(this);
  }

  /** Runs only if something it read has really changed since it last ran. */
  runIfNeeded(): void {
    if (!this.disposed && this.inputsChanged()) this.execute();
  }

  private execute(): void {
    const outer = this.begin(this);
    try {
      this.fn();
    } finally {
      this.end(outer, this);
    }
    this.runs++;
  }

  dispose(): void {
    this.disposed = true;
    for (const dep of this.deps.keys()) dep.observers.delete(this);
    this.deps.clear();
  }
}

/** Defers effects until `fn` returns, so several writes make each effect run once. */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      while (queue.size) {
        const next = queue.values().next().value!;
        queue.delete(next);
        next.runIfNeeded();
      }
    }
  }
}

export const signal = <T>(value: T): Signal<T> => new Signal(value);
export const computed = <T>(fn: () => T, onRun?: () => void): Computed<T> => new Computed(fn, onRun);
export const effect = (fn: () => void): Effect => new Effect(fn);
