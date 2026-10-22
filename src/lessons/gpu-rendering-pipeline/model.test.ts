import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle, type Rnd } from '../../core/random';
import { renderTriangles, type DepthVertex, type Triangle } from '../../core/raster';
import { cameraRay, makeCamera } from '../../core/raytrace';
import { BACKGROUND, BLEND_GRID, COLOUR_A, COLOUR_B, blend, probePixel } from './blend';
import { cube, icosphere, triangleCount, type Mesh } from './mesh';
import { LAYOUT, SHUFFLE_SEED, initialOverdraw, orderFor, overdraw } from './overdraw';
import { ASPECT, DEG, GRID, IMAGE, assemble, depthTestOf, matrices, shadeImage, visibleFragments } from './render';
import { FUNCTIONS, INPUT_NAMES, MAX_CHARS, MAX_DEPTH, MAX_TOKENS, SHADER_PRESETS, compileChannels, parseChannel, run } from './shader';
import { QUAD_CAMERA, QUAD_FLOOR_Y, QUAD_HALF_WIDTH, QUAD_NEAR_Z, bentPixels, quadImage } from './slant';

const near = (a: number, b: number, tol = 1e-9) => a === b || Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

describe('the meshes', () => {
  it('the cube has 24 vertices, 36 indices and 12 triangles; the icosphere has 80 triangles on the unit sphere', () => {
    const c = cube();
    expect([c.vertices.length, c.indices.length, triangleCount(c)]).toEqual([24, 36, 12]);
    const s = icosphere();
    expect(triangleCount(s)).toBe(80);
    s.vertices.forEach((v) => expect(Math.hypot(...v.pos)).toBeCloseTo(1, 9));
    expect(Math.max(...s.indices)).toBe(s.vertices.length - 1);
  });
});

// ── an independent per-pixel visibility reference ──

interface Tri2 {
  p: [number, number, number][];
}
const orient = (a: number[], b: number[], x: number, y: number) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);

/** For one pixel centre, the nearest of the triangles that strictly cover it, or null (and `ambiguous` when a centre sits on an edge). */
function reference(tris: readonly Tri2[], x: number, y: number): { depth: number; id: number } | null | 'ambiguous' {
  let best: { depth: number; id: number } | null = null;
  for (let id = 0; id < tris.length; id++) {
    const [a, b, c] = tris[id].p;
    const w = [orient(b, c, x, y), orient(c, a, x, y), orient(a, b, x, y)];
    if (w.some((v) => Math.abs(v) < 1e-9)) return 'ambiguous';
    const area = orient(a, b, c[0], c[1]);
    if (area === 0) continue;
    if (!(w.every((v) => v > 0) || w.every((v) => v < 0))) continue;
    const depth = (w[0] * a[2] + w[1] * b[2] + w[2] * c[2]) / (w[0] + w[1] + w[2]);
    if (!best || depth < best.depth) best = { depth, id };
  }
  return best;
}

function randomSoup(rnd: Rnd, count: number, w: number, h: number): Triangle<DepthVertex>[] {
  return Array.from({ length: count }, () => [0, 1, 2].map(() => ({ x: rnd() * w, y: rnd() * h, z: rnd() })) as unknown as Triangle<DepthVertex>);
}

describe('visibility (the z-buffer image equals a per-pixel reference)', () => {
  it('on 200 seeded random triangle soups, the visible triangle and depth match the reference and the draw order does not matter', () => {
    const [w, h] = [24, 18];
    for (let seed = 0; seed < 200; seed++) {
      const rnd = mulberry32(seed + 1);
      const soup = randomSoup(rnd, 6, w, h);
      const tris2: Tri2[] = soup.map((t) => ({ p: t.map((v) => [v.x, v.y, v.z] as [number, number, number]) as Tri2['p'] }));
      const forward = renderTriangles(soup, w, h);
      const backward = renderTriangles(soup, w, h, { order: soup.map((_, i) => soup.length - 1 - i) });
      const mixed = renderTriangles(soup, w, h, { order: shuffle(soup.map((_, i) => i), rnd), earlyZ: true });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ref = reference(tris2, x + 0.5, y + 0.5);
        if (ref === 'ambiguous') continue;
        const slot = y * w + x;
        if (ref === null) {
          expect(forward.id[slot]).toBe(-1);
          continue;
        }
        expect(forward.id[slot], `seed ${seed} (${x},${y})`).toBe(ref.id);
        expect(near(forward.depth[slot], ref.depth, 1e-9)).toBe(true);
        expect(near(backward.depth[slot], forward.depth[slot], 1e-12)).toBe(true);
        expect(near(mixed.depth[slot], forward.depth[slot], 1e-12)).toBe(true);
      }
    }
  });

  it('for the default cube at several turns, the visible depth at each pixel is the reference minimum over the assembled triangles, in either triangle order', () => {
    const mesh = cube();
    const reversed: Mesh = { ...mesh, indices: Array.from({ length: triangleCount(mesh) }, (_, t) => t).reverse().flatMap((t) => mesh.indices.slice(3 * t, 3 * t + 3)) };
    for (const turn of [0, 30, 100, 215]) {
      const m = matrices(turn);
      const tris2: Tri2[] = Array.from({ length: triangleCount(mesh) }, (_, t) => assemble(mesh, t, m, GRID.w, GRID.h).pieces)
        .flat()
        .map((p) => ({ p: p.map((v) => [v.x, v.y, v.z] as [number, number, number]) as Tri2['p'] }));
      const a = visibleFragments(mesh, m, GRID.w, GRID.h).winners;
      const b = visibleFragments(reversed, m, GRID.w, GRID.h).winners;
      let compared = 0;
      for (let y = 0; y < GRID.h; y++) for (let x = 0; x < GRID.w; x++) {
        const ref = reference(tris2, x + 0.5, y + 0.5);
        if (ref === 'ambiguous') continue;
        const slot = y * GRID.w + x;
        if (ref === null) {
          expect(a[slot]).toBeNull();
          continue;
        }
        compared++;
        expect(near(a[slot]?.depth ?? NaN, ref.depth, 1e-9), `turn ${turn} (${x},${y})`).toBe(true);
        expect(near(b[slot]?.depth ?? NaN, ref.depth, 1e-9)).toBe(true);
      }
      expect(compared).toBeGreaterThan(40);
    }
  });

  it('the stepper agrees with the final picture: the fragments of triangle t that pass the depth test are the pixels where t is on top after t is drawn', () => {
    const mesh = cube();
    const m = matrices(30);
    for (const t of [0, 3, 6, 9, 11]) {
      const passed = depthTestOf(mesh, m, GRID.w, GRID.h, t).filter((r) => r.passed).map((r) => r.fragment.y * GRID.w + r.fragment.x).sort((p, q) => p - q);
      const top = visibleFragments(mesh, m, GRID.w, GRID.h, { upTo: t + 1 }).winners
        .map((wn, i) => (wn?.tri === t ? i : -1)).filter((i) => i >= 0);
      expect(passed).toEqual(top);
    }
  });
});

describe('perspective-correct interpolation', () => {
  it('u and v at every covered pixel equal the values from unprojecting the pixel centre onto the floor plane (1e-6)', () => {
    const camera = makeCamera(QUAD_CAMERA.eye, QUAD_CAMERA.target, [0, 1, 0], QUAD_CAMERA.fovDeg * DEG);
    if (!camera) throw new Error('the quad camera has a direction');
    const image = quadImage(true);
    let checked = 0;
    image.forEach((px, i) => {
      if (px.parity === null) return;
      const ray = cameraRay(camera, i % IMAGE.w, Math.floor(i / IMAGE.w), IMAGE.w, IMAGE.h);
      const t = (QUAD_FLOOR_Y - ray.origin[1]) / ray.dir[1];
      const hit = [ray.origin[0] + t * ray.dir[0], ray.origin[2] + t * ray.dir[2]];
      expect(Math.abs(px.u - (hit[0] + QUAD_HALF_WIDTH)), `pixel ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(px.v - (QUAD_NEAR_Z - hit[1]))).toBeLessThan(1e-6);
      checked++;
    });
    expect(checked).toBeGreaterThan(1000);
  });

  it('screen-linear interpolation differs on the slanted quad, so the toggle is not decorative', () => {
    const { differing, covered } = bentPixels();
    expect(differing).toBeGreaterThan(covered * 0.1);
    const good = quadImage(true);
    const bad = quadImage(false);
    const worst = Math.max(...good.map((p, i) => (p.parity === null ? 0 : Math.abs(p.v - bad[i].v))));
    expect(worst).toBeGreaterThan(0.5);
  });
});

describe('the expression language', () => {
  const inputs = { u: 0.3, v: 0.7, nl: 0.5, z: 0.9, x: 0.25, y: 0.75, bx: 0.2, by: 0.3, bz: 0.5 };
  const evalText = (text: string, i = inputs) => {
    const r = parseChannel(text);
    if (!r.ok) throw new Error(r.error);
    return run(r.value.tree, i);
  };

  it('has the precedence, unary minus and pow edge cases worked by hand', () => {
    expect(evalText('1 + 2 * 3')).toBe(7);
    expect(evalText('(1 + 2) * 3')).toBe(9);
    expect(evalText('2 - 3 - 4')).toBe(-5);
    expect(evalText('8 / 2 / 2')).toBe(2);
    expect(evalText('-2 * -3')).toBe(6);
    expect(evalText('- - 4')).toBe(4);
    expect(evalText('+3 - -3')).toBe(6);
    expect(evalText('pow(-2, 2)')).toBe(4);
    expect(evalText('pow(0, 0)')).toBe(1);
    expect(evalText('pow(-8, 1 / 3)')).toBeNaN();
    expect(evalText('sqrt(0 - 1)')).toBeNaN();
    expect(evalText('1 / 0')).toBe(Infinity);
    expect(evalText('0 / 0')).toBeNaN();
    expect(evalText('step(0.5, 0.5)')).toBe(1);
    expect(evalText('smoothstep(0, 1, 0.5)')).toBe(0.5);
    expect(evalText('mix(2, 4, 0.25)')).toBe(2.5);
    expect(evalText('clamp(5, 0, 1)')).toBe(1);
    expect(evalText('fract(-0.25)')).toBe(0.75);
  });

  /** A random expression as text, with spaces so that unary minus never reads as a decrement in JavaScript. */
  function randomExpression(rnd: Rnd, depth: number): string {
    const names = Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[];
    const pickOne = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    if (depth === 0 || rnd() < 0.2) return rnd() < 0.5 ? pickOne(['0', '0.5', '1', '2', '3.25', '10']) : pickOne(INPUT_NAMES);
    const roll = rnd();
    if (roll < 0.15) return `- ${randomExpression(rnd, depth - 1)}`;
    if (roll < 0.25) return `( ${randomExpression(rnd, depth - 1)} )`;
    if (roll < 0.65) return `${randomExpression(rnd, depth - 1)} ${pickOne(['+', '-', '*', '/'])} ${randomExpression(rnd, depth - 1)}`;
    const fn = pickOne(names);
    return `${fn}( ${Array.from({ length: FUNCTIONS[fn].arity }, () => randomExpression(rnd, depth - 1)).join(' , ')} )`;
  }

  it('equals real JavaScript on 1,000 seeded random expressions (this test, and only this test, runs them with new Function)', () => {
    // The reference implementations below are written independently of FUNCTIONS: GLSL's definitions.
    const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
    const reference = {
      sin: Math.sin, cos: Math.cos, abs: Math.abs, floor: Math.floor, sqrt: Math.sqrt, min: Math.min, max: Math.max, pow: Math.pow,
      fract: (x: number) => x - Math.floor(x),
      step: (edge: number, x: number) => (x < edge ? 0 : 1),
      clamp,
      mix: (a: number, b: number, t: number) => a * (1 - t) + b * t,
      smoothstep: (e0: number, e1: number, x: number) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
      },
    };
    const rnd = mulberry32(1234);
    let finite = 0;
    for (let i = 0; i < 1000; i++) {
      const text = randomExpression(rnd, 4);
      const values = { u: rnd(), v: rnd(), nl: rnd(), z: rnd(), x: rnd(), y: rnd(), bx: rnd(), by: rnd(), bz: rnd() };
      const parsed = parseChannel(text);
      if (!parsed.ok) {
        expect(parsed.error, text).toMatch(/tokens|nested|characters/);
        continue;
      }
      const js = new Function(...INPUT_NAMES, ...Object.keys(reference), `return (${text});`) as (...a: unknown[]) => number;
      const want = js(...INPUT_NAMES.map((n) => values[n]), ...Object.values(reference));
      const got = run(parsed.value.tree, values);
      if (Number.isNaN(want)) expect(got, text).toBeNaN();
      else {
        expect(near(got, want, 1e-9), `${text}: ${got} vs ${want}`).toBe(true);
        if (Number.isFinite(want)) finite++;
      }
    }
    expect(finite).toBeGreaterThan(500);
  });

  it('enforces the size, token and depth caps and says why', () => {
    expect(parseChannel('1 + '.repeat(29) + '1').ok).toBe(true);
    const longText = `${'1+'.repeat(60)}1`;
    expect(longText.length).toBeGreaterThan(MAX_CHARS);
    const tooLong = parseChannel(longText);
    expect(!tooLong.ok && tooLong.error).toContain(`${MAX_CHARS} or fewer`);
    const manyTokens = parseChannel(`${'x+'.repeat(31)}x`);
    expect(manyTokens.ok).toBe(false);
    expect(!manyTokens.ok && manyTokens.error).toContain(`${MAX_TOKENS} or fewer`);
    const deep = parseChannel(`${'('.repeat(MAX_DEPTH + 1)}1${')'.repeat(MAX_DEPTH + 1)}`);
    expect(!deep.ok && deep.error).toContain('nested more than');
    expect(parseChannel(`${'('.repeat(MAX_DEPTH)}1${')'.repeat(MAX_DEPTH)}`).ok).toBe(true);
    expect(parseChannel('   ').ok).toBe(false);
  });

  it('refuses unknown names, assignments, loops, strings and unknown calls with the reason, never as JavaScript', () => {
    const reasons: [string, RegExp][] = [
      ['q + 1', /unknown name "q"/],
      ['x = 1', /assignments are not part/],
      ['for', /unknown name "for"/],
      ['while(1)', /unknown function "while"/],
      ['"red"', /strings are not part/],
      ["'a'", /strings are not part/],
      ['alert(1)', /unknown function "alert"/],
      ['u(2)', /input, not a function/],
      ['sin', /is a function/],
      ['min(1)', /takes 2 arguments, not 1/],
      ['sin(1, 2)', /takes 1 argument, not 2/],
      ['1 +', /ends too soon/],
      ['(1 + 2', /closing/],
      ['1 2', /unexpected "2"/],
      ['x.y', /unexpected "\."/],
      ['1; 2', /unexpected ";"/],
      ['* 2', /unexpected "\*"/],
    ];
    for (const [text, why] of reasons) {
      const r = parseChannel(text);
      expect(r.ok, text).toBe(false);
      expect(!r.ok && r.error, text).toMatch(why);
      expect(!r.ok && r.error, text).toMatch(/^Column \d+:|characters|expression/);
    }
  });

  it('every preset parses and every channel is a number', () => {
    for (const p of SHADER_PRESETS) {
      const c = compileChannels(p.fields);
      expect(c.ok, p.id).toBe(true);
      if (c.ok) c.shader(inputs).forEach((v) => expect(typeof v).toBe('number'));
    }
  });
});

describe('the shaded image', () => {
  const mesh = cube();
  const m = matrices(30);
  const shade = (id: string) => {
    const preset = SHADER_PRESETS.find((p) => p.id === id);
    const c = compileChannels(preset?.fields ?? ['0', '0', '0']);
    if (!c.ok) throw new Error(id);
    return shadeImage(mesh, m, c.shader, [0, 0, 0]);
  };

  it('barycentric weights sum to 1 on every visible pixel', () => {
    const img = shade('rainbow');
    const ok = img.pixels.filter((p) => p.kind === 'ok');
    expect(ok.length).toBeGreaterThan(1000);
    ok.forEach((p) => expect(near(p.rgb[0] + p.rgb[1] + p.rgb[2], 1, 1e-9)).toBe(true));
  });

  it('Lambert equals the interpolated N·L on each visible pixel, and toon quantises it to four levels', () => {
    const { winners } = visibleFragments(mesh, m, IMAGE.w, IMAGE.h);
    const lam = shade('lambert');
    const toon = shade('toon');
    winners.forEach((f, i) => {
      if (!f) return;
      expect(near(lam.pixels[i].rgb[0], Math.min(1, f.nl), 1e-12)).toBe(true);
      expect([0, 1 / 3, 2 / 3, 1].some((level) => near(level, toon.pixels[i].rgb[0], 1e-12))).toBe(true);
    });
  });

  it('the checker uses both of its colours on the cube and depth fog spreads into many grey levels', () => {
    const levels = new Set(shade('checker').pixels.filter((p) => p.kind === 'ok').map((p) => p.rgb[0]));
    expect([...levels].sort()).toEqual([0, 1]);
    expect(new Set(shade('fog').pixels.filter((p) => p.kind === 'ok').map((p) => p.rgb[0].toFixed(2))).size).toBeGreaterThan(5);
  });

  it('sqrt of a negative marks exactly the covered pixels left of the middle as bad, and the count is reported', () => {
    const img = shade('broken');
    const { winners } = visibleFragments(mesh, m, IMAGE.w, IMAGE.h);
    winners.forEach((f, i) => {
      if (!f) expect(img.pixels[i].kind).toBe('background');
      else expect(img.pixels[i].kind).toBe((f.x + 0.5) / IMAGE.w < 0.5 ? 'bad' : 'ok');
    });
    expect(img.badCount).toBe(img.pixels.filter((p) => p.kind === 'bad').length);
    expect(img.badCount).toBeGreaterThan(100);
  });

  it('a division by zero is infinite, follows IEEE and is marked bad; the shader runs once per visible pixel', () => {
    const c = compileChannels(['1 / 0', '0', '0']);
    if (!c.ok) throw new Error('parses');
    const img = shadeImage(mesh, m, c.shader, [0, 0, 0]);
    const visible = visibleFragments(mesh, m, IMAGE.w, IMAGE.h).winners.filter(Boolean).length;
    expect(img.badCount).toBe(visible);
    expect(img.shaded).toBe(visible);
  });

  it('the image aspect is the camera aspect (no stretching)', () => {
    expect(IMAGE.w / IMAGE.h).toBe(ASPECT);
    expect(GRID.w / GRID.h).toBe(ASPECT);
  });
});

describe('order and early depth testing', () => {
  /** Fragments by brute force: pixel centres strictly inside, counted without core/raster. */
  const covers = (t: Triangle<DepthVertex>, w: number, h: number) => {
    const out = new Set<number>();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = [orient([t[1].x, t[1].y], [t[2].x, t[2].y], x + 0.5, y + 0.5), orient([t[2].x, t[2].y], [t[0].x, t[0].y], x + 0.5, y + 0.5), orient([t[0].x, t[0].y], [t[1].x, t[1].y], x + 0.5, y + 0.5)];
      expect(e.every((v) => Math.abs(v) > 1e-9), 'no centre on an edge in the hand layout').toBe(true);
      if (e.every((v) => v > 0) || e.every((v) => v < 0)) out.add(y * w + x);
    }
    return out;
  };

  it('for a hand-built two-triangle layout the counts follow from first principles in all four combinations', () => {
    const [w, h] = [12, 10];
    const far: Triangle<DepthVertex> = [{ x: 0, y: 0, z: 0.8 }, { x: 11.3, y: 1.1, z: 0.8 }, { x: 1.2, y: 9.7, z: 0.8 }];
    const nearT: Triangle<DepthVertex> = [{ x: 3.1, y: 0.4, z: 0.2 }, { x: 11.7, y: 8.6, z: 0.2 }, { x: 0.6, y: 6.2, z: 0.2 }];
    const cf = covers(far, w, h);
    const cn = covers(nearT, w, h);
    const overlap = [...cf].filter((p) => cn.has(p)).length;
    expect(overlap).toBeGreaterThan(5);
    const tris = [far, nearT];
    const run2 = (order: number[], earlyZ: boolean) => renderTriangles(tris, w, h, { order, earlyZ });
    expect(run2([0, 1], false).shaderInvocations).toBe(cf.size + cn.size);
    expect(run2([1, 0], false).shaderInvocations).toBe(cf.size + cn.size);
    expect(run2([0, 1], true).shaderInvocations).toBe(cf.size + cn.size);
    expect(run2([1, 0], true).shaderInvocations).toBe(cn.size + cf.size - overlap);
    expect(run2([0, 1], true).coveredFragments).toBe(cf.size + cn.size);
  });

  it('on the lesson layout the picture is the same in every order and the invocation counts fall as the lesson says', () => {
    const base = overdraw(initialOverdraw());
    for (const order of ['back-to-front', 'front-to-back', 'shuffled'] as const) for (const earlyZ of [false, true]) {
      const r = overdraw({ order, earlyZ });
      expect(Array.from(r.rendered.id)).toEqual(Array.from(base.rendered.id));
      expect(r.rendered.coveredFragments).toBe(base.rendered.coveredFragments);
      expect(r.wasted).toBe(r.rendered.shaderInvocations - r.visible);
    }
    const noEarly = overdraw({ order: 'back-to-front', earlyZ: false });
    expect(noEarly.rendered.shaderInvocations).toBe(noEarly.rendered.coveredFragments);
    expect(overdraw({ order: 'back-to-front', earlyZ: true }).rendered.shaderInvocations).toBe(noEarly.rendered.coveredFragments);
    const best = overdraw({ order: 'front-to-back', earlyZ: true });
    expect(best.rendered.shaderInvocations).toBeLessThan(noEarly.rendered.shaderInvocations);
    expect(best.wasted).toBe(0);
  });

  it('back to front and front to back are really sorted by depth, and the shuffle is a seeded permutation', () => {
    const depthOrder = (kind: 'back-to-front' | 'front-to-back') => orderFor(LAYOUT, kind).map((i) => LAYOUT[i][0].z);
    expect(depthOrder('back-to-front')).toEqual([0.8, 0.6, 0.4, 0.2]);
    expect(depthOrder('front-to-back')).toEqual([0.2, 0.4, 0.6, 0.8]);
    const shuffled = orderFor(LAYOUT, 'shuffled');
    expect([...shuffled].sort()).toEqual([0, 1, 2, 3]);
    expect(orderFor(LAYOUT, 'shuffled', SHUFFLE_SEED)).toEqual(shuffled);
  });
});

describe('blending', () => {
  const overlapPixel = probePixel('both');
  const by = (s: { order: 'a-then-b' | 'b-then-a'; alphaA: number; alphaB: number }) => blend(s).pixels[overlapPixel];

  it('the overlap pixel equals alpha·Cs + (1 - alpha)·Cd worked by hand, in both orders', () => {
    const [aA, aB] = [0.6, 0.3];
    const afterA = COLOUR_A.map((c, i) => aA * c + (1 - aA) * BACKGROUND[i]);
    const hand1 = COLOUR_B.map((c, i) => aB * c + (1 - aB) * afterA[i]);
    const afterB = COLOUR_B.map((c, i) => aB * c + (1 - aB) * BACKGROUND[i]);
    const hand2 = COLOUR_A.map((c, i) => aA * c + (1 - aA) * afterB[i]);
    by({ order: 'a-then-b', alphaA: aA, alphaB: aB }).forEach((v, i) => expect(v).toBeCloseTo(hand1[i], 12));
    by({ order: 'b-then-a', alphaA: aA, alphaB: aB }).forEach((v, i) => expect(v).toBeCloseTo(hand2[i], 12));
    expect(hand1).not.toEqual(hand2);
  });

  it('the two orders differ by exactly alphaA·alphaB·(B - A), so they agree only when an alpha is 0 (or the colours match)', () => {
    for (const aA of [0, 0.2, 0.5, 1]) for (const aB of [0, 0.4, 0.7, 1]) {
      const one = by({ order: 'a-then-b', alphaA: aA, alphaB: aB });
      const two = by({ order: 'b-then-a', alphaA: aA, alphaB: aB });
      one.forEach((v, i) => expect(v - two[i]).toBeCloseTo(aA * aB * (COLOUR_B[i] - COLOUR_A[i]), 12));
      const same = one.every((v, i) => Math.abs(v - two[i]) < 1e-12);
      expect(same).toBe(aA === 0 || aB === 0);
    }
  });

  it('pixels outside both triangles keep the background and the recorded steps match the pixel', () => {
    const r = blend({ order: 'a-then-b', alphaA: 0.6, alphaB: 0.6 });
    r.region.forEach((reg, i) => {
      if (reg === 'none') expect(r.pixels[i]).toEqual([...BACKGROUND]);
      expect(r.steps[i].length).toBe(reg === 'both' ? 2 : reg === 'none' ? 0 : 1);
      if (r.steps[i].length) expect(r.steps[i].at(-1)?.after).toEqual(r.pixels[i]);
    });
    expect(r.pixels).toHaveLength(BLEND_GRID.w * BLEND_GRID.h);
  });
});

describe('long typed words are echoed shortened (390px overflow)', () => {
  it('a 115-character identifier is refused with a short message', () => {
    const res = compileChannels(['a'.repeat(115), '0', '0']);
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res.errors[0] ?? '').length).toBeLessThan(160);
  });
});
