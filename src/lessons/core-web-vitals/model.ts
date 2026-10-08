/**
 * Pure model of the three Core Web Vitals: the threshold bands, the Largest Contentful Paint
 * candidate rule on a scripted page load, layout-shift scoring with session windows, and the
 * Interaction to Next Paint selection rule. The definitions are the real ones (web.dev); the
 * page loads and layouts they are applied to are scripted illustrations.
 */

// ── Thresholds ───────────────────────────────────────────────────────────

export type MetricId = 'lcp' | 'inp' | 'cls';
export type Band = 'good' | 'needs' | 'poor';

/** A value is good up to and including `good`, needs improvement up to and including `poor`. */
export const THRESHOLDS: Record<MetricId, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

export function bandOf(metric: MetricId, value: number): Band {
  const t = THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs';
  return 'poor';
}

export const BAND_TONE = { good: 'ok', needs: 'orange', poor: 'bad' } as const;
export const BAND_LABEL: Record<Band, string> = { good: 'good', needs: 'needs improvement', poor: 'poor' };

// ── LCP ──────────────────────────────────────────────────────────────────

export const VIEWPORT = { w: 360, h: 640 } as const;
export const VIEWPORT_AREA = VIEWPORT.w * VIEWPORT.h;

export type ElementId = 'heading' | 'text' | 'hero';

export interface PageElement {
  id: ElementId;
  label: string;
  /** Visible area, px². */
  area: number;
  /** When it is painted, ms. */
  at: number;
}

export interface LcpOptions {
  /** `<link rel="preload">` for the hero: its request starts when the HTML arrives. */
  preload: boolean;
  /** A script-based lazy loader sets the hero's src only once its script has run. */
  lazy: boolean;
  /** A smaller file for the same on-screen picture. */
  small: boolean;
  /** The first tap or key press, ms, or null for none. Later elements cannot become the LCP. */
  inputAt: number | null;
}

/** The scripted timings of the page load, ms. */
export const LCP_TIMES = {
  html: 300,
  heading: 800,
  text: 1700,
  /** The stylesheet has been parsed: a plain `<img>` is discovered. */
  cssParsed: 900,
  /** The lazy-load script has run. */
  script: 1500,
  rtt: 150,
  /** One more frame to paint the image once it is in. */
  paint: 50,
} as const;
export const HERO_KB = { large: 1200, small: 300 } as const;
/** 0.5 KB per ms: a slow mobile connection, about 4 Mbit/s. */
export const KB_PER_MS = 0.5;

const HEADING_AREA = VIEWPORT.w * 50;
const TEXT_AREA = VIEWPORT.w * 170;
const HERO_AREA = VIEWPORT.w * 330;

/** When the hero's request goes out, and when its bytes are all in. */
export function heroFetch(o: Pick<LcpOptions, 'preload' | 'lazy' | 'small'>): { start: number; done: number } {
  const discovered = o.lazy ? LCP_TIMES.script : LCP_TIMES.cssParsed;
  const start = o.preload ? LCP_TIMES.html : discovered;
  const kb = o.small ? HERO_KB.small : HERO_KB.large;
  return { start, done: start + LCP_TIMES.rtt + kb / KB_PER_MS };
}

/** Every element of the page with the moment it is painted. */
export function pageElements(o: LcpOptions): PageElement[] {
  const fetch = heroFetch(o);
  // A lazy-loaded image is not put on the page before its loader has run, even if the bytes are in already.
  const heroReady = o.lazy ? Math.max(fetch.done, LCP_TIMES.script) : fetch.done;
  return [
    { id: 'heading', label: 'Heading', area: HEADING_AREA, at: LCP_TIMES.heading },
    { id: 'text', label: 'Text block', area: TEXT_AREA, at: LCP_TIMES.text },
    { id: 'hero', label: 'Hero image', area: HERO_AREA, at: heroReady + LCP_TIMES.paint },
  ];
}

/**
 * The LCP candidates in the order the browser reports them: an element becomes a candidate when it
 * is painted and is larger than every candidate before it. Anything painted after the first input
 * is never a candidate. Elements painted in the same frame are taken smallest first.
 */
export function lcpCandidates(elements: readonly PageElement[], inputAt: number | null): PageElement[] {
  const ordered = [...elements].sort((a, b) => a.at - b.at || a.area - b.area);
  const out: PageElement[] = [];
  let largest = 0;
  for (const el of ordered) {
    if (inputAt !== null && el.at > inputAt) continue;
    if (el.area > largest) {
      out.push(el);
      largest = el.area;
    }
  }
  return out;
}

/** The LCP: the render time of the last candidate. */
export function lcpOf(o: LcpOptions): { value: number; element: PageElement } {
  const candidates = lcpCandidates(pageElements(o), o.inputAt);
  const element = candidates[candidates.length - 1];
  return { value: element.at, element };
}

// ── CLS ──────────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Area of the part of `r` inside the viewport. */
function visibleArea(r: Rect): number {
  const w = Math.max(0, Math.min(r.x + r.w, VIEWPORT.w) - Math.max(r.x, 0));
  const h = Math.max(0, Math.min(r.y + r.h, VIEWPORT.h) - Math.max(r.y, 0));
  return w * h;
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

/** Area of the union of `a` and `b` that is inside the viewport. */
export function impactArea(a: Rect, b: Rect): number {
  const clip = (r: Rect): Rect => {
    const x = Math.max(r.x, 0);
    const y = Math.max(r.y, 0);
    return { x, y, w: Math.max(0, Math.min(r.x + r.w, VIEWPORT.w) - x), h: Math.max(0, Math.min(r.y + r.h, VIEWPORT.h) - y) };
  };
  const ca = clip(a);
  const cb = clip(b);
  return visibleArea(a) + visibleArea(b) - overlapArea(ca, cb);
}

/** Share of the viewport the moved element covered before or after the shift. */
export const impactFraction = (before: Rect, after: Rect) => impactArea(before, after) / VIEWPORT_AREA;

/** Furthest the element moved, as a share of the viewport's larger side. */
export const distanceFraction = (before: Rect, after: Rect) =>
  Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y)) / Math.max(VIEWPORT.w, VIEWPORT.h);

/** The layout-shift score: impact fraction times distance fraction. */
export const shiftScore = (before: Rect, after: Rect) => impactFraction(before, after) * distanceFraction(before, after);

export type ShiftId = 'image' | 'ad' | 'font' | 'tap' | 'banner';

export interface ShiftSpec {
  id: ShiftId;
  label: string;
  /** What causes it, in a phrase. */
  cause: string;
  /** What stops it. */
  fix: string;
  /** When it happens, ms. */
  at: number;
  /** The user tapped this long before it happened, or null. */
  inputBefore: number | null;
  before: Rect;
  after: Rect;
}

const SHIFT_X = 0;
const SHIFT_W = VIEWPORT.w;
const moved = (y: number, h: number, dy: number): Pick<ShiftSpec, 'before' | 'after'> => ({
  before: { x: SHIFT_X, y, w: SHIFT_W, h },
  after: { x: SHIFT_X, y: y + dy, w: SHIFT_W, h },
});

/** Each shift is scored on its own scripted layout: the element that moves, and how far. */
export const SHIFTS: readonly ShiftSpec[] = [
  { id: 'image', label: 'Image without dimensions', cause: 'the image has no width and height, so it takes no space until it has loaded', fix: 'width and height (or aspect-ratio)', at: 1000, inputBefore: null, ...moved(260, 340, 160) },
  { id: 'ad', label: 'Late ad, no reserved space', cause: 'an ad is inserted above the article and pushes it down', fix: 'a slot with a reserved height', at: 1400, inputBefore: null, ...moved(140, 460, 250) },
  { id: 'font', label: 'Web font swap', cause: 'the web font is wider than the fallback, so the text re-wraps and grows', fix: 'a fallback matched to the font (size-adjust) or font-display: optional', at: 2200, inputBefore: null, ...moved(300, 300, 24) },
  { id: 'tap', label: 'Panel opens after your tap', cause: 'a tap opens a panel that pushes the content down', fix: 'none needed for the score: a shift soon after your own input is excluded', at: 5200, inputBefore: 200, ...moved(200, 400, 120) },
  { id: 'banner', label: 'Cookie banner, late', cause: 'a banner is inserted at the top and pushes the page down', fix: 'overlay it, or reserve its height', at: 8000, inputBefore: null, ...moved(60, 540, 60) },
];

/** A shift this soon after an input does not count towards CLS. */
export const RECENT_INPUT_MS = 500;
/** Shifts less than this far apart share a session window. */
export const WINDOW_GAP_MS = 1000;
/** A session window is never longer than this. */
export const WINDOW_CAP_MS = 5000;

export interface LayoutShift {
  id: string;
  at: number;
  score: number;
  /** True when the user's input came within RECENT_INPUT_MS before it. */
  recentInput: boolean;
}

export interface SessionWindow {
  shifts: LayoutShift[];
  start: number;
  end: number;
  value: number;
}

/**
 * Group the shifts that count (those without recent input) into session windows: a new window
 * starts when a shift is 1 s or more after the previous one, or 5 s or more after the first of
 * its window. A window's value is the sum of its scores.
 */
export function sessionWindows(shifts: readonly LayoutShift[]): SessionWindow[] {
  const counted = shifts.filter((s) => !s.recentInput).sort((a, b) => a.at - b.at);
  const windows: SessionWindow[] = [];
  for (const s of counted) {
    const w = windows[windows.length - 1];
    if (w && s.at - w.end < WINDOW_GAP_MS && s.at - w.start < WINDOW_CAP_MS) {
      w.shifts.push(s);
      w.end = s.at;
      w.value += s.score;
    } else windows.push({ shifts: [s], start: s.at, end: s.at, value: s.score });
  }
  return windows;
}

/** CLS: the value of the worst session window (0 when nothing shifted). */
export const clsOf = (shifts: readonly LayoutShift[]): number => Math.max(0, ...sessionWindows(shifts).map((w) => w.value));

/** The shifts a page really has: every spec the learner has not fixed. */
export function shiftsFor(fixed: ReadonlySet<ShiftId>): LayoutShift[] {
  return SHIFTS.filter((s) => !fixed.has(s.id)).map((s) => ({
    id: s.id,
    at: s.at,
    score: shiftScore(s.before, s.after),
    recentInput: s.inputBefore !== null && s.inputBefore <= RECENT_INPUT_MS,
  }));
}

/** Which window of `windows` a shift is in (1-based), or null when it is excluded. */
export function windowIndexOf(windows: readonly SessionWindow[], id: string): number | null {
  const i = windows.findIndex((w) => w.shifts.some((s) => s.id === id));
  return i < 0 ? null : i + 1;
}

// ── INP ──────────────────────────────────────────────────────────────────

export interface Interaction {
  id: number;
  /** Time from the input until its handler started, ms. */
  inputDelay: number;
  /** Time in the handler, ms. */
  processing: number;
  /** Time from the end of the handler until the next frame was painted, ms. */
  presentation: number;
}

export const interactionTotal = (i: Interaction) => i.inputDelay + i.processing + i.presentation;

/** One interaction in 50 is ignored, worst first. */
export const IGNORED_PER = 50;

/** The interaction INP reports: the worst one, after ignoring the worst of each 50 interactions. */
export function inpOf(interactions: readonly Interaction[]): Interaction | null {
  if (!interactions.length) return null;
  const worstFirst = [...interactions].sort((a, b) => interactionTotal(b) - interactionTotal(a));
  return worstFirst[Math.min(Math.floor(interactions.length / IGNORED_PER), worstFirst.length - 1)];
}

/** Handler work in `CHUNK_MS` slices: the most the main thread is held at a time when the handler yields. */
export const CHUNK_MS = 8;

export type InpFix = 'none' | 'yield' | 'worker';

/** What the handler does on the main thread before it returns, in ms of work, for a given amount of total work. */
export function mainThreadWork(fix: InpFix, workMs: number): number {
  if (fix === 'worker') return 0;
  if (fix === 'yield') return Math.min(workMs, CHUNK_MS);
  return workMs;
}

/** The slices a yielding handler splits `workMs` into: each at most CHUNK_MS, summing to the total. */
export function chunksOf(workMs: number): number[] {
  const out: number[] = [];
  for (let left = workMs; left > 0; left -= CHUNK_MS) out.push(Math.min(CHUNK_MS, left));
  return out;
}

// ── Showing a metric ─────────────────────────────────────────────────────

/** The metric as the thresholds are written: LCP in seconds, INP in ms, CLS as a plain number. */
export function formatMetric(metric: MetricId, value: number): string {
  if (metric === 'lcp') return `${Number((value / 1000).toFixed(2))} s`;
  if (metric === 'inp') return `${Math.round(value)} ms`;
  return value.toFixed(3);
}

/** The full-scale value of each metric's meter: far enough past "poor" to show how bad it is. */
export const METER_MAX: Record<MetricId, number> = { lcp: 6000, inp: 800, cls: 0.5 };
