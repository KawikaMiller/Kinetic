import { plural } from '../../core/format';
import { checklist, FIX_LABELS, score, type Diagram, type FixId } from './diagram';
import { LEVEL_NAMES, elementOf, viewAt, type Audience, type Level } from './model';

/** Captions as plain text, computed from the model so they cannot outlive the state they describe. */

const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** What a zoom level shows: its boxes, its arrows, and who it is for. */
export function levelCaption(level: Level): string {
  const v = viewAt(level);
  const inside = v.focus ? ` inside ${elementOf(v.focus).name}` : '';
  const outside = v.surroundings.length ? `, with ${plural(v.surroundings.length, 'neighbour')} outside` : '';
  return `${LEVEL_NAMES[level]} level${inside}: ${plural(v.children.length, 'box', 'boxes')} (${list(v.children.map((c) => c.name))}) and ${plural(v.relations.length, 'arrow')}${outside}.`;
}

/** How the current level reads for an audience. */
export function audienceNote(a: Audience, level: Level): string {
  if (a.level === null) return '';
  if (a.level === level) return ` This level answers the question of the ${a.label.toLowerCase()}: ${a.question}`;
  const more = level > a.level;
  return ` ${more ? 'More' : 'Less'} detail than the ${a.label.toLowerCase()} needs: this lesson pairs that question with the ${LEVEL_NAMES[a.level]} level.`;
}

export function audienceCaption(a: Audience): string {
  if (a.level === null) return `${a.question}`;
  return `${a.label}: "${a.question}" This lesson pairs that question with the ${LEVEL_NAMES[a.level]} diagram (a rule of thumb), so the stage jumps there; detail they do not need is dimmed.`;
}

export function noDeeperLevel(id: string): string {
  const e = elementOf(id);
  return `${e.name} has no deeper level in this made-up system, so there is nothing to zoom into. The boxes marked + can be opened.`;
}

/** After ticking or unticking a fix: the item it controls, as the checklist now reads. */
export function fixCaption(id: FixId, on: boolean, d: Diagram): string {
  const item = checklist(d).find((c) => c.id === id)!;
  return `${on ? 'Applied' : 'Undone'}: "${FIX_LABELS[id]}". Checklist item: ${item.detail}. Readability ${score(d)} of ${checklist(d).length}.`;
}

export function fixIntro(d: Diagram): string {
  return `A diagram as found: ${checklist(d).filter((c) => !c.ok).length} of ${checklist(d).length} readability checks fail. Tick the fixes one at a time and watch the checklist.`;
}
