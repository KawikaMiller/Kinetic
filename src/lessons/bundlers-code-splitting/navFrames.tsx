import type { ReactNode } from 'react';
import { ms } from '../../core/format';
import type { Frame } from '../../core/types';
import { chunkName } from './buildFrames';
import { APP_LABEL, LAZY_TARGET, kbText, NET, buildApp, loadPlan, singleBundle, type AppOptions, type Build, type Chunk, type LoadPlan } from './model';

export type Level = 'bundle' | 'shaken' | 'split' | 'fine';

export const LEVELS: { value: Level; label: string }[] = [
  { value: 'bundle', label: 'One bundle' },
  { value: 'shaken', label: 'Shaken' },
  { value: 'split', label: 'Split' },
  { value: 'fine', label: 'Too fine' },
];

export interface NavFrame extends Frame {
  /** The cursor, ms. */
  now: number;
}

export interface Scenario {
  level: Level;
  chunks: Chunk[];
  plan: LoadPlan;
}


/** The page load and the click on reports, for one way of shipping the app. */
export function scenarioFor(level: Level, b: Build, fineBuild: Build): Scenario {
  if (level === 'fine') return { level, chunks: fineBuild.chunks, plan: fineBuild.plan };
  if (level === 'split') return { level, chunks: b.chunks, plan: b.plan };
  const chunks = singleBundle(b, level === 'shaken');
  return { level, chunks, plan: loadPlan(b.graph, b.shaken, chunks, LAZY_TARGET) };
}

export function scenariosFor(o: AppOptions): Record<Level, Scenario> {
  const b = buildApp(o);
  const fine = buildApp(o, true);
  return { bundle: scenarioFor('bundle', b, fine), shaken: scenarioFor('shaken', b, fine), split: scenarioFor('split', b, fine), fine: scenarioFor('fine', b, fine) };
}

/** The requests made before the click: everything but the lazy chunks. */
export const firstLoadFetches = (s: Scenario) => s.plan.fetches.filter((f) => !s.plan.lazyChunks.includes(f.chunk));

/** What a scenario ships before the first screen works, in KB. */
export const firstLoadKb = (s: Scenario) => firstLoadFetches(s).reduce((sum, f) => sum + s.chunks.find((c) => c.id === f.chunk)!.kb, 0);

const name = (s: Scenario, id: string) => {
  const c = s.chunks.find((x) => x.id === id)!;
  return c.kind === 'module' ? <b>{APP_LABEL[c.modules[0] as keyof typeof APP_LABEL]}</b> : <b>{chunkName(c)}</b>;
};

interface Moment {
  t: number;
  say: ReactNode;
}

function moments(s: Scenario): Moment[] {
  const { plan } = s;
  const out: Moment[] = [];
  const first = firstLoadFetches(s);
  for (const f of plan.fetches) {
    const c = s.chunks.find((x) => x.id === f.chunk)!;
    const lazy = plan.lazyChunks.includes(f.chunk);
    out.push({
      t: f.done,
      say: <>{name(s, f.chunk)} ({kbText(c.kb)}) {lazy ? 'arrived after the click' : 'arrived'}. That request took {ms(f.done - f.start)}: a {ms(NET.rtt)} round trip plus its bytes
        {f.start > 0 && !lazy ? <>, and it had to wait for a free connection first (the model allows {NET.connections} at once)</> : null}.</>,
    });
  }
  out.push({
    t: plan.interactiveAt,
    say: <><span className="hl ok">The first screen works</span> at {ms(plan.interactiveAt)}: all {first.length} file(s) arrived, and running them took {ms(plan.interactiveAt - Math.max(...first.map((f) => f.done)))}.</>,
  });
  out.push({ t: plan.clickAt, say: <>You click <b>Reports</b> at {ms(plan.clickAt)}. {plan.lazyChunks.length ? <>Its code is not here yet, so the page fetches {plan.lazyChunks.length === 1 ? 'a chunk' : `${plan.lazyChunks.length} chunks`}.</> : <>Its code shipped with the first load, so there is nothing to fetch.</>}</> });
  if (plan.lazyChunks.length) {
    out.push({
      t: plan.visibleAt,
      say: <><span className="hl ok">Reports is on screen</span> at {ms(plan.visibleAt)}: {ms(plan.visibleAt - plan.clickAt)} after your click, which is the price of not shipping it up front.</>,
    });
  }
  return out;
}

const SAY: Record<Level, ReactNode> = {
  bundle: <>Everything in one file, nothing removed: the first load carries it all, and reports opens instantly.</>,
  shaken: <>One file again, but with unused code shaken out. Smaller, and still no waiting at the click.</>,
  split: <>Split: the first load carries only what the first screen needs, and reports is fetched when you click.</>,
  fine: <>Too fine: every module is its own file. The same code, but many more requests, each with its own round trip and overhead, sharing one bandwidth, and the connection limit makes some of them wait.</>,
};

export function navFrames(s: Scenario): NavFrame[] {
  const sorted = moments(s).sort((a, b) => a.t - b.t);
  const merged: Moment[] = [];
  for (const m of sorted) {
    const last = merged.at(-1);
    if (last && last.t === m.t) last.say = <>{last.say} {m.say}</>;
    else merged.push({ ...m });
  }
  const t0 = s.plan.fetches[0].start;
  return [
    { now: t0, say: <>A scripted page load on an illustrative network. {SAY[s.level]} Press play. The target of the click is <b>{APP_LABEL[LAZY_TARGET]}</b>.</> },
    ...merged.map((m) => ({ now: m.t, say: m.say, hold: 1.5 })),
  ];
}
