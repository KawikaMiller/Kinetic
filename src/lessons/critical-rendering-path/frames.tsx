import type { ReactNode } from 'react';
import { ms } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  CSS_IDS, EXEC_MS, NEEDS, RESOURCES, SCRIPT_IDS, htmlKb, screenAt, type Config, type CssId, type ResId, type Screen, type ScriptId, type Timeline,
} from './model';

export interface CrpFrame extends Frame {
  /** The time the cursor sits at, ms. */
  now: number;
}

export interface Moment {
  t: number;
  say: ReactNode;
}

const file = (id: ResId) => RESOURCES[id].file;
const MOMENT_HOLD = 2;

/** What the viewer sees, in words. */
export function describeScreen(s: Screen): string {
  if (!s.painted) return 'blank: nothing drawn yet';
  const text =
    s.text === 'none' ? 'no text yet'
      : s.text === 'invisible' ? 'text hidden while its font loads'
        : s.text === 'fallback' ? 'text in a fallback font'
          : 'text in the web font';
  return `${text}, ${s.hero ? 'hero image shown' : 'no hero image yet'}`;
}

/** What the first paint waited for, in words (the last thing to arrive before it could happen). */
export function gateText(tl: Timeline): ReactNode {
  const { gate, cfg } = tl;
  if (gate.by === 'css' && gate.css) {
    return <>the render-blocking stylesheet <b>{file(gate.css)}</b>, which arrived at {ms(tl.cssReadyAt)}: nothing paints until every normal stylesheet is in</>;
  }
  if (gate.by === 'main-thread') return <>a script that was still running on the main thread when the page was ready to draw</>;
  const syncScripts = gate.scripts.filter((id) => tl.blocks.some((b) => b.on === id));
  if (syncScripts.length) {
    return <>the parser reaching the page&apos;s content at {ms(tl.contentAt)}, held up by the synchronous {syncScripts.map((id, i) => <span key={id}>{i ? ', ' : ''}<b>{file(id)}</b></span>)} in the head</>;
  }
  return <>the parser reaching the page&apos;s content at {ms(tl.contentAt)}{cfg.css.main === 'inline' && cfg.css.widgets !== 'normal' ? ': no stylesheet or script stood in the way' : ''}</>;
}

function arrivalNote(id: ResId, cfg: Config): ReactNode {
  if (id === 'main' || id === 'widgets') {
    const mode = cfg.css[id as CssId];
    return mode === 'print'
      ? <>It was loaded as <code>media=&quot;print&quot;</code> and swaps itself in when it arrives, so nothing waited for it.</>
      : <>It is render-blocking: nothing paints until every normal stylesheet is in.</>;
  }
  if (id === 'font') return <>The page can switch to the web font in the next frame.</>;
  if (id === 'hero') return <>It can be drawn in the next frame.</>;
  const mode = cfg.scripts[id as ScriptId];
  if (mode === 'sync') return <>A plain script runs when the parser reaches it, once the stylesheets above it are in.</>;
  if (mode === 'async') return <><code>async</code>: it runs as soon as it has arrived and its tag has been parsed, in whatever order that happens.</>;
  return <><code>{mode === 'defer' ? 'defer' : 'type="module"'}</code>: it waits for the parser to finish, then runs in document order.</>;
}

/** The events of one load, each in the past tense so a caption stays true until the next. */
export function moments(tl: Timeline): Moment[] {
  const { cfg } = tl;
  const out: Moment[] = [];
  out.push({
    t: tl.htmlEnd,
    say: <><b>{file('html')}</b> ({htmlKb(cfg)} KB) arrived after {ms(tl.htmlEnd)}, and the parser started.{' '}
      {cfg.scanner
        ? <>The preload scanner reads the markup ahead of the parser and started every stylesheet and script it saw, all at once.</>
        : <>With no preload scanner (a what-if), a download only starts when the parser reaches its tag.</>}</>,
  });
  for (const id of Object.keys(tl.fetches) as ResId[]) {
    if (id === 'html') continue;
    out.push({ t: tl.fetches[id]!.done, say: <><b>{file(id)}</b> arrived. {arrivalNote(id, cfg)}</> });
  }
  for (const b of tl.blocks) {
    out.push({
      t: b.start,
      say: <>The parser reached the plain <code>&lt;script src=&quot;{file(b.on)}&quot;&gt;</code> and <span className="hl bad">stopped</span>: it reads nothing more until that
        script has downloaded, the stylesheets above it have arrived, and it has run.</>,
    });
  }
  for (const id of tl.execOrder) {
    const run = tl.execAt[id]!;
    const mode = cfg.scripts[id];
    const needs = NEEDS[id];
    const bad = tl.broken.some((x) => x.script === id);
    out.push({
      t: run.end,
      say: bad && needs
        ? <><span className="hl bad">✕ {file(id)} ran before {file(needs)}</span> ({ms(EXEC_MS[id])}). It needs {file(needs)}&apos;s code, and <code>async</code> promises no order, so it failed.</>
        : mode === 'sync'
          ? <><b>{file(id)}</b> ran ({ms(EXEC_MS[id])}) and the parser carried on.</>
          : <><b>{file(id)}</b> ran ({ms(EXEC_MS[id])}){mode === 'async' ? <>, as soon as it could: <code>async</code> runs whenever it arrives, with no order promised.</> : <>, after parsing, in document order.</>}</>,
    });
  }
  out.push({ t: tl.parseEndAt, say: <>The parser finished the document.</> });
  const first = screenAt(tl, tl.firstPaintAt);
  out.push({
    t: tl.firstPaintAt,
    say: <><span className="hl ok">First paint</span> at {ms(tl.firstPaintAt)}, after waiting for {gateText(tl)}. On screen: {describeScreen(first)}.</>,
  });
  out.push({
    t: tl.dclAt,
    say: <><span className="hl violet">DOMContentLoaded</span> at {ms(tl.dclAt)}: the document is parsed and the <code>defer</code> and module scripts have run. Neither <code>async</code> scripts nor images hold it up.</>,
  });
  out.push({
    t: tl.loadAt,
    say: <><b>load</b> at {ms(tl.loadAt)}: the scripts, stylesheets and the hero image the page asked for are all in.</>,
  });
  const end = Math.max(tl.loadAt, ...Object.values(tl.fetches).map((x) => x.done));
  out.push({
    t: end,
    say: <><span className="hl ok">Done</span>: first paint {ms(tl.firstPaintAt)}, DOMContentLoaded {ms(tl.dclAt)}, load {ms(tl.loadAt)}. A scripted page load: the ordering rules are real, the network is illustrative.</>,
  });
  return mergeSameTime(out);
}

/** Events at the same moment become one caption, so none flashes past unseen. */
function mergeSameTime(list: Moment[]): Moment[] {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const out: Moment[] = [];
  for (const m of sorted) {
    const last = out.at(-1);
    if (last && last.t === m.t) last.say = <>{last.say} {m.say}</>;
    else out.push({ ...m });
  }
  return out;
}

export function intro(cfg: Config): ReactNode {
  return <>A <b>scripted page load</b>: fixed sizes and a fixed round trip of {ms(cfg.rtt)}, no real network. The browser asks for <b>{file('html')}</b>. Press play and watch what holds up
    the first paint.</>;
}

/** One frame at the start, then one per moment. */
export function buildFrames(tl: Timeline): CrpFrame[] {
  return [{ now: 0, say: intro(tl.cfg) }, ...moments(tl).map((m) => ({ now: m.t, say: m.say, hold: MOMENT_HOLD }))];
}

/** Resources a head toggle can change, for the editor. */
export const SCRIPT_LABEL: Record<ScriptId, string> = Object.fromEntries(SCRIPT_IDS.map((id) => [id, file(id)])) as Record<ScriptId, string>;
export const CSS_LABEL: Record<CssId, string> = Object.fromEntries(CSS_IDS.map((id) => [id, file(id)])) as Record<CssId, string>;
