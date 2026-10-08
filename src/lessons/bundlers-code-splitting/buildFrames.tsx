import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import type { Tone } from '../../core/tone';
import { APP_LABEL, INITIAL, SHARED, kbText, moduleKb, type AppId, type AppOptions, type Build, type Chunk } from './model';

export type Phase = 'walk' | 'shake' | 'split';

export interface BuildFrame extends Frame {
  phase: Phase;
  /** Modules the walk has added to the bundle so far. */
  visited: string[];
  /** The module being visited. */
  current: string | null;
  /** How many shake events have been applied. */
  shakeStep: number;
  /** 0: not split yet; 1: the dynamic import is drawn; 2: the chunks are drawn. */
  splitStep: 0 | 1 | 2;
}

export type ShakeEvent =
  | { kind: 'drop'; id: string; kb: number }
  | { kind: 'exports'; id: string; removed: string[]; kb: number }
  | { kind: 'sideEffect'; id: string }
  | { kind: 'cjs'; id: string };

const label = (id: string) => APP_LABEL[id as AppId] ?? id;

/** What shaking does, in the order the walk met the modules. */
export function shakeEvents(b: Build): ShakeEvent[] {
  const { graph, shaken } = b;
  const out: ShakeEvent[] = [];
  for (const id of b.walk) {
    const m = graph.modules[id];
    if (shaken.dropped.includes(id)) out.push({ kind: 'drop', id, kb: moduleKb(m) });
    else if (shaken.removedExports[id]?.length) {
      const removed = shaken.removedExports[id];
      out.push({ kind: 'exports', id, removed, kb: m.exports.filter((e) => removed.includes(e.name)).reduce((s, e) => s + e.kb, 0) });
    } else if (shaken.unshakable.includes(id)) out.push({ kind: 'cjs', id });
    if (shaken.sideEffectOnly.includes(id)) out.push({ kind: 'sideEffect', id });
  }
  return out;
}

/** Kilobytes removed by the first `step` events. */
export function removedKb(events: readonly ShakeEvent[], step: number): number {
  return events.slice(0, step).reduce((s, e) => s + (e.kind === 'drop' || e.kind === 'exports' ? e.kb : 0), 0);
}

export const CHUNK_TONE: Record<string, Tone> = { initial: 'info', shared: 'sky', lazy: 'violet', module: 'info' };
export const chunkName = (c: Chunk) => (c.id === INITIAL ? 'initial chunk' : c.id === SHARED ? 'shared (vendor) chunk' : `lazy chunk: ${label(c.modules[0])}`);

function eventCaption(e: ShakeEvent, b: Build): ReactNode {
  const m = b.graph.modules[e.id];
  switch (e.kind) {
    case 'drop':
      return <><b>{label(e.id)}</b> is imported but never used, and importing it does nothing else: the bundler drops the whole module (−{kbText(e.kb)}).</>;
    case 'exports':
      return <><b>{label(e.id)}</b> is an ES module, so the bundler can see exactly which exports are imported. It keeps <b>{b.shaken.keptExports[e.id].join(', ')}</b> and
        removes {e.removed.join(', ')} (−{kbText(e.kb)}).{e.id === 'datelib' ? <> The kept ones are what main, settings and reports use between them.</> : null}</>;
    case 'sideEffect':
      return <><b>{label(e.id)}</b> is never used, but it is marked as having side effects (it registers itself when imported), so removing it could change what the app does. It
        stays, <span className="hl orange">kept only because of its side effects</span>.</>;
    case 'cjs':
      return <><b>{label(e.id)}</b> is CommonJS (<code>require</code>): what it exports is only known when the code runs, so the bundler cannot tell which parts are unused. It stays
        whole ({kbText(moduleKb(m))}) although only {b.shaken.keptExports[e.id].length ? 'part of it' : 'none of it'} is used.</>;
  }
}

/** The whole story: walk, shake, split. */
export function buildFrames(b: Build, o: AppOptions): BuildFrame[] {
  const frames: BuildFrame[] = [];
  const base = { visited: [] as string[], current: null as string | null, shakeStep: 0, splitStep: 0 as 0 | 1 | 2 };
  frames.push({
    ...base, phase: 'walk',
    say: <>A fictional app of {b.walk.length} modules. A bundler starts at the entry, <code>main.js</code>, and follows every import. Press play to watch it walk the graph and
      concatenate what it finds.</>,
  });
  let size = 0;
  b.walk.forEach((id, i) => {
    const kb = moduleKb(b.graph.modules[id]);
    size += kb;
    frames.push({
      ...base, phase: 'walk', visited: b.walk.slice(0, i + 1), current: id,
      say: <>Visiting <b>{label(id)}</b> (+{kbText(kb)}). The bundle is now {kbText(size)}.</>,
    });
  });
  frames.push({
    ...base, phase: 'walk', visited: b.walk,
    say: <><span className="hl info">Bundled</span>: everything reachable from the entry, {kbText(b.fullKb)} in one file. That includes things nothing uses, so far.</>,
  });
  const events = shakeEvents(b);
  events.forEach((e, i) => {
    frames.push({ ...base, phase: 'shake', visited: b.walk, shakeStep: i + 1, say: eventCaption(e, b) });
  });
  frames.push({
    ...base, phase: 'shake', visited: b.walk, shakeStep: events.length,
    say: <><span className="hl ok">Tree shaken</span>: {kbText(b.fullKb)} down to {kbText(b.shakenKb)}. Shaking needs ES modules, whose imports and exports are fixed in the source, and
      code with no side effects; without either, the code stays. This is whole-program: an export survives if any importer uses it.</>,
  });
  if (o.splitReports) {
    frames.push({
      ...base, phase: 'split', visited: b.walk, shakeStep: events.length, splitStep: 1,
      say: <>Now <b>reports</b> is loaded with <code>import(&apos;./reports&apos;)</code> instead of a plain import. The dashed violet edge means: not needed to show the first screen,
        fetch it when it is asked for.</>,
    });
  }
  const chunkText = b.chunks.map((c) => `${chunkName(c)} ${kbText(c.kb)}`).join(', ');
  frames.push({
    ...base, phase: 'split', visited: b.walk, shakeStep: events.length, splitStep: 2,
    say: o.splitReports
      ? <><span className="hl violet">Split</span> into {b.chunks.length} chunks: {chunkText}. A module needed by only the first screen goes in the initial chunk, one needed only by reports goes in
        reports&apos; chunk, and <b>datelib</b>, needed by both, goes in a shared chunk so it is not shipped twice.</>
      : <>Nothing is loaded on demand, so there is nothing to split: one chunk of {kbText(b.shakenKb)}. Turn on the dynamic import to see reports move out.</>,
  });
  return frames;
}
