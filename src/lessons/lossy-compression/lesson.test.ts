import { describe, expect, it } from 'vitest';
import { decimal, integer, pct } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { SOURCES, analyseBlock, chooseSource, initialBlock, initialQuant, paintCell, quantiseBlock, toggleCoefficient, type QuantSource } from './blocks';
import { blockCaption, dB, generationCaption, imageCaption, quantCaption } from './captions';
import { generations, measure, syntheticImage } from './image';
import lesson from './index';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const clean = (s: string) => {
  expect(s).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return s;
};
const n2 = (v: number) => decimal(v, 2);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('lossy-compression');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('lossy-compression')).toEqual([]);
  });

  it('each scene opens on a pure state, and a painted block starts from the block that was showing', () => {
    expect(initialBlock()).toEqual(initialBlock());
    expect(initialBlock().source).toBe('textbook');
    expect(initialQuant()).toEqual({ source: 'textbook', quality: 50 });
    expect(chooseSource(initialBlock(), 'painted').painted).toEqual(analyseBlock(initialBlock()).block);
    expect(paintCell(initialBlock(), 0, 0).source).toBe('painted');
  });

  it('stays inside the page: no network call, no eval, no storage', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources, { also: ['localStorage', 'sessionStorage', 'indexedDB'] })).toEqual([]);
  });

  it('chips every scene, with the table and rule marked from memory and the size illustrative', () => {
    for (const file of ['./BlockScene.tsx', './QuantScene.tsx', './ImageScene.tsx', './LossScene.tsx']) expect(sources[file]).toContain('<Provenance kind="real">');
    expect(sources['./BlockScene.tsx']).toContain('kind="from-memory"');
    expect(sources['./QuantScene.tsx']).toContain('kind="from-memory"');
    expect(sources['./ImageScene.tsx']).toContain('kind="illustrative"');
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the textbook block, its DC, the DC zeroed, and the gradient against the checker', () => {
    const b = initialBlock();
    const base = analyseBlock(b);
    const zero = analyseBlock(toggleCoefficient(b, 0, 0));
    const grad = analyseBlock(chooseSource(b, 'gradient'));
    const check = analyseBlock(chooseSource(b, 'checker'));
    expect(Math.round(base.coeffs[0][0])).toBe(-415);
    expect(grad.holding90).toBeLessThan(check.holding90);
    const t = lesson.tryThis[0];
    expect(t).toContain(`${base.holding90} of 64 coefficients hold 90%`);
    expect(t).toContain('the DC coefficient is -415');
    expect(t).toContain(`${pct(zero.keptEnergy)} of the energy is kept and the PSNR drops to ${dB(zero.psnr)}`);
    expect(t).toContain(`${grad.holding90} coefficients hold 90%; pick the checker: ${check.holding90}`);
  });

  it('try-this 2: non-zero levels at qualities 50, 10, 1 and 100', () => {
    const q = (quality: number) => quantiseBlock({ ...initialQuant(), quality });
    const [q50, q10, q1, q100] = [q(50), q(10), q(1), q(100)];
    expect(q10.nonZero).toBeLessThan(q50.nonZero);
    expect(q1.nonZero).toBeLessThanOrEqual(2);
    const t = lesson.tryThis[1];
    expect(t).toContain(`${q50.nonZero} of 64 levels are non-zero`);
    expect(t).toContain(`quality to 10: ${q10.nonZero}`);
    expect(t).toContain(`To 1: ${q1.nonZero}`);
    expect(t).toContain(`${q100.nonZero} levels are non-zero`);
    expect(q100.table.flat().every((v) => v === 1)).toBe(true);
  });

  it('try-this 3: the estimated size and PSNR at 50 and at 5', () => {
    const img = syntheticImage();
    const [m50, m5] = [measure(img, 50).point, measure(img, 5).point];
    expect(m5.bytes).toBeLessThan(m50.bytes);
    const t = lesson.tryThis[2];
    expect(t).toContain(`${integer(Math.round(m50.bytes))} bytes against 4,096 raw, and the PSNR is ${dB(m50.psnr)}`);
    expect(t).toContain(`${integer(Math.round(m5.bytes))} bytes and ${dB(m5.psnr)}`);
  });

  it('try-this 4: ten aligned saves settle and ten shifted saves keep changing, with the stated counts', () => {
    const img = syntheticImage();
    const aligned = generations(img, 50, 10, 0);
    const shifted = generations(img, 50, 10, 3);
    expect(aligned.changed[9]).toBeLessThan(aligned.changed[0]);
    expect(shifted.changed[9]).toBeGreaterThan(aligned.changed[9]);
    const t = lesson.tryThis[3];
    expect(t).toContain(`save 1 changes ${integer(aligned.changed[0])} pixels and save 10 changes ${integer(aligned.changed[9])}`);
    expect(t).toContain(`save 10 changes ${integer(shifted.changed[9])}`);
  });
});

describe('every control combination gives a clean caption that matches the model', () => {
  it('scene 1: every source, nothing zeroed, one zeroed and every coefficient zeroed', () => {
    for (const { value } of SOURCES) {
      const base = chooseSource(initialBlock(), value);
      expect(expectCaption(blockCaption(base))).toContain('Click a coefficient');
      const one = toggleCoefficient(base, 0, 0);
      const r = analyseBlock(one);
      expect(clean(expectCaption(blockCaption(one)))).toContain(`${pct(r.keptEnergy)} of the energy is kept`);
      const all = { ...base, zeroed: base.zeroed.map(() => true) };
      expect(clean(expectCaption(blockCaption(all)))).toContain('64 coefficients zeroed');
    }
    const flat = { ...initialBlock(), source: 'painted' as const, painted: Array.from({ length: 8 }, () => new Array<number>(8).fill(128)) };
    expect(expectCaption(blockCaption(flat))).toContain('no energy after the shift');
    expect(expectCaption(blockCaption(toggleCoefficient(flat, 0, 0)))).toContain('PSNR infinite because nothing differs');
  });

  it('scene 2: every source at every quality from 1 to 100 states the counted levels', () => {
    for (const source of SOURCES.filter((s) => s.value !== 'painted').map((s) => s.value as QuantSource)) for (let quality = 1; quality <= 100; quality += 3) {
      const r = quantiseBlock({ source, quality });
      const text = clean(expectCaption(quantCaption({ source, quality })));
      expect(text).toContain(`${r.nonZero} of 64 levels are non-zero`);
      expect(text.includes('collapsed toward a flat patch')).toBe(r.nonZero <= 1);
    }
  });

  it('scene 3: the qualities at both ends', () => {
    const img = syntheticImage();
    for (const q of [1, 5, 50, 95, 100]) {
      const p = measure(img, q).point;
      expect(clean(expectCaption(imageCaption(q, p)))).toContain(`Quality ${q}: an estimated ${integer(Math.round(p.bytes))} bytes`);
    }
  });

  it('scene 4: aligned and shifted, one save and ten', () => {
    const img = syntheticImage();
    for (const shift of [0, 3, 7]) for (const saves of [1, 2, 10]) {
      const g = generations(img, 50, saves, shift);
      const text = clean(expectCaption(generationCaption(50, shift, g)));
      expect(text).toContain(`save ${saves} changed ${integer(g.changed[saves - 1])}`);
      expect(text.includes('with the grid aligned')).toBe(shift === 0);
    }
  });
});

describe('hostile input', () => {
  it('the brush and the slider cannot make an invalid block: painted values stay whole grey levels, the block stays 8 by 8', () => {
    let s = chooseSource(initialBlock(), 'painted');
    for (let i = 0; i < 100; i++) s = paintCell(s, i % 8, (i * 3) % 8);
    expect(s.painted).toHaveLength(8);
    s.painted.forEach((row) => {
      expect(row).toHaveLength(8);
      row.forEach((v) => expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true));
    });
    expect(n2(analyseBlock(s).mse)).toBe('0');
  });
});

describe('caption wording the model drives', () => {
  it('names the run of zeros as a number, never as arithmetic, and guards one save', () => {
    for (const quality of [1, 10, 50, 100]) {
      const r = quantiseBlock({ source: 'checker', quality });
      const text = clean(expectCaption(quantCaption({ source: 'checker', quality })));
      expect(text).not.toContain(' minus ');
      if (r.lastNonZero + 1 === 64) expect(text).toContain('no run of zeros follows it');
      else if (r.lastNonZero >= 0) expect(text).toContain(`the ${64 - (r.lastNonZero + 1)} after it are a run of zeros`);
    }
    const g = generations(syntheticImage(), 50, 1, 0);
    const one = clean(expectCaption(generationCaption(50, 0, g)));
    expect(one).not.toContain('and save 1');
    const painted = chooseSource(initialBlock(), 'painted');
    expect(clean(expectCaption(blockCaption(painted)))).toContain('Your painted block');
  });
});

describe('checker versus gradient: the explanation matches the numbers', () => {
  it('the checker loses far more than the gradient at quality 50, and its energy sits in a high-frequency corner with large steps', () => {
    const g = quantiseBlock({ source: 'gradient', quality: 50 });
    const c = quantiseBlock({ source: 'checker', quality: 50 });
    expect(c.mse).toBeGreaterThan(10 * g.mse);
    const checkerCoeffs = analyseBlock(chooseSource(initialBlock(), 'checker')).coeffs;
    const flat = checkerCoeffs.flat().map((v, i) => ({ v: Math.abs(v), i }));
    flat.sort((a, b) => b.v - a.v);
    expect(flat[0].i).toBe(63); // (7,7), the highest-frequency corner
    const text = [...lesson.keyIdeas, ...lesson.quiz.map((q) => q.why)].join(' ');
    expect(text).not.toMatch(/spread over high/);
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });

  it('does not claim a bound on the error at quality 100 that the lesson has not proven', () => {
    for (const text of [...lesson.keyIdeas, ...lesson.quiz.map((q) => q.why), ...lesson.tryThis]) expect(text).not.toMatch(/at most 1|one grey level/);
  });
});
