import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import { PROPERTIES, STAGE_INFO, STAGES, isCompositeOnly, stagesRerun } from './model';

const COMBOS = PROPERTIES.flatMap((property) => [false, true].map((promoted) => ({ property, promoted })));

describe('the change scene\'s frames', () => {
  it('have one frame before, one for the change, one per re-run stage and a summary, every caption glue-free', () => {
    for (const { property, promoted } of COMBOS) {
      const frames = buildFrames(property, promoted);
      const stages = stagesRerun(property, promoted);
      expect(frames, `${property} ${promoted}`).toHaveLength(stages.length + 3);
      for (const f of frames) expect(expectCaption(f.say).length).toBeGreaterThan(20);
    }
  });

  it('light stages strictly in pipeline order, each exactly once, and the sandbox changes from frame 1', () => {
    for (const { property, promoted } of COMBOS) {
      const frames = buildFrames(property, promoted);
      const stages = stagesRerun(property, promoted);
      expect(frames[0].changed).toBe(false);
      expect(frames.slice(1).every((f) => f.changed)).toBe(true);
      const current = frames.map((f) => f.current).filter((c) => c !== null);
      expect(current).toEqual(stages);
      const last = frames.at(-1)!;
      expect(last.ran).toEqual(stages);
      expect(last.current).toBeNull();
    }
  });

  it('a stage caption names the stage that is running, and the summary lists exactly the stages that ran', () => {
    for (const { property, promoted } of COMBOS) {
      const frames = buildFrames(property, promoted);
      const stages = stagesRerun(property, promoted);
      frames.forEach((f) => {
        if (f.current) expect(expectCaption(f.say)).toContain(`${STAGE_INFO[f.current].title} re-runs`);
      });
      const summary = expectCaption(frames.at(-1)!.say);
      for (const s of STAGES) {
        const title = STAGE_INFO[s].title;
        const listed = summary.includes(`typically ${stages.map((x) => STAGE_INFO[x].title).join(', ')}`);
        expect(listed).toBe(true);
        if (!stages.includes(s)) expect(summary.split('.')[0]).not.toContain(title);
      }
      expect(summary).toContain('typical Chromium behaviour');
    }
  });

  it('only says "cheap" for a path that really skips layout and paint', () => {
    for (const { property, promoted } of COMBOS) {
      const text = buildFrames(property, promoted).map((f) => expectCaption(f.say)).join(' ');
      const cheap = isCompositeOnly(stagesRerun(property, promoted));
      expect(text.includes('cheapest')).toBe(cheap);
      expect(text.includes('cheap path')).toBe(cheap);
    }
  });

  it('the default scene (width, shared layer) re-runs style, layout, paint and composite', () => {
    const frames = buildFrames('width', false);
    expect(frames.map((f) => f.current).filter(Boolean)).toEqual(['style', 'layout', 'paint', 'composite']);
  });
});

describe('lesson text', () => {
  it('mentions the real mechanics it teaches', () => {
    expect(lesson.summary.what).toContain('layout thrashing');
    expect(lesson.tryThis.length).toBeGreaterThanOrEqual(3);
  });
});
