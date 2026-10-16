import { describe, expect, it } from 'vitest';
import { conv2d } from '../../core/linalg';
import { gradCheck } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import { SIZE, barsSet, type Image } from './barsData';
import {
  BAR_COLUMNS, BOX, DEFAULT_OPTIONS, IMAGE_PRESETS, INTENSITIES, KERNEL_PRESETS, NOISE_LEVELS, SHIFTS, barAt, convParams, convolve, denseParams, flipKernel, kernelOf, maxPool, nextIntensity,
  outputSize, paintCell, padded, presetImage, refuse, shiftImage, shiftPresets, shiftReport, windowSteps, type ConvOptions, type Kernel,
} from './convolve';
import { parseEntry } from './kernelEntry';
import {
  GALLERY_SEEDS, HELD_OUT_COUNT, LEARNED_AT, LEARN_DEFAULT, TRAIN_COUNT, applyLearned, createLearnRun, learnedShare, trainGallery,
} from './learn';
import { convOpening, learnOpening, poolOpening, stackOpening } from './openings';
import {
  INPUT_SIZE, MAX_LAYERS, PERTURBATION, canAdd, describeStack, reachedByPerturbation, reachedByRecurrence, receptiveBox, runStack, stackInput, stackKernels, type LayerKind,
} from './stack';

const rndImage = (rnd: () => number, n = SIZE): Image => Array.from({ length: n }, () => Array.from({ length: n }, () => rnd() * 2 - 1));
const rndKernel = (rnd: () => number): Kernel => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => Math.round((rnd() * 18 - 9) * 100) / 100));

/** Independent oracle: a naive four-loop cross-correlation on the zero-padded image. */
function naive(image: Image, kernel: Kernel, stride: number, pad: number): number[][] {
  const [n, k] = [image.length, kernel.length];
  const side = Math.floor((n + 2 * pad - k) / stride) + 1;
  const out: number[][] = [];
  for (let oy = 0; oy < side; oy++) {
    const row: number[] = [];
    for (let ox = 0; ox < side; ox++) {
      let sum = 0;
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          const [y, x] = [oy * stride + a - pad, ox * stride + b - pad];
          if (y >= 0 && y < n && x >= 0 && x < n) sum += image[y][x] * kernel[a][b];
        }
      }
      row.push(sum);
    }
    out.push(row);
  }
  return out;
}

describe('convolution (scene 1)', () => {
  it('conv2d equals a naive four-loop reference on 200 seeded images, kernels, strides and paddings', () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const [image, kernel, stride, pad] = [rndImage(rnd, 5 + Math.floor(rnd() * 6)), rndKernel(rnd), 1 + Math.floor(rnd() * 3), Math.floor(rnd() * 2)];
      const got = conv2d(image, kernel, { stride, pad });
      const want = naive(image, kernel, stride, pad);
      expect(got.length).toBe(want.length);
      got.forEach((row, y) => row.forEach((v, x) => expect(v).toBeCloseTo(want[y][x], 9)));
    }
  });

  it('the output size formula equals the real output for every (n, k, p, s) in range, and a refusal is a real failure', () => {
    for (let n = 1; n <= 12; n++) {
      for (let k = 1; k <= 5; k++) {
        for (let p = 0; p <= 1; p++) {
          for (let s = 1; s <= 3; s++) {
            const image = Array.from({ length: n }, () => new Array<number>(n).fill(1));
            const kernel = Array.from({ length: k }, () => new Array<number>(k).fill(1));
            if (k > n + 2 * p) {
              expect(refuse(n, k, p, s)).not.toBeNull();
              expect(() => conv2d(image, kernel, { stride: s, pad: p })).toThrow();
              continue;
            }
            expect(refuse(n, k, p, s)).toBeNull();
            expect(conv2d(image, kernel, { stride: s, pad: p }).length, `n${n} k${k} p${p} s${s}`).toBe(outputSize(n, k, p, s));
          }
        }
      }
    }
    expect([outputSize(8, 3, 0, 1), outputSize(8, 3, 1, 1), outputSize(8, 3, 0, 2)]).toEqual([6, 8, 3]);
  });

  it('refuses stride 0, padding above 1 and a kernel bigger than the padded image, with a message', () => {
    expect(refuse(8, 3, 0, 0)).toMatch(/stride/);
    expect(refuse(8, 3, 2, 1)).toMatch(/Padding/);
    expect(refuse(2, 3, 0, 1)).toMatch(/does not fit/);
    expect(() => convolve(presetImage('vbar'), kernelOf('identity'), { ...DEFAULT_OPTIONS, pad: 2 })).toThrow(/Padding/);
  });

  it('hand vector: a 6 x 6 image, left three columns 0 and right three 1, with Sobel x gives 0, 4, 4, 0 on every row of the 4 x 4 output', () => {
    const image = Array.from({ length: 6 }, () => [0, 0, 0, 1, 1, 1]);
    const out = conv2d(image, kernelOf('sobelX'));
    expect(out.length).toBe(4);
    for (const row of out) expect(row).toEqual([0, 4, 4, 0]);
  });

  it('the vertical bar under Sobel x has 4 on its left edge and -4 on its right: the try-this row 0, 4, 0, -4, 0, 0', () => {
    const map = convolve(convOpening().image, convOpening().kernel, convOpening().options);
    for (const row of map) expect(row).toEqual([0, 4, 0, -4, 0, 0]);
  });

  it('window steps: one per output cell in reading order, the products add to the feature-map value, with every option combination', () => {
    const rnd = mulberry32(3);
    for (const stride of [1, 2]) {
      for (const pad of [0, 1]) {
        for (const relu of [false, true]) {
          for (const flip of [false, true]) {
            const o: ConvOptions = { stride, pad, relu, flip };
            const [image, kernel] = [rndImage(rnd), rndKernel(rnd)];
            const map = convolve(image, kernel, o);
            const steps = windowSteps(image, kernel, o);
            expect(steps.length).toBe(map.length * map.length);
            steps.forEach((s, i) => {
              expect([s.oy, s.ox]).toEqual([Math.floor(i / map.length), i % map.length]);
              expect(s.value).toBeCloseTo(map[s.oy][s.ox], 9);
              expect(s.products.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(s.sum, 9);
              expect(s.top).toBe(s.oy * stride);
            });
          }
        }
      }
    }
  });

  it('padding adds rings of zeros and nothing else', () => {
    const image = presetImage('diagonal');
    const grid = padded(image, 1);
    expect(grid.length).toBe(SIZE + 2);
    expect(grid[0].every((v) => v === 0) && grid[SIZE + 1].every((v) => v === 0)).toBe(true);
    for (let y = 0; y < SIZE; y++) expect(grid[y + 1].slice(1, -1)).toEqual(image[y]);
  });

  it('flipping the kernel is true convolution by its definition; Sobel flips to its negative and a symmetric kernel is unchanged', () => {
    const rnd = mulberry32(4);
    for (let i = 0; i < 30; i++) {
      const [image, kernel] = [rndImage(rnd), rndKernel(rnd)];
      const flipped = convolve(image, kernel, { ...DEFAULT_OPTIONS, flip: true });
      // True convolution: out[y][x] = sum k[a][b] * image[y + 2 - a][x + 2 - b].
      flipped.forEach((row, y) =>
        row.forEach((v, x) => {
          let sum = 0;
          for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) sum += kernel[a][b] * image[y + 2 - a][x + 2 - b];
          expect(v).toBeCloseTo(sum, 9);
        }),
      );
    }
    const image = presetImage('ell');
    const plain = convolve(image, kernelOf('sobelX'), DEFAULT_OPTIONS);
    const flipped = convolve(image, kernelOf('sobelX'), { ...DEFAULT_OPTIONS, flip: true });
    flipped.forEach((row, y) => row.forEach((v, x) => expect(v).toBeCloseTo(-plain[y][x], 12)));
    expect(convolve(image, kernelOf('blur'), { ...DEFAULT_OPTIONS, flip: true })).toEqual(convolve(image, kernelOf('blur'), DEFAULT_OPTIONS));
    expect(flipKernel(flipKernel(kernelOf('sharpen')))).toEqual(kernelOf('sharpen'));
  });

  it('the kernel presets are the textbook ones, and ReLU clamps negatives and nothing else', () => {
    expect(kernelOf('sobelX')).toEqual([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]);
    expect(kernelOf('sobelY')).toEqual([[-1, -2, -1], [0, 0, 0], [1, 2, 1]]);
    expect(kernelOf('identity').flat().reduce((a, b) => a + b, 0)).toBe(1);
    expect(KERNEL_PRESETS.length).toBe(5);
    expect(BOX * 9).toBeCloseTo(1, 2);
    const image = presetImage('ell');
    const raw = convolve(image, kernelOf('sobelX'), DEFAULT_OPTIONS);
    const clamped = convolve(image, kernelOf('sobelX'), { ...DEFAULT_OPTIONS, relu: true });
    raw.forEach((row, y) => row.forEach((v, x) => expect(clamped[y][x]).toBe(Math.max(v, 0))));
  });

  it('painting cycles 0, 0.5, 1 and back, changes one cell, and never mutates the old image', () => {
    expect(INTENSITIES.map(nextIntensity)).toEqual([0.5, 1, 0]);
    const image = presetImage('vbar');
    const copy = image.map((r) => [...r]);
    const next = paintCell(image, 0, 0);
    expect(image).toEqual(copy);
    expect(next[0][0]).toBe(0.5);
    expect(next.flat().filter((v, i) => v !== image.flat()[i]).length).toBe(1);
  });

  it('image presets are 8 x 8 on the painting steps; noise is seeded and its level is the share of lit pixels', () => {
    for (const p of IMAGE_PRESETS) {
      const image = presetImage(p.id);
      expect(image.length).toBe(SIZE);
      for (const v of image.flat()) expect(INTENSITIES as readonly number[]).toContain(v);
    }
    expect(presetImage('noise')).toEqual(presetImage('noise'));
    const lit = (level: number) => presetImage('noise', level).flat().filter((v) => v > 0).length;
    expect(lit(NOISE_LEVELS[0])).toBeLessThan(lit(NOISE_LEVELS[2]));
    expect(lit(1)).toBe(SIZE * SIZE);
  });

  it('kernel entries: plain numbers from -9 to 9 are read; letters, exponents and out-of-range values are refused', () => {
    for (const ok of ['0', '-9', '9', '0.111', '−2', ' 3 ']) expect(parseEntry(ok).ok, ok).toBe(true);
    for (const bad of ['', 'abc', '10', '-10', '1e3', '2,5', '9.01', '<b>']) expect(parseEntry(bad).ok, bad).toBe(false);
    expect((parseEntry('10') as { error: string }).error).toBe('Kernel entries run from -9 to 9.');
  });
});

describe('pooling and shifting (scene 2)', () => {
  it('maxPool equals a brute-force block maximum on 50 seeded maps', () => {
    const rnd = mulberry32(6);
    for (let i = 0; i < 50; i++) {
      const map = rndImage(rnd, 6);
      const pooled = maxPool(map);
      expect(pooled.length).toBe(3);
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const block = [map[2 * y][2 * x], map[2 * y][2 * x + 1], map[2 * y + 1][2 * x], map[2 * y + 1][2 * x + 1]];
          expect(pooled[y][x]).toBe(block.reduce((a, b) => (b > a ? b : a)));
        }
      }
    }
  });

  it('equivariance: for every bar column and shift the feature map of the shifted image is the shifted feature map', () => {
    for (const column of BAR_COLUMNS) {
      for (const dx of SHIFTS) expect(shiftReport(barAt(column), dx).mapShifted, `column ${column} shift ${dx}`).toBe(true);
    }
  });

  it('the equivariance check can fail: a position-dependent operation (not a convolution) does not commute with the shift', () => {
    const positional = (image: Image) => convolve(image, kernelOf('sobelX'), { ...DEFAULT_OPTIONS, relu: true }).map((row) => row.map((v, x) => v * (x + 1)));
    const original = positional(barAt(3));
    const shifted = positional(shiftImage(barAt(3), 1));
    const moves = shifted.every((row, y) => row.every((v, x) => x - 1 < 0 || x - 1 >= row.length || Math.abs(v - original[y][x - 1]) < 1e-9));
    expect(moves).toBe(false);
  });

  it('pooling hides some shifts and not others: column 3 shift +1 leaves the pooled map alone, column 4 shift +1 changes 6 of 9 cells', () => {
    expect(shiftReport(barAt(2), 1).pooledChanged).toBe(0);
    expect(shiftReport(barAt(3), 1).pooledChanged).toBe(6);
    const presets = shiftPresets();
    expect(shiftReport(barAt(presets.unchanged.column), presets.unchanged.shift).pooledChanged).toBe(0);
    expect(shiftReport(barAt(presets.changed.column), presets.changed.shift).pooledChanged).toBeGreaterThan(0);
  });

  it('the pooled count is a real comparison of the two pooled maps', () => {
    for (const column of BAR_COLUMNS) {
      for (const dx of SHIFTS) {
        const r = shiftReport(barAt(column), dx);
        const a = r.original.pooled.flat();
        const b = r.shifted.pooled.flat();
        expect(r.pooledChanged).toBe(a.filter((v, i) => v !== b[i]).length);
      }
    }
  });

  it('shifting is exact: what slides off is lost and zeros slide in', () => {
    const image = presetImage('diagonal');
    expect(shiftImage(image, 0)).toEqual(image);
    expect(shiftImage(image, 1)[3]).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
    expect(shiftImage(image, -2)[3]).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('numbers learned: a 3 x 3 conv layer is 10, the dense layer for the same 6 x 6 map from 64 pixels is 2,340', () => {
    expect(convParams(1, 3)).toBe(10);
    expect(convParams(2, 3)).toBe(20);
    expect(denseParams(64, 36)).toBe(2340);
  });
});

describe('learning a kernel (scene 3)', () => {
  it('the conv net passes gradCheck on this lesson\'s own images', () => {
    for (const kernels of [1, 2]) {
      const run = createLearnRun({ kernels, seed: 3 });
      run.advance(5);
      expect(gradCheck(run.net, barsSet(100, TRAIN_COUNT, 0.2)).maxRelError).toBeLessThan(1e-6);
    }
  });

  it('the default run reaches the learned line on unseen images by epoch 120 and its loss falls', () => {
    const run = createLearnRun(LEARN_DEFAULT);
    run.advance(120);
    expect(run.heldOut()).toBeGreaterThanOrEqual(LEARNED_AT);
    expect(run.lossHistory[120]).toBeLessThan(run.lossHistory[0]);
    expect(run.lossHistory.length).toBe(121);
  });

  it('a stated share of seeds: 6 of 8 seeds learn it with one kernel, 8 of 8 with two, and one seed finds nothing', () => {
    const one = trainGallery(1, 1);
    expect(one.length).toBe(GALLERY_SEEDS);
    expect(learnedShare(one)).toBe(6);
    expect(one[2].heldOut).toBeLessThan(0.6);
    expect(learnedShare(trainGallery(2, 1))).toBe(8);
  });

  it('over seeds 1 to 20 with one kernel, at least 12 reach the learned line; the held-out set has 200 images', () => {
    expect(HELD_OUT_COUNT).toBe(200);
    expect(learnedShare(trainGallery(1, 1, 20))).toBeGreaterThanOrEqual(12);
  });

  it('different seeds learn different kernels', () => {
    const [a, b] = [createLearnRun({ kernels: 1, seed: 1 }), createLearnRun({ kernels: 1, seed: 2 })];
    a.advance(120);
    b.advance(120);
    expect(a.kernels()[0]).not.toEqual(b.kernels()[0]);
  });

  it('applying the net to your own image gives a probability and one feature map per kernel', () => {
    const run = createLearnRun({ kernels: 2, seed: 1 });
    run.advance(60);
    const out = applyLearned(run.net, presetImage('vbar'));
    expect(out.p).toBeGreaterThan(0);
    expect(out.p).toBeLessThan(1);
    expect(out.maps.length).toBe(2);
    expect(out.maps[0].length).toBe(6);
  });
});

describe('stacking layers (scene 4)', () => {
  const kinds: LayerKind[] = ['conv', 'pool'];
  const randomStack = (rnd: () => number): LayerKind[] => {
    const layers: LayerKind[] = [];
    for (let n = 1 + Math.floor(rnd() * MAX_LAYERS); layers.length < n; ) {
      const kind = kinds[Math.floor(rnd() * 2)];
      if (!canAdd(layers, kind)) break;
      layers.push(kind);
    }
    return layers;
  };

  it('hand values: three 3 x 3 convs give 7 x 7 and a 10 x 10 output; conv, pool, conv gives 8 x 8 and 5 x 5 (3, 4, 8)', () => {
    const three = describeStack(['conv', 'conv', 'conv']);
    expect(three.map((r) => r.field)).toEqual([3, 5, 7]);
    expect(three.at(-1)!.side).toBe(10);
    const cpc = describeStack(['conv', 'pool', 'conv']);
    expect(cpc.map((r) => r.field)).toEqual([3, 4, 8]);
    expect(cpc.map((r) => r.side)).toEqual([14, 7, 5]);
    expect(cpc.map((r) => r.jump)).toEqual([1, 2, 2]);
  });

  it('the receptive field from the recurrence equals the perturbation test for every input pixel of 40 random stacks of up to 4 layers', () => {
    const rnd = mulberry32(12);
    const image = stackInput();
    for (let i = 0; i < 40; i++) {
      const layers = randomStack(rnd);
      if (layers.length === 0) continue;
      const kernels = stackKernels(layers, i);
      for (let row = 0; row < INPUT_SIZE; row++) {
        for (let col = 0; col < INPUT_SIZE; col++) {
          const moved = reachedByPerturbation(layers, kernels, image, row, col);
          const predicted = reachedByRecurrence(layers, row, col);
          expect([...moved].sort(), `${layers.join('-')} pixel ${row},${col}`).toEqual([...predicted].sort());
        }
      }
    }
  });

  it('broken variant: a recurrence that adds k instead of k - 1 disagrees with the perturbation test, so the test above can fail', () => {
    const layers: LayerKind[] = ['conv', 'conv', 'conv'];
    const wrongField = 1 + 3 * 3;
    expect(wrongField).not.toBe(describeStack(layers).at(-1)!.field);
    // An interior pixel reaches field x field outputs (the output is 10 x 10, so none are cut off).
    const moved = reachedByPerturbation(layers, stackKernels(layers), stackInput(), 8, 8);
    expect(moved.size).toBe(7 ** 2);
    expect(moved.size).not.toBe(wrongField ** 2);
  });

  it('a receptive box stays inside the input and has the stated size, for every output cell of every random stack', () => {
    const rnd = mulberry32(13);
    for (let i = 0; i < 40; i++) {
      const layers = randomStack(rnd);
      const last = describeStack(layers).at(-1);
      if (!last) continue;
      for (let r = 0; r < last.side; r++) {
        for (let c = 0; c < last.side; c++) {
          const box = receptiveBox(layers, r, c);
          expect(box.size).toBe(last.field);
          expect(box.top + box.size).toBeLessThanOrEqual(INPUT_SIZE);
          expect(box.left + box.size).toBeLessThanOrEqual(INPUT_SIZE);
        }
      }
    }
  });

  it('layers are capped at four and a layer that would leave no output is refused with a message', () => {
    expect(canAdd(['conv', 'conv', 'conv', 'conv'], 'conv')).toBe(false);
    expect(canAdd(['conv', 'conv', 'conv'], 'conv')).toBe(true);
    expect(() => describeStack(['pool', 'pool', 'pool', 'pool', 'pool'], 16)).toThrow(/leaves nothing/);
    expect(canAdd(['pool', 'pool', 'pool', 'pool'], 'pool')).toBe(false);
  });

  it('the perturbation really runs the stack: it raises the reached outputs by a lot and leaves the others untouched', () => {
    const layers: LayerKind[] = ['conv', 'pool', 'conv'];
    const [kernels, image] = [stackKernels(layers), stackInput()];
    const before = runStack(layers, kernels, image);
    const bumped = image.map((r, y) => r.map((v, x) => (y === 8 && x === 8 ? PERTURBATION : v)));
    const after = runStack(layers, kernels, bumped);
    const moved = reachedByPerturbation(layers, kernels, image, 8, 8);
    after.forEach((row, y) => row.forEach((v, x) => (moved.has(`${y},${x}`) ? expect(v - before[y][x]).toBeGreaterThan(100) : expect(v).toBe(before[y][x]))));
  });
});

describe('opening states are pure functions', () => {
  it('each scene opens from fresh values, and mutating one result never reaches the next', () => {
    for (const open of [convOpening, poolOpening, learnOpening, stackOpening]) {
      expect(open()).toEqual(open());
      expect(open()).not.toBe(open());
    }
    const image = convOpening().image;
    image[0][0] = 1;
    expect(convOpening().image[0][0]).toBe(0);
    const layers = stackOpening().layers;
    layers.push('pool');
    expect(stackOpening().layers).toEqual(['conv', 'conv', 'conv']);
    const kernel = poolOpening().kernel;
    kernel[0][0] = 99;
    expect(poolOpening().kernel[0][0]).toBe(-1);
  });
});
