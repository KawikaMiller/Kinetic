import { describe, expect, it } from 'vitest';
import {
  activateCell, addItem, buildLaneModel, clampCursor, createLaneModel, itemAt, itemById, laneKeyAction, linkItems, moveItem, removeItem, resizeItem,
  selectItem, selectedItem, setItemData, unlinkItems, type LaneEdit, type LaneLimits, type LaneModel,
} from './laneEditor';
import { mulberry32 } from './random';

const LIMITS: LaneLimits = { lanes: 3, slots: 10 };
const empty = () => createLaneModel<string>(LIMITS);

function must<T>(edit: LaneEdit<T>): LaneModel<T> {
  if (!edit.ok) throw new Error(edit.reason);
  return edit.model;
}
const reasonOf = <T>(edit: LaneEdit<T>) => (edit.ok ? null : edit.reason);

/** An independent check of the rules every reachable model must obey: in bounds, no overlap in a lane, every message goes forward between two lanes. */
function violations<T>(m: LaneModel<T>): string[] {
  const out: string[] = [];
  for (const a of m.items) {
    if (a.lane < 0 || a.lane >= m.limits.lanes || a.start < 0 || a.end >= m.limits.slots || a.end < a.start) out.push(`${a.id} out of bounds`);
    for (const b of m.items) {
      if (a.id < b.id && a.lane === b.lane && !(a.end < b.start || b.end < a.start)) out.push(`${a.id} overlaps ${b.id}`);
    }
  }
  for (const l of m.links) {
    const from = m.items.find((i) => i.id === l.from);
    const to = m.items.find((i) => i.id === l.to);
    if (!from || !to) out.push(`message ${l.from}->${l.to} has a missing end`);
    else if (from.lane === to.lane || to.start <= from.end) out.push(`message ${l.from}->${l.to} does not go forward between lanes`);
  }
  if (m.selected !== null && !m.items.some((i) => i.id === m.selected)) out.push('selection points at nothing');
  return out;
}

describe('addItem', () => {
  it('places a point on a lane, selects it and gives ids that are never reused', () => {
    const a = must(addItem(empty(), 1, 4, 'a'));
    expect(a.items).toEqual([{ id: 'i1', lane: 1, start: 4, end: 4, data: 'a' }]);
    expect(a.selected).toBe('i1');
    const b = must(removeItem(a, 'i1'));
    expect(must(addItem(b, 1, 4, 'b')).items[0].id).toBe('i2');
  });

  it('refuses a taken place, the edges of the axis, a missing lane and a full model, each with its reason', () => {
    const m = must(addItem(empty(), 0, 3, 'a'));
    expect(reasonOf(addItem(m, 0, 3, 'b'))).toMatch(/taken/);
    expect(reasonOf(addItem(m, 0, 10, 'b'))).toMatch(/past the end/);
    expect(reasonOf(addItem(m, 0, -1, 'b'))).toMatch(/before the start/);
    expect(reasonOf(addItem(m, 3, 0, 'b'))).toMatch(/no lane/);
    const capped = createLaneModel<string>({ ...LIMITS, maxItems: 1 });
    expect(reasonOf(addItem(must(addItem(capped, 0, 0, 'a')), 1, 1, 'b'))).toMatch(/at most 1/);
  });

  it('an interval takes every slot it spans and blocks them for others, but another lane is free', () => {
    const m = must(addItem(empty(), 0, 2, 'w', 3));
    expect(itemAt(m, 0, 4)?.id).toBe('i1');
    expect(itemAt(m, 0, 6)).toBeUndefined();
    expect(reasonOf(addItem(m, 0, 4, 'r'))).toMatch(/taken/);
    expect(reasonOf(addItem(m, 0, 0, 'r', 2))).toMatch(/taken/);
    expect(addItem(m, 1, 4, 'r').ok).toBe(true);
  });

  it('honours minSpan and maxSpan', () => {
    const ops = createLaneModel<string>({ ...LIMITS, minSpan: 1, maxSpan: 3 });
    expect(must(addItem(ops, 0, 0, 'w')).items[0].end).toBe(1);
    expect(reasonOf(addItem(ops, 0, 0, 'w', 0))).toMatch(/at least one slot/);
    expect(reasonOf(addItem(ops, 0, 0, 'w', 4))).toMatch(/at most 3/);
  });
});

describe('moveItem and resizeItem', () => {
  it('moves along and across lanes, and refuses to leave the grid or land on another item', () => {
    let m = must(addItem(empty(), 0, 1, 'a'));
    m = must(addItem(m, 0, 2, 'b'));
    expect(reasonOf(moveItem(m, 'i1', 0, 1))).toMatch(/taken/);
    expect(reasonOf(moveItem(m, 'i1', 0, -2))).toMatch(/before the start/);
    expect(reasonOf(moveItem(m, 'i1', -1, 0))).toMatch(/no lane/);
    const moved = must(moveItem(m, 'i1', 2, 5));
    expect(itemById(moved, 'i1')).toMatchObject({ lane: 2, start: 6, end: 6 });
  });

  it('refuses a move that would make a message point backwards or stay on one lane, and says so', () => {
    let m = buildLaneModel(LIMITS, [{ lane: 0, slot: 2, data: 's' }, { lane: 1, slot: 5, data: 'r' }], [[0, 1]]);
    const [send, receive] = m.items.map((i) => i.id);
    expect(reasonOf(moveItem(m, send, 0, 4))).toMatch(/break a message: a message can't arrive before it is sent/);
    expect(reasonOf(moveItem(m, send, 0, 3))).toMatch(/break a message: a message needs at least one slot to travel/);
    expect(reasonOf(moveItem(m, receive, -1, 0))).toMatch(/break a message: a message goes between two lanes/);
    expect(reasonOf(moveItem(m, receive, 0, -4))).toMatch(/can't arrive before it is sent/);
    m = must(moveItem(m, receive, 0, 2));
    expect(violations(m)).toEqual([]);
  });

  it('resizes either edge of an interval and keeps it a valid interval', () => {
    const ops = createLaneModel<string>({ ...LIMITS, minSpan: 1 });
    const m = must(addItem(ops, 0, 2, 'w', 2));
    expect(itemById(must(resizeItem(m, 'i1', 'end', 2)), 'i1')).toMatchObject({ start: 2, end: 6 });
    expect(itemById(must(resizeItem(m, 'i1', 'start', -1)), 'i1')).toMatchObject({ start: 1, end: 4 });
    expect(reasonOf(resizeItem(m, 'i1', 'end', -2))).toMatch(/at least one slot/);
    expect(reasonOf(resizeItem(m, 'i1', 'end', 9))).toMatch(/past the end/);
  });
});

describe('messages', () => {
  const two = () => buildLaneModel(LIMITS, [{ lane: 0, slot: 2, data: 'a' }, { lane: 1, slot: 6, data: 'b' }, { lane: 2, slot: 1, data: 'c' }, { lane: 1, slot: 2, data: 'd' }]);

  it('joins a send event to a later event on another lane', () => {
    const m = must(linkItems(two(), 'i1', 'i2'));
    expect(m.links).toEqual([{ from: 'i1', to: 'i2' }]);
  });

  it('refuses a message to an earlier place, to the same slot, to itself, within one lane, or twice, with the reason', () => {
    const m = two();
    expect(reasonOf(linkItems(m, 'i1', 'i3'))).toBe("a message can't arrive before it is sent");
    expect(reasonOf(linkItems(m, 'i1', 'i4'))).toMatch(/at least one slot to travel/);
    expect(reasonOf(linkItems(m, 'i1', 'i1'))).toMatch(/two different events/);
    expect(reasonOf(linkItems(m, 'i2', 'i4'))).toMatch(/between two lanes/);
    const once = must(linkItems(m, 'i1', 'i2'));
    expect(reasonOf(linkItems(once, 'i1', 'i2'))).toMatch(/already joined/);
    expect(reasonOf(linkItems(m, 'i1', 'nope'))).toMatch(/send event first/);
  });

  it('deleting an event deletes its messages; unlinking drops only that one', () => {
    const m = must(linkItems(must(linkItems(two(), 'i1', 'i2')), 'i3', 'i2'));
    expect(must(removeItem(m, 'i2')).links).toEqual([]);
    expect(unlinkItems(m, 'i1', 'i2').links).toEqual([{ from: 'i3', to: 'i2' }]);
  });
});

describe('selection and data', () => {
  it('select, deselect and replace data without moving the item', () => {
    let m = must(addItem(empty(), 0, 0, 'a'));
    m = selectItem(m, null);
    expect(selectedItem(m)).toBeUndefined();
    m = setItemData(selectItem(m, 'i1'), 'i1', 'z');
    expect(selectedItem(m)).toMatchObject({ id: 'i1', data: 'z', start: 0 });
  });

  it('removing the selected item clears the selection; removing another keeps it', () => {
    const m = must(addItem(must(addItem(empty(), 0, 0, 'a')), 1, 1, 'b'));
    expect(m.selected).toBe('i2');
    expect(must(removeItem(m, 'i2')).selected).toBeNull();
    expect(must(removeItem(m, 'i1')).selected).toBe('i2');
  });
});

describe('buildLaneModel', () => {
  it('builds a preset with messages by position, nothing selected', () => {
    const m = buildLaneModel(LIMITS, [{ lane: 0, slot: 1, data: 'send' }, { lane: 1, slot: 4, data: 'recv' }], [[0, 1]]);
    expect(m.links).toEqual([{ from: 'i1', to: 'i2' }]);
    expect(m.selected).toBeNull();
  });

  it('throws on a preset that breaks a rule', () => {
    expect(() => buildLaneModel(LIMITS, [{ lane: 0, slot: 1, data: 'a' }, { lane: 0, slot: 1, data: 'b' }])).toThrow(/taken/);
    expect(() => buildLaneModel(LIMITS, [{ lane: 0, slot: 5, data: 'a' }, { lane: 1, slot: 1, data: 'b' }], [[0, 1]])).toThrow(/before it is sent/);
  });
});

describe('activateCell', () => {
  it('edit mode: an empty cell adds, an item selects, the selected item deselects', () => {
    let m = must(activateCell(empty(), 0, 3, 'edit', 'new'));
    expect(m.items).toHaveLength(1);
    m = selectItem(m, null);
    m = must(activateCell(m, 0, 3, 'edit', 'new'));
    expect(m.selected).toBe('i1');
    m = must(activateCell(m, 0, 3, 'edit', 'new'));
    expect(m.selected).toBeNull();
    expect(m.items).toHaveLength(1);
  });

  it('link mode: pick a sender, then press an empty later cell to get a receive event joined by a message, then chain on', () => {
    let m = buildLaneModel(LIMITS, [{ lane: 0, slot: 1, data: 'a' }]);
    expect(reasonOf(activateCell(m, 1, 5, 'link', 'new'))).toMatch(/send event first/);
    m = must(activateCell(m, 0, 1, 'link', 'new'));
    expect(m.selected).toBe('i1');
    m = must(activateCell(m, 1, 5, 'link', 'new'));
    expect(m.items).toHaveLength(2);
    expect(m.links).toEqual([{ from: 'i1', to: 'i2' }]);
    expect(m.selected).toBe('i2');
    m = must(activateCell(m, 2, 8, 'link', 'new'));
    expect(m.links).toHaveLength(2);
  });

  it('link mode: an earlier cell is refused with the reason and adds nothing', () => {
    const m = must(activateCell(buildLaneModel(LIMITS, [{ lane: 0, slot: 5, data: 'a' }]), 0, 5, 'link', 'new'));
    const refused = activateCell(m, 1, 2, 'link', 'new');
    expect(reasonOf(refused)).toMatch(/before it is sent/);
    expect(m.items).toHaveLength(1);
  });

  it('link mode: pressing the sender again deselects it', () => {
    const m = must(activateCell(buildLaneModel(LIMITS, [{ lane: 0, slot: 1, data: 'a' }]), 0, 1, 'link', 'x'));
    expect(must(activateCell(m, 0, 1, 'link', 'x')).selected).toBeNull();
  });
});

describe('laneKeyAction', () => {
  const at = { lane: 1, slot: 4 };
  it('maps the documented keys, clamping the cursor at the edges instead of wrapping', () => {
    expect(laneKeyAction('ArrowRight', {}, at, LIMITS)).toEqual({ type: 'cursor', to: { lane: 1, slot: 5 } });
    expect(laneKeyAction('ArrowUp', {}, { lane: 0, slot: 0 }, LIMITS)).toEqual({ type: 'cursor', to: { lane: 0, slot: 0 } });
    expect(laneKeyAction('ArrowRight', {}, { lane: 0, slot: 9 }, LIMITS)).toEqual({ type: 'cursor', to: { lane: 0, slot: 9 } });
    expect(laneKeyAction('Home', {}, at, LIMITS)).toEqual({ type: 'cursor', to: { lane: 1, slot: 0 } });
    expect(laneKeyAction('End', {}, at, LIMITS)).toEqual({ type: 'cursor', to: { lane: 1, slot: 9 } });
    expect(laneKeyAction('Enter', {}, at, LIMITS)).toEqual({ type: 'activate' });
    expect(laneKeyAction(' ', {}, at, LIMITS)).toEqual({ type: 'activate' });
    expect(laneKeyAction('Delete', {}, at, LIMITS)).toEqual({ type: 'remove' });
    expect(laneKeyAction('Escape', {}, at, LIMITS)).toEqual({ type: 'deselect' });
    expect(laneKeyAction('q', {}, at, LIMITS)).toBeNull();
  });

  it('Shift+arrow moves the item, Alt+Left/Right resizes it, Alt+Up/Down is nothing', () => {
    expect(laneKeyAction('ArrowDown', { shift: true }, at, LIMITS)).toEqual({ type: 'move', dLane: 1, dSlot: 0 });
    expect(laneKeyAction('ArrowLeft', { shift: true }, at, LIMITS)).toEqual({ type: 'move', dLane: 0, dSlot: -1 });
    expect(laneKeyAction('ArrowRight', { alt: true }, at, LIMITS)).toEqual({ type: 'resize', delta: 1 });
    expect(laneKeyAction('ArrowUp', { alt: true }, at, LIMITS)).toBeNull();
  });

  it('clampCursor keeps a cursor on the grid', () => {
    expect(clampCursor({ lane: 7, slot: -3 }, LIMITS)).toEqual({ lane: 2, slot: 0 });
  });
});

describe('invariants over random edit sequences', () => {
  const SEQUENCES = 300;
  const STEPS = 60;

  it(`no sequence of edits ever leaves an overlap, an out-of-bounds item or a backwards message (${SEQUENCES} seeded sequences of ${STEPS} edits)`, () => {
    let applied = 0;
    let refused = 0;
    for (let seed = 0; seed < SEQUENCES; seed++) {
      const rnd = mulberry32(seed);
      const int = (n: number) => Math.floor(rnd() * n);
      let m = createLaneModel<number>({ lanes: 3, slots: 8, maxItems: 9, minSpan: 0, maxSpan: 3 });
      for (let step = 0; step < STEPS; step++) {
        const ids = m.items.map((i) => i.id);
        const pick = () => ids[int(ids.length)] ?? 'none';
        const edit = [
          () => addItem(m, int(3), int(8), step, int(3)),
          () => moveItem(m, pick(), int(3) - 1, int(5) - 2),
          () => resizeItem(m, pick(), int(2) ? 'end' : 'start', int(3) - 1),
          () => linkItems(m, pick(), pick()),
          () => removeItem(m, pick()),
          () => activateCell(m, int(3), int(8), int(2) ? 'link' : 'edit', step),
        ][int(6)]();
        if (edit.ok) {
          m = edit.model;
          applied++;
        } else {
          refused++;
        }
        expect(violations(m), `seed ${seed} step ${step}`).toEqual([]);
      }
    }
    expect(applied).toBeGreaterThan(1000);
    expect(refused).toBeGreaterThan(1000);
  });

  it('the checker itself notices an overlap and a backwards message (a model built by hand, past the editor)', () => {
    const ok = buildLaneModel(LIMITS, [{ lane: 0, slot: 1, data: 'a' }, { lane: 1, slot: 4, data: 'b' }], [[0, 1]]);
    expect(violations(ok)).toEqual([]);
    const overlapping: LaneModel<string> = { ...ok, items: [ok.items[0], { ...ok.items[1], lane: 0, start: 1, end: 1 }] };
    expect(violations(overlapping).length).toBeGreaterThan(0);
    const backwards: LaneModel<string> = { ...ok, items: [{ ...ok.items[0], start: 7, end: 7 }, ok.items[1]] };
    expect(violations(backwards).length).toBeGreaterThan(0);
  });
});
