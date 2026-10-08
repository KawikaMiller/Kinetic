import type { GanttBar, GanttLane, GanttMarker } from '../../components/GanttLanes';
import { clamp01 } from '../../core/math';
import { CSS_IDS, RESOURCES, SCRIPT_IDS, isNonBlocking, isRenderBlocking, type Config, type ResId, type ScriptId, type Timeline } from './model';

export const PARSER_LANE = 'parser';

/** One lane per resource, then the parser. An inlined stylesheet has no download, so its lane says so. */
export function lanesFor(cfg: Config): GanttLane[] {
  return [
    { id: 'html', label: RESOURCES.html.file },
    ...CSS_IDS.map((id) => ({ id, label: cfg.css[id] === 'inline' ? `${RESOURCES[id].file} (inlined)` : RESOURCES[id].file })),
    ...SCRIPT_IDS.map((id) => ({ id, label: RESOURCES[id].file })),
    { id: 'font', label: RESOURCES.font.file },
    { id: 'hero', label: RESOURCES.hero.file },
    { id: PARSER_LANE, label: 'parser' },
  ];
}

/** A render-blocking stylesheet is outlined red; anything that blocks nothing is a dim outline. */
function ringOf(id: ResId, cfg: Config): GanttBar['ring'] {
  if (id === 'html') return undefined;
  if (id === 'main' || id === 'widgets') return isRenderBlocking(id, cfg) ? 'bad' : 'dim';
  return isNonBlocking(id, cfg) ? 'dim' : undefined;
}

/** The last moment anything happens: the load event, or a font or image that arrives after it. */
export function lastEventAt(tl: Timeline): number {
  return Math.max(tl.loadAt, ...Object.values(tl.fetches).map((f) => f.done));
}

/** The parser bar's text: the longest label any bar in this chart carries. */
export const blockedLabel = (id: ScriptId) => `blocked: ${RESOURCES[id].file}`;
export const LONGEST_LABEL = blockedLabel('analytics');

/** The time axis: the whole load, rounded up to a clean tick. */
export function domainEnd(tl: Timeline): number {
  return Math.ceil((lastEventAt(tl) + 40) / 100) * 100;
}

/** A bar drawn up to `now`: not started is just the dashed plan, started fills as time passes. */
function timed(bar: Omit<GanttBar, 'tone' | 'progress'> & { tone: NonNullable<GanttBar['tone']> }, now: number): GanttBar {
  const length = bar.end - bar.start;
  const progress = length <= 0 ? 1 : clamp01((now - bar.start) / length);
  if (now <= bar.start) return { ...bar, tone: undefined, progress: 0 };
  return { ...bar, progress };
}

/** Consecutive parse tasks draw as one stretch of parsing. */
function parseStretches(tl: Timeline): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const t of tl.tasks) {
    if (t.kind !== 'parse') continue;
    const last = out.at(-1);
    if (last && last.end === t.start) last.end = t.end;
    else out.push({ start: t.start, end: t.end });
  }
  return out;
}

/** Every bar of the waterfall at time `now`. */
export function barsAt(tl: Timeline, now: number): GanttBar[] {
  const { cfg } = tl;
  const bars: GanttBar[] = [];
  for (const id of Object.keys(tl.fetches) as ResId[]) {
    const f = tl.fetches[id]!;
    const ring = ringOf(id, cfg);
    bars.push(timed({ id: `${id}-wait`, lane: id, start: f.start, end: f.start + cfg.rtt, tone: 'dim', kind: 'blocked', label: 'first byte' }, now));
    bars.push(timed({ id: `${id}-get`, lane: id, start: f.start + cfg.rtt, end: f.done, tone: 'info', ring, label: RESOURCES[id].file }, now));
  }
  for (const id of SCRIPT_IDS) {
    const run = tl.execAt[id]!;
    bars.push(timed({ id: `${id}-run`, lane: id, start: run.start, end: run.end, tone: 'hi', label: 'run' }, now));
  }
  parseStretches(tl).forEach((s, i) => bars.push(timed({ id: `parse-${i}`, lane: PARSER_LANE, start: s.start, end: s.end, tone: 'muted', label: 'parse' }, now)));
  tl.blocks.forEach((b) => bars.push(timed({ id: `block-${b.on}`, lane: PARSER_LANE, start: b.start, end: b.end, tone: 'bad', kind: 'wait', label: blockedLabel(b.on) }, now)));
  return bars;
}

/** First paint, DOMContentLoaded and load, where the solved load puts them. */
export function markersOf(tl: Timeline): GanttMarker[] {
  return [
    { at: tl.firstPaintAt, label: 'first paint', tone: 'ok' },
    { at: tl.dclAt, label: 'DOMContentLoaded', tone: 'violet' },
    { at: tl.loadAt, label: 'load', tone: 'muted' },
  ];
}
