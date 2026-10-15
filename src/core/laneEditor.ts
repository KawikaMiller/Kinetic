/**
 * Lane editor model: pure, immutable state for "things placed on lanes along a time axis".
 *
 * An item sits in one lane and covers slots `start..end` (inclusive): a point event has
 * `start === end`, an operation interval spans several slots. Items in one lane never overlap.
 * Optional links join two items (a message from a send event to a later receive event on another
 * lane). Every edit returns a new model, or a refusal with the reason in plain words, so a lesson
 * can keep a stack of models for undo and show the reason when the learner asks for something
 * impossible. What the items *mean* lives in each item's `data`; this module only knows geometry.
 * `components/LaneEditor` draws a model and turns pointer and key presses into these edits.
 */

export interface LaneLimits {
  lanes: number;
  /** Time slots on the axis, numbered from 0. */
  slots: number;
  /** Most items the model holds (default: no limit beyond the grid). */
  maxItems?: number;
  /** Fewest slots an item spans, counted as `end - start` (default 0: a point). */
  minSpan?: number;
  /** Most slots an item spans, counted as `end - start` (default `slots - 1`). */
  maxSpan?: number;
}

export interface LaneItem<T = undefined> {
  id: string;
  lane: number;
  start: number;
  end: number;
  data: T;
}

export interface LaneLink {
  from: string;
  to: string;
}

export interface LaneModel<T = undefined> {
  limits: LaneLimits;
  items: readonly LaneItem<T>[];
  links: readonly LaneLink[];
  selected: string | null;
  /** The number the next item's id is made from, so ids never repeat after a delete. */
  nextId: number;
}

export type LaneEdit<T> = { ok: true; model: LaneModel<T>; id?: string } | { ok: false; reason: string };

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const done = <T>(model: LaneModel<T>, id?: string): LaneEdit<T> => ({ ok: true, model, ...(id === undefined ? {} : { id }) });

export function createLaneModel<T = undefined>(limits: LaneLimits): LaneModel<T> {
  return { limits, items: [], links: [], selected: null, nextId: 1 };
}

export const itemById = <T>(model: LaneModel<T>, id: string): LaneItem<T> | undefined => model.items.find((i) => i.id === id);

/** The item covering `slot` in `lane`, if any. */
export const itemAt = <T>(model: LaneModel<T>, lane: number, slot: number): LaneItem<T> | undefined =>
  model.items.find((i) => i.lane === lane && i.start <= slot && slot <= i.end);

export const selectedItem = <T>(model: LaneModel<T>): LaneItem<T> | undefined =>
  model.selected === null ? undefined : itemById(model, model.selected);

const spanOf = (limits: LaneLimits) => ({ min: limits.minSpan ?? 0, max: limits.maxSpan ?? limits.slots - 1 });

/** Why an item at `lane`, `start..end` cannot exist (ignoring `ignoreId`), or null if it can. */
function placementProblem<T>(model: LaneModel<T>, lane: number, start: number, end: number, ignoreId?: string): string | null {
  const { lanes, slots } = model.limits;
  if (lane < 0 || lane >= lanes) return 'there is no lane there';
  if (start < 0) return 'that is before the start of the time axis';
  if (end >= slots) return 'that is past the end of the time axis';
  const { min, max } = spanOf(model.limits);
  if (end - start < min) return min === 1 ? 'it must span at least one slot' : `it must span at least ${min} slots`;
  if (end - start > max) return `it can span at most ${max} slots`;
  const clash = model.items.find((i) => i.id !== ignoreId && i.lane === lane && i.start <= end && start <= i.end);
  return clash ? 'that place on the lane is taken' : null;
}

/** Why `from` → `to` is not a valid message, or null when it is. */
function linkProblem<T>(from: LaneItem<T>, to: LaneItem<T>): string | null {
  if (from.id === to.id) return 'a message needs two different events';
  if (from.lane === to.lane) return 'a message goes between two lanes';
  if (to.start < from.end) return "a message can't arrive before it is sent";
  if (to.start === from.end) return 'a message needs at least one slot to travel';
  return null;
}

/** Why moving or resizing `item` to this place would break a message it has, or null. */
function linksProblem<T>(model: LaneModel<T>, moved: LaneItem<T>): string | null {
  for (const link of model.links) {
    if (link.from !== moved.id && link.to !== moved.id) continue;
    const from = link.from === moved.id ? moved : itemById(model, link.from);
    const to = link.to === moved.id ? moved : itemById(model, link.to);
    if (from && to) {
      const problem = linkProblem(from, to);
      if (problem) return `it would break a message: ${problem}`;
    }
  }
  return null;
}

/** Add an item (selected afterwards). `span` is `end - start`, default the model's `minSpan`. */
export function addItem<T>(model: LaneModel<T>, lane: number, slot: number, data: T, span = model.limits.minSpan ?? 0): LaneEdit<T> {
  const { maxItems } = model.limits;
  if (maxItems !== undefined && model.items.length >= maxItems) return refuse(`at most ${maxItems} items fit`);
  const problem = placementProblem(model, lane, slot, slot + span);
  if (problem) return refuse(problem);
  const id = `i${model.nextId}`;
  const item: LaneItem<T> = { id, lane, start: slot, end: slot + span, data };
  return done({ ...model, items: [...model.items, item], selected: id, nextId: model.nextId + 1 }, id);
}

const replaceItem = <T>(model: LaneModel<T>, next: LaneItem<T>): LaneModel<T> => ({
  ...model,
  items: model.items.map((i) => (i.id === next.id ? next : i)),
});

/** Move a whole item by whole lanes and slots. */
export function moveItem<T>(model: LaneModel<T>, id: string, dLane: number, dSlot: number): LaneEdit<T> {
  const item = itemById(model, id);
  if (!item) return refuse('nothing is selected');
  const next = { ...item, lane: item.lane + dLane, start: item.start + dSlot, end: item.end + dSlot };
  const problem = placementProblem(model, next.lane, next.start, next.end, id) ?? linksProblem(model, next);
  return problem ? refuse(problem) : done(replaceItem(model, next), id);
}

/** Move one edge of an interval by `delta` slots (an item that is a point has no edges to move: use `moveItem`). */
export function resizeItem<T>(model: LaneModel<T>, id: string, edge: 'start' | 'end', delta: number): LaneEdit<T> {
  const item = itemById(model, id);
  if (!item) return refuse('nothing is selected');
  const next = edge === 'start' ? { ...item, start: item.start + delta } : { ...item, end: item.end + delta };
  const problem = placementProblem(model, next.lane, next.start, next.end, id) ?? linksProblem(model, next);
  return problem ? refuse(problem) : done(replaceItem(model, next), id);
}

/** Delete an item and every message that touches it. */
export function removeItem<T>(model: LaneModel<T>, id: string): LaneEdit<T> {
  if (!itemById(model, id)) return refuse('nothing is selected');
  return done({
    ...model,
    items: model.items.filter((i) => i.id !== id),
    links: model.links.filter((l) => l.from !== id && l.to !== id),
    selected: model.selected === id ? null : model.selected,
  });
}

export const selectItem = <T>(model: LaneModel<T>, id: string | null): LaneModel<T> => (model.selected === id ? model : { ...model, selected: id });

/** Replace one item's data (a value, a label) without touching where it is. */
export const setItemData = <T>(model: LaneModel<T>, id: string, data: T): LaneModel<T> => replaceItem(model, { ...itemById(model, id)!, data });

/** Join two items with a message. At most one message per ordered pair. */
export function linkItems<T>(model: LaneModel<T>, fromId: string, toId: string): LaneEdit<T> {
  const from = itemById(model, fromId);
  const to = itemById(model, toId);
  if (!from || !to) return refuse('pick a send event first');
  const problem = linkProblem(from, to);
  if (problem) return refuse(problem);
  if (model.links.some((l) => l.from === fromId && l.to === toId)) return refuse('those two events are already joined by a message');
  return done({ ...model, links: [...model.links, { from: fromId, to: toId }] });
}

export const unlinkItems = <T>(model: LaneModel<T>, fromId: string, toId: string): LaneModel<T> => ({
  ...model,
  links: model.links.filter((l) => !(l.from === fromId && l.to === toId)),
});

/** A preset item for `buildLaneModel`; `span` is `end - start`. */
export interface LaneSeed<T> {
  lane: number;
  slot: number;
  span?: number;
  data: T;
}

/**
 * A model from an authored list (a preset): items in order, links as `[fromIndex, toIndex]`
 * into that list. Throws on the first refusal, since a preset that breaks the rules is a bug.
 */
export function buildLaneModel<T>(limits: LaneLimits, seeds: readonly LaneSeed<T>[], links: readonly (readonly [number, number])[] = []): LaneModel<T> {
  const ids: string[] = [];
  let model = createLaneModel<T>(limits);
  for (const seed of seeds) {
    const edit = addItem(model, seed.lane, seed.slot, seed.data, seed.span);
    if (!edit.ok) throw new RangeError(`preset item at lane ${seed.lane}, slot ${seed.slot}: ${edit.reason}`);
    model = edit.model;
    ids.push(edit.id!);
  }
  for (const [from, to] of links) {
    const edit = linkItems(model, ids[from], ids[to]);
    if (!edit.ok) throw new RangeError(`preset message ${from} to ${to}: ${edit.reason}`);
    model = edit.model;
  }
  return selectItem(model, null);
}

/* ---------- activation: what Enter, Space or a press on one cell does ---------- */

export type LaneMode = 'edit' | 'link';

/**
 * Press on a cell. Edit mode: an empty cell adds an item (`newData` is its data), a cell holding
 * an item selects it (pressing the selected one again deselects). Link mode: with a send event
 * selected, an item is the receiver and an empty cell gets a new receive event first; with
 * nothing selected, an item is picked as the sender. After a message the receiver is selected, so
 * a chain of messages is a run of presses.
 */
export function activateCell<T>(model: LaneModel<T>, lane: number, slot: number, mode: LaneMode, newData: T): LaneEdit<T> {
  const hit = itemAt(model, lane, slot);
  const sender = selectedItem(model);
  if (mode === 'link' && sender) {
    if (hit?.id === sender.id) return done(selectItem(model, null));
    let target = hit;
    let working = model;
    if (!target) {
      const added = addItem(model, lane, slot, newData);
      if (!added.ok) return added;
      working = added.model;
      target = itemById(working, added.id!);
    }
    const linked = linkItems(working, sender.id, target!.id);
    return linked.ok ? done(selectItem(linked.model, target!.id), target!.id) : linked;
  }
  if (hit) return done(selectItem(model, model.selected === hit.id ? null : hit.id), hit.id);
  if (mode === 'link') return refuse('pick a send event first');
  return addItem(model, lane, slot, newData);
}

/* ---------- keyboard ---------- */

export interface Cursor {
  lane: number;
  slot: number;
}

export const clampCursor = (c: Cursor, limits: LaneLimits): Cursor => ({
  lane: Math.min(limits.lanes - 1, Math.max(0, c.lane)),
  slot: Math.min(limits.slots - 1, Math.max(0, c.slot)),
});

export type LaneKeyAction =
  | { type: 'cursor'; to: Cursor }
  | { type: 'activate' }
  | { type: 'move'; dLane: number; dSlot: number }
  | { type: 'resize'; delta: number }
  | { type: 'remove' }
  | { type: 'deselect' };

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };

/**
 * What a key press does. Arrows move the cursor over the grid (no wrapping), Home and End jump to
 * the lane's first and last slot, Enter or Space is `activate`, Delete or Backspace removes the
 * selected item, Escape deselects. Shift plus an arrow moves the selected item; Alt plus Left or
 * Right moves the selected interval's end edge. Null: not a lane-editor key.
 */
export function laneKeyAction(key: string, mods: { shift?: boolean; alt?: boolean }, cursor: Cursor, limits: LaneLimits): LaneKeyAction | null {
  const arrow = ARROWS[key];
  if (arrow && mods.shift) return { type: 'move', dLane: arrow[0], dSlot: arrow[1] };
  if (arrow && mods.alt) return arrow[1] === 0 ? null : { type: 'resize', delta: arrow[1] };
  if (arrow) return { type: 'cursor', to: clampCursor({ lane: cursor.lane + arrow[0], slot: cursor.slot + arrow[1] }, limits) };
  switch (key) {
    case 'Home':
      return { type: 'cursor', to: { lane: cursor.lane, slot: 0 } };
    case 'End':
      return { type: 'cursor', to: { lane: cursor.lane, slot: limits.slots - 1 } };
    case 'Enter':
    case ' ':
      return { type: 'activate' };
    case 'Delete':
    case 'Backspace':
      return { type: 'remove' };
    case 'Escape':
      return { type: 'deselect' };
    default:
      return null;
  }
}
