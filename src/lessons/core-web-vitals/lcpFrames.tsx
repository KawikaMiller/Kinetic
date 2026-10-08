import type { ReactNode } from 'react';
import { ms, pct } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  BAND_LABEL, LCP_TIMES, THRESHOLDS, VIEWPORT_AREA, bandOf, formatMetric, heroFetch, lcpCandidates, lcpOf, pageElements, type LcpOptions, type PageElement,
} from './model';

export interface LcpFrame extends Frame {
  /** Where the cursor sits, ms. */
  t: number;
}

/** The candidates the browser has reported by time `t`. */
export function candidatesAt(o: LcpOptions, t: number): PageElement[] {
  return lcpCandidates(pageElements(o).filter((e) => e.at <= t), o.inputAt);
}

const share = (e: PageElement) => pct(e.area / VIEWPORT_AREA);

function paintedCaption(o: LcpOptions, el: PageElement): ReactNode {
  const after = candidatesAt(o, el.at);
  const isCandidate = after.some((c) => c.id === el.id);
  const ignored = o.inputAt !== null && el.at > o.inputAt;
  if (ignored) {
    return <><b>{el.label}</b> painted at {ms(el.at)}, but the tap at {ms(o.inputAt!)} already stopped the search: <b>it can no longer be the LCP</b>, however large it is.</>;
  }
  if (isCandidate) {
    const prev = after.length > 1 ? after[after.length - 2] : null;
    return <><b>{el.label}</b> painted at {ms(el.at)}, covering {share(el)} of the screen
      {prev ? <>, more than the {prev.label.toLowerCase()} before it: it replaces it as the <span className="hl hi">current LCP candidate</span></> : <>: the first <span className="hl hi">LCP candidate</span></>}.</>;
  }
  const current = after[after.length - 1];
  return <><b>{el.label}</b> painted at {ms(el.at)}, but it covers only {share(el)} of the screen and the {current.label.toLowerCase()} ({share(current)}) is already larger: not a candidate.</>;
}

/** One frame at the start, then one per event of the scripted load, in time order. */
export function buildLcpFrames(o: LcpOptions): LcpFrame[] {
  const fetch = heroFetch(o);
  const events: { t: number; say: ReactNode }[] = [
    {
      t: LCP_TIMES.html,
      say: <>The HTML arrived at {ms(LCP_TIMES.html)}. Nothing is painted yet.{' '}
        {o.preload ? <>A <code>preload</code> hint is in the head, so the hero image&apos;s request goes out right now.</> : <>The browser has not met the hero image yet: an image set in CSS is found only once the CSS has been parsed ({ms(LCP_TIMES.cssParsed)}), and a script-lazy-loaded one only once its script has run ({ms(LCP_TIMES.script)}). A plain <code>&lt;img&gt;</code> in the HTML would have been found at once, by the preload scanner.</>}</>,
    },
    ...pageElements(o).map((el) => ({ t: el.at, say: paintedCaption(o, el) })),
  ];
  if (o.inputAt !== null) {
    events.push({ t: o.inputAt, say: <>The user <span className="hl violet">taps</span> at {ms(o.inputAt)} (a key press or a scroll would do the same). From now on nothing new can become the LCP candidate: the browser stops looking.</> });
  }
  const { value, element } = lcpOf(o);
  events.push({
    t: Math.max(value, ...events.map((e) => e.t)),
    say: <><span className={`hl ${bandOf('lcp', value) === 'good' ? 'ok' : bandOf('lcp', value) === 'needs' ? 'orange' : 'bad'}`}>LCP {formatMetric('lcp', value)}</span>: the render time of the {element.label.toLowerCase()}, the last candidate, in the <b>{BAND_LABEL[bandOf('lcp', value)]}</b> band (good up to {formatMetric('lcp', THRESHOLDS.lcp.good)}).
      {o.inputAt !== null && element.id !== 'hero' ? <> The hero would have come later, but the tap ended the search first.</> : null}
      {element.id === 'hero' ? <> The hero was requested at {ms(fetch.start)} and its bytes were all in at {ms(fetch.done)}.</> : null}</>,
  });
  const sorted = events.sort((a, b) => a.t - b.t);
  return [
    { t: 0, say: <>A <b>scripted page load</b> on a slow phone connection. LCP is the moment the <b>largest</b> element in view was painted, among those painted before the user first taps, presses a key or scrolls. Press play.</> },
    ...sorted.map((e) => ({ ...e, hold: 1.6 })),
  ];
}
