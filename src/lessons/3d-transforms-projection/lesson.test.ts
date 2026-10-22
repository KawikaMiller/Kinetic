import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { cameraCaption, clipCaption, depthCaption, pointCaption } from './captions';
import lesson from './index';
import {
  APEX_RANGE, CAMERA_PRESETS, EDGES, FAR_CHOICES, FAR_RANGE, FOV_RANGE, GAP_CHOICES, NEAR_CHOICES, NEAR_RANGE, POINT_RANGES, cameraView, clipScene, depthScene,
  edgeState, initialCamera, initialClip, initialDepth, initialPoint, pipeline, setFar, setNear, translationEffect, type CameraState,
} from './model';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const clean = (s: string) => {
  expect(s).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return s;
};
const range = (r: { min: number; max: number; step: number }) => {
  const out: number[] = [];
  for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(Math.round(v * 100) / 100);
  return out;
};

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('3d-transforms-projection');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('3d-transforms-projection')).toEqual([]);
  });

  it('each scene opens on a pure state, and editing one never reaches another', () => {
    expect(initialPoint()).toEqual(initialPoint());
    expect(initialCamera()).toEqual(initialCamera());
    expect(initialClip()).toEqual(initialClip());
    expect(initialDepth()).toEqual(initialDepth());
    const edited = { ...initialCamera(), fovDeg: 99 };
    expect(edited.fovDeg).not.toBe(initialCamera().fovDeg);
    expect(initialClip().clipping).toBe(true);
  });

  it('stays inside the page: no network call, no eval, no storage', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources, { also: ['localStorage', 'sessionStorage', 'indexedDB'] })).toEqual([]);
  });

  it('chips every scene as simulated or illustrative', () => {
    for (const file of ['./PointScene.tsx', './FrustumScene.tsx', './ClipScene.tsx', './DepthScene.tsx']) expect(sources[file]).toContain('<Provenance kind=');
    expect(sources['./DepthScene.tsx']).toContain('kind="from-memory"');
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: corner 7 lands where the text says, a translation moves the point by 2.83 and the direction by 0', () => {
    const s = initialPoint();
    expect([s.vertex, s.scale, s.turnDeg, s.moveX, s.moveZ, s.kind]).toEqual([7, 1.5, 30, 2, -2, 'point']);
    const steps = pipeline(s);
    const world = steps[1].value as readonly number[];
    const screen = steps[5].value as readonly number[];
    const t = lesson.tryThis[0];
    expect(t).toContain(`world (${world.slice(0, 3).map((v) => (Math.round(v * 100) / 100).toString().replace('-', '−')).join(', ')})`);
    expect(t).toContain(`pixel (${(Math.round(screen[0] * 100) / 100).toString()}, ${(Math.round(screen[1] * 100) / 100).toString()})`);
    const e = translationEffect(s);
    expect(e.point).toBeCloseTo(Math.hypot(2, 2), 12);
    expect(e.direction).toBeCloseTo(0, 12);
    expect(t).toContain('by 2.83 and the direction by 0');
    expect(pipeline({ ...s, kind: 'direction' }).slice(3).every((p) => p.value === null)).toBe(true);
  });

  it('try-this 2: camera inside the cube puts corners behind the camera whose edges are not drawn; orthographic keeps all corners inside', () => {
    const inside = cameraView(CAMERA_PRESETS.find((p) => p.id === 'inside')?.apply(initialCamera()) as CameraState);
    const ortho = cameraView(CAMERA_PRESETS.find((p) => p.id === 'ortho')?.apply(initialCamera()) as CameraState);
    expect(inside.behind).toBe(4);
    expect(ortho.outside).toBe(0);
    for (const [a, b] of EDGES) {
      if (inside.projected[a].behind || inside.projected[b].behind) expect(edgeState(inside, a, b)).toBe('hidden');
    }
    const t = lesson.tryThis[1];
    expect(t).toContain(`${inside.behind} of 8 corners are behind the camera and ${inside.outside} are outside the frustum`);
    expect(t).toContain(`"orthographic": ${ortho.outside} corners are outside`);
    expect(t).toContain('"camera inside the cube"');
  });

  it('try-this 3: the default apex is behind the camera; clipping on adds vertices on the near plane, off gives w = -2 and flips the apex below the base', () => {
    const s = initialClip();
    expect(s.apexZ).toBe(2);
    const on = clipScene(s);
    expect(on.rows.filter((r) => r.created).length).toBe(2);
    const off = clipScene({ ...s, clipping: false });
    const [a, , apex] = off.rows;
    expect(apex.clip[3]).toBeCloseTo(-2, 12);
    expect(apex.screen?.[1]).toBeGreaterThan(a.screen?.[1] ?? 0);
    const upright = on.rows.filter((r) => !r.created && r.name === 'C');
    expect(upright).toHaveLength(0);
    const t = lesson.tryThis[2];
    expect(t).toContain('adds 2 vertices on the near plane');
    expect(t).toContain('w = −2');
  });

  it('try-this 4: the default depth scene z-fights in part, near 0.1 clears it and far 10 clips both surfaces', () => {
    const d = depthScene(initialDepth());
    expect([d.near, d.far, d.distance, d.gap]).toEqual([0.01, 1000, 50, 0.01]);
    expect(d.tiedShare).toBeGreaterThan(0);
    expect(depthScene({ ...initialDepth(), nearIndex: 4 }).tiedShare).toBe(0);
    expect(depthScene({ ...initialDepth(), farIndex: 0 }).clippedShare).toBe(1);
    const t = lesson.tryThis[3];
    expect(t).toContain(`one depth step is ${d.resolution.toPrecision(3)} units`);
    expect(t).toContain('Set the near plane to 0.1: z-fighting drops to 0%');
    expect(t).toContain('set far to 10: the surfaces lie beyond it and nothing is drawn');
  });
});

describe('every control combination gives a clean caption', () => {
  it('scene 1: every corner, both kinds, at the slider extremes', () => {
    for (const vertex of [0, 1, 2, 3, 4, 5, 6, 7]) for (const kind of ['point', 'direction'] as const) {
      for (const scale of [POINT_RANGES.scale.min, POINT_RANGES.scale.max]) for (const moveZ of [POINT_RANGES.moveZ.min, POINT_RANGES.moveZ.max]) {
        const s = { ...initialPoint(), vertex, kind, scale, moveZ };
        expect(clean(expectCaption(pointCaption(s)))).toContain(`Corner ${vertex}`);
      }
    }
  });

  it('scene 2: every preset, projection and aspect at the slider extremes, with the count in the caption matching the model', () => {
    for (const preset of [undefined, ...CAMERA_PRESETS]) for (const projection of ['perspective', 'orthographic'] as const) {
      for (const aspect of ['4:3', '1:1', '16:9'] as const) for (const fovDeg of [FOV_RANGE.min, FOV_RANGE.max]) {
        const base = preset ? preset.apply(initialCamera()) : initialCamera();
        const s: CameraState = { ...base, projection, aspect, fovDeg };
        const text = clean(expectCaption(cameraCaption(s)));
        const v = cameraView(s);
        expect(text.includes('All 8 corners are inside')).toBe(v.outside === 0);
        expect(text.includes('stretched')).toBe(v.stretched);
      }
    }
  });

  it('scene 2: the near and far sliders cannot cross, at every position of the other', () => {
    for (const far of range(FAR_RANGE)) for (const near of range(NEAR_RANGE)) {
      const s = setNear({ ...initialCamera(), far }, near);
      expect(s.near).toBeLessThan(s.far);
      const t = setFar({ ...initialCamera(), near }, far);
      expect(t.far).toBeGreaterThan(t.near);
    }
  });

  it('scene 3: every apex depth with clipping on and off', () => {
    for (const apexZ of range(APEX_RANGE)) for (const clipping of [true, false]) {
      const text = clean(expectCaption(clipCaption({ clipping, apexZ })));
      const r = clipScene({ clipping, apexZ });
      expect(text.includes('mirrors')).toBe(!clipping && r.behindInput > 0);
    }
  });

  it('scene 4: every near, far, gap and three distances', () => {
    for (let nearIndex = 0; nearIndex < NEAR_CHOICES.length; nearIndex++) for (let farIndex = 0; farIndex < FAR_CHOICES.length; farIndex++) {
      for (let gapIndex = 0; gapIndex < GAP_CHOICES.length; gapIndex++) for (const distance of [5, 50, 100]) {
        const s = { nearIndex, farIndex, gapIndex, distance };
        const text = clean(expectCaption(depthCaption(s)));
        const r = depthScene(s);
        expect(text.includes('nothing is drawn')).toBe(r.clippedShare === 1);
      }
    }
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });

  it('the depth question quotes the hand-worked 81/99 and the share of the range it uses, computed independently', () => {
    const q = lesson.quiz[1];
    expect(q.q).toContain((81 / 99).toFixed(4));
    expect(q.options[1]).toContain('9%');
    expect(q.options[1]).toContain('91%');
    expect(q.why).toContain('0.9091');
  });
});
