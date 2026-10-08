import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BLOCK_MS, CSS_IDS, EXEC_MS, PARSE_ITEM_MS, PAINT_MS, PRESETS, REPAINT_MS, RESOURCES, RTTS, SCRIPT_IDS,
  cssExcerpt, documentItems, fetchMs, headLines, htmlKb, isNonBlocking, screenAt, solve,
  type Config, type CssId, type CssMode, type ResId, type ScriptId, type ScriptMode, type Timeline,
} from './model';

// ── Every configuration the controls can make ───────────────────────────

const SCRIPT_MODES: ScriptMode[] = ['sync', 'async', 'defer', 'module'];
const CSS_MODES: CssMode[] = ['normal', 'print', 'inline'];

function allConfigs(): Config[] {
  const out: Config[] = [];
  const pickScripts = SCRIPT_MODES.flatMap((analytics) => SCRIPT_MODES.flatMap((lib) => SCRIPT_MODES.map((app) => ({ analytics, lib, app }))));
  const pickCss = CSS_MODES.flatMap((main) => CSS_MODES.map((widgets) => ({ main, widgets })));
  for (const scripts of pickScripts) {
    for (const css of pickCss) {
      for (const fontPreload of [false, true]) {
        for (const fontDisplay of ['swap', 'block'] as const) {
          for (const hero of ['css', 'preload'] as const) {
            for (const scanner of [true, false]) {
              for (const rtt of RTTS) out.push({ scripts, css, fontPreload, fontDisplay, hero, scanner, rtt });
            }
          }
        }
      }
    }
  }
  return out;
}
const ALL = allConfigs();

// ── An independent reference: the same rules, one millisecond at a time ──

interface Ref {
  firstPaintAt: number;
  parseEndAt: number;
  dclAt: number;
  loadAt: number;
  exec: Partial<Record<ScriptId, [number, number]>>;
  start: Partial<Record<ResId, number>>;
}

/**
 * No event jumping and no shared helpers: tick every millisecond from the moment the HTML is in,
 * and each tick the idle main thread starts the first thing that is allowed to start.
 */
function reference(cfg: Config): Ref {
  const kb = (id: ResId) => (id === 'html' ? RESOURCES.html.kb + CSS_IDS.filter((c) => cfg.css[c] === 'inline').reduce((s, c) => s + RESOURCES[c].kb, 0) : RESOURCES[id].kb);
  const dur = (id: ResId) => cfg.rtt + kb(id);
  const htmlEnd = dur('html');
  const start: Partial<Record<ResId, number>> = {};
  const note = (id: ResId, t: number) => {
    if (start[id] === undefined) start[id] = t;
  };
  const arrived = (id: ResId, t: number) => start[id] !== undefined && start[id]! + dur(id) <= t;

  const order: { what: string; res?: ResId; css?: CssId; script?: ScriptId; mode?: string }[] = [];
  if (cfg.fontPreload) order.push({ what: 'hint', res: 'font' });
  if (cfg.hero === 'preload') order.push({ what: 'hint', res: 'hero' });
  for (const c of CSS_IDS) order.push({ what: 'css', res: cfg.css[c] === 'inline' ? undefined : c, css: c, mode: cfg.css[c] });
  for (const s of SCRIPT_IDS) order.push({ what: 'script', res: s, script: s, mode: cfg.scripts[s] });
  order.push({ what: 'body' }, { what: 'h1' }, { what: 'hero' }, { what: 'para' });

  if (cfg.scanner) for (const o of order) if (o.res) note(o.res, htmlEnd);

  const normal = CSS_IDS.filter((c) => cfg.css[c] === 'normal');
  const allNormalIn = (t: number) => normal.every((c) => arrived(c, t));
  const normalBeforeIn = (scriptId: ScriptId, t: number) => {
    const at = order.findIndex((o) => o.script === scriptId);
    return order.slice(0, at).filter((o) => o.what === 'css' && o.mode === 'normal').every((o) => arrived(o.css!, t));
  };

  let busyUntil = 0;
  let idx = 0;
  let waitScript: ScriptId | null = null;
  const asyncTags: ScriptId[] = [];
  const deferTags: ScriptId[] = [];
  let deferIdx = 0;
  let h1Done = Infinity;
  let heroTag = Infinity;
  let parseEnd = Infinity;
  let painted = false;
  let paintEnd = Infinity;
  let lastDeferEnd = -1;
  const exec: Partial<Record<ScriptId, [number, number]>> = {};
  const parseEndOf: Record<string, number> = {};

  const run = (id: ScriptId, t: number) => {
    exec[id] = [t, t + EXEC_MS[id]];
    busyUntil = t + EXEC_MS[id];
  };

  for (let t = htmlEnd; t < 30_000; t++) {
    if (t < busyUntil) continue;
    if (!painted && h1Done <= t && allNormalIn(t)) {
      painted = true;
      busyUntil = t + PAINT_MS;
      paintEnd = t + PAINT_MS;
      continue;
    }
    const ready = asyncTags.filter((s) => !exec[s] && arrived(s, t));
    if (ready.length) {
      ready.sort((a, b) => start[a]! + dur(a) - (start[b]! + dur(b)) || SCRIPT_IDS.indexOf(a) - SCRIPT_IDS.indexOf(b));
      run(ready[0], t);
      continue;
    }
    if (waitScript) {
      if (arrived(waitScript, t) && normalBeforeIn(waitScript, t)) {
        run(waitScript, t);
        waitScript = null;
        if (idx >= order.length) parseEnd = busyUntil;
      }
      continue;
    }
    if (idx < order.length) {
      const o = order[idx++];
      if (!cfg.scanner && o.res) note(o.res, t);
      busyUntil = t + PARSE_ITEM_MS;
      if (o.script) {
        if (o.mode === 'sync') waitScript = o.script;
        else if (o.mode === 'async') asyncTags.push(o.script);
        else deferTags.push(o.script);
      }
      if (o.what === 'h1') h1Done = busyUntil;
      if (o.what === 'hero') heroTag = busyUntil;
      if (o.css) parseEndOf[`css-${o.css}`] = busyUntil;
      if (idx >= order.length && !waitScript) parseEnd = busyUntil;
      continue;
    }
    if (parseEnd !== Infinity && deferIdx < deferTags.length) {
      const s = deferTags[deferIdx];
      if (arrived(s, t) && allNormalIn(t)) {
        run(s, t);
        lastDeferEnd = busyUntil;
        deferIdx++;
      }
    }
    if (painted && idx >= order.length && !waitScript && deferIdx >= deferTags.length && asyncTags.every((s) => exec[s])) break;
  }

  const appliedMain = cfg.css.main === 'inline' ? parseEndOf['css-main'] : start.main! + dur('main');
  if (!cfg.fontPreload) note('font', Math.max(appliedMain, h1Done));
  if (cfg.hero !== 'preload') note('hero', Math.max(appliedMain, heroTag));
  const dclAt = lastDeferEnd >= 0 ? lastDeferEnd : parseEnd;
  const ends = [dclAt, ...Object.values(exec).map((e) => e![1]), start.hero! + dur('hero')];
  for (const c of CSS_IDS) if (cfg.css[c] !== 'inline') ends.push(start[c]! + dur(c));
  return { firstPaintAt: paintEnd, parseEndAt: parseEnd, dclAt, loadAt: Math.max(...ends), exec, start };
}

// ── Hand-worked presets ──────────────────────────────────────────────────

describe('the presets, worked by hand', () => {
  it('"everything sync in head" at a 100 ms round trip', () => {
    const tl = solve(PRESETS.sync.config);
    // 18 KB of HTML + 100 ms: the HTML is in at 118. The scanner starts every markup download then.
    expect(tl.htmlEnd).toBe(118);
    expect(tl.fetches.main).toEqual({ start: 118, done: 258 });
    expect(tl.fetches.lib).toEqual({ start: 118, done: 338 });
    // analytics waits for main.css (258) and runs 10 ms; lib.js is in at 338 and runs 30 ms; app.js (in at 243) follows.
    expect(tl.execAt.analytics).toEqual({ start: 258, end: 268 });
    expect(tl.execAt.lib).toEqual({ start: 338, end: 368 });
    expect(tl.execAt.app).toEqual({ start: 372, end: 392 });
    // Then <body> (392-396), the heading (396-400): content exists at 400, and the paint takes 10 ms.
    expect(tl.contentAt).toBe(400);
    expect(tl.firstPaintAt).toBe(410);
    expect(tl.parseEndAt).toBe(418);
    expect(tl.dclAt).toBe(418);
    expect(tl.blocks.map((b) => [b.on, b.start, b.end])).toEqual([['analytics', 130, 268], ['lib', 272, 368], ['app', 372, 392]]);
    // The font is found when main.css has arrived and the heading exists; the hero when its element has been parsed.
    expect(tl.fetches.font).toEqual({ start: 400, done: 545 });
    expect(tl.fetches.hero).toEqual({ start: 414, done: 754 });
    expect(tl.loadAt).toBe(754);
    expect(tl.gate.by).toBe('parser');
    expect(tl.broken).toEqual([]);
  });

  it('"the fixed version": inline CSS, deferred scripts, preloads; paint no longer waits for any script', () => {
    const tl = solve(PRESETS.fixed.config);
    // The HTML carries main.css (18 + 40 KB), so it lands at 158.
    expect(htmlKb(PRESETS.fixed.config)).toBe(58);
    expect(tl.htmlEnd).toBe(158);
    expect(tl.contentAt).toBe(194);
    expect(tl.firstPaintAt).toBe(204);
    expect(tl.parseEndAt).toBe(212);
    // async analytics runs when it lands (288); the deferred pair runs after parsing, lib then app, once lib is in (378).
    expect(tl.execAt.analytics).toEqual({ start: 288, end: 298 });
    expect(tl.execAt.lib).toEqual({ start: 378, end: 408 });
    expect(tl.execAt.app).toEqual({ start: 408, end: 428 });
    expect(tl.dclAt).toBe(428);
    expect(tl.fetches.font).toEqual({ start: 158, done: 303 });
    expect(tl.fetches.hero).toEqual({ start: 158, done: 498 });
    expect(tl.loadAt).toBe(498);
    expect(tl.blocks).toEqual([]);
    expect(tl.broken).toEqual([]);
  });

  it('"async scripts that need each other": app.js runs first and breaks', () => {
    const tl = solve(PRESETS['async-deps'].config);
    expect(tl.execAt.app!.start).toBeLessThan(tl.execAt.lib!.start);
    expect(tl.execAt.app).toEqual({ start: 283, end: 303 });
    expect(tl.execAt.lib).toEqual({ start: 378, end: 408 });
    expect(tl.broken).toEqual([{ script: 'app', needs: 'lib' }]);
    // async scripts do not hold up DOMContentLoaded.
    expect(tl.dclAt).toBe(tl.parseEndAt);
    expect(tl.dclAt).toBeLessThan(tl.execAt.lib!.end);
  });

  it('with the same configuration but defer, the order is lib then app and nothing breaks', () => {
    const cfg = { ...PRESETS['async-deps'].config, scripts: { analytics: 'async', lib: 'defer', app: 'defer' } as Config['scripts'] };
    const tl = solve(cfg);
    expect(tl.execOrder).toEqual(['analytics', 'lib', 'app']);
    expect(tl.broken).toEqual([]);
  });

  it('a slower network moves first paint later by whole round trips, not by the same constant', () => {
    const base = PRESETS.sync.config;
    const fast = solve({ ...base, rtt: 50 });
    const slow = solve({ ...base, rtt: 250 });
    expect(fast.firstPaintAt).toBeLessThan(solve(base).firstPaintAt);
    expect(solve(base).firstPaintAt).toBeLessThan(slow.firstPaintAt);
  });
});

describe('what is on screen', () => {
  it('"everything sync": nothing, then an empty page while the block-period font loads, then the web font, then the hero', () => {
    const tl = solve(PRESETS.sync.config);
    expect(screenAt(tl, 409)).toEqual({ painted: false, text: 'none', hero: false });
    expect(screenAt(tl, 410)).toEqual({ painted: true, text: 'invisible', hero: false });
    expect(screenAt(tl, 554).text).toBe('invisible');
    // The font finishes at 545; it shows in the next frame, REPAINT_MS later.
    expect(545 + REPAINT_MS).toBe(555);
    expect(screenAt(tl, 555).text).toBe('web');
    expect(screenAt(tl, 763).hero).toBe(false);
    expect(screenAt(tl, 764).hero).toBe(true);
  });

  it('with font-display: swap the text shows in a fallback font immediately, then swaps', () => {
    const tl = solve({ ...PRESETS.sync.config, fontDisplay: 'swap' });
    expect(screenAt(tl, 410).text).toBe('fallback');
    expect(screenAt(tl, 555).text).toBe('web');
  });

  it('block hides text for at most the block period, then shows the fallback until the font arrives', () => {
    // A font that arrives after the block period: a huge round trip (not a control value, so build the timeline by hand).
    const tl: Timeline = solve({ ...PRESETS.sync.config, rtt: 250 });
    const font = tl.fetches.font!;
    const late: Timeline = { ...tl, fetches: { ...tl.fetches, font: { start: font.start, done: font.start + BLOCK_MS + 500 } } };
    expect(screenAt(late, font.start + BLOCK_MS - 1).text).toBe('invisible');
    expect(screenAt(late, font.start + BLOCK_MS).text).toBe('fallback');
    expect(screenAt(late, font.start + BLOCK_MS + 500 + REPAINT_MS).text).toBe('web');
  });

  it('the fixed version shows fallback text at first paint and the hero by the time it has loaded', () => {
    const tl = solve(PRESETS.fixed.config);
    expect(screenAt(tl, tl.firstPaintAt).text).toBe('fallback');
    expect(screenAt(tl, 313).text).toBe('web');
    expect(screenAt(tl, 507).hero).toBe(false);
    expect(screenAt(tl, 508).hero).toBe(true);
  });
});

// ── Rules that must hold for every configuration ─────────────────────────

describe('the loading rules, for every configuration the controls can make', () => {
  it('there are 27648 of them, and each finishes with every script run once', () => {
    expect(ALL).toHaveLength(27648);
    for (const cfg of ALL) {
      const tl = solve(cfg);
      expect([...tl.execOrder].sort()).toEqual([...SCRIPT_IDS].sort());
    }
  });

  it('the main thread does one thing at a time, in order', () => {
    for (const cfg of ALL) {
      const { tasks } = solve(cfg);
      for (let i = 0; i < tasks.length; i++) {
        expect(tasks[i].end).toBeGreaterThan(tasks[i].start);
        if (i) expect(tasks[i].start, JSON.stringify(cfg)).toBeGreaterThanOrEqual(tasks[i - 1].end);
      }
    }
  });

  it('first paint never comes before every render-blocking stylesheet has arrived, nor before the first content exists', () => {
    for (const cfg of ALL) {
      const tl = solve(cfg);
      for (const id of CSS_IDS) {
        if (cfg.css[id] === 'normal') expect(tl.paintStartAt, `${id} ${JSON.stringify(cfg)}`).toBeGreaterThanOrEqual(tl.fetches[id]!.done);
      }
      expect(tl.paintStartAt).toBeGreaterThanOrEqual(tl.contentAt);
      expect(tl.firstPaintAt).toBe(tl.paintStartAt + PAINT_MS);
    }
  });

  it('a synchronous script waits to run for its download and for every render-blocking stylesheet above it, and holds the parser', () => {
    for (const cfg of ALL) {
      const tl = solve(cfg);
      const items = documentItems(cfg);
      for (const id of SCRIPT_IDS) {
        if (cfg.scripts[id] !== 'sync') continue;
        const run = tl.execAt[id]!;
        expect(run.start).toBeGreaterThanOrEqual(tl.fetches[id]!.done);
        const here = items.findIndex((it) => it.kind === 'script' && it.id === id);
        items.forEach((it, i) => {
          if (i < here && it.kind === 'css' && it.mode === 'normal') expect(run.start).toBeGreaterThanOrEqual(tl.fetches[it.id]!.done);
        });
        // The parser is parked from the end of the script's tag until the script has run: it parses nothing in between.
        const tag = tl.tasks.find((t) => t.kind === 'parse' && t.id === id)!;
        const parsedInBetween = tl.tasks.filter((t) => t.kind === 'parse' && t.start >= tag.end && t.start < run.end);
        expect(parsedInBetween).toEqual([]);
        const block = tl.blocks.find((b) => b.on === id)!;
        expect(block.start).toBe(tag.end);
        expect(block.end).toBe(run.end);
      }
      expect(tl.blocks).toHaveLength(SCRIPT_IDS.filter((id) => cfg.scripts[id] === 'sync').length);
    }
  });

  it('async scripts run once they have arrived and their tag was parsed, and do not hold up DOMContentLoaded', () => {
    for (const cfg of ALL) {
      const tl = solve(cfg);
      for (const id of SCRIPT_IDS) {
        if (cfg.scripts[id] !== 'async') continue;
        expect(tl.execAt[id]!.start).toBeGreaterThanOrEqual(tl.fetches[id]!.done);
      }
      const defers = SCRIPT_IDS.filter((id) => cfg.scripts[id] === 'defer' || cfg.scripts[id] === 'module');
      const expected = defers.length ? tl.execAt[defers.at(-1)!]!.end : tl.parseEndAt;
      expect(tl.dclAt).toBe(expected);
    }
  });

  it('defer and module scripts run after parsing, in document order, before DOMContentLoaded, once their stylesheets are in', () => {
    for (const cfg of ALL) {
      const tl = solve(cfg);
      const defers = SCRIPT_IDS.filter((id) => cfg.scripts[id] === 'defer' || cfg.scripts[id] === 'module');
      let previousEnd = tl.parseEndAt;
      for (const id of defers) {
        const run = tl.execAt[id]!;
        expect(run.start, `${id} ${JSON.stringify(cfg)}`).toBeGreaterThanOrEqual(previousEnd);
        expect(run.start).toBeGreaterThanOrEqual(tl.fetches[id]!.done);
        for (const css of CSS_IDS) if (cfg.css[css] === 'normal') expect(run.start).toBeGreaterThanOrEqual(tl.fetches[css]!.done);
        previousEnd = run.end;
      }
      expect(tl.dclAt).toBeGreaterThanOrEqual(tl.parseEndAt);
      const order = tl.execOrder.filter((id) => defers.includes(id));
      expect(order).toEqual(defers);
    }
  });

  it('the page load event comes after DOMContentLoaded, every script, every stylesheet that was fetched and the hero', () => {
    for (const cfg of ALL) {
      const tl = solve(cfg);
      expect(tl.loadAt).toBeGreaterThanOrEqual(tl.dclAt);
      expect(tl.loadAt).toBeGreaterThanOrEqual(tl.fetches.hero!.done);
      for (const id of SCRIPT_IDS) expect(tl.loadAt).toBeGreaterThanOrEqual(tl.execAt[id]!.end);
      for (const id of CSS_IDS) if (cfg.css[id] !== 'inline') expect(tl.loadAt).toBeGreaterThanOrEqual(tl.fetches[id]!.done);
    }
  });

  it('a preload hint finds the font and the hero when the HTML is in; without it they wait for the CSS and the element', () => {
    for (const cfg of ALL) {
      const tl = solve(cfg);
      if (cfg.fontPreload && cfg.scanner) expect(tl.fetches.font!.start).toBe(tl.htmlEnd);
      if (!cfg.fontPreload) expect(tl.fetches.font!.start).toBeGreaterThan(tl.htmlEnd);
      if (cfg.hero === 'preload' && cfg.scanner) expect(tl.fetches.hero!.start).toBe(tl.htmlEnd);
      if (cfg.hero === 'css') expect(tl.fetches.hero!.start).toBeGreaterThan(tl.htmlEnd);
    }
  });

  it('the preload scanner never starts a download later, and it brings first paint forward once a synchronous script hides later tags', () => {
    for (const cfg of ALL) {
      if (!cfg.scanner) continue;
      const on = solve(cfg);
      const off = solve({ ...cfg, scanner: false });
      // The downloads the markup names: the font and the hero only when a preload hint names them.
      for (const item of documentItems(cfg)) {
        const id: ResId | null = item.kind === 'preload' ? item.res : item.kind === 'script' ? item.id : item.kind === 'css' && item.mode !== 'inline' ? item.id : null;
        if (id) expect(on.fetches[id]!.start, `${id} ${JSON.stringify(cfg)}`).toBeLessThanOrEqual(off.fetches[id]!.start);
      }
    }
    const cfg = PRESETS.sync.config;
    expect(solve(cfg).firstPaintAt).toBeLessThan(solve({ ...cfg, scanner: false }).firstPaintAt);
  });

  it('a print stylesheet never holds the first paint back, and is non-blocking', () => {
    for (const cfg of ALL) {
      for (const id of CSS_IDS) {
        if (cfg.css[id] !== 'print') continue;
        expect(isNonBlocking(id, cfg)).toBe(true);
        const loud = solve({ ...cfg, css: { ...cfg.css, [id]: 'normal' } });
        expect(solve(cfg).firstPaintAt, JSON.stringify(cfg)).toBeLessThanOrEqual(loud.firstPaintAt);
      }
    }
  });
});

describe('against the independent one-millisecond reference', () => {
  const rnd = mulberry32(2931);
  const sample = [...Object.values(PRESETS).map((p) => p.config), ...Array.from({ length: 400 }, () => ALL[Math.floor(rnd() * ALL.length)])];

  it('agrees on first paint, parse end, DOMContentLoaded, load, every script run and every download start', () => {
    for (const cfg of sample) {
      const tl = solve(cfg);
      const ref = reference(cfg);
      const why = JSON.stringify(cfg);
      expect(tl.firstPaintAt, why).toBe(ref.firstPaintAt);
      expect(tl.parseEndAt, why).toBe(ref.parseEndAt);
      expect(tl.dclAt, why).toBe(ref.dclAt);
      expect(tl.loadAt, why).toBe(ref.loadAt);
      for (const id of SCRIPT_IDS) expect([tl.execAt[id]!.start, tl.execAt[id]!.end], `${id} ${why}`).toEqual(ref.exec[id]);
      for (const id of Object.keys(tl.fetches) as ResId[]) {
        if (id === 'html') continue;
        expect(tl.fetches[id]!.start, `${id} ${why}`).toBe(ref.start[id]);
      }
    }
  });
});

// ── The generated <head> ─────────────────────────────────────────────────

describe('the generated <head>', () => {
  it('marks exactly the synchronous scripts as parser-blocking and the normal stylesheets as render-blocking', () => {
    for (const cfg of ALL.filter((_, i) => i % 13 === 0)) {
      const lines = headLines(cfg);
      const parser = lines.filter((l) => l.blocks === 'parser').map((l) => l.text);
      const render = lines.filter((l) => l.blocks === 'render').map((l) => l.text);
      expect(parser).toHaveLength(SCRIPT_IDS.filter((id) => cfg.scripts[id] === 'sync').length);
      expect(render).toHaveLength(CSS_IDS.filter((id) => cfg.css[id] === 'normal').length);
      for (const l of parser) expect(l).not.toMatch(/async|defer|module/);
    }
  });

  it('writes the attribute each mode means', () => {
    const cfg: Config = { ...PRESETS.sync.config, scripts: { analytics: 'async', lib: 'defer', app: 'module' }, css: { main: 'print', widgets: 'inline' }, fontPreload: true, hero: 'preload' };
    const text = headLines(cfg).map((l) => l.text).join('\n');
    expect(text).toContain('<script src="analytics.js" async></script>');
    expect(text).toContain('<script src="lib.js" defer></script>');
    expect(text).toContain('<script src="app.js" type="module"></script>');
    expect(text).toContain('<link rel="stylesheet" href="main.css" media="print" onload="this.media=\'all\'">');
    expect(text).toContain('<style>/* widgets.css, inlined */</style>');
    expect(text).toContain('rel="preload" href="inter.woff2" as="font" crossorigin');
    expect(text).toContain('rel="preload" href="hero.jpg" as="image"');
  });

  it('shows the font-display the model uses', () => {
    expect(cssExcerpt({ ...PRESETS.sync.config, fontDisplay: 'swap' })[0]).toContain('font-display: swap');
    expect(cssExcerpt({ ...PRESETS.sync.config, fontDisplay: 'block' })[0]).toContain('font-display: block');
  });

  it('fetch times follow the one formula: a round trip plus a millisecond per KB', () => {
    expect(fetchMs('lib', PRESETS.sync.config)).toBe(100 + 120);
    expect(fetchMs('html', PRESETS.fixed.config)).toBe(100 + 58);
  });
});
