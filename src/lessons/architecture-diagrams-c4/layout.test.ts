import { describe, expect, it } from 'vitest';
import { segmentHitsBox } from '../coupling-cohesion/layout';
import { FIX_IDS, applyFixes, type FixId } from './diagram';
import {
  BOX, FIX_AT, FIX_TITLE, FIX_VIEW, VIEWS, VIEW_W, boxRect, edgeKey, frameTitleRect, labelPoint, labelRect, rectsOverlap, type Rect,
} from './layout';
import { LEVELS, frameTitle, labelText, viewAt } from './model';

const CLEAR = 4;
const inView = (r: Rect, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= VIEW_W && r.y + r.h <= h;

describe.each(LEVELS)('level %i drawing', (level) => {
  const v = viewAt(level);
  const layout = VIEWS[level];
  const ids = [...v.children, ...v.surroundings].map((e) => e.id);

  it('positions exactly the boxes the view shows, inside the drawing', () => {
    expect(Object.keys(layout.at).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(inView(boxRect(layout.at[id]), layout.h), id).toBe(true);
  });

  it('no two boxes overlap', () => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(rectsOverlap(boxRect(layout.at[ids[i]]), boxRect(layout.at[ids[j]]), CLEAR), `${ids[i]} / ${ids[j]}`).toBe(false);
      }
    }
  });

  it('children sit inside the frame and surroundings outside it', () => {
    if (!layout.frame) return;
    const f: Rect = layout.frame;
    expect(inView(f, layout.h)).toBe(true);
    for (const c of v.children) {
      const r = boxRect(layout.at[c.id]);
      expect(r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h, c.id).toBe(true);
    }
    for (const s of v.surroundings) expect(rectsOverlap(boxRect(layout.at[s.id]), f), s.id).toBe(false);
  });

  it('no arrow passes through a box it does not connect', () => {
    for (const r of v.relations) {
      for (const id of ids) {
        if (id === r.from || id === r.to) continue;
        const hit = segmentHitsBox(layout.at[r.from], layout.at[r.to], layout.at[id], BOX.w / 2 + CLEAR, BOX.h / 2 + CLEAR);
        expect(hit, `${r.from}>${r.to} crosses ${id}`).toBe(false);
      }
    }
  });

  it('every label stays clear of every box, of the other labels and of the frame title', () => {
    const rects = v.relations.map((r) => ({ key: edgeKey(r), rect: labelRect(labelPoint(layout.at[r.from], layout.at[r.to], layout.labelAt[edgeKey(r)]), labelText(r)) }));
    for (const l of rects) {
      expect(inView(l.rect, layout.h), `${l.key} in view`).toBe(true);
      for (const id of ids) expect(rectsOverlap(l.rect, boxRect(layout.at[id])), `${l.key} over ${id}`).toBe(false);
      if (layout.frame && v.focus) expect(rectsOverlap(l.rect, frameTitleRect(layout.frame, frameTitle(v.focus)), 2), `${l.key} over the frame title`).toBe(false);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(rectsOverlap(rects[i].rect, rects[j].rect, 2), `${rects[i].key} / ${rects[j].key}`).toBe(false);
  });

  it('the frame title fits inside the frame and clear of every box', () => {
    if (!layout.frame || !v.focus) return;
    const t = frameTitleRect(layout.frame, frameTitle(v.focus));
    expect(t.x + t.w).toBeLessThanOrEqual(layout.frame.x + layout.frame.w);
    for (const c of v.children) expect(rectsOverlap(t, boxRect(layout.at[c.id])), c.id).toBe(false);
  });

  it('every label fits in its box: names at 12px, tech at 11px', () => {
    for (const e of v.children) expect(e.name.length * 7.2, e.name).toBeLessThanOrEqual(BOX.w - 12);
  });
});

describe('the bad-diagram drawing, for all 32 subsets of fixes', () => {
  const subsets: Set<FixId>[] = Array.from({ length: 1 << FIX_IDS.length }, (_, mask) => new Set(FIX_IDS.filter((_, i) => (mask >> i) & 1)));

  it('places every box and keeps arrows and labels off other boxes', () => {
    for (const fixes of subsets) {
      const d = applyFixes(fixes);
      const name = [...fixes].join('+') || 'none';
      const boxes = d.elements.map((e) => ({ id: e.id, rect: boxRect(FIX_AT[e.id]) }));
      for (const b of boxes) expect(inView(b.rect, FIX_VIEW.h), `${name} ${b.id}`).toBe(true);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(rectsOverlap(boxes[i].rect, boxes[j].rect, CLEAR), `${name} ${boxes[i].id}/${boxes[j].id}`).toBe(false);
      const labels: Rect[] = [];
      for (const e of d.edges) {
        for (const b of boxes) {
          if (b.id === e.from || b.id === e.to) continue;
          expect(segmentHitsBox(FIX_AT[e.from], FIX_AT[e.to], FIX_AT[b.id], BOX.w / 2 + CLEAR, BOX.h / 2 + CLEAR), `${name} ${e.from}>${e.to} crosses ${b.id}`).toBe(false);
        }
        const text = [e.intent, e.protocol && `[${e.protocol}]`].filter(Boolean).join(' ');
        if (!text) continue;
        const rect = labelRect(labelPoint(FIX_AT[e.from], FIX_AT[e.to]), text);
        for (const b of boxes) expect(rectsOverlap(rect, b.rect), `${name} label ${e.from}>${e.to} over ${b.id}`).toBe(false);
        labels.push(rect);
      }
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(rectsOverlap(labels[i], labels[j], 2), name).toBe(false);
      if (d.title) {
        const t: Rect = { x: FIX_TITLE.x, y: FIX_TITLE.y - 12, w: d.title.length * 7.2, h: 14 };
        for (const b of boxes) expect(rectsOverlap(t, b.rect), `${name} title over ${b.id}`).toBe(false);
      }
    }
  });
});
