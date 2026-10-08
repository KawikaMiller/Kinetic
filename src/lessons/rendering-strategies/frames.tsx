import type { ReactNode } from 'react';
import { ms } from '../../core/format';
import type { Frame } from '../../core/types';
import { NET, STRATEGY_SHORT, milestones, timeline, valleyMs, type Inputs, type Milestone, type StrategyId } from './model';

export interface RenderFrame extends Frame {
  /** The cursor, ms. */
  now: number;
}

export type TapMode = 'ignored' | 'replayed';
const HOLD = 1.6;

const tag = (id: StrategyId) => <b>{STRATEGY_SHORT[id]}</b>;

function say(m: Milestone, input: Inputs, tap: TapMode): ReactNode {
  const t = timeline(m.id, input);
  switch (m.kind) {
    case 'firstByte':
      if (m.id === 'csr') return <>{tag(m.id)}: the server answers at once with an almost empty page, a shell with a script tag. Nothing to show yet.</>;
      if (m.id === 'ssg') return <>{tag(m.id)}: the page was built earlier, so the answer is just a file: the first bytes arrive after a round trip.</>;
      if (m.id === 'ssr') return <>{tag(m.id)}: the server fetches the data and renders the HTML before it answers: {ms(t.serverMsPerRequest)} of work, so the first bytes come at {ms(m.at)}.</>;
      return <>{tag(m.id)}: the server sends the page&apos;s shell at once, before the data is back, and keeps the connection open for the rest.</>;
    case 'paint':
      if (m.id === 'csr') return <>{tag(m.id)}: the script has run, fetched the data and drawn the page, so only now is there anything to see ({ms(m.at)}). The page is interactive at the same moment.</>;
      if (m.id === 'stream') return <>{tag(m.id)}: the shell is painted at {ms(m.at)}: a header and placeholders. The content is still on its way.</>;
      return <>{tag(m.id)}: the HTML already holds the content, so it is painted at {ms(m.at)}, before the JavaScript has even arrived ({ms(t.jsDoneAt)}). It looks finished, but it is not interactive yet.</>;
    case 'content':
      return <>{tag(m.id)}: the rest of the page streamed in and is painted at {ms(m.at)}.</>;
    case 'js':
      if (m.id === 'csr') return <>{tag(m.id)}: the JavaScript bundle ({input.bundleKb} KB) has arrived. Only now can the page start asking for its data.</>;
      return <>{tag(m.id)}: the JavaScript bundle ({input.bundleKb} KB) has arrived.{' '}
        {m.at < t.contentAt ? <>The HTML is not complete yet, so it has to wait.</> : <>It can start hydrating: attaching its code to the HTML that is already on screen.</>}</>;
    case 'interactive': {
      const valley = valleyMs(t);
      if (valley === 0) return <>{tag(m.id)} is <span className="hl ok">interactive</span> at {ms(m.at)}, the same moment the content appeared. There is no gap between seeing and using.</>;
      return <>{tag(m.id)} is <span className="hl ok">interactive</span> at {ms(m.at)}, {ms(valley)} after the content was visible. A tap in between would have been{' '}
        {tap === 'ignored' ? <span className="hl orange">ignored</span> : <span className="hl orange">remembered and replayed</span>}{tap === 'ignored' ? '' : ' now (some setups record early events; many do not)'}.</>;
    }
  }
}

/** One frame at the start, then one per moment, same-time moments merged into one caption. */
export function buildFrames(input: Inputs, shown: readonly StrategyId[], tap: TapMode): RenderFrame[] {
  const merged: { now: number; parts: ReactNode[] }[] = [];
  for (const m of milestones(input, shown)) {
    const last = merged.at(-1);
    if (last && last.now === m.at) last.parts.push(say(m, input, tap));
    else merged.push({ now: m.at, parts: [say(m, input, tap)] });
  }
  return [
    {
      now: 0,
      say: <>The user asks for the page. Each lane renders it a different way on a modelled network (a {ms(NET.rtt)} round trip) and device. Press play and watch what is on screen, and when it
        starts to respond.</>,
    },
    ...merged.map((g) => ({
      now: g.now,
      hold: HOLD,
      say: <>{g.parts.map((p, i) => <span key={i}>{i ? ' ' : ''}{p}</span>)}</>,
    })),
  ];
}
