import { describe, expect, it } from 'vitest';
import { decimal } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { blend, initialBlend, probePixel, type Region } from './blend';
import { blendCaption, overdrawCaption, pipelineCaption, shaderCaption, slantCaption } from './captions';
import lesson from './index';
import { meshOf } from './mesh';
import { ORDERS, initialOverdraw, overdraw } from './overdraw';
import { rgbText } from '../../components/canvasImage';
import { IMAGE, matrices, shadeImage } from './render';
import { MAX_CHARS, SHADER_PRESETS, compileChannels, parseChannel } from './shader';
import { activePreset, choosePreset, initialShader, typeField } from './shaderState';
import { bentPixels } from './slant';
import { STAGES, analyse, initialPipeline, lastTriangle, withMesh, withStage } from './stages';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const clean = (s: string) => {
  expect(s.replace(/NaN or infinite/g, '')).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return s;
};

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('gpu-rendering-pipeline');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('gpu-rendering-pipeline')).toEqual([]);
  });

  it('each scene opens on a pure state; switching mesh clamps the triangle and keeps no stale picked cell', () => {
    expect(initialPipeline()).toEqual(initialPipeline());
    expect(initialShader()).toEqual(initialShader());
    expect(initialOverdraw()).toEqual(initialOverdraw());
    expect(initialBlend()).toEqual(initialBlend());
    const last = { ...initialPipeline(), mesh: 'icosphere' as const, triangle: lastTriangle('icosphere'), picked: 5 };
    expect(lastTriangle('icosphere')).toBe(79);
    const back = withMesh(last, 'cube');
    expect(back.triangle).toBe(11);
    expect(back.picked).toBeNull();
    expect(withStage(initialPipeline(), -3).stage).toBe(0);
    expect(withStage(initialPipeline(), 99).stage).toBe(STAGES.length - 1);
  });

  it('stays inside the page: no network call, no eval, no Function constructor, no storage', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(12);
    expect(forbiddenCalls(sources, { also: ['localStorage', 'sessionStorage', 'indexedDB'] })).toEqual([]);
  });

  it('chips every scene as a toy, simulated or from memory', () => {
    for (const file of ['./PipelineScene.tsx', './ShaderScene.tsx', './SlantScene.tsx', './OrderScene.tsx', './BlendScene.tsx']) expect(sources[file]).toContain('<Provenance kind=');
    expect(sources['./OrderScene.tsx']).toContain('kind="from-memory"');
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: triangle 9 of the cube at 30° makes the stated fragments, and the depth test passes the stated number', () => {
    const s = initialPipeline();
    expect([s.mesh, s.triangle, s.turnDeg, s.stage]).toEqual(['cube', 8, 30, 0]);
    const a = analyse(s);
    expect(a.fragments.length).toBeGreaterThan(10);
    expect(a.passed).toBe(a.fragments.length);
    const t = lesson.tryThis[0];
    expect(t).toContain(`step ${STAGES.findIndex((x) => x.id === 'raster') + 1}: rasterisation makes ${a.fragments.length} fragments`);
    expect(t).toContain(`step ${STAGES.findIndex((x) => x.id === 'depth') + 1} the depth test passes ${a.passed} of them`);
  });

  it('try-this 2: the Lambert preset runs once per visible pixel, and sqrt of a negative hatches the stated number', () => {
    const s = initialShader();
    expect(activePreset(s)).toBe('lambert');
    const run = (id: string) => {
      const c = compileChannels(SHADER_PRESETS.find((p) => p.id === id)?.fields ?? ['0', '0', '0']);
      if (!c.ok) throw new Error(id);
      return shadeImage(meshOf(s.mesh), matrices(s.turnDeg), c.shader, [0, 0, 0], IMAGE.w, IMAGE.h);
    };
    const lambert = run('lambert');
    const broken = run('broken');
    expect(broken.badCount).toBeGreaterThan(0);
    const t = lesson.tryThis[1];
    expect(t).toContain(`runs ${lambert.shaded} times`);
    expect(t).toContain(`${broken.badCount} pixels come out NaN`);
    expect(choosePreset(s, 'broken').applied[0]).toBe('sqrt(x - 0.5)');
  });

  it('try-this 3: screen-linear changes the stated number of floor pixels', () => {
    const b = bentPixels();
    expect(b.differing).toBeGreaterThan(0);
    expect(lesson.tryThis[2]).toContain(`${b.differing} of the ${b.covered} pixels`);
  });

  it('try-this 4: back to front shades every fragment, early test on changes nothing, front to back wastes nothing', () => {
    const s = initialOverdraw();
    expect([s.order, s.earlyZ]).toEqual(['back-to-front', false]);
    const late = overdraw(s);
    const early = overdraw({ ...s, earlyZ: true });
    const best = overdraw({ order: 'front-to-back', earlyZ: true });
    expect(late.rendered.shaderInvocations).toBe(late.rendered.coveredFragments);
    expect(early.rendered.shaderInvocations).toBe(late.rendered.shaderInvocations);
    expect(best.wasted).toBe(0);
    expect(best.rendered.shaderInvocations).toBeLessThan(late.rendered.shaderInvocations);
    const t = lesson.tryThis[3];
    expect(t).toContain(`runs ${late.rendered.shaderInvocations} times, one per fragment`);
    expect(t).toContain(`still ${early.rendered.shaderInvocations}`);
    expect(t).toContain(`${best.rendered.shaderInvocations} runs, ${best.wasted} thrown away`);
  });

  it('try-this 5: the overlap pixel differs between the two orders by the stated colours', () => {
    const s = initialBlend();
    const slot = probePixel('both');
    const ab = blend(s).pixels[slot];
    const ba = blend({ ...s, order: 'b-then-a' }).pixels[slot];
    expect(rgbText(ab)).not.toBe(rgbText(ba));
    const t = lesson.tryThis[4];
    expect(t).toContain(`the pixel in the overlap is ${rgbText(ab)}`);
    expect(t).toContain(`it becomes ${rgbText(ba)}`);
    expect(t).toContain(`alpha ${decimal(s.alphaA, 1)} and ${decimal(s.alphaB, 1)}`);
  });
});

describe('every control combination gives a clean caption that matches the model', () => {
  it('scene 1: every stage, both meshes, several triangles and turns', () => {
    for (const mesh of ['cube', 'icosphere'] as const) for (const triangle of [0, 3, 8, lastTriangle(mesh)]) for (const turnDeg of [0, 30, 180, 345]) {
      const base = { ...initialPipeline(), mesh, triangle, turnDeg };
      const a = analyse(base);
      STAGES.forEach((_, stage) => {
        const text = clean(expectCaption(pipelineCaption({ ...base, stage }, a)));
        if (STAGES[stage].id === 'raster' && a.fragments.length > 0) expect(text).toContain(`produces ${a.fragments.length} fragment`);
        if (STAGES[stage].id === 'depth') expect(text).toContain(`${a.passed} of ${a.fragments.length} fragment`);
      });
    }
  });

  it('scene 2: every preset, a refused field and an over-long field', () => {
    for (const p of SHADER_PRESETS) {
      const s = choosePreset(initialShader(), p.id);
      expect(activePreset(s)).toBe(p.id);
      clean(expectCaption(shaderCaption({ fields: s.fields, errors: s.errors, shaded: 10, badCount: 0 })));
    }
    const refused = typeField(initialShader(), 0, 'q + 1');
    expect(refused.errors[0]).toMatch(/unknown name "q"/);
    expect(refused.applied).toEqual(initialShader().applied);
    expect(expectCaption(shaderCaption({ fields: refused.fields, errors: refused.errors, shaded: 10, badCount: 0 }))).toContain('last shader that worked');
    const fixed = typeField(refused, 0, 'nl');
    expect(fixed.errors).toEqual([null, null, null]);
    expect(fixed.applied[0]).toBe('nl');
  });

  it('scene 3: both modes', () => {
    const b = bentPixels();
    expect(expectCaption(slantCaption(true, b))).toContain('stay square-looking');
    expect(expectCaption(slantCaption(false, b))).toContain('The squares bend');
  });

  it('scene 4: every order and both early-test settings state the counts of the model', () => {
    for (const { value: order } of ORDERS) for (const earlyZ of [false, true]) {
      const r = overdraw({ order, earlyZ });
      const text = clean(expectCaption(overdrawCaption({ order, earlyZ })));
      expect(text).toContain(`ran ${r.rendered.shaderInvocations} times`);
      expect(text).toContain(`${r.wasted} runs were thrown away`);
    }
  });

  it('scene 5: every region, order and alpha extreme, and the caption says whether the order matters', () => {
    for (const region of ['both', 'a-only', 'b-only', 'none'] as Region[]) for (const order of ['a-then-b', 'b-then-a'] as const) {
      for (const alphaA of [0, 0.6, 1]) for (const alphaB of [0, 0.6, 1]) {
        const s = { order, alphaA, alphaB };
        const text = clean(expectCaption(blendCaption(s, region)));
        if (region === 'both') expect(text.includes('gives the same colour')).toBe(alphaA === 0 || alphaB === 0);
        else expect(text).toContain('the order cannot matter here');
      }
    }
  });
});

describe('hostile input', () => {
  it('a megabyte of text is refused at once, by length, without tokenising it', () => {
    const t0 = performance.now();
    const r = parseChannel('1+'.repeat(500_000));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(`${MAX_CHARS} or fewer`);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('typing a refused or empty field never throws and keeps the last image', () => {
    let s = initialShader();
    for (const text of ['', ' ', '(((', '1 +', 'x = 1', '"a"', 'a'.repeat(5000), 'sin(', 'ünï']) {
      s = typeField(s, 1, text);
      expect(s.applied).toEqual(initialShader().applied);
    }
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
