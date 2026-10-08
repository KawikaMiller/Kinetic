import { describe, expect, it } from 'vitest';
import { segmentHitsBox } from '../../core/geometry';
import { BOX, VIEW, drawnEdge, labelOf, positionOf } from './layout';
import { filesFor, importEdges, type Choices, type Design, type DriverChoice, type RepoChoice, type View } from './model';

const ALL: Choices[] = (['layered', 'hexagon'] as View[]).flatMap((view) =>
  (['clean', 'orm'] as Design[]).flatMap((design) =>
    (['postgres', 'memory'] as RepoChoice[]).flatMap((repo) => (['http', 'cli'] as DriverChoice[]).map((driver) => ({ view, design, repo, driver }))),
  ),
);
const CLEAR = 3;

describe('the drawing', () => {
  it('places every deployed file inside the view, with no two boxes overlapping (16 deployments)', () => {
    for (const c of ALL) {
      const paths = Object.keys(filesFor(c));
      const at = paths.map((p) => positionOf(c.view, p));
      for (const p of at) {
        expect(p.x - BOX.w / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + BOX.w / 2).toBeLessThanOrEqual(VIEW.w);
        expect(p.y + BOX.h / 2).toBeLessThanOrEqual(VIEW.h);
      }
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          expect(Math.abs(at[i].x - at[j].x) >= BOX.w || Math.abs(at[i].y - at[j].y) >= BOX.h, `${paths[i]} / ${paths[j]}`).toBe(true);
        }
      }
    }
  });

  it('never draws an import arrow through a box it does not connect (16 deployments; arrows from main.ts are not drawn)', () => {
    for (const c of ALL) {
      const files = filesFor(c);
      for (const e of importEdges(files).filter(drawnEdge)) {
        const a = positionOf(c.view, e.from);
        const b = positionOf(c.view, e.to);
        for (const other of Object.keys(files)) {
          if (other === e.from || other === e.to) continue;
          const hit = segmentHitsBox(a, b, positionOf(c.view, other), BOX.w / 2 + CLEAR, BOX.h / 2 + CLEAR);
          expect(hit, `${JSON.stringify(c)}: ${e.from} → ${e.to} crosses ${other}`).toBe(false);
        }
      }
    }
  });

  it('labels fit their boxes at 12px mono (about 7.2px a character)', () => {
    for (const c of ALL) for (const p of Object.keys(filesFor(c))) expect(labelOf(p).length * 7.2, p).toBeLessThanOrEqual(BOX.w - 10);
  });
});
