/**
 * Pure model of a scripted page load: what the preload scanner, the HTML parser, the single
 * main thread and the network do with the resources of one page, in whole milliseconds.
 *
 * The ordering rules are the real ones (HTML spec): a synchronous script pauses the parser and
 * waits for the stylesheets above it; `async` runs as soon as it has arrived and been parsed;
 * `defer` and module scripts run after parsing, in document order, before DOMContentLoaded;
 * nothing paints before every render-blocking stylesheet has arrived. The network is a
 * scripted illustration: fixed round trip, fixed sizes, every download on its own bandwidth.
 */

export type ResId = 'html' | 'main' | 'widgets' | 'analytics' | 'lib' | 'app' | 'font' | 'hero';
export const CSS_IDS = ['main', 'widgets'] as const;
export type CssId = (typeof CSS_IDS)[number];
export const SCRIPT_IDS = ['analytics', 'lib', 'app'] as const;
export type ScriptId = (typeof SCRIPT_IDS)[number];

export type ScriptMode = 'sync' | 'async' | 'defer' | 'module';
export type CssMode = 'normal' | 'print' | 'inline';
export type FontDisplay = 'swap' | 'block';
export type HeroMode = 'css' | 'preload';

export interface Config {
  scripts: Record<ScriptId, ScriptMode>;
  css: Record<CssId, CssMode>;
  fontPreload: boolean;
  fontDisplay: FontDisplay;
  hero: HeroMode;
  /** The browser's preload scanner: reads ahead of a blocked parser and starts every download it can see. */
  scanner: boolean;
  /** Round trip time, ms. */
  rtt: number;
}

export const RESOURCES: Record<ResId, { file: string; kb: number }> = {
  html: { file: 'index.html', kb: 18 },
  main: { file: 'main.css', kb: 40 },
  widgets: { file: 'widgets.css', kb: 25 },
  analytics: { file: 'analytics.js', kb: 30 },
  lib: { file: 'lib.js', kb: 120 },
  app: { file: 'app.js', kb: 25 },
  font: { file: 'inter.woff2', kb: 45 },
  hero: { file: 'hero.jpg', kb: 240 },
};

/** How long each script runs once it may. */
export const EXEC_MS: Record<ScriptId, number> = { analytics: 10, lib: 30, app: 20 };
/** A script that needs another to have run first. */
export const NEEDS: Partial<Record<ScriptId, ScriptId>> = { app: 'lib' };

/** 1 KB per ms: about 8 Mbit/s, and every download gets that on its own. */
export const MS_PER_KB = 1;
export const PARSE_ITEM_MS = 4;
export const PAINT_MS = 10;
/** A change to the page shows in a frame this long after it happens. */
export const REPAINT_MS = 10;
/** How long text stays invisible while a `font-display: block` font loads (about 3 s in current browsers). */
export const BLOCK_MS = 3000;
export const RTTS = [50, 100, 250] as const;

export type Item =
  | { kind: 'preload'; res: 'font' | 'hero' }
  | { kind: 'css'; id: CssId; mode: CssMode }
  | { kind: 'script'; id: ScriptId; mode: ScriptMode }
  | { kind: 'body' }
  | { kind: 'content'; id: 'h1' | 'hero' | 'para' };

/** What the parser meets, in document order. */
export function documentItems(cfg: Config): Item[] {
  const items: Item[] = [];
  if (cfg.fontPreload) items.push({ kind: 'preload', res: 'font' });
  if (cfg.hero === 'preload') items.push({ kind: 'preload', res: 'hero' });
  for (const id of CSS_IDS) items.push({ kind: 'css', id, mode: cfg.css[id] });
  for (const id of SCRIPT_IDS) items.push({ kind: 'script', id, mode: cfg.scripts[id] });
  items.push({ kind: 'body' });
  for (const id of ['h1', 'hero', 'para'] as const) items.push({ kind: 'content', id });
  return items;
}

/** The HTML grows by every stylesheet inlined into it. */
export function htmlKb(cfg: Config): number {
  return RESOURCES.html.kb + CSS_IDS.filter((id) => cfg.css[id] === 'inline').reduce((sum, id) => sum + RESOURCES[id].kb, 0);
}

/** Request to last byte: one round trip, then the bytes. */
export function fetchMs(id: ResId, cfg: Config): number {
  const kb = id === 'html' ? htmlKb(cfg) : RESOURCES[id].kb;
  return cfg.rtt + kb * MS_PER_KB;
}

export interface Task {
  kind: 'parse' | 'exec' | 'paint';
  /** The script or item it was for. */
  id: string;
  start: number;
  end: number;
}

export interface Block {
  on: ScriptId;
  start: number;
  end: number;
}

export interface Fetch {
  start: number;
  done: number;
}

/** What the first painted frame was waiting for. */
export interface PaintGate {
  /** `css`: a render-blocking stylesheet; `parser`: the parser had not yet reached the first content (a script held it up); `main-thread`: a script was running. */
  by: 'css' | 'parser' | 'main-thread';
  /** The stylesheet that arrived last (always set when there is one). */
  css: CssId | null;
  /** Synchronous scripts that paused the parser before <body>. */
  scripts: ScriptId[];
}

export interface Timeline {
  cfg: Config;
  htmlEnd: number;
  fetches: Partial<Record<ResId, Fetch>>;
  tasks: Task[];
  blocks: Block[];
  execAt: Partial<Record<ScriptId, { start: number; end: number }>>;
  /** Scripts in the order they ran. */
  execOrder: ScriptId[];
  parsedAt: Record<string, number>;
  /** When the first content (the heading) is in the DOM: the earliest a frame has anything to draw. */
  contentAt: number;
  parseEndAt: number;
  paintStartAt: number;
  firstPaintAt: number;
  dclAt: number;
  loadAt: number;
  /** When the render-blocking stylesheets were all in (0 when there are none). */
  cssReadyAt: number;
  /** Scripts that ran before one they need. */
  broken: { script: ScriptId; needs: ScriptId }[];
  gate: PaintGate;
}

const isFetched = (item: Item): item is Extract<Item, { kind: 'preload' | 'css' | 'script' }> =>
  item.kind === 'preload' || (item.kind === 'css' && item.mode !== 'inline') || item.kind === 'script';
const resOf = (item: Extract<Item, { kind: 'preload' | 'css' | 'script' }>): ResId => (item.kind === 'preload' ? item.res : item.id);

/** Solve the whole page load: who runs on the main thread when, and what is on screen. */
export function solve(cfg: Config): Timeline {
  const items = documentItems(cfg);
  const htmlEnd = fetchMs('html', cfg);
  const started: Partial<Record<ResId, number>> = {};
  const startFetch = (id: ResId, at: number) => {
    if (started[id] === undefined) started[id] = at;
  };
  const done = (id: ResId) => (started[id] === undefined ? Infinity : started[id] + fetchMs(id, cfg));
  if (cfg.scanner) for (const item of items) if (isFetched(item)) startFetch(resOf(item), htmlEnd);

  const normalCss = CSS_IDS.filter((id) => cfg.css[id] === 'normal');
  const cssDone = () => normalCss.reduce((m, id) => Math.max(m, done(id)), 0);
  /** A script waits for the render-blocking stylesheets that come before it. */
  const cssDoneBefore = (index: number) =>
    items.reduce((m, item, i) => (i < index && item.kind === 'css' && item.mode === 'normal' ? Math.max(m, done(item.id)) : m), 0);
  const indexOfScript = (id: ScriptId) => items.findIndex((it) => it.kind === 'script' && it.id === id);
  const syncReadyAt = (id: ScriptId) => Math.max(done(id), cssDoneBefore(indexOfScript(id)));

  const tasks: Task[] = [];
  const blocks: Block[] = [];
  const execAt: Timeline['execAt'] = {};
  const execOrder: ScriptId[] = [];
  const parsedAt: Record<string, number> = {};
  const asyncPending: ScriptId[] = [];
  const deferList: ScriptId[] = [];
  let deferNext = 0;
  let next = 0;
  let waiting: { id: ScriptId; since: number } | null = null;
  let contentAt = Infinity;
  let parseEndAt = Infinity;
  let painted = false;
  let paintStartAt = Infinity;
  let firstPaintAt = Infinity;
  let lastDeferEnd = -1;
  let t = htmlEnd;

  const runScript = (id: ScriptId) => {
    const end = t + EXEC_MS[id];
    tasks.push({ kind: 'exec', id, start: t, end });
    execAt[id] = { start: t, end };
    execOrder.push(id);
    t = end;
  };

  for (let guard = 0; guard < 10_000; guard++) {
    const paintReadyAt = !painted && contentAt !== Infinity ? Math.max(contentAt, cssDone()) : Infinity;
    if (paintReadyAt <= t) {
      tasks.push({ kind: 'paint', id: 'first paint', start: t, end: t + PAINT_MS });
      painted = true;
      paintStartAt = t;
      t += PAINT_MS;
      firstPaintAt = t;
      continue;
    }
    const asyncReady = asyncPending.filter((id) => done(id) <= t).sort((a, b) => done(a) - done(b) || SCRIPT_IDS.indexOf(a) - SCRIPT_IDS.indexOf(b));
    if (asyncReady.length) {
      asyncPending.splice(asyncPending.indexOf(asyncReady[0]), 1);
      runScript(asyncReady[0]);
      continue;
    }
    if (waiting) {
      if (syncReadyAt(waiting.id) <= t) {
        runScript(waiting.id);
        blocks.push({ on: waiting.id, start: waiting.since, end: t });
        waiting = null;
        if (next >= items.length) parseEndAt = t;
        continue;
      }
    } else if (next < items.length) {
      const item = items[next];
      if (!cfg.scanner && isFetched(item)) startFetch(resOf(item), t);
      const end = t + PARSE_ITEM_MS;
      const label = item.kind === 'content' ? item.id : item.kind === 'body' ? '<body>' : item.kind === 'preload' ? `preload ${item.res}` : item.id;
      tasks.push({ kind: 'parse', id: label, start: t, end });
      t = end;
      next++;
      if (item.kind === 'script') {
        if (item.mode === 'sync') waiting = { id: item.id, since: end };
        else if (item.mode === 'async') asyncPending.push(item.id);
        else deferList.push(item.id);
      } else if (item.kind === 'content') {
        parsedAt[item.id] = end;
        if (item.id === 'h1') contentAt = end;
      } else if (item.kind === 'css') parsedAt[item.id] = end;
      if (next >= items.length && !waiting) parseEndAt = end;
      continue;
    }
    if (parseEndAt !== Infinity && deferNext < deferList.length) {
      const id = deferList[deferNext];
      if (Math.max(done(id), cssDone()) <= t) {
        runScript(id);
        lastDeferEnd = t;
        deferNext++;
        continue;
      }
    }
    const wake = [
      paintReadyAt,
      ...asyncPending.map(done),
      waiting ? syncReadyAt(waiting.id) : Infinity,
      parseEndAt !== Infinity && deferNext < deferList.length ? Math.max(done(deferList[deferNext]), cssDone()) : Infinity,
    ].filter((x) => x > t && x !== Infinity);
    if (!wake.length) break;
    t = Math.min(...wake);
  }

  // The font and the hero are found late (by the CSS) unless a preload hint found them early.
  const applied = (id: CssId) => (cfg.css[id] === 'inline' ? parsedAt[id] : done(id));
  if (!cfg.fontPreload) startFetch('font', Math.max(applied('main'), parsedAt.h1));
  if (cfg.hero !== 'preload') startFetch('hero', Math.max(applied('main'), parsedAt.hero));

  const fetches: Timeline['fetches'] = { html: { start: 0, done: htmlEnd } };
  for (const id of Object.keys(started) as ResId[]) fetches[id] = { start: started[id]!, done: done(id) };

  const dclAt = lastDeferEnd >= 0 ? lastDeferEnd : parseEndAt;
  const loadAt = Math.max(
    dclAt,
    ...execOrder.map((id) => execAt[id]!.end),
    ...CSS_IDS.filter((id) => cfg.css[id] !== 'inline').map((id) => done(id)),
    done('hero'),
  );

  const broken = SCRIPT_IDS.flatMap((script) => {
    const needs = NEEDS[script];
    if (!needs || !execAt[script]) return [];
    const needed = execAt[needs];
    return !needed || needed.end > execAt[script]!.start ? [{ script, needs }] : [];
  });

  const cssReadyAt = cssDone();
  const lastCss = [...normalCss].sort((a, b) => done(b) - done(a))[0] ?? null;
  const gate: PaintGate = {
    by: paintStartAt - Math.max(contentAt, cssReadyAt) > PARSE_ITEM_MS ? 'main-thread' : cssReadyAt > contentAt ? 'css' : 'parser',
    css: lastCss,
    scripts: SCRIPT_IDS.filter((id) => cfg.scripts[id] === 'sync'),
  };

  return {
    cfg, htmlEnd, fetches, tasks, blocks, execAt, execOrder, parsedAt, contentAt, parseEndAt, paintStartAt, firstPaintAt, dclAt, loadAt, cssReadyAt, broken, gate,
  };
}

// ── What is on screen ────────────────────────────────────────────────────

export type TextState = 'none' | 'invisible' | 'fallback' | 'web';
export interface Screen {
  painted: boolean;
  text: TextState;
  hero: boolean;
}

/** What a viewer sees at time `at`. */
export function screenAt(tl: Timeline, at: number): Screen {
  const { cfg } = tl;
  const fontFetch = tl.fetches.font!;
  const heroFetch = tl.fetches.hero!;
  const painted = at >= tl.firstPaintAt;
  const textReady = Math.max(tl.firstPaintAt, tl.parsedAt.h1 + REPAINT_MS);
  const webFrom = Math.max(textReady, fontFetch.done + REPAINT_MS);
  let text: TextState;
  if (!painted || at < textReady) text = 'none';
  else if (at >= webFrom) text = 'web';
  else if (cfg.fontDisplay === 'block' && at >= fontFetch.start && at < fontFetch.start + BLOCK_MS) text = 'invisible';
  else text = 'fallback';
  const hero = painted && at >= Math.max(tl.firstPaintAt, heroFetch.done + REPAINT_MS);
  return { painted, text, hero };
}

// ── The generated <head> ─────────────────────────────────────────────────

export interface HeadLine {
  text: string;
  /** What the line holds up, if anything. */
  blocks: 'parser' | 'render' | null;
}

const SCRIPT_ATTR: Record<ScriptMode, string> = { sync: '', async: ' async', defer: ' defer', module: ' type="module"' };

export function headLines(cfg: Config): HeadLine[] {
  const lines: HeadLine[] = [{ text: '<head>', blocks: null }];
  if (cfg.fontPreload) lines.push({ text: `  <link rel="preload" href="${RESOURCES.font.file}" as="font" crossorigin>`, blocks: null });
  if (cfg.hero === 'preload') lines.push({ text: `  <link rel="preload" href="${RESOURCES.hero.file}" as="image">`, blocks: null });
  for (const id of CSS_IDS) {
    const file = RESOURCES[id].file;
    const mode = cfg.css[id];
    if (mode === 'inline') lines.push({ text: `  <style>/* ${file}, inlined */</style>`, blocks: null });
    else if (mode === 'print') lines.push({ text: `  <link rel="stylesheet" href="${file}" media="print" onload="this.media='all'">`, blocks: null });
    else lines.push({ text: `  <link rel="stylesheet" href="${file}">`, blocks: 'render' });
  }
  for (const id of SCRIPT_IDS) {
    const mode = cfg.scripts[id];
    lines.push({ text: `  <script src="${RESOURCES[id].file}"${SCRIPT_ATTR[mode]}></script>`, blocks: mode === 'sync' ? 'parser' : null });
  }
  lines.push({ text: '</head>', blocks: null });
  return lines;
}

/** The lines of main.css that matter here. */
export function cssExcerpt(cfg: Config): string[] {
  return [
    `@font-face { font-family: Inter; src: url(${RESOURCES.font.file}); font-display: ${cfg.fontDisplay}; }`,
    `.hero { background-image: url(${RESOURCES.hero.file}); }`,
  ];
}

// ── Presets ──────────────────────────────────────────────────────────────

export type PresetId = 'sync' | 'fixed' | 'async-deps';

const BASE: Config = {
  scripts: { analytics: 'sync', lib: 'sync', app: 'sync' },
  css: { main: 'normal', widgets: 'normal' },
  fontPreload: false,
  fontDisplay: 'block',
  hero: 'css',
  scanner: true,
  rtt: 100,
};
const FIXED: Config = {
  ...BASE,
  scripts: { analytics: 'async', lib: 'defer', app: 'defer' },
  css: { main: 'inline', widgets: 'print' },
  fontPreload: true,
  fontDisplay: 'swap',
  hero: 'preload',
};

export const PRESETS: Record<PresetId, { label: string; config: Config; blurb: string }> = {
  sync: { label: 'Everything sync in head', config: BASE, blurb: 'every script a plain <script>, normal stylesheets, nothing preloaded' },
  fixed: { label: 'The fixed version', config: FIXED, blurb: 'critical CSS inlined, scripts deferred, font and hero preloaded' },
  'async-deps': {
    label: 'Async scripts that need each other',
    config: { ...FIXED, scripts: { analytics: 'async', lib: 'async', app: 'async' } },
    blurb: 'app.js needs lib.js, but async gives no order',
  },
};
export const DEFAULT_PRESET: PresetId = 'sync';

/** True when two configs are the same. */
export function sameConfig(a: Config, b: Config): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Reading the timeline ─────────────────────────────────────────────────

/** A resource that blocks nothing: it can arrive whenever. */
export function isNonBlocking(id: ResId, cfg: Config): boolean {
  if (id === 'html') return false;
  if (id === 'font' || id === 'hero') return true;
  if (id === 'main' || id === 'widgets') return cfg.css[id] !== 'normal';
  return cfg.scripts[id] !== 'sync';
}

/** The stylesheets that hold up the first paint (and the scripts below them). */
export const isRenderBlocking = (id: CssId, cfg: Config) => cfg.css[id] === 'normal';
