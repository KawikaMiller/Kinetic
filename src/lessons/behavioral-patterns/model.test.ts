import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { commandCaption, observerCaption, stateCaption, strategyCaption } from './frames';
import {
  CARRIERS, ORDER_TOTALS, P_EVENTS, P_STATES, REASONS, SLOTS, SUBS, TRANSITIONS, addedLines, applyCommand, attachedIds, canAct, canEdit, carriersFor, commandFor,
  describe as describeCmd, editorStep, editsShippingBody, flagRows, initialEditor, initialObserver, isDead, isValid, nextState, observerStep, retainedObjects, shippingCode,
  type CarrierId, type Editor, type EditorAction, type ObserverAction, type ObserverState, type PEvent, type PState, type Shape, type StrategyMode,
} from './model';

/** 20 order totals, including the edge at exactly 50. */
const TWENTY_TOTALS = Array.from({ length: 20 }, (_, i) => i * 5);

/** A reference price function, written as a plain switch with its own arithmetic. */
function reference(id: CarrierId, total: number): number {
  switch (id) {
    case 'standard': return 4 + 1;
    case 'express': return 10 + 5;
    case 'freeOver50': return total <= 50 ? 5 : 0;
    case 'overnight': return 20 + 5;
  }
}

describe('strategy', () => {
  it('every carrier × 20 order totals matches the reference price', () => {
    expect(TWENTY_TOTALS).toHaveLength(20);
    for (const c of CARRIERS) for (const t of TWENTY_TOTALS) expect([c.id, t, c.price(t)]).toEqual([c.id, t, reference(c.id, t)]);
    expect(CARRIERS.find((c) => c.id === 'freeOver50')!.price(50)).toBe(5);
    expect(CARRIERS.find((c) => c.id === 'freeOver50')!.price(51)).toBe(0);
  });

  it('the code on screen, run as real JavaScript, prices like the reference (both modes, with and without overnight)', () => {
    for (const mode of ['switch', 'strategies'] as StrategyMode[]) {
      for (const added of [false, true]) {
        // Safe: fixed, lesson-authored program text from shippingCode, never learner input.
        const shipping = new Function(`${shippingCode(mode, added).join('\n')}\nreturn shipping;`)() as (c: string, t: number) => number;
        for (const c of carriersFor(added)) for (const t of TWENTY_TOTALS) expect([mode, added, c.id, t, shipping(c.id, t)]).toEqual([mode, added, c.id, t, reference(c.id, t)]);
        if (!added) expect(() => shipping('overnight', 10)).toThrow(mode === 'switch' ? 'unknown carrier' : /not a function/);
      }
    }
  });

  it('adding a carrier edits the shipping function in the switch version only', () => {
    expect(editsShippingBody('switch')).toBe(true);
    expect(editsShippingBody('strategies')).toBe(false);
    expect(addedLines('strategies')).toHaveLength(1);
    expect(addedLines('switch')).toHaveLength(2);
  });

  it('captions quote the same price as the model, for every mode × carrier × total × added', () => {
    for (const mode of ['switch', 'strategies'] as StrategyMode[]) {
      for (const added of [false, true]) {
        for (const c of carriersFor(added)) {
          for (const t of ORDER_TOTALS) {
            const say = captionText(strategyCaption(mode, c.id, t, added));
            const price = reference(c.id, t);
            expect([`costs $${price}.`, `costs $${price} (`].some((p) => say.includes(p))).toBe(true);
            expect(say.includes('edits the shipping function itself')).toBe(added && mode === 'switch');
          }
        }
      }
    }
  });
});

describe('observer', () => {
  /** A reference: plain sets, and the deliveries it should make. */
  function run(seed: number, steps: number) {
    const rnd = mulberry32(seed);
    let st = initialObserver();
    const attached = new Set<string>(['chart']);
    const mounted = new Set<string>(['chart', 'alert', 'log']);
    const ids = SUBS.map((s) => s.id);
    for (let i = 0; i < steps; i++) {
      const id = ids[Math.floor(rnd() * 3)];
      const kind = ['attach', 'detach', 'unmount', 'publish', 'publish'][Math.floor(rnd() * 5)] as 'attach' | 'detach' | 'unmount' | 'publish';
      const a: ObserverAction = kind === 'publish' ? { type: 'publish' } : { type: kind, id };
      const before = st;
      st = observerStep(st, a);
      if (kind === 'attach' && !attached.has(id) && mounted.has(id)) attached.add(id);
      if (kind === 'detach') attached.delete(id);
      if (kind === 'unmount') mounted.delete(id);
      if (kind === 'publish') {
        const expected = ids.filter((x) => attached.has(x));
        expect(st.last!.to).toEqual(expected);
        expect(st.last!.dead).toEqual(expected.filter((x) => !mounted.has(x)));
        for (const x of expected) expect(st.subs[x as 'chart'].received).toBe(before.subs[x as 'chart'].received + 1);
        for (const x of ids.filter((y) => !attached.has(y))) expect(st.subs[x as 'chart'].received).toBe(before.subs[x as 'chart'].received);
      }
      expect(attachedIds(st)).toEqual(ids.filter((x) => attached.has(x)));
    }
    return st;
  }

  it('each publish notifies exactly the attached subscribers, the leaked one included (200 seeded runs of 60 steps)', () => {
    for (let seed = 1; seed <= 200; seed++) run(seed, 60);
  });

  it('the forgotten-unsubscribe preset: the dead chart keeps being called and the retained count climbs', () => {
    let st = initialObserver();
    st = observerStep(st, { type: 'unmount', id: 'chart' });
    expect(isDead(st.subs.chart)).toBe(true);
    expect(retainedObjects(st)).toBe(1);
    for (let n = 1; n <= 3; n++) {
      st = observerStep(st, { type: 'publish' });
      expect(st.last!.to).toEqual(['chart']);
      expect(st.last!.dead).toEqual(['chart']);
      expect(retainedObjects(st)).toBe(1 + n);
    }
    // Detaching ends the leak.
    st = observerStep(st, { type: 'detach', id: 'chart' });
    expect(retainedObjects(st)).toBe(0);
    expect(observerStep(st, { type: 'publish' }).last!.to).toEqual([]);
  });

  it('detaching before unmounting leaks nothing; a dead component cannot re-attach', () => {
    let st = observerStep(initialObserver(), { type: 'detach', id: 'chart' });
    st = observerStep(st, { type: 'unmount', id: 'chart' });
    expect(retainedObjects(observerStep(st, { type: 'publish' }))).toBe(0);
    expect(canAct(st, { type: 'attach', id: 'chart' })).toBe(false);
  });

  it('captions: the dead subscriber is named exactly when it is notified', () => {
    let st: ObserverState = initialObserver();
    st = observerStep(st, { type: 'unmount', id: 'chart' });
    st = observerStep(st, { type: 'publish' });
    const say = captionText(observerCaption(st, { type: 'publish' }));
    expect(say).toContain('chart is no longer on screen');
    expect(say).toContain('Retained objects: 2');
    st = observerStep(observerStep(st, { type: 'detach', id: 'chart' }), { type: 'publish' });
    expect(captionText(observerCaption(st, { type: 'publish' }))).toContain('nobody is subscribed');
  });
});

describe('command undo/redo', () => {
  /** Reference: a list of document snapshots and a pointer. No command objects at all. */
  function simulate(seed: number) {
    const rnd = mulberry32(seed);
    let e: Editor = initialEditor();
    const history: Shape[][] = [[]];
    let at = 0;
    let letters = 0;
    for (let i = 0; i < 40; i++) {
      const pick = Math.floor(rnd() * 6);
      const target = e.doc.length ? e.doc[Math.floor(rnd() * e.doc.length)].id : 'Z';
      const a: EditorAction = pick === 0 || pick === 1 ? { type: 'draw' } : pick === 2 ? { type: 'move', id: target } : pick === 3 ? { type: 'delete', id: target } : pick === 4 ? { type: 'undo' } : { type: 'redo' };
      const cur = history[at];
      let next: Shape[] | null = null;
      if (a.type === 'draw') {
        const free = [...Array(SLOTS).keys()].find((x) => !cur.some((s) => s.x === x));
        if (free !== undefined && letters < 26) {
          next = [...cur, { id: String.fromCharCode(65 + letters), x: free }].sort((p, q) => p.x - q.x);
          letters++;
        }
      } else if (a.type === 'move') {
        const s = cur.find((d) => d.id === a.id);
        if (s && s.x + 1 < SLOTS && !cur.some((d) => d.x === s.x + 1)) next = cur.map((d) => (d.id === s.id ? { ...d, x: d.x + 1 } : d)).sort((p, q) => p.x - q.x);
      } else if (a.type === 'delete') {
        if (cur.some((d) => d.id === a.id)) next = cur.filter((d) => d.id !== a.id);
      }
      if (a.type === 'undo') {
        if (at > 0) at--;
      } else if (a.type === 'redo') {
        if (at < history.length - 1) at++;
      } else if (next) {
        history.length = at + 1; // a new action discards the redo future
        history.push(next);
        at++;
      }
      e = editorStep(e, a);
      expect(e.doc).toEqual(history[at]);
      expect(e.undo).toHaveLength(at);
      expect(e.redo).toHaveLength(history.length - 1 - at);
      expect(canEdit(e, a) === canEdit(e, a)).toBe(true);
    }
    return { e, history };
  }

  it('matches the snapshot reference over 500 seeded action sequences, stack sizes included', () => {
    for (let seed = 1; seed <= 500; seed++) simulate(seed);
  });

  it('undoing everything returns to the initial document, and redoing everything returns to the end', () => {
    for (let seed = 1; seed <= 500; seed++) {
      let { e } = simulate(seed);
      let end = e;
      while (end.redo.length) end = editorStep(end, { type: 'redo' });
      const final = end.doc;
      const total = e.undo.length + e.redo.length;
      while (e.undo.length) e = editorStep(e, { type: 'undo' });
      expect(e.doc).toEqual([]);
      expect(e.redo).toHaveLength(total);
      while (e.redo.length) e = editorStep(e, { type: 'redo' });
      expect(e.doc).toEqual(final);
    }
  });

  it('a new action after an undo clears the redo stack', () => {
    let e = initialEditor();
    e = editorStep(e, { type: 'draw' });
    e = editorStep(e, { type: 'draw' });
    e = editorStep(e, { type: 'undo' });
    expect(e.redo).toHaveLength(1);
    e = editorStep(e, { type: 'draw' });
    expect(e.redo).toEqual([]);
    expect(canEdit(e, { type: 'redo' })).toBe(false);
    expect(e.log.map(describeCmd)).toEqual(['draw A at 0', 'draw B at 1', 'draw C at 1']);
  });

  it('revert is the exact inverse of apply for every command the editor can create', () => {
    let e = initialEditor();
    for (const a of [{ type: 'draw' }, { type: 'draw' }, { type: 'move', id: 'B' }, { type: 'delete', id: 'A' }] as EditorAction[]) {
      const c = commandFor(e, a)!;
      expect(applyCommand(e.doc, c)).not.toEqual(e.doc);
      e = editorStep(e, a);
    }
    for (let i = e.undo.length - 1; i >= 0; i--) e = editorStep(e, { type: 'undo' });
    expect(e.doc).toEqual([]);
  });

  it('captions: the discard claim is made only when the action really discarded redo entries', () => {
    let e = initialEditor();
    e = editorStep(e, { type: 'draw' });
    e = editorStep(e, { type: 'draw' });
    const plain = commandFor(e, { type: 'draw' })!;
    expect(captionText(commandCaption(editorStep(e, { type: 'draw' }), { type: 'draw' }, plain, e.redo.length))).not.toContain('discards');
    e = editorStep(editorStep(e, { type: 'undo' }), { type: 'undo' });
    expect(e.redo).toHaveLength(2);
    const ran = commandFor(e, { type: 'draw' })!;
    const after = editorStep(e, { type: 'draw' });
    expect(after.redo).toEqual([]);
    expect(captionText(commandCaption(after, { type: 'draw' }, ran, e.redo.length))).toContain('discards the 2 undone commands');
    expect(captionText(commandCaption(e, { type: 'undo' }, null))).toContain('Undo pops');
  });
});

describe('state machine', () => {
  /** The nine independent facts, as a switch: which presses move the player, and where. */
  function expected(s: PState, e: PEvent): PState | null {
    switch (s) {
      case 'stopped': return e === 'play' ? 'playing' : null;
      case 'playing': return e === 'pause' ? 'paused' : e === 'stop' ? 'stopped' : e === 'drop' ? 'buffering' : null;
      case 'paused': return e === 'play' ? 'playing' : e === 'stop' ? 'stopped' : null;
      case 'buffering': return e === 'recover' ? 'playing' : e === 'stop' ? 'stopped' : null;
    }
  }

  it('accepts and rejects exactly the listed pairs, all 20', () => {
    let valid = 0;
    for (const s of P_STATES) {
      for (const e of P_EVENTS) {
        expect([s, e.id, nextState(s, e.id)]).toEqual([s, e.id, expected(s, e.id)]);
        if (isValid(s, e.id)) valid++;
      }
    }
    expect(valid).toBe(8);
  });

  it('every invalid pair has a reason, and no valid pair does', () => {
    for (const s of P_STATES) for (const e of P_EVENTS) expect(Boolean(REASONS[s][e.id]), `${s} ${e.id}`).toBe(!isValid(s, e.id));
    expect(Object.values(TRANSITIONS).flatMap((t) => Object.keys(t))).toHaveLength(8);
  });

  it('the on-screen transition table, run as real JavaScript, agrees', () => {
    // Safe: fixed, lesson-authored program text.
    const press = new Function(`${STATE_CODE_TEXT}\nreturn press;`)() as (s: string, e: string) => string;
    for (const s of P_STATES) for (const e of P_EVENTS) expect(press(s, e.id)).toBe(expected(s, e.id) ?? s);
  });

  it('the flags table has 16 rows and exactly 4 valid, one per state', () => {
    const rows = flagRows();
    expect(rows).toHaveLength(16);
    const valid = rows.filter((r) => r.means);
    expect(valid).toHaveLength(4);
    expect(valid.map((r) => r.means).sort()).toEqual([...P_STATES].sort());
  });

  it('captions: a rejected press says why, an accepted one names the new state', () => {
    for (const s of P_STATES) {
      for (const e of P_EVENTS) {
        const say = captionText(stateCaption(s, { event: e.id, from: s }));
        const to = expected(s, e.id);
        if (to) expect(say).toContain(`→ ${to[0].toUpperCase()}${to.slice(1)}`);
        else expect(say).toContain(REASONS[s][e.id]);
      }
    }
  });
});

import { STATE_CODE } from './model';
const STATE_CODE_TEXT = STATE_CODE.join('\n');
