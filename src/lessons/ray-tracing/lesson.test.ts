import { describe, expect, it } from 'vitest';
import { decimal, integer } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { acneCaption, bvhCaption, pixelCaption, shadingCaption } from './captions';
import lesson from './index';
import { rgbText } from './paint';
import {
  BIAS_CHOICES, CLEAN_BIAS, DEFAULT_PIXEL, IMAGE, MANY, MAX_BOUNCES, PRESETS, compareBvh, differsFromClean, initialTrace, manySpheres, moveBody, pixelTrail, render, sceneOf, settingsOf,
  type TraceState,
} from './scene';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const clean = (s: string) => {
  expect(s).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return s;
};
const testsOf = (s: TraceState) => render(sceneOf(s), settingsOf(s)).stats.objectTests;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('ray-tracing');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('ray-tracing')).toEqual([]);
  });

  it('each scene opens on a pure state: the acne scene on bias 0 and the others on the clean bias, no hierarchy', () => {
    expect(initialTrace()).toEqual(initialTrace());
    expect(BIAS_CHOICES[initialTrace().biasIndex]).toBe(CLEAN_BIAS);
    expect(initialTrace().bvh).toBe(false);
    expect(sources['./AcneScene.tsx']).toContain('biasIndex: 0');
  });

  it('dragging moves the light or one sphere in the plot, where y is -z, and nothing else', () => {
    const s = initialTrace();
    const light = moveBody(s, 0, [1, -2]);
    expect(light.light).toEqual([1, 2]);
    expect(light.spheres).toEqual(s.spheres);
    const sphere = moveBody(s, 2, [3, -4]);
    expect(sphere.spheres[1]).toEqual([3, 4]);
    expect(sphere.spheres[0]).toEqual(s.spheres[0]);
    expect(sphere.light).toEqual(s.light);
  });

  it('stays inside the page: no network call, no eval, no storage', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(forbiddenCalls(sources, { also: ['localStorage', 'sessionStorage', 'indexedDB'] })).toEqual([]);
  });

  it('chips every scene as simulated, a toy or from memory', () => {
    for (const file of ['./PixelScene.tsx', './ShadingScene.tsx', './AcneScene.tsx', './BvhScene.tsx']) expect(sources[file]).toContain('<Provenance kind=');
    expect(sources['./ShadingScene.tsx']).toContain('kind="from-memory"');
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the opening pixel is on the mirror ball, lit, and its mirror ray hits the floor, with the stated numbers', () => {
    const s = initialTrace();
    const trail = pixelTrail(s, DEFAULT_PIXEL.x, DEFAULT_PIXEL.y);
    const [ball, floor] = trail.hits;
    expect([ball.object, ball.shadowed, floor.object]).toEqual(['mirror ball', false, 'floor']);
    const t = lesson.tryThis[0];
    expect(t).toContain(`pixel (${DEFAULT_PIXEL.x}, ${DEFAULT_PIXEL.y}) lies on the mirror ball`);
    expect(t).toContain(`hits it at t = ${decimal(ball.t, 3)}`);
    expect(t).toContain(`hit the floor at t = ${decimal(floor.t, 3)}`);
    expect(t).toContain(rgbText(trail.colour));
    const red = pixelTrail(s, 30, 36);
    expect(red.hits[0].object).toBe('red sphere');
  });

  it('try-this 2: shadows off and depth 0 both lower the counted tests, by the stated amounts', () => {
    const s = initialTrace();
    const on = testsOf(s);
    const off = testsOf({ ...s, shadows: false });
    const flat = testsOf(PRESETS.find((p) => p.id === 'flat')?.apply(s) ?? s);
    expect(off).toBeLessThan(on);
    expect(flat).toBeLessThan(on);
    const t = lesson.tryThis[1];
    expect(t).toContain(`makes ${integer(on)} ray-object tests`);
    expect(t).toContain(`Switch shadows off: ${integer(off)}`);
    expect(t).toContain(`${integer(flat)} with shadows on`);
  });

  it('try-this 3: bias 0 rings many pixels, and the clean bias none', () => {
    const s = { ...initialTrace(), biasIndex: 0 };
    const n = differsFromClean(s).filter(Boolean).length;
    expect(n).toBeGreaterThan(0);
    expect(differsFromClean({ ...s, biasIndex: BIAS_CHOICES.indexOf(CLEAN_BIAS) }).some(Boolean)).toBe(false);
    const t = lesson.tryThis[2];
    expect(t).toContain(`${n} pixels differ from the clean render`);
    expect(t).toContain(`bias slider to ${CLEAN_BIAS}: 0 pixels differ`);
  });

  it('try-this 4: the hierarchy lowers the object tests and the two images are identical', () => {
    const c = compareBvh(manySpheres());
    expect(c.identical).toBe(true);
    const t = lesson.tryThis[3];
    expect(t).toContain(`${integer(c.without.stats.objectTests)} ray-object tests`);
    expect(t).toContain(`${integer(c.withBvh.stats.objectTests)} object tests and ${integer(c.withBvh.stats.boxTests)} box tests`);
    expect(t).toContain('images are identical');
    expect(t).toContain(`${MANY.count} spheres`);
  });
});

describe('every control combination gives a clean caption that matches the model', () => {
  it('scene 1: a spread of pixels (sphere, floor, background) with shadows on and off, mirror 0 and 1, bounce depth 0 to 4', () => {
    const pixels = [[56, 36], [30, 36], [10, 60], [0, 0], [95, 71], [46, 40], [70, 30]];
    for (const shadows of [true, false]) for (const mirror of [0, 1]) for (let bounces = 0; bounces <= MAX_BOUNCES; bounces++) {
      const s = { ...initialTrace(), shadows, mirror, bounces };
      for (const [x, y] of pixels) {
        const trail = pixelTrail(s, x, y);
        const text = clean(expectCaption(pixelCaption(s, x, y, trail)));
        expect(text).toContain(`Pixel (${x}, ${y}):`);
        if (trail.hits.length === 0) expect(text).toContain('hits nothing');
        else expect(text).toContain(`hits the ${trail.hits[0].object} at t = ${decimal(trail.hits[0].t, 3)}`);
        expect(text.includes('Shadows are off')).toBe(!shadows && trail.hits.length > 0);
      }
    }
  });

  it('scene 2: every preset and the slider extremes state the counted tests of the model', () => {
    const states = [initialTrace(), ...PRESETS.map((p) => p.apply(initialTrace())), { ...initialTrace(), lighting: { ambient: 0, diffuse: 0, specular: 1, shininess: 64 }, shadows: false, bounces: MAX_BOUNCES, mirror: 1 }];
    for (const s of states) {
      const r = render(sceneOf(s), settingsOf(s));
      const text = clean(expectCaption(shadingCaption(s, r)));
      expect(text).toContain(`${integer(r.stats.objectTests)} ray-object tests`);
      expect(text).toContain(`budget of ${integer(r.budget)}`);
      expect(text.includes('no mirror rays')).toBe(s.bounces === 0);
    }
  });

  it('scene 3: every bias gives a caption whose branch follows the count', () => {
    for (let biasIndex = 0; biasIndex < BIAS_CHOICES.length; biasIndex++) {
      const s = { ...initialTrace(), biasIndex };
      const n = differsFromClean(s).filter(Boolean).length;
      const text = clean(expectCaption(acneCaption(s, n)));
      expect(text).toContain(`Bias ${BIAS_CHOICES[biasIndex]}`);
      if (biasIndex === 0) expect(text).toContain('shadow acne');
      if (BIAS_CHOICES[biasIndex] > CLEAN_BIAS) expect(text.includes('shadows creep away')).toBe(n > 0);
      expect(text).not.toContain('rounding');
      if (BIAS_CHOICES[biasIndex] < CLEAN_BIAS && biasIndex > 0) expect(text.includes('no pixel changes')).toBe(n === 0);
    }
  });

  it('scene 3: a large bias with zero differing pixels does not claim shadows crept away', () => {
    const s = { ...initialTrace(), biasIndex: BIAS_CHOICES.length - 1 };
    const text = clean(expectCaption(acneCaption(s, 0)));
    expect(text).toContain('0 pixels differ');
    expect(text).not.toContain('shadows creep away');
    expect(text).toContain('No pixel changes');
  });

  it('scene 4: both toggle positions state the same counted totals', () => {
    const c = compareBvh(manySpheres(), [3, 5, -2], undefined, 24, 18);
    for (const on of [false, true]) {
      const text = clean(expectCaption(bvhCaption(c, on)));
      expect(text).toContain(`${integer(c.without.stats.objectTests)} ray-object tests`);
      expect(text).toContain(`${integer(c.withBvh.stats.boxTests)} box tests`);
      expect(text).toContain(on ? 'with the hierarchy' : 'without the hierarchy');
    }
  });
});

describe('hidden controls', () => {
  it('the shading sliders, the bias and the hierarchy toggle are not rendered in scene 1 and stay at their defaults there', () => {
    const src = sources['./PixelScene.tsx'];
    for (const name of ['Ambient', 'Diffuse', 'Specular', 'Shininess', 'Bias', 'Bounce depth', 'Hierarchy']) expect(src).not.toContain(`label="${name}`);
    expect(initialTrace().lighting).toEqual({ ambient: 0.15, diffuse: 0.8, specular: 0.4, shininess: 24 });
  });

  it('the mirror slider and the bounce depth do not change a pixel that does not touch the mirror ball', () => {
    const base = pixelTrail(initialTrace(), 30, 36);
    const other = pixelTrail({ ...initialTrace(), mirror: 1, bounces: MAX_BOUNCES }, 30, 36);
    expect(other.colour).toEqual(base.colour);
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });

  it('quiz option lengths stay within 0.75-1.35x of the mean', () => {
    for (const q of lesson.quiz) {
      const mean = q.options.reduce((a, o) => a + o.length, 0) / q.options.length;
      for (const o of q.options) {
        expect(o.length / mean).toBeGreaterThanOrEqual(0.75);
        expect(o.length / mean).toBeLessThanOrEqual(1.35);
      }
    }
  });

  it('the picture is 96 by 72', () => {
    expect([IMAGE.w, IMAGE.h]).toEqual([96, 72]);
  });
});
