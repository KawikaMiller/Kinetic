import { describe, expect, it } from 'vitest';
import { BASE, le32, link, patchedSection, type Input, type Mode } from './link';
import { loadPlan, PAGE, printedLine, randomBases } from './load';
import { GEOM_C, GEOM_O, MAIN_C, MAIN_O } from './objects';
import { LIBC_SHARED, LIBC_STATIC, LIBGEOM, PRESETS, commandFor, inputsFor, type PresetId } from './presets';

const preset = (id: PresetId) => PRESETS.find((p) => p.id === id)!;
const run = (id: PresetId, mode: Mode = 'dynamic') => link(inputsFor(preset(id), mode));
const readLe32 = (b: readonly number[], at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >> 0;

describe('GNU ld messages (pinned wording)', () => {
  it('a missing object: undefined reference, with the place that uses it', () => {
    expect(run('missing').messages).toEqual([
      "/usr/bin/ld: main.o: in function `main':",
      "main.c:(.text+0xf): undefined reference to `area'",
      'collect2: error: ld returned 1 exit status',
    ]);
  });

  it('a duplicate: multiple definition, pointing at the first', () => {
    expect(run('duplicate').messages).toEqual([
      "/usr/bin/ld: geom2.o: in function `area':",
      "geom2.c:(.text+0x0): multiple definition of `area'; geom.o:geom.c:(.text+0x0): first defined here",
      'collect2: error: ld returned 1 exit status',
    ]);
  });

  it('a library before the object that needs it: the same undefined reference', () => {
    const r = run('wrongOrder');
    expect(r.ok).toBe(false);
    expect(r.messages).toEqual(run('missing').messages);
    expect(r.events[0]).toMatchObject({ k: 'skip', input: 0 });
  });

  it('the same library after the object succeeds', () => {
    const r = run('rightOrder');
    expect(r.ok).toBe(true);
    expect(r.events.find((e) => e.k === 'pull')).toMatchObject({ member: 'geom.o', resolved: ['area'] });
  });

  it('the commands', () => {
    expect(commandFor(preset('wrongOrder'), 'dynamic')).toBe('gcc -no-pie -o app -L. -lgeom main.o');
    expect(commandFor(preset('ok'), 'static')).toBe('gcc -no-pie -static -o app main.o geom.o');
  });
});

describe('every undefined symbol is resolved or reported', () => {
  for (const p of PRESETS) {
    for (const mode of ['dynamic', 'static'] as const) {
      it(`${p.id} ${mode}`, () => {
        const r = run(p.id, mode);
        const reported = new Set(r.events.filter((e) => e.k === 'undefined').map((e) => (e as { symbol: string }).symbol));
        for (const obj of r.included) {
          for (const rel of obj.relocs) {
            const local = obj.locals?.some((s) => s.name === rel.symbol);
            const ok = local || r.definedBy.has(rel.symbol) || r.dynamic.includes(rel.symbol);
            expect(ok || reported.has(rel.symbol)).toBe(true);
            expect(ok && reported.has(rel.symbol)).toBe(false);
          }
        }
        expect(r.ok).toBe(r.messages.length === 0);
        expect(r.ok).toBe(p.id === 'ok' || p.id === 'rightOrder');
      });
    }
  }
});

describe('static archives are searched left to right, once', () => {
  // Every order of main.o, geom.o-in-an-archive and libc: the link works exactly when the
  // archive comes after main.o (which needs area) and libc after the archive (geom.o needs printf).
  const pieces: Input[] = [{ kind: 'obj', obj: MAIN_O }, LIBGEOM, LIBC_STATIC];
  const perms = (xs: Input[]): Input[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  for (const order of perms(pieces)) {
    const names = order.map((i) => (i.kind === 'obj' ? i.obj.name : i.name)).join(' ');
    it(names, () => {
      const at = (n: string) => order.findIndex((i) => (i.kind === 'obj' ? i.obj.name : i.name) === n);
      const want = at('main.o') < at('libgeom.a') && at('libgeom.a') < at('libc.a');
      expect(link(order).ok).toBe(want);
    });
  }

  it('a shared library satisfies what is undefined when it is reached', () => {
    const r = link([{ kind: 'obj', obj: MAIN_O }, { kind: 'obj', obj: GEOM_O }, LIBC_SHARED]);
    expect(r.dynamic).toEqual(['printf']);
    expect(r.needed).toEqual(['libc.so.6']);
  });
});

describe('relocations: S + A − P, checked against what the CPU does with the bytes', () => {
  for (const mode of ['dynamic', 'static'] as const) {
    it(`${mode}: each patched rel32 lands the instruction on its symbol`, () => {
      const r = run('ok', mode);
      expect(r.patches).toHaveLength(4);
      for (const p of r.patches) {
        // Every hole here is the last 4 bytes of its instruction, so the CPU's target is
        // (address after the instruction) + rel32 = P + 4 + value.
        const sec = patchedSection(r, p.obj, '.text')!;
        const rel = readLe32(sec.bytes, p.reloc.offset);
        expect(rel).toBe(p.value);
        expect(p.P + 4 + rel).toBe(p.S);
        expect(p.value).toBe(p.S + p.reloc.addend - p.P);
      }
    });
  }

  it('the preset, worked by hand: main calls area', () => {
    const r = run('ok', 'static');
    // Static: main.o .text at 0x401000 (0x18 bytes), geom.o .text at the next 16-byte boundary.
    expect(r.symbols.get('main')).toBe(0x401000);
    expect(r.symbols.get('area')).toBe(0x401020);
    const call = r.patches.find((p) => p.reloc.symbol === 'area')!;
    expect(call.P).toBe(0x40100f);
    expect(call.value).toBe(0x401020 - 4 - 0x40100f);
    expect(call.bytes).toEqual([0x0d, 0x00, 0x00, 0x00]);
  });

  it('dynamic: printf goes through its PLT stub, whose GOT slot sits after the 3 reserved ones', () => {
    const r = run('ok', 'dynamic');
    expect(r.plt).toEqual([{ symbol: 'printf', addr: 0x401010, got: 0x404018 }]);
    expect(r.patches.find((p) => p.reloc.symbol === 'printf')).toMatchObject({ S: 0x401010, viaPlt: true });
    expect(r.layout.find((p) => p.obj.name === 'printf.o')).toBeUndefined();
  });

  it('static: printf.o is copied in', () => {
    const r = run('ok', 'static');
    expect(r.included.map((o) => o.name)).toEqual(['main.o', 'geom.o', 'printf.o']);
    expect(r.plt).toEqual([]);
  });

  it('le32', () => {
    expect(le32(-4)).toEqual([0xfc, 0xff, 0xff, 0xff]);
    expect(le32(0x12345678)).toEqual([0x78, 0x56, 0x34, 0x12]);
    expect(() => le32(0x80000000)).toThrow(RangeError);
  });

  it('the unpatched holes are zero, as an assembler leaves them for RELA', () => {
    for (const obj of [MAIN_O, GEOM_O]) for (const r of obj.relocs) expect(obj.sections['.text']!.slice(r.offset, r.offset + 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('loading', () => {
  it('prints what the C source computes', () => {
    expect(MAIN_C.join('\n')).toContain('area(3, 4)');
    expect(GEOM_C.join('\n')).toContain('int scale = 2;');
    expect(printedLine()).toBe(`area=${3 * 4 * 2}`);
  });

  it('ASLR bases are page-aligned, in their usual ranges, and differ between runs', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const b = randomBases(seed);
      for (const v of Object.values(b)) expect(v % PAGE).toBe(0);
      expect(b.libc).toBeGreaterThanOrEqual(0x7f0000000000);
      expect(b.stack).toBeGreaterThan(b.ldso);
      expect(b.heap).toBeGreaterThan(BASE.data);
      seen.add(b.libc);
    }
    expect(seen.size).toBeGreaterThan(45);
  });

  it('lazy binding: the GOT slot points back into the stub until the first call writes it', () => {
    const r = run('ok', 'dynamic');
    const plan = loadPlan(r, 'dynamic', 'lazy', randomBases(1));
    const first = plan.steps.findIndex((s) => s.phase === 'firstCall');
    plan.steps.forEach((s, i) => {
      expect(s.got).toBe(i < first ? r.plt[0].addr + 6 : plan.printf);
      expect(s.gotWritten).toBe(i === first);
    });
  });

  it('-z now: ld.so fills the slot before main runs', () => {
    const plan = loadPlan(run('ok', 'dynamic'), 'dynamic', 'now', randomBases(1));
    const bind = plan.steps.findIndex((s) => s.phase === 'bind');
    const main = plan.steps.findIndex((s) => s.phase === 'main');
    expect(bind).toBeGreaterThan(0);
    expect(bind).toBeLessThan(main);
    expect(plan.steps[main].got).toBe(plan.printf);
    expect(plan.steps.filter((s) => s.gotWritten)).toHaveLength(1);
  });

  it('static: no loader, no GOT, printf is inside the program', () => {
    const r = run('ok', 'static');
    const plan = loadPlan(r, 'static', 'lazy', randomBases(1));
    expect(plan.steps.every((s) => s.got === null)).toBe(true);
    expect(plan.steps.some((s) => s.regions.some((g) => g.label.startsWith('libc') || g.label.startsWith('ld-linux')))).toBe(false);
    expect(plan.printf).toBe(r.symbols.get('printf'));
  });
});
