import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { PROPERTY_INFO, STAGE_INFO, isCompositeOnly, stagesRerun, type Property, type StageId } from './model';

export interface PipeFrame extends Frame {
  /** The sandbox shows the changed value. */
  changed: boolean;
  /** Stages that have run so far for this change. */
  ran: StageId[];
  /** The stage running right now. */
  current: StageId | null;
}

export function intro(property: Property): ReactNode {
  return <>The page loaded and was drawn: the HTML and CSS were parsed once, then style, layout, paint and composite each ran once. Now the
    sandbox box will change its <code>{property}</code>. Press play to see which stages the browser typically re-runs for that.</>;
}

function changedCaption(property: Property): ReactNode {
  const { from, to } = PROPERTY_INFO[property];
  return <><code>{property}</code> changes from <code>{from}</code> to <code>{to}</code>. Parse HTML and Parse CSS stay dim: neither the
    markup nor the stylesheet changed, so nothing is parsed again. The strip works out what this change forces.</>;
}

function stageCaption(stage: StageId, property: Property, promoted: boolean): ReactNode {
  const what = STAGE_INFO[stage].what;
  if (stage === 'style') return <><b>Style</b> re-runs: it {what}. Every change starts here.</>;
  if (stage === 'layout') return <><b>Layout</b> re-runs: it {what}. <code>{property}</code> {PROPERTY_INFO[property].why}.</>;
  if (stage === 'paint') {
    return <><b>Paint</b> re-runs: it {what}.{' '}
      {PROPERTY_INFO[property].trigger === 'composite'
        ? <>This box is not on its own layer, so its pixels typically have to be drawn again before they can move or fade.</>
        : <><code>{property}</code> {PROPERTY_INFO[property].why}.</>}</>;
  }
  return <><b>Composite</b> re-runs: it {what}.{' '}
    {PROPERTY_INFO[property].trigger === 'composite' && promoted ? <>On its own layer the box&apos;s painted pixels are reused, so this is the cheap path.</> : null}</>;
}

function finalCaption(property: Property, promoted: boolean): ReactNode {
  const stages = stagesRerun(property, promoted);
  const names = stages.map((s) => STAGE_INFO[s].title).join(', ');
  const trigger = PROPERTY_INFO[property].trigger;
  const tail = isCompositeOnly(stages)
    ? <> Layout and paint stayed dim: typically the cheapest kind of change, because the box is on its own layer.</>
    : trigger === 'composite'
      ? <> Turn on <b>Own layer</b> and replay: with its own compositor layer the same change typically skips layout and paint.</>
      : trigger === 'paint'
        ? <> Layout was skipped because no box changed size or position.</>
        : <> The browser did not redraw the whole page for this: only the work downstream of the change.</>;
  return <><span className="hl ok">Done</span>: typically {names}.{tail} This is typical Chromium behaviour; engines differ.</>;
}

/** One frame before the change, one for the change, then one per stage that re-runs. */
export function buildFrames(property: Property, promoted: boolean): PipeFrame[] {
  const stages = stagesRerun(property, promoted);
  const frames: PipeFrame[] = [
    { changed: false, ran: [], current: null, say: intro(property) },
    { changed: true, ran: [], current: null, say: changedCaption(property) },
  ];
  stages.forEach((stage, i) => {
    frames.push({
      changed: true,
      ran: stages.slice(0, i),
      current: stage,
      say: stageCaption(stage, property, promoted),
    });
  });
  frames.push({ changed: true, ran: stages, current: null, say: finalCaption(property, promoted) });
  return frames;
}
