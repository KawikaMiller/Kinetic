import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { linkFrames, loadFrames } from './frames';
import { hex, link, type Mode } from './link';
import { loadPlan, randomBases, type Binding } from './load';
import { PRESETS, inputsFor } from './presets';

const MODES: Mode[] = ['dynamic', 'static'];

describe('link captions, every preset × libc mode', () => {
  for (const p of PRESETS) {
    for (const mode of MODES) {
      it(`${p.id} ${mode}`, () => {
        const inputs = inputsFor(p, mode);
        const r = link(inputs);
        const frames = linkFrames(inputs, r, mode);
        const texts = frames.map((f) => captionText(f.say));
        for (const t of texts) {
          expect(t.length).toBeGreaterThan(20);
          // "undefined" is a word ld's story uses; a leaked JS value would show up anywhere else.
          const prose = t.replace(/(is|are|stays?|still) undefined|undefined reference/g, '');
          expect(prose).not.toMatch(/undefined|NaN|null|\[object/);
        }
        const last = frames.at(-1)!;
        expect(last.done).toBe(true);
        if (r.ok) {
          expect(texts.at(-1)).toMatch(/^Linked: app/);
          expect(texts.at(-1)!.includes('libc.so.6')).toBe(mode === 'dynamic');
          expect(last.patched).toBe(r.patches.length);
          // One patch step per relocation, each quoting its own numbers.
          for (const patch of r.patches) expect(texts.some((t) => t.includes(`${hex(patch.P)} =`))).toBe(true);
          expect(last.messages).toEqual([]);
        } else {
          expect(texts.at(-1)).toMatch(/^The link failed/);
          expect(last.messages).toEqual(r.messages);
          expect(texts.at(-1)).toContain(r.messages.at(-2)!);
          expect(frames.some((f) => f.laidOut)).toBe(false);
        }
        // Every arrow drawn is a real resolution: from an object needing the symbol to its definer.
        for (const a of last.arrows) {
          const needs = r.included.find((o) => o.name === a.from)!.relocs.some((x) => x.symbol === a.symbol);
          expect(needs).toBe(true);
          const definer = r.definedBy.get(a.symbol) ?? (r.dynamic.includes(a.symbol) ? r.needed[0] : undefined);
          expect(a.toObj).toBe(definer);
        }
        // The duplicate preset narrates the clash after reading the file that causes it.
        if (p.id === 'duplicate') {
          const read = texts.findIndex((t) => t.startsWith('Read geom2.o'));
          const clash = texts.findIndex((t) => t.includes('multiple definition'));
          expect(read).toBeGreaterThan(0);
          expect(clash).toBe(read + 1);
          // At the clash nothing is printed yet, so the caption only promises the report.
          expect(frames[clash].messages).toEqual([]);
          expect(texts[clash]).toContain('will report it');
        }
        if (p.id === 'wrongOrder') expect(texts[1]).toMatch(/^Search libgeom\.a: nothing is undefined yet/);
      });
    }
  }
});

describe('load captions, every mode × binding', () => {
  const combos: [Mode, Binding][] = [['dynamic', 'lazy'], ['dynamic', 'now'], ['static', 'lazy']];
  for (const [mode, binding] of combos) {
    it(`${mode} ${binding}`, () => {
      const r = link(inputsFor(PRESETS[0], mode));
      const bases = randomBases(7);
      const plan = loadPlan(r, mode, binding, bases);
      const texts = loadFrames(plan, mode, binding).map((f) => captionText(f.say));
      for (const t of texts) expect(t).not.toMatch(/undefined|NaN|null/);
      expect(texts.at(-1)).toContain('area=24');
      expect(texts.at(-1)).toContain(hex(bases.heap));
      const all = texts.join(' ');
      expect(all.includes('PT_INTERP')).toBe(mode === 'dynamic');
      expect(all.includes(hex(bases.libc))).toBe(mode === 'dynamic');
      expect(all.includes('resolver')).toBe(mode === 'dynamic' && binding === 'lazy');
      expect(all.includes('-z now')).toBe(binding === 'now');
      // rip never claims the program starts at main: the first step has no rip, or rip in ld.so.
      expect(plan.steps[0].pointer).toBeNull();
      if (mode === 'static') expect(texts.join(' ')).toContain('_start');
    });
  }
});
