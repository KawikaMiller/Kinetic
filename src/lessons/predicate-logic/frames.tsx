import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { evaluate, explain, FORMULAS, show, type FormulaId, type World } from './model';
import { DISHES, PEOPLE } from './presets';

export type Cell = readonly [number, number];

export interface PlFrame extends Frame {
  /** The row or column being examined now. */
  scanRow: number | null;
  scanCol: number | null;
  /** Witness cells found so far, and the dish column that satisfies everyone. */
  ok: Cell[];
  okCol: number | null;
  /** Cells that broke a candidate, and the person who breaks a ∀. */
  bad: Cell[];
  badRow: number | null;
  /** null until the walk reaches its verdict. */
  verdict: boolean | null;
}

const who = (x: number) => PEOPLE[x];
const dish = (y: number) => DISHES[y];
const word = (v: boolean) => (v ? <span className="hl ok">true</span> : <span className="hl bad">false</span>);

/** The verdict sentence, worked out from the grid. Also used by the formula panel's status line. */
export function verdictText(id: FormulaId, w: World): ReactNode {
  const e = explain(id, w);
  const f = show(FORMULAS[id]);
  switch (e.id) {
    case 'AE':
      if (w.people === 0) return <>{f} is {word(true)}, vacuously: there are no people, so nobody lacks a dish.</>;
      if (!e.value) return <>{f} is {word(false)}: {who(e.failRow!)} likes {w.dishes === 0 ? 'nothing (there are no dishes)' : 'nothing'}, and one counterexample is enough.</>;
      return <>{f} is {word(true)}: every person has a witness ({e.picks.map((y, x) => `${who(x)} → ${dish(y!)}`).join(', ')}). The dish may differ per person.</>;
    case 'EA':
      if (e.value && w.people === 0) return <>{f} is {word(true)}: with nobody to ask, {dish(e.column!)} is liked by all 0 people (∀x over an empty domain is vacuously true).</>;
      if (e.value) return <>{f} is {word(true)}: everyone likes {dish(e.column!)}, one dish chosen before any person.</>;
      if (w.dishes === 0) return <>{f} is {word(false)}: there are no dishes, so ∃y has nothing to pick.</>;
      return (
        <>
          {f} is {word(false)}: every dish has someone who doesn't like it ({e.missedBy.map((x, y) => `${dish(y)}: ${who(x!)}`).join(', ')}).
          {evaluate(FORMULAS.AE, w) && <> Yet ∀x ∃y is true on this grid: swapping the quantifiers changed the answer.</>}
        </>
      );
    case 'EE':
      if (e.value) return <>{f} is {word(true)}: {who(e.cell![0])} likes {dish(e.cell![1])}; one witness pair is enough.</>;
      return <>{f} is {word(false)}: {w.people === 0 || w.dishes === 0 ? 'a domain is empty, so there is no pair to pick' : 'nobody likes anything'}.</>;
    case 'AA':
      if (e.value) return <>{f} is {word(true)}{w.people * w.dishes === 0 ? <>, vacuously: there is no (person, dish) pair to fail</> : <>: every person likes every dish</>}.</>;
      return <>{f} is {word(false)}: {who(e.cell![0])} doesn't like {dish(e.cell![1])}, a counterexample pair.</>;
  }
}

const INTRO: Record<FormulaId, ReactNode> = {
  AE: <>∀x ∃y: for each person, look for a dish they like. One person with no dish makes it false.</>,
  EA: <>∃y ∀x: look for one dish that every person likes. One such dish makes it true.</>,
  EE: <>∃x ∃y: look for any person and dish with a like. One pair makes it true.</>,
  AA: <>∀x ∀y: check every person against every dish. One missing like makes it false.</>,
};

const START: PlFrame = { scanRow: null, scanCol: null, ok: [], okCol: null, bad: [], badRow: null, verdict: null };

/** The evaluation of one formula on the grid, as a walk the learner can step through. */
export function evalFrames(id: FormulaId, w: World): PlFrame[] {
  const rec = createRecorder<PlFrame>({ ...START }, { transient: { scanRow: null, scanCol: null } });
  const e = explain(id, w);
  rec.snap(INTRO[id]);
  const ok: Cell[] = [];
  const bad: Cell[] = [];
  const likedIn = (x: number) => Array.from({ length: w.dishes }, (_, y) => y).filter((y) => w.likes[x][y]);

  switch (e.id) {
    case 'AE':
      for (let x = 0; x < w.people; x++) {
        const y = e.picks[x];
        if (y === null) {
          rec.snap(<>{who(x)} likes no dish: a counterexample to ∀x, so the search stops.</>, 1.4, { scanRow: x, badRow: x });
          break;
        }
        ok.push([x, y]);
        rec.snap(<>{who(x)} likes {dish(y)}: a witness y for x = {who(x)}.</>, 1, { scanRow: x, ok: [...ok] });
      }
      break;
    case 'EA':
      for (let y = 0; y < w.dishes; y++) {
        const x = e.missedBy[y];
        if (x === null) {
          rec.snap(
            w.people === 0 ? <>{dish(y)}: there's nobody to dislike it, so it passes vacuously.</> : <>Everyone likes {dish(y)}: that's the witness.</>,
            1.4,
            { scanCol: y, okCol: y, bad: [...bad] },
          );
          break;
        }
        bad.push([x, y]);
        rec.snap(<>{who(x)} doesn't like {dish(y)}, so {dish(y)} can't be the one dish.</>, 1, { scanCol: y, bad: [...bad] });
      }
      break;
    case 'EE':
      for (let x = 0; x < w.people; x++) {
        const liked = likedIn(x);
        if (liked.length) {
          ok.push([x, liked[0]]);
          rec.snap(<>{who(x)} likes {dish(liked[0])}: a witness pair.</>, 1.4, { scanRow: x, ok: [...ok] });
          break;
        }
        rec.snap(<>{who(x)} likes nothing; keep looking.</>, 1, { scanRow: x });
      }
      break;
    case 'AA':
      for (let x = 0; x < w.people && w.dishes > 0; x++) {
        const missing = Array.from({ length: w.dishes }, (_, y) => y).find((y) => !w.likes[x][y]);
        if (missing !== undefined) {
          bad.push([x, missing]);
          rec.snap(<>{who(x)} doesn't like {dish(missing)}: a counterexample, so the search stops.</>, 1.4, { scanRow: x, bad: [...bad] });
          break;
        }
        rec.snap(<>{who(x)} likes every dish.</>, 1, { scanRow: x });
      }
      break;
  }
  rec.set({ verdict: e.value });
  rec.close(verdictText(id, w), 2);
  return rec.frames;
}
