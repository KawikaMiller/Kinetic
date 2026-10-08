/**
 * Pure model of four ways to render a page: in the browser (CSR), on the server per request (SSR),
 * once at build time (SSG), and on the server in a stream (SSR with streaming). Each strategy
 * is a timeline of milestones, in whole milliseconds from the moment the user asks for the page,
 * built from the dependency rules: hydration needs the HTML and the JavaScript, client-side
 * rendering needs the JavaScript before it can even ask for data, and so on. The network, the
 * server and the device are illustrative; real frameworks add their own steps.
 */

export type StrategyId = 'csr' | 'ssr' | 'ssg' | 'stream';
export const STRATEGY_IDS: readonly StrategyId[] = ['csr', 'ssr', 'ssg', 'stream'];

export const STRATEGY_LABEL: Record<StrategyId, string> = {
  csr: 'Client-side (CSR)',
  ssr: 'Server-side (SSR)',
  ssg: 'Static (SSG)',
  stream: 'SSR, streaming',
};
export const STRATEGY_SHORT: Record<StrategyId, string> = { csr: 'CSR', ssr: 'SSR', ssg: 'SSG', stream: 'Streaming' };

export interface Inputs {
  /** How long the data takes to come back from its source, ms. */
  dataMs: number;
  /** The JavaScript bundle, KB (compressed). */
  bundleKb: number;
  /** How many times slower the device is than the reference: scales every bit of JavaScript work. */
  cpu: number;
}

/** The fixed parts of the model. */
export const NET = {
  /** Round trip, ms. */
  rtt: 100,
  /** Bandwidth, KB per ms (about 4 Mbit/s). */
  kbPerMs: 0.5,
  /** The empty page a client-rendered app starts from, KB. */
  shellKb: 2,
  /** The finished page, KB. */
  htmlKb: 30,
  /** The first chunk of a streamed page (header, skeleton), KB. */
  streamShellKb: 6,
  /** The server turns the data into HTML, ms. */
  renderHtmlMs: 60,
  /** The browser draws what it was given, ms. */
  paintMs: 10,
  /** Running the bundle: parse and execute, ms per KB at the reference speed. */
  runMsPerKb: 0.4,
  /** Rendering or hydrating the component tree, ms per KB of bundle at the reference speed. */
  treeMsPerKb: 0.3,
} as const;

export const RANGES = {
  dataMs: { min: 0, max: 1500, step: 50 },
  bundleKb: { min: 50, max: 1500, step: 50 },
  cpu: { min: 1, max: 6, step: 1 },
} as const;

export type ScreenState = 'blank' | 'shell' | 'content' | 'interactive';

export interface Bar {
  lane: 'server' | 'network' | 'browser';
  label: string;
  start: number;
  end: number;
}

export interface Timeline {
  id: StrategyId;
  /** The first bytes of the response reach the browser. */
  firstByteAt: number;
  /** The first time the screen shows real content: the heading, the text, the header. */
  firstPaintAt: number;
  /** The main content is on screen. */
  contentAt: number;
  /** The page responds to a tap: its JavaScript has run and attached to what is on screen. */
  interactiveAt: number;
  /** Work done on a server for every request, ms (the data and the HTML). Zero when nothing is rendered per request. */
  serverMsPerRequest: number;
  /** The JavaScript is all in. */
  jsDoneAt: number;
  /** The JavaScript starts running. */
  runAt: number;
  bars: Bar[];
}

const transfer = (kb: number) => kb / NET.kbPerMs;
/** The request has crossed the network (half a round trip): the server starts its work. */
const SERVER_AT = NET.rtt / 2;

/** The milestones and bars of one strategy. */
export function timeline(id: StrategyId, input: Inputs): Timeline {
  const { dataMs, bundleKb, cpu } = input;
  const run = bundleKb * NET.runMsPerKb * cpu;
  const tree = bundleKb * NET.treeMsPerKb * cpu;
  const jsTransfer = NET.rtt + transfer(bundleKb);
  const bars: Bar[] = [];

  if (id === 'csr') {
    const htmlDone = NET.rtt + transfer(NET.shellKb);
    const jsDone = htmlDone + jsTransfer;
    const ranAt = jsDone + run;
    const dataDone = ranAt + NET.rtt + dataMs;
    const renderEnd = dataDone + tree;
    bars.push(
      { lane: 'network', label: 'shell', start: NET.rtt, end: htmlDone },
      { lane: 'network', label: 'JS', start: htmlDone, end: jsDone },
      { lane: 'browser', label: 'run JS', start: jsDone, end: ranAt },
      { lane: 'network', label: 'data', start: ranAt, end: dataDone },
      { lane: 'browser', label: 'render', start: dataDone, end: renderEnd },
    );
    return {
      id, firstByteAt: NET.rtt, firstPaintAt: renderEnd + NET.paintMs, contentAt: renderEnd + NET.paintMs, interactiveAt: renderEnd + NET.paintMs,
      serverMsPerRequest: 0, jsDoneAt: jsDone, runAt: jsDone, bars,
    };
  }

  if (id === 'stream') {
    const shellDone = NET.rtt + transfer(NET.streamShellKb);
    const ready = NET.rtt + dataMs + NET.renderHtmlMs;
    const contentDone = Math.max(shellDone, ready) + transfer(NET.htmlKb - NET.streamShellKb);
    const jsDone = NET.rtt + jsTransfer;
    const start = Math.max(contentDone, jsDone);
    const ranAt = start + run;
    bars.push(
      { lane: 'server', label: 'data', start: SERVER_AT, end: SERVER_AT + dataMs },
      { lane: 'server', label: 'render', start: SERVER_AT + dataMs, end: SERVER_AT + dataMs + NET.renderHtmlMs },
      { lane: 'network', label: 'shell', start: NET.rtt, end: shellDone },
      { lane: 'network', label: 'rest', start: Math.max(shellDone, ready), end: contentDone },
      { lane: 'network', label: 'JS', start: NET.rtt, end: jsDone },
      { lane: 'browser', label: 'hydrate', start, end: ranAt + tree },
    );
    return {
      id, firstByteAt: NET.rtt, firstPaintAt: shellDone + NET.paintMs, contentAt: contentDone + NET.paintMs, interactiveAt: ranAt + tree,
      serverMsPerRequest: dataMs + NET.renderHtmlMs, jsDoneAt: jsDone, runAt: start, bars,
    };
  }

  // SSR renders per request; SSG renders once at build time, so its request is answered at once.
  const serverMs = id === 'ssr' ? dataMs + NET.renderHtmlMs : 0;
  const firstByte = NET.rtt + serverMs;
  const htmlDone = firstByte + transfer(NET.htmlKb);
  const jsDone = firstByte + jsTransfer;
  const start = Math.max(htmlDone, jsDone);
  const ranAt = start + run;
  if (id === 'ssr') {
    bars.push({ lane: 'server', label: 'data', start: SERVER_AT, end: SERVER_AT + dataMs }, { lane: 'server', label: 'render', start: SERVER_AT + dataMs, end: SERVER_AT + serverMs });
  }
  bars.push(
    { lane: 'network', label: 'HTML', start: firstByte, end: htmlDone },
    { lane: 'network', label: 'JS', start: firstByte, end: jsDone },
    { lane: 'browser', label: 'hydrate', start, end: ranAt + tree },
  );
  return {
    id, firstByteAt: firstByte, firstPaintAt: htmlDone + NET.paintMs, contentAt: htmlDone + NET.paintMs, interactiveAt: ranAt + tree,
    serverMsPerRequest: serverMs, jsDoneAt: jsDone, runAt: start, bars,
  };
}

/** What is on the phone at time `t`. */
export function screenAt(tl: Timeline, t: number): ScreenState {
  if (t >= tl.interactiveAt) return 'interactive';
  if (t >= tl.contentAt) return 'content';
  if (t >= tl.firstPaintAt) return 'shell';
  return 'blank';
}

/** The stretch where the content is on screen but taps do nothing (zero when they arrive together). */
export const valleyMs = (tl: Timeline) => tl.interactiveAt - tl.contentAt;

// ── The comparison table ─────────────────────────────────────────────────

export interface Facts {
  /** What a crawler or a reader without JavaScript gets from the first response. */
  htmlHasContent: boolean;
  /** When the data was read. */
  freshness: 'every load' | 'every request' | 'at the last build';
  /** The first response is served from storage, without running application code. */
  staticResponse: boolean;
}

export const FACTS: Record<StrategyId, Facts> = {
  csr: { htmlHasContent: false, freshness: 'every load', staticResponse: true },
  ssr: { htmlHasContent: true, freshness: 'every request', staticResponse: false },
  ssg: { htmlHasContent: true, freshness: 'at the last build', staticResponse: true },
  stream: { htmlHasContent: true, freshness: 'every request', staticResponse: false },
};

export interface Row {
  id: StrategyId;
  label: string;
  seo: string;
  firstPaintMs: number;
  /** When the real content is on screen: the first paint, except for streaming, which paints its shell first. */
  contentMs: number;
  interactiveMs: number;
  /** Per-request server work: none, or the milliseconds of data and rendering. */
  serverCost: string;
  freshness: string;
}

/** The table, every cell derived from the timeline and the facts. */
export function tableRows(input: Inputs): Row[] {
  return STRATEGY_IDS.map((id) => {
    const tl = timeline(id, input);
    const f = FACTS[id];
    return {
      id,
      label: STRATEGY_LABEL[id],
      seo: f.htmlHasContent ? 'content in the HTML' : 'an empty shell',
      firstPaintMs: tl.firstPaintAt,
      contentMs: tl.contentAt,
      interactiveMs: tl.interactiveAt,
      serverCost: tl.serverMsPerRequest > 0 ? `${tl.serverMsPerRequest} ms of work` : f.staticResponse ? 'a file served' : 'none',
      freshness: f.freshness,
    };
  });
}

// ── Presets ──────────────────────────────────────────────────────────────

export type PresetId = 'default' | 'marketing' | 'dashboard' | 'phone';

export const PRESETS: Record<PresetId, { label: string; inputs: Inputs; blurb: string }> = {
  default: { label: 'Middle of the road', inputs: { dataMs: 400, bundleKb: 400, cpu: 1 }, blurb: 'a typical app on a typical device' },
  marketing: { label: 'Marketing page', inputs: { dataMs: 600, bundleKb: 150, cpu: 1 }, blurb: 'content that rarely changes, a small bundle' },
  dashboard: { label: 'Logged-in dashboard', inputs: { dataMs: 800, bundleKb: 900, cpu: 2 }, blurb: 'a big app on live data' },
  phone: { label: 'Slow phone', inputs: { dataMs: 300, bundleKb: 600, cpu: 5 }, blurb: 'a mid-range phone: running JavaScript is the cost' },
};
export const DEFAULT_PRESET: PresetId = 'default';

/** The fastest strategies at something: every one that ties for the lead. */
export function best(rows: readonly Row[], key: 'firstPaintMs' | 'contentMs' | 'interactiveMs'): StrategyId[] {
  const fastest = Math.min(...rows.map((r) => r[key]));
  return rows.filter((r) => r[key] === fastest).map((r) => r.id);
}

// ── Events, for the captions ─────────────────────────────────────────────

export interface Milestone {
  id: StrategyId;
  at: number;
  kind: 'firstByte' | 'paint' | 'content' | 'js' | 'interactive';
}

/** Every milestone of every shown strategy, in time order (ties keep strategy order). */
export function milestones(input: Inputs, shown: readonly StrategyId[]): Milestone[] {
  const out: Milestone[] = [];
  for (const id of shown) {
    const tl = timeline(id, input);
    out.push({ id, at: tl.firstByteAt, kind: 'firstByte' }, { id, at: tl.firstPaintAt, kind: 'paint' });
    if (tl.contentAt > tl.firstPaintAt) out.push({ id, at: tl.contentAt, kind: 'content' });
    out.push({ id, at: tl.jsDoneAt, kind: 'js' }, { id, at: tl.interactiveAt, kind: 'interactive' });
  }
  return out.sort((a, b) => a.at - b.at);
}
