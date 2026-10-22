import { describe, expect, it } from 'vitest';
import { emptyClassify, pickCategory, type ClassifyState } from '../../core/classify';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { layoutCaption, moveCaption, placeAll, referenceCaption, threeTeamChanges } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { CAP, PRESETS, SERVICES, WEIGHT, emptyLayout, isPlaced, layoutFrom, metrics, moveService, reference, type Metrics } from './model';
import { OPENING } from './opening';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;
const atCap = (key: keyof typeof PRESETS, cap: number = CAP.default) => metrics(PRESETS[key].layout, cap);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('conways-law');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('conways-law')).toEqual([]);
  });

  it('opens on the board with no service placed, the cap at 16 and the weight at 1', () => {
    expect(OPENING.scene).toBe('board');
    expect(Object.values(OPENING.board.answers).every((a) => a === null)).toBe(true);
    expect(Object.keys(OPENING.board.answers)).toHaveLength(SERVICES.length);
    expect(OPENING.cap).toBe(16);
    expect(OPENING.weight).toBe(1);
  });
});

describe('try-this entries, in written order from the default state', () => {
  const press = (key: keyof typeof PRESETS): ClassifyState => ({ answers: { ...PRESETS[key].layout }, checked: false });
  const placedMetrics = (board: ClassifyState): Metrics => {
    const layout = layoutFrom(board.answers);
    if (!isPlaced(layout)) throw new Error("board is not complete");
    return metrics(layout, OPENING.cap);
  };

  it('try-this 1: one team reads 0, 0, 26 and red against 16', () => {
    const m = placedMetrics(press("one"));
    expect([m.handoffs, m.interfaces, m.maxCognitive, m.over]).toEqual([0, 0, 26, ['A']]);
    expect(lesson.tryThis[0]).toContain('Handoffs read 0, interfaces 0, and the largest load reads 26, red against the cap of 16');
  });

  it('try-this 2: by layer reads 6, 7, team B at 23 red, and F2 touches three teams', () => {
    const m = atCap('layer');
    expect([m.handoffs, m.interfaces, m.cognitive.B, m.over, threeTeamChanges(m)]).toEqual([6, 7, 23, ['B'], ['F2']]);
    expect(lesson.tryThis[1]).toContain('handoffs 6, interfaces 7, and team B\'s load is 23, red');
  });

  it('try-this 3: by journey reads 4, 4, largest load 15, inside the cap', () => {
    const m = atCap('journey');
    expect([m.handoffs, m.interfaces, m.maxCognitive, m.over]).toEqual([4, 4, 15, []]);
    expect(lesson.tryThis[2]).toContain('handoffs 4, interfaces 4, and the largest load reads 15, inside the cap');
  });

  it('try-this 4: moving payments from C to A in the journey layout gives 3, 3 and team A at 19, red', () => {
    let board = press('journey');
    board = pickCategory(board, 'payments', 'A');
    const m = placedMetrics(board);
    expect([m.handoffs, m.interfaces, m.cognitive.A, m.over]).toEqual([3, 3, 19, ['A']]);
    expect(lesson.tryThis[3]).toContain('handoffs fall to 3 and interfaces to 3, but team A\'s load is 19');
  });

  it('try-this 5: the reference at cap 16 is three layouts at 8; at cap 26 it is one team at 0', () => {
    const r = reference(OPENING.cap, OPENING.weight);
    expect([r.tied.length, r.score]).toEqual([3, 8]);
    const wide = reference(26, OPENING.weight);
    expect([wide.tied.length, wide.score]).toEqual([1, 0]);
    expect(CAP.max).toBeGreaterThanOrEqual(26);
    expect(lesson.tryThis[4]).toContain('3 tied layouts score 8');
    expect(lesson.tryThis[4]).toContain('the reference becomes one team at 0');
  });
});

describe('captions across the controls', () => {
  it('the layout caption is clean at the cap extremes and one step beyond, and names exactly the teams over the cap', () => {
    for (const key of ['one', 'layer', 'journey'] as const) {
      for (const cap of [CAP.min - 1, CAP.min, CAP.default, CAP.max, CAP.max + 1]) {
        const m = atCap(key, cap);
        const text = expectCaption(layoutCaption(m, cap));
        expect(text).not.toMatch(NO_JUNK);
        expect(text.includes('over it')).toBe(m.over.length > 0);
        expect(text).toContain(`${m.handoffs} handoff`);
      }
    }
    expect(expectCaption(layoutCaption(atCap('layer'), 16))).toContain('team B is over it');
    expect(expectCaption(layoutCaption(atCap('layer'), 16))).toContain('F2 touches three teams');
  });

  it('says what is missing until all eight services are placed', () => {
    expect(expectCaption(placeAll(emptyLayout()))).toContain('0 of 8 placed');
    expect(expectCaption(placeAll(layoutFrom({ web: 'A', mobile: 'B' })))).toContain('2 of 8 placed');
  });

  it('the reference caption covers a score, no fit, and the shown and hidden states, at both ends of both sliders', () => {
    for (const cap of [CAP.min - 1, CAP.min, CAP.max, CAP.max + 1]) {
      for (const w of [WEIGHT.min, WEIGHT.default, WEIGHT.max]) {
        for (const shown of [false, true]) {
          const text = expectCaption(referenceCaption(reference(cap, w), cap, w, shown));
          expect(text).not.toMatch(NO_JUNK);
        }
      }
    }
    expect(expectCaption(referenceCaption(reference(16, 1), 16, 1, false))).toContain('is 8, reached by 3 distinct layouts');
    expect(expectCaption(referenceCaption(reference(12, 1), 12, 1, false))).toContain('No layout fits a cap of 12');
  });

  it('the move caption reads before and after, and says so when the service is already there', () => {
    const before = atCap('journey');
    const after: Metrics = metrics(moveService(PRESETS.journey.layout, 'payments', 'A'), 16);
    const text = expectCaption(moveCaption('payments', 'C', 'A', before, after, 16));
    expect(text).toContain('handoffs from 4 to 3, interfaces from 4 to 3 and the largest load from 15 to 19');
    expect(text).toContain('team A over the cap of 16');
    expect(expectCaption(moveCaption('payments', 'C', 'C', before, before, 16))).toContain('already in team C');
  });
});

describe('the text quotes what the model computes', () => {
  it('quiz and key ideas carry the model\'s figures', () => {
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('load of 26 is over the cap of 16');
    expect(lesson.keyIdeas[2]).toContain(`${FACTS.refTied} layouts tie at ${FACTS.refScore}`);
    expect(FACTS.tightScore).toBe(12);
    expect(lesson.keyIdeas[2]).toContain('at 13 the best score is 12 and at 26 it is 0');
  });

  it('has one "it depends" question that names its X and one misconception question', () => {
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toContain('depends on how often changes cross the new lines');
    expect(lesson.quiz[4].q).toContain('never be changed without a reorganisation');
  });

  it('the empty board round trips to an empty layout', () => {
    expect(layoutFrom(emptyClassify(SERVICES).answers)).toEqual(emptyLayout());
  });
});
