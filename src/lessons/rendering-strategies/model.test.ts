import { describe, expect, it } from 'vitest';
import {
  FACTS, NET, PRESETS, RANGES, STRATEGY_IDS, best, milestones, screenAt, tableRows, timeline, valleyMs, type Inputs, type PresetId, type StrategyId,
} from './model';

const grid = (): Inputs[] => {
  const out: Inputs[] = [];
  for (let dataMs = RANGES.dataMs.min; dataMs <= RANGES.dataMs.max; dataMs += 150) {
    for (let bundleKb = RANGES.bundleKb.min; bundleKb <= RANGES.bundleKb.max; bundleKb += 150) {
      for (let cpu = RANGES.cpu.min; cpu <= RANGES.cpu.max; cpu += 1) out.push({ dataMs, bundleKb, cpu });
    }
  }
  return out;
};
const GRID = grid();
const everyStrategy = (fn: (id: StrategyId, input: Inputs) => void) => GRID.forEach((input) => STRATEGY_IDS.forEach((id) => fn(id, input)));
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

describe('the default inputs, worked by hand (data 400 ms, bundle 400 KB, device 1x)', () => {
  const input = PRESETS.default.inputs;
  const at = (id: StrategyId) => timeline(id, input);

  it('CSR: shell 104, JS in at 1004, run to 1164, then the data (a round trip and 400 ms) at 1664, render to 1784, painted and usable at 1794', () => {
    const t = at('csr');
    expect(t.jsDoneAt).toBe(100 + 4 + 100 + 400 / 0.5);
    expect(t.firstPaintAt).toBe(1794);
    expect(t.contentAt).toBe(1794);
    expect(t.interactiveAt).toBe(1794);
    expect(valleyMs(t)).toBe(0);
  });

  it('SSR: 460 ms of server work, the page at 620 and painted at 630, but the JS only at 1460, so interactive at 1740', () => {
    const t = at('ssr');
    expect(t.firstByteAt).toBe(100 + 400 + 60);
    expect(t.firstPaintAt).toBe(630);
    expect(t.jsDoneAt).toBe(1460);
    expect(t.interactiveAt).toBe(1460 + 160 + 120);
    expect(valleyMs(t)).toBe(1740 - 630);
  });

  it('SSG: the response needs no server work, so painted at 170; the JS at 1000 makes it interactive at 1280', () => {
    const t = at('ssg');
    expect(t.firstPaintAt).toBe(100 + 60 + 10);
    expect(t.jsDoneAt).toBe(1000);
    expect(t.interactiveAt).toBe(1000 + 160 + 120);
    expect(t.serverMsPerRequest).toBe(0);
  });

  it('streaming: the shell is painted at 122, the content at 618, and the JS (asked for with the first bytes) makes it interactive at 1280', () => {
    const t = at('stream');
    expect(t.firstPaintAt).toBe(100 + 12 + 10);
    expect(t.contentAt).toBe(100 + 400 + 60 + 48 + 10);
    expect(t.interactiveAt).toBe(1280);
  });

  it('SSR makes the page visible much sooner than CSR but interactive about as late: the misconception the lesson is about', () => {
    expect(at('ssr').firstPaintAt).toBeLessThan(at('csr').firstPaintAt / 2);
    expect(Math.abs(at('ssr').interactiveAt - at('csr').interactiveAt)).toBeLessThan(100);
  });
});

describe('the dependency rules, over a grid of every slider combination', () => {
  it('first paint <= content <= interactive in every lane', () => {
    everyStrategy((id, input) => {
      const t = timeline(id, input);
      expect(t.firstPaintAt).toBeLessThanOrEqual(t.contentAt);
      expect(t.contentAt).toBeLessThanOrEqual(t.interactiveAt);
      expect(t.firstByteAt).toBeLessThan(t.firstPaintAt);
    });
  });

  it('CSR paints content only after its JavaScript has arrived, run, and fetched the data', () => {
    GRID.forEach((input) => {
      const t = timeline('csr', input);
      const afterJs = t.jsDoneAt + input.bundleKb * NET.runMsPerKb * input.cpu;
      expect(t.firstPaintAt).toBeGreaterThanOrEqual(afterJs + NET.rtt + input.dataMs);
      expect(t.firstPaintAt).toBeGreaterThan(t.jsDoneAt);
    });
  });

  it('SSR, SSG and streaming paint before their JavaScript has arrived', () => {
    GRID.forEach((input) => {
      for (const id of ['ssr', 'ssg', 'stream'] as const) {
        const t = timeline(id, input);
        expect(t.firstPaintAt).toBeLessThan(t.jsDoneAt);
      }
    });
  });

  it('hydration starts only once the HTML and the JavaScript are both there, and ends a run plus a tree walk later', () => {
    GRID.forEach((input) => {
      for (const id of ['ssr', 'ssg', 'stream'] as const) {
        const t = timeline(id, input);
        expect(t.runAt).toBeGreaterThanOrEqual(t.jsDoneAt);
        expect(t.runAt).toBeGreaterThanOrEqual(t.contentAt - NET.paintMs);
        expect(t.runAt).toBe(Math.max(t.jsDoneAt, t.contentAt - NET.paintMs));
        expect(t.interactiveAt).toBeCloseTo(t.runAt + input.bundleKb * (NET.runMsPerKb + NET.treeMsPerKb) * input.cpu, 9);
      }
    });
  });

  it('the screen goes blank, then (shell), then content, then interactive, never backwards, and ends interactive', () => {
    const order = ['blank', 'shell', 'content', 'interactive'];
    everyStrategy((id, input) => {
      const t = timeline(id, input);
      let last = 0;
      for (let ms = 0; ms <= t.interactiveAt + 50; ms += 25) {
        const i = order.indexOf(screenAt(t, ms));
        expect(i).toBeGreaterThanOrEqual(last);
        last = i;
      }
      expect(screenAt(t, 0)).toBe('blank');
      expect(screenAt(t, t.interactiveAt)).toBe('interactive');
    });
  });

  it('only a streamed page has a shell stage, and only server-rendered pages have a valley between content and interactive', () => {
    GRID.forEach((input) => {
      expect(valleyMs(timeline('csr', input))).toBe(0);
      for (const id of ['ssr', 'ssg', 'stream'] as const) expect(valleyMs(timeline(id, input))).toBeGreaterThan(0);
      expect(timeline('ssr', input).contentAt).toBe(timeline('ssr', input).firstPaintAt);
      expect(timeline('stream', input).contentAt).toBeGreaterThan(timeline('stream', input).firstPaintAt);
    });
  });

  it('SSG does not depend on the data latency at all, CSR and the server strategies do', () => {
    const base = { dataMs: 0, bundleKb: 400, cpu: 2 };
    const slow = { ...base, dataMs: 1500 };
    expect(timeline('ssg', slow)).toEqual(timeline('ssg', base));
    for (const id of ['csr', 'ssr'] as const) expect(timeline(id, slow).interactiveAt).toBe(timeline(id, base).interactiveAt + 1500);
  });

  it('slower data, a bigger bundle or a slower device never makes any lane faster', () => {
    everyStrategy((id, input) => {
      const t = timeline(id, input);
      for (const worse of [{ ...input, dataMs: input.dataMs + 150 }, { ...input, bundleKb: input.bundleKb + 150 }, { ...input, cpu: input.cpu + 1 }]) {
        const w = timeline(id, worse);
        expect(w.firstPaintAt).toBeGreaterThanOrEqual(t.firstPaintAt);
        expect(w.interactiveAt).toBeGreaterThanOrEqual(t.interactiveAt);
      }
    });
  });

  it('every bar lies between 0 and the interactive moment and runs forwards', () => {
    everyStrategy((id, input) => {
      const t = timeline(id, input);
      for (const b of t.bars) {
        expect(b.start).toBeGreaterThanOrEqual(0);
        expect(b.end).toBeGreaterThanOrEqual(b.start);
        expect(b.end).toBeLessThanOrEqual(t.interactiveAt);
      }
    });
  });
});

describe('the table', () => {
  it('takes every number from the timelines and every fact from the facts, for every preset', () => {
    for (const p of PRESET_IDS) {
      const input = PRESETS[p].inputs;
      const rows = tableRows(input);
      expect(rows.map((r) => r.id)).toEqual([...STRATEGY_IDS]);
      for (const r of rows) {
        const t = timeline(r.id, input);
        expect(r.firstPaintMs).toBe(t.firstPaintAt);
        expect(r.interactiveMs).toBe(t.interactiveAt);
        expect(r.seo === 'content in the HTML').toBe(FACTS[r.id].htmlHasContent);
        expect(r.serverCost.includes(String(t.serverMsPerRequest))).toBe(t.serverMsPerRequest > 0);
        expect(r.freshness).toBe(FACTS[r.id].freshness);
      }
    }
  });

  it('server work per request is data plus rendering for SSR and streaming, and nothing for CSR and SSG', () => {
    const rows = Object.fromEntries(tableRows({ dataMs: 250, bundleKb: 300, cpu: 1 }).map((r) => [r.id, r]));
    expect(rows.ssr.serverCost).toBe('310 ms of work');
    expect(rows.stream.serverCost).toBe('310 ms of work');
    expect(rows.csr.serverCost).toBe('a file served');
    expect(rows.ssg.serverCost).toBe('a file served');
  });

  it('only static generation serves data fixed at build time', () => {
    expect(STRATEGY_IDS.filter((id) => FACTS[id].freshness === 'at the last build')).toEqual(['ssg']);
  });
});

describe('the presets tell the stories they are named for', () => {
  it('marketing page: static generation has the content on screen first and is the first to be usable (streaming paints its shell sooner, without the content)', () => {
    const rows = tableRows(PRESETS.marketing.inputs);
    const content = Object.fromEntries(STRATEGY_IDS.map((id) => [id, timeline(id, PRESETS.marketing.inputs).contentAt]));
    expect(Math.min(...Object.values(content))).toBe(content.ssg);
    expect(best(rows, 'firstPaintMs')).toEqual(['stream']);
    expect(best(rows, 'contentMs')).toEqual(['ssg']);
    expect(best(rows, 'interactiveMs')).toEqual(['ssg']);
  });

  it('strategies that tie are all reported as best, not just the first listed', () => {
    const rows = tableRows(PRESETS.default.inputs);
    const at = (id: StrategyId) => rows.find((r) => r.id === id)!.interactiveMs;
    expect(at('ssg')).toBe(at('stream'));
    expect(best(rows, 'interactiveMs')).toEqual(['ssg', 'stream']);
  });

  it('dashboard: server rendering and client rendering end up within a few percent of each other, but the server paints seconds earlier', () => {
    const csr = timeline('csr', PRESETS.dashboard.inputs);
    const ssr = timeline('ssr', PRESETS.dashboard.inputs);
    expect(Math.abs(csr.interactiveAt - ssr.interactiveAt) / csr.interactiveAt).toBeLessThan(0.05);
    expect(csr.firstPaintAt - ssr.firstPaintAt).toBeGreaterThan(2000);
  });

  it('slow phone: running the bundle and hydrating it is most of the time to interactive for every server-rendered strategy', () => {
    const input = PRESETS.phone.inputs;
    for (const id of ['ssr', 'ssg', 'stream'] as const) {
      const t = timeline(id, input);
      const js = input.bundleKb * (NET.runMsPerKb + NET.treeMsPerKb) * input.cpu;
      expect(js / t.interactiveAt).toBeGreaterThan(0.5);
    }
  });

  it('from the default, SSR is visible well before CSR and no more interactive, but streaming and static are interactive sooner', () => {
    const rows = Object.fromEntries(tableRows(PRESETS.default.inputs).map((r) => [r.id, r]));
    expect(rows.ssr.firstPaintMs).toBeLessThan(rows.csr.firstPaintMs);
    expect(rows.stream.interactiveMs).toBeLessThan(rows.ssr.interactiveMs);
    expect(rows.ssg.interactiveMs).toBeLessThan(rows.ssr.interactiveMs);
  });
});

describe('milestones', () => {
  it('are in time order, one set per shown strategy, and a streamed page also has a content moment', () => {
    for (const p of PRESET_IDS) {
      const ms = milestones(PRESETS[p].inputs, STRATEGY_IDS);
      ms.forEach((m, i) => i && expect(m.at).toBeGreaterThanOrEqual(ms[i - 1].at));
      expect(ms.filter((m) => m.kind === 'interactive').map((m) => m.id).sort()).toEqual([...STRATEGY_IDS].sort());
      expect(ms.filter((m) => m.kind === 'content').map((m) => m.id)).toEqual(['stream']);
    }
    expect(milestones(PRESETS.default.inputs, ['ssr']).every((m) => m.id === 'ssr')).toBe(true);
  });
});
