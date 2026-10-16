import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { dvFrames, forwardFrames, lsFrames, msText } from './captions';
import { SPLIT_MODES, roundsByMode, sceneRun, type SplitMode } from './dv';
import { FORWARDING_TABLES, FORWARDING_TOPO, ROUTERS, TEACH_DESTINATIONS, TEACH_ROUTES, fewestHopsPath, lookup, tableRows, walk } from './forwarding';
import {
  FORWARD_DESTINATION, applyCost, brokenRandomSetup, defaultLink, dvBaseline, dvTopo, initialDv, initialForward, initialLs, linkEventOf, loadDvPreset, loadLsPreset,
  parseCost, scriptedSetup, selectLink, toggleSelected, withDelay, withLinkEvent, type DvState, type LinkEvent,
} from './init';
import lesson from './index';
import { DEFAULT_LS, LS_BROKEN_SEED, LS_DEAD_ROUTE_SEED, dvRoundsFor, lsRun, messageCounts, routerView, settling, wrongRouters } from './ls';
import { floydWarshall } from './testkit';
import { COST_MAX, COST_MIN, PRESETS, presetById, type Topo } from './topology';

const clean = (node: unknown) => {
  const t = text(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object/);
  return t;
};

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the default A to F packet crosses A, B, C, E, F at cost 7, and the prefix rows are won by /25 and /32', () => {
    const s = initialForward();
    expect([s.src, s.dst, s.destination]).toEqual(['A', 'F', FORWARD_DESTINATION]);
    const w = walk(FORWARDING_TABLES, FORWARDING_TOPO, s.src, s.dst);
    expect(w.hops).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(w.cost).toBe(floydWarshall(FORWARDING_TOPO).A.F);
    expect(w.cost).toBe(7);
    expect(lookup(s.destination).matches.map((r) => r.text)).toEqual(['198.51.100.0/24', '198.51.100.128/25', '0.0.0.0/0']);
    expect(lookup(s.destination).winner?.text).toBe('198.51.100.128/25');
    expect(lookup('198.51.100.200').winner?.text).toBe('198.51.100.200/32');
    const t = lesson.tryThis[0];
    expect(t).toContain('A, B, C, E, F');
    expect(t).toContain('path cost of 7');
    expect(t).toContain('matches 3 rows and 198.51.100.128/25 wins');
    expect(t).toContain('198.51.100.200/32 row wins');
  });

  it('try-this 2: the default chain climbs 2, 4, 4, 6, 6, 8 and 3, 3, 5, 5, 7, 7 to 16 in 15 rounds; split horizon reads 2 rounds', () => {
    const s = initialDv();
    expect([s.presetId, s.mode, s.start, s.links.find((l) => l.id === 'BC')?.up]).toEqual(['chain', 'plain', 'change', false]);
    const run = sceneRun(dvBaseline(s.presetId), dvTopo(s.presetId, s.links), s.start, s.mode);
    expect(run.tables.slice(1, 7).map((t) => t.A.C.cost)).toEqual([2, 4, 4, 6, 6, 8]);
    expect(run.tables.slice(1, 7).map((t) => t.B.C.cost)).toEqual([3, 3, 5, 5, 7, 7]);
    expect(run.rounds).toBe(15);
    expect(roundsByMode(dvBaseline(s.presetId), dvTopo(s.presetId, s.links), s.start).split).toBe(2);
    const t = lesson.tryThis[1];
    expect(t).toContain('2, 4, 4, 6, 6, 8');
    expect(t).toContain('3, 3, 5, 5, 7, 7');
    expect(t).toContain('after 15 rounds');
    expect(t).toContain('"split horizon"');
  });

  it('try-this 3: from the defaults, loading the triangle and picking split horizon still takes 15 rounds, and plain takes the same', () => {
    const s = loadDvPreset('triangle', 'split');
    expect(s.start).toBe('change');
    expect(s.links.find((l) => l.id === 'AX')?.up).toBe(false);
    const by = roundsByMode(dvBaseline(s.presetId), dvTopo(s.presetId, s.links), s.start);
    expect(by).toEqual({ plain: 15, split: 15, poison: 15 });
    const t = lesson.tryThis[2];
    expect(t).toContain('15 rounds');
    expect(t).toContain('"triangle + stub, cut A-X"');
    expect(t).toContain('"Same change, by mode"');
  });

  it('try-this 4: the default ring cut at 60 ms sends the stated number of LSAs, agrees after the stated time, against 4 rounds for distance vector', () => {
    const ui = initialLs();
    expect(ui.setup).toEqual(DEFAULT_LS);
    expect(DEFAULT_LS).toMatchObject({ presetId: 'ring', link: 'AB', mode: 'seq', delivery: 'random', restore: false, seed: 1 });
    const run = lsRun(ui.setup);
    const st = settling(run);
    const sent = messageCounts(run, Infinity).sent;
    expect(dvRoundsFor(ui.setup)).toBe(4);
    const t = lesson.tryThis[3];
    expect(t).toContain(`${sent} advertisements`);
    expect(t).toContain(`agree ${msText(st.ms as number)} after the cut`);
    expect(t).toContain('4 synchronous rounds');
    expect(t).toContain('seed 1');
  });

  it('try-this 5: from the defaults, "ignore sequence numbers" breaks the rule at the stated time on seed 1; seed 70 leaves B routing over the cut link', () => {
    const broken = lsRun({ ...initialLs().setup, mode: 'ignore' });
    expect(broken.violation).not.toBeNull();
    expect(lesson.tryThis[4]).toContain(`at ${msText(broken.violation?.time as number)}`);
    expect(initialLs().setup.seed).toBe(LS_BROKEN_SEED);
    expect(brokenRandomSetup()).toMatchObject({ mode: 'ignore', seed: LS_BROKEN_SEED });
    const dead = lsRun({ ...brokenRandomSetup(), seed: LS_DEAD_ROUTE_SEED });
    expect(wrongRouters(dead, dead.endTime)).toEqual(['B']);
    expect(routerView(dead, 'B', dead.endTime).deadEdges.length).toBeGreaterThan(0);
    expect(lesson.tryThis[4]).toContain(`Seed ${LS_DEAD_ROUTE_SEED}: a router keeps a dead route`);
  });
});

describe('scene 1, forwarding', () => {
  const unitHops = (t: Topo, a: string, b: string) => floydWarshall({ ...t, links: t.links.map((l) => ({ ...l, cost: 1 })) })[a][b];

  it('every source and destination pair is delivered at the cheapest cost, and the caption claims fewer hops only when a path with fewer hops exists', () => {
    const fw = floydWarshall(FORWARDING_TOPO);
    for (const src of ROUTERS) {
      for (const dst of ROUTERS) {
        if (src === dst) continue;
        const w = walk(FORWARDING_TABLES, FORWARDING_TOPO, src, dst);
        expect(w.delivered).toBe(true);
        expect(w.cost).toBe(fw[src][dst]);
        const frames = forwardFrames(src, dst);
        expect(frames).toHaveLength(w.hops.length + 1);
        const last = clean(frames[frames.length - 1].say);
        expect(last).toContain(`path cost ${w.cost}`);
        expect(last.includes('Cost, not hop count')).toBe(unitHops(FORWARDING_TOPO, src, dst) < w.hops.length - 1);
        for (const f of frames.slice(0, -1)) clean(f.say);
      }
    }
  });

  it('the route table of a router lists every other destination once, with a next hop that is a neighbour', () => {
    for (const r of ROUTERS) {
      const rows = tableRows(FORWARDING_TABLES, r);
      expect(rows.map((x) => x.dest)).toEqual(ROUTERS.filter((x) => x !== r));
      for (const row of rows) expect(FORWARDING_TOPO.links.some((l) => l.up && ((l.a === r && l.b === row.next) || (l.b === r && l.a === row.next)))).toBe(true);
    }
  });

  it('the fewest-hops path of A to F is A, B, D, F', () => {
    expect(fewestHopsPath(FORWARDING_TOPO, 'A', 'F')).toEqual(['A', 'B', 'D', 'F']);
  });

  it('longest-prefix match equals a bit-string brute force on every destination of the panel and 200 other addresses', () => {
    const bits = (ip: string) => ip.split('.').map((o) => Number(o).toString(2).padStart(8, '0')).join('');
    const rows = TEACH_ROUTES.map((r) => ({ r, bits: bits(r.text.split('/')[0]).slice(0, r.prefix) }));
    const brute = (ip: string) => rows.filter((x) => bits(ip).startsWith(x.bits)).sort((a, b) => b.r.prefix - a.r.prefix)[0]?.r;
    const addrs = [...TEACH_DESTINATIONS];
    for (let i = 0; i < 200; i++) addrs.push(`${198 + (i % 3)}.${51 + (i % 2) * 12}.${i % 2 ? 100 : 0}.${(i * 37) % 256}`);
    for (const a of addrs) expect(lookup(a).winner).toBe(brute(a));
  });
});

describe('scene 2, distance vector: the whole control cross product', () => {
  it('every preset, mode and start builds frames whose captions are clean and whose changed counts equal the model', () => {
    for (const p of PRESETS) {
      for (const mode of SPLIT_MODES) {
        for (const start of ['change', 'boot'] as const) {
          const s: DvState = { ...loadDvPreset(p.id, mode), start };
          const base = dvBaseline(s.presetId);
          const now = dvTopo(s.presetId, s.links);
          const run = sceneRun(base, now, start, mode);
          const frames = dvFrames(run, start, '', mode);
          expect(frames).toHaveLength(run.rounds + 2);
          frames.forEach((f, k) => {
            const t = clean(f.say);
            if (k >= 1 && k <= run.rounds) expect(t).toMatch(new RegExp(`^Round ${k}: ${run.changed[k - 1].size} (entry|entries) changed`));
          });
          expect(frames[frames.length - 1].round).toBe(run.rounds);
        }
      }
    }
  });

  it('the settled caption mentions counting to infinity exactly when a cost climbs through 3 or more rounds', () => {
    const chain = initialDv();
    const run = sceneRun(dvBaseline(chain.presetId), dvTopo(chain.presetId, chain.links), 'change', 'plain');
    expect(clean(dvFrames(run, 'change', 'link B-C is cut', 'plain').at(-1)?.say)).toContain('counting to infinity');
    const split = sceneRun(dvBaseline(chain.presetId), dvTopo(chain.presetId, chain.links), 'change', 'split');
    expect(clean(dvFrames(split, 'change', 'link B-C is cut', 'split').at(-1)?.say)).not.toContain('counting to infinity');
  });

  it('a network with nothing changed settles in 0 rounds and says so', () => {
    const s = { ...initialDv(), links: dvBaseline('chain').links.map((l) => ({ ...l })) };
    const run = sceneRun(dvBaseline(s.presetId), dvTopo(s.presetId, s.links), 'change', 'plain');
    expect(run.rounds).toBe(0);
    expect(clean(dvFrames(run, 'change', '', 'plain').at(-1)?.say)).toContain('Nothing to do');
  });

  it('the opening state of each scene is its own: scene 2 opens on the chain with B-C cut and no link selected, scene 3 on the ring', () => {
    const dv = initialDv();
    expect(dv.selected).toBeNull();
    expect(dv.note).toBeNull();
    expect(initialForward().src).toBe('A');
    expect(initialLs().setup.presetId).toBe('ring');
    expect(initialLs().router).toBe('D');
    expect(loadDvPreset('ring', 'plain').links.filter((l) => !l.up).map((l) => l.id)).toEqual(['AB']);
  });
});

describe('link edits and hostile input', () => {
  const picked = (id: string): DvState => selectLink(initialDv(), id);
  const costOf = (s: DvState, id: string) => s.links.find((l) => l.id === id)?.cost;

  it('cutting and restoring the selected link toggles it and nothing else; with no link selected it says to select one', () => {
    const s = picked('AB');
    const cut = toggleSelected(s);
    expect(cut.links.find((l) => l.id === 'AB')?.up).toBe(false);
    expect(cut.links.find((l) => l.id === 'BC')?.up).toBe(false);
    expect(toggleSelected(cut).links.find((l) => l.id === 'AB')?.up).toBe(true);
    expect(toggleSelected(initialDv()).note).toContain('Select a link first');
    expect(applyCost(initialDv()).note).toContain('Select a link first');
  });

  it.each(['', '   ', 'abc', '0', '-3', '10', '1e9', '4.5', '+5', '<b>bold</b>', '١٢', 'x'.repeat(5000), '9999999999999999999999'])('the cost %j is refused with a reason and the old cost stays', (typed) => {
    const s = { ...picked('AB'), costText: typed };
    const r = applyCost(s);
    expect(costOf(r, 'AB')).toBe(1);
    expect(r.note).toContain('Keeping cost 1');
    expect(r.note?.length).toBeLessThan(160);
  });

  it('costs from 1 to 9 are accepted and nothing is clamped', () => {
    for (let c = COST_MIN; c <= COST_MAX; c++) {
      const r = applyCost({ ...picked('AB'), costText: String(c) });
      expect(costOf(r, 'AB')).toBe(c);
    }
    expect(parseCost('10').ok).toBe(false);
    expect(parseCost('0').ok).toBe(false);
  });

  it('a changed cost is a change the routers react to: the settled costs match Floyd-Warshall on the edited network', () => {
    const edited = applyCost({ ...loadDvPreset('ring', 'plain'), selected: 'BC', costText: '5' });
    const topo = dvTopo(edited.presetId, edited.links);
    const run = sceneRun(dvBaseline(edited.presetId), topo, 'change', 'plain');
    const last = run.tables[run.tables.length - 1];
    const fw = floydWarshall(topo);
    for (const a of topo.routers) for (const b of topo.routers) expect(last[a][b].cost).toBe(fw[a][b]);
  });
});

describe('scene 3, link state: the whole control cross product', () => {
  const events: LinkEvent[] = ['none', 'cut', 'restore'];

  it('every preset, link event, rule and delivery builds clean frames that end on the run\'s end', () => {
    for (const p of PRESETS) {
      for (const event of events) {
        for (const mode of ['seq', 'ignore'] as const) {
          for (const delivery of ['random', 'scripted'] as const) {
            const base = loadLsPreset(initialLs(), p.id).setup;
            const setup = withLinkEvent({ ...base, mode, delivery }, event);
            expect(linkEventOf(setup)).toBe(event);
            const run = lsRun(setup);
            const frames = lsFrames(run);
            frames.forEach((f) => clean(f.say ?? ''));
            expect(frames[frames.length - 1].now).toBe(Math.max(1, run.endTime));
            expect(clean(frames[frames.length - 1].say)).toContain(settling(run).settledAt === null ? 'never agreed' : 'Settled');
          }
        }
      }
    }
  });

  it('the summary names the violation when there is one, and the scripted ring says what happened at 40 ms', () => {
    const run = lsRun(scriptedSetup('ignore'));
    const milestones = lsFrames(run).filter((f) => f.say !== undefined).map((f) => clean(f.say));
    expect(milestones.some((t) => t.includes("At 40 ms: F replaced its copy of A's LSA #2 with the older #1"))).toBe(true);
    expect(milestones.some((t) => t.includes('At 15 ms link A-B goes down'))).toBe(true);
  });

  it('the delay slider extremes and the loss extremes still build frames, and the range is never upside down', () => {
    for (const [minMs, maxMs, loss] of [[1, 1, 0], [80, 80, 0.3], [1, 80, 0.3], [80, 80, 0]] as const) {
      const run = lsRun({ ...DEFAULT_LS, minMs, maxMs, loss });
      lsFrames(run).forEach((f) => clean(f.say ?? ''));
    }
    expect(withDelay({ ...DEFAULT_LS, minMs: 5, maxMs: 60 }, 'min', 70)).toMatchObject({ minMs: 70, maxMs: 70 });
    expect(withDelay({ ...DEFAULT_LS, minMs: 5, maxMs: 60 }, 'max', 2)).toMatchObject({ minMs: 2, maxMs: 2 });
    expect(withDelay({ ...DEFAULT_LS, minMs: 5, maxMs: 60 }, 'min', 30)).toMatchObject({ minMs: 30, maxMs: 60 });
  });

  it('a preset load keeps the learner\'s rule and seed and picks that preset\'s cut link', () => {
    const ui = { ...initialLs(), setup: { ...DEFAULT_LS, mode: 'ignore' as const, seed: 7 } };
    for (const p of PRESETS) {
      const loaded = loadLsPreset(ui, p.id);
      expect(loaded.setup).toMatchObject({ presetId: p.id, mode: 'ignore', seed: 7, link: defaultLink(p.id), restore: false });
      expect(presetById(p.id).routers).toContain(loaded.router);
    }
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });

  it('the roundsByMode helper returns all three modes', () => {
    const s = initialDv();
    expect(Object.keys(roundsByMode(dvBaseline(s.presetId), dvTopo(s.presetId, s.links), s.start)).sort()).toEqual(['plain', 'poison', 'split'] satisfies SplitMode[]);
  });
});
