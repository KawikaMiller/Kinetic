import type { ReactNode } from 'react';
import { joinList, plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import {
  CROSSOVER_SCAN, DEFAULT_PLACEMENT, OPTIONS, PAIRS, STAGES, amount, benefitCounts, breakEven, cheapest, cheapestFlip, crossoverYear, rows, type Assumptions, type Component, type ComponentId, type OptionId, type StageId,
} from './model';
import { METER } from './scenario';

const optionLabel = (id: OptionId): string => OPTIONS.find((o) => o.id === id)!.label.toLowerCase();
export const stageLabel = (id: StageId): string => STAGES.find((s) => s.id === id)!.label;

/** Scene 1: what the placements do to the benefit. */
export function placeCaption(items: readonly { id: ComponentId; label: string; stage: StageId }[]): ReactNode {
  const counted = items.filter((i) => benefitCounts(i.stage));
  return (
    <>
      {counted.length === 0 ? <>No component is placed as something that sets you apart, so no benefit counts anywhere.</> : <>{plural(counted.length, 'component')} counts a benefit: {joinList(counted.map((i) => i.label))}.</>}
      {' '}{items.map((i) => `${i.label} is ${stageLabel(i.stage)}`).join(', ')}. Only Genesis and Custom-built count a benefit.
    </>
  );
}

/** The board's status line: every component opens placed in Product, so "3 of 3 placed" at the start would claim work the learner has not done; this counts what they moved. */
export function placementStatus(items: readonly { id: ComponentId; stage: StageId }[]): string {
  const moved = items.filter((i) => i.stage !== DEFAULT_PLACEMENT[i.id]).length;
  return `${moved} of ${items.length} moved off the opening ${stageLabel(DEFAULT_PLACEMENT.email)} placement`;
}

/** The sentence that names where the lowest-net option changes as the horizon grows. */
export function flipText(flip: ReturnType<typeof cheapestFlip>): string {
  if (flip === null) return `The lowest-net option does not change with the horizon up to ${CROSSOVER_SCAN} years.`;
  return `The lowest-net option changes at a horizon of ${flip.year} years, ${flipChange(flip)}.`;
}

/** The short form of a flip, for a stat: from the old lowest option to the new one. */
export function flipChange(flip: NonNullable<ReturnType<typeof cheapestFlip>>): string {
  return `from ${joinList(flip.from.map(optionLabel))} to ${joinList(flip.to.map(optionLabel))}`;
}

/** Scene 2: the costs, the crossover and the break-even for one component. */
export function costCaption(c: Component, stage: StageId, a: Assumptions): ReactNode {
  const rs = rows(c, stage, a);
  const cross = crossoverYear(c, a.growth, a.maintenance);
  const build = breakEven(c, 'build', 'buy', a);
  const flip = cheapestFlip(c, stage, a);
  return (
    <>
      {c.label[0].toUpperCase() + c.label.slice(1)} over {plural(a.horizon, 'year')}, net cost: {rs.map((r) => `${optionLabel(r.option)} ${amount(r.net)}`).join(', ')}. The lowest is {joinList(cheapest(rs).map(optionLabel))}.{' '}
      {benefitCounts(stage) ? <>It is placed {stageLabel(stage)}, so a benefit of {amount(a.benefit[c.id])} a year counts in proportion to the control each option gives.</> : <>It is placed {stageLabel(stage)}, so no benefit counts: net cost is cost.</>}{' '}
      {flipText(flip)}{' '}{cross === null ? <>Buying has not cost more than building by year {CROSSOVER_SCAN}.</> : <>Buying has cost more than building from year {cross}{cross > a.horizon ? `, beyond your ${a.horizon}-year horizon` : ''}.</>}{' '}
      {build === null ? null : <>Build and buy swap places at a yearly benefit of {amount(build)}.</>}
    </>
  );
}

/** The pairwise break-even benefits as printed lines. */
export function breakEvenLines(c: Component, a: Assumptions, benefitMax: number): string[] {
  return PAIRS.map(([x, y]) => {
    const b = breakEven(c, x, y, a);
    if (b === null) return `${optionLabel(x)} against ${optionLabel(y)}: they capture the same share of a benefit, so no benefit separates them.`;
    const where = b < 0 ? 'below zero, so the first is cheaper at any benefit' : b > benefitMax ? `above the slider's ${amount(benefitMax)}` : 'inside the slider range';
    return `${optionLabel(x)} against ${optionLabel(y)}: net costs are equal at a yearly benefit of ${amount(b)} (${where}).`;
  });
}

/** Scene 3: where the story stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase().replace(/ \(thousands, invented\)/, ''));
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Extra cost {w.meters[METER.extra]}, weeks diverted {w.meters[METER.weeks]}, lock-in exposure {w.meters[METER.lockin]} (invented units).
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}

