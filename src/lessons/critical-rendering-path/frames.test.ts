import { describe, expect, it } from 'vitest';
import { ms } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { buildFrames, describeScreen, gateText, moments } from './frames';
import lesson from './index';
import { PRESETS, RESOURCES, RTTS, SCRIPT_IDS, screenAt, solve, type Config, type CssMode, type ScriptMode } from './model';
import { barsAt, domainEnd, lanesFor, lastEventAt, markersOf } from './waterfall';

const SCRIPT_MODES: ScriptMode[] = ['sync', 'async', 'defer', 'module'];
const CSS_MODES: CssMode[] = ['normal', 'print', 'inline'];

function randomConfigs(count: number, seed: number): Config[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  return Array.from({ length: count }, () => ({
    scripts: { analytics: pick(SCRIPT_MODES), lib: pick(SCRIPT_MODES), app: pick(SCRIPT_MODES) },
    css: { main: pick(CSS_MODES), widgets: pick(CSS_MODES) },
    fontPreload: rnd() < 0.5,
    fontDisplay: pick(['swap', 'block'] as const),
    hero: pick(['css', 'preload'] as const),
    scanner: rnd() < 0.5,
    rtt: pick(RTTS),
  }));
}
const SAMPLE = [...Object.values(PRESETS).map((p) => p.config), ...randomConfigs(300, 77)];

describe('the try-this steps, from the default preset', () => {
  const sync = solve(PRESETS.sync.config);
  const fixed = solve(PRESETS.fixed.config);

  it('everything sync: three parser stops, and first paint after the last script has run', () => {
    expect(sync.blocks).toHaveLength(3);
    expect(sync.firstPaintAt).toBeGreaterThan(Math.max(...SCRIPT_IDS.map((id) => sync.execAt[id]!.end)));
  });

  it('the fixed version brings first paint forward and pushes DOMContentLoaded back', () => {
    expect(fixed.firstPaintAt).toBeLessThan(sync.firstPaintAt);
    expect(fixed.dclAt).toBeGreaterThan(sync.dclAt);
  });

  it('async scripts that need each other break; the same scripts deferred do not', () => {
    expect(solve(PRESETS['async-deps'].config).broken).toEqual([{ script: 'app', needs: 'lib' }]);
    const deferred = { ...PRESETS['async-deps'].config, scripts: { analytics: 'async', lib: 'defer', app: 'defer' } as Config['scripts'] };
    expect(solve(deferred).broken).toEqual([]);
  });

  it('with the preload scanner off, the default preset paints later', () => {
    expect(solve({ ...PRESETS.sync.config, scanner: false }).firstPaintAt).toBeGreaterThan(sync.firstPaintAt);
  });

  it('on the fixed version, font-display: block hides the text at first paint, and swap shows the fallback', () => {
    const block = solve({ ...PRESETS.fixed.config, fontDisplay: 'block' });
    expect(screenAt(block, block.firstPaintAt).text).toBe('invisible');
    expect(screenAt(fixed, fixed.firstPaintAt).text).toBe('fallback');
  });
});

describe('the waterfall', () => {
  it('has a lane for every bar, bars inside the time axis, and markers where the load puts them', () => {
    for (const cfg of SAMPLE) {
      const tl = solve(cfg);
      const lanes = lanesFor(cfg).map((l) => l.id as string);
      const end = domainEnd(tl);
      for (const bar of barsAt(tl, end)) {
        expect(lanes).toContain(bar.lane);
        expect(bar.start).toBeGreaterThanOrEqual(0);
        expect(bar.end).toBeLessThanOrEqual(end);
        expect(bar.end).toBeGreaterThanOrEqual(bar.start);
      }
      expect(markersOf(tl).map((m) => m.at)).toEqual([tl.firstPaintAt, tl.dclAt, tl.loadAt]);
      expect(end).toBeGreaterThan(lastEventAt(tl));
    }
  });

  it('draws only the plan before a bar starts, a part of it while it runs, and all of it afterwards', () => {
    const tl = solve(PRESETS.sync.config);
    const get = (now: number) => barsAt(tl, now).find((b) => b.id === 'lib-get')!;
    const f = tl.fetches.lib!;
    expect(get(f.start).tone).toBeUndefined();
    const mid = get((f.start + tl.cfg.rtt + f.done) / 2);
    expect(mid.tone).toBe('info');
    expect(mid.progress).toBeGreaterThan(0);
    expect(mid.progress).toBeLessThan(1);
    expect(get(f.done).progress).toBe(1);
  });

  it('outlines render-blocking CSS red and non-blocking downloads dim', () => {
    const sync = solve(PRESETS.sync.config);
    const ring = (tl: ReturnType<typeof solve>, id: string) => barsAt(tl, 9999).find((b) => b.id === id)!.ring;
    expect(ring(sync, 'main-get')).toBe('bad');
    expect(ring(sync, 'lib-get')).toBeUndefined();
    expect(ring(sync, 'hero-get')).toBe('dim');
    const fixed = solve(PRESETS.fixed.config);
    expect(ring(fixed, 'widgets-get')).toBe('dim');
    expect(ring(fixed, 'lib-get')).toBe('dim');
  });

  it('marks the parser as blocked exactly where the model says', () => {
    const tl = solve(PRESETS.sync.config);
    const blocked = barsAt(tl, 9999).filter((b) => b.id.startsWith('block-'));
    expect(blocked.map((b) => [b.id, b.start, b.end, b.tone, b.kind])).toEqual(tl.blocks.map((b) => [`block-${b.on}`, b.start, b.end, 'bad', 'wait']));
  });
});

describe('captions', () => {
  it('every frame is glue-free, in time order, and the frames start with the intro', () => {
    for (const cfg of SAMPLE) {
      const tl = solve(cfg);
      const frames = buildFrames(tl);
      let last = -1;
      for (const f of frames) {
        expect(expectCaption(f.say).length).toBeGreaterThan(10);
        expect(f.now).toBeGreaterThanOrEqual(last);
        last = f.now;
      }
      expect(frames[0].now).toBe(0);
      expect(expectCaption(frames[0].say)).toContain('scripted page load');
      expect(frames.at(-1)!.now).toBe(lastEventAt(tl));
      expect(expectCaption(frames.at(-1)!.say)).toContain(`first paint ${ms(tl.firstPaintAt)}, DOMContentLoaded ${ms(tl.dclAt)}, load ${ms(tl.loadAt)}`);
    }
  });

  it('the first-paint, DOMContentLoaded and load captions give the model\'s times, at those moments', () => {
    for (const cfg of SAMPLE) {
      const tl = solve(cfg);
      const marks = moments(tl).map((m) => ({ t: m.t, text: expectCaption(m.say) }));
      const at = (t: number) => marks.find((m) => m.t === t)!.text;
      expect(at(tl.firstPaintAt)).toContain(`First paint at ${ms(tl.firstPaintAt)}`);
      expect(at(tl.firstPaintAt)).toContain(describeScreen(screenAt(tl, tl.firstPaintAt)));
      expect(at(tl.dclAt)).toContain(`DOMContentLoaded at ${ms(tl.dclAt)}`);
      expect(at(tl.loadAt)).toContain(`load at ${ms(tl.loadAt)}`);
    }
  });

  it('every script gets a "ran" caption at the moment its run ended, and a failure caption exactly when the model says broken', () => {
    for (const cfg of SAMPLE) {
      const tl = solve(cfg);
      const marks = moments(tl).map((m) => ({ t: m.t, text: expectCaption(m.say) }));
      for (const id of SCRIPT_IDS) {
        const file = RESOURCES[id].file;
        const m = marks.find((x) => x.t === tl.execAt[id]!.end)!;
        expect(m.text, `${file} ${JSON.stringify(cfg)}`).toMatch(new RegExp(`${file.replace('.', '\\.')} (ran|ran before)`));
      }
      const failed = marks.some((m) => m.text.includes('✕'));
      expect(failed).toBe(tl.broken.length > 0);
    }
  });

  it('a stop caption exists for every blocked stretch and for nothing else', () => {
    for (const cfg of SAMPLE) {
      const tl = solve(cfg);
      const stops = moments(tl).filter((m) => expectCaption(m.say).includes('and stopped')).length;
      // Stops at the same moment are merged into one caption, so compare distinct start times.
      expect(stops).toBe(new Set(tl.blocks.map((b) => b.start)).size);
    }
  });

  it('what first paint waited for is named correctly', () => {
    const sync = solve(PRESETS.sync.config);
    expect(sync.gate.by).toBe('parser');
    expect(captionOf(gateText(sync))).toContain('held up by the synchronous');
    expect(captionOf(gateText(sync))).toContain('lib.js');
    // A slow, big stylesheet that arrives after the parser has reached the content makes the stylesheet the reason.
    const slowCss = solve({ ...PRESETS.fixed.config, css: { main: 'normal', widgets: 'normal' } });
    expect(slowCss.gate.by).toBe('css');
    expect(captionOf(gateText(slowCss))).toContain('render-blocking stylesheet');
    expect(captionOf(gateText(slowCss))).toContain(RESOURCES[slowCss.gate.css!].file);
    expect(captionOf(gateText(slowCss))).toContain(ms(slowCss.cssReadyAt));
  });
});

function captionOf(node: Parameters<typeof expectCaption>[0]): string {
  return expectCaption(node);
}

describe('the screen descriptions', () => {
  it('describe each state distinctly', () => {
    const words = new Set([
      describeScreen({ painted: false, text: 'none', hero: false }),
      describeScreen({ painted: true, text: 'none', hero: false }),
      describeScreen({ painted: true, text: 'invisible', hero: false }),
      describeScreen({ painted: true, text: 'fallback', hero: false }),
      describeScreen({ painted: true, text: 'web', hero: false }),
      describeScreen({ painted: true, text: 'web', hero: true }),
    ]);
    expect(words.size).toBe(6);
  });
});

describe('lesson text', () => {
  it('names the rules the model implements', () => {
    const text = [lesson.summary.what, ...lesson.keyIdeas].join(' ');
    expect(text).toContain('blocks the parser');
    expect(text).toContain('before DOMContentLoaded');
  });
});
