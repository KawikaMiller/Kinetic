import { describe, expect, it } from 'vitest';
import { PRESETS } from './frames';
import { capturedEnvs, emptyWorld, GLOBAL, lookup, newEnv, prim, reachable, setVar } from './model';

/** Run a snippet as real JavaScript, let its timers fire, and collect console.log output. */
async function runReal(code: string[]): Promise<string[]> {
  const out: string[] = [];
  const fakeConsole = { log: (...args: unknown[]) => out.push(args.map(String).join(' ')) };
  new Function('console', code.join('\n'))(fakeConsole);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return out;
}

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('every preset prints what real JavaScript prints', () => {
  for (const p of PRESETS) {
    it(p.name, async () => {
      expect(p.build().at(-1)!.world.out).toEqual(await runReal(p.code));
    });
  }
});

describe('lookup', () => {
  it('walks outward and stops at the nearest binding', () => {
    let w = setVar(emptyWorld(), GLOBAL, 'x', prim('outer'));
    w = newEnv(w, { id: 'fn', label: 'fn', parent: GLOBAL, place: { col: 1, row: 0 } });
    expect(lookup(w, 'fn', 'x')).toMatchObject({ path: ['fn', GLOBAL], found: GLOBAL });
    w = setVar(w, 'fn', 'x', prim('inner'));
    expect(lookup(w, 'fn', 'x')).toMatchObject({ path: ['fn'], found: 'fn', value: prim('inner') });
    expect(lookup(w, 'fn', 'nope').found).toBeNull();
  });
});

describe('closures keep environments alive', () => {
  it('two counters have two separate environments that outlive their calls', () => {
    const frames = preset('counter').build();
    const last = frames.at(-1)!.world;
    // ƒ makeCounter itself was created in (and captures) global.
    expect([...capturedEnvs(last)].sort()).toEqual([GLOBAL, 'mc1', 'mc2']);
    expect(last.envs.find((e) => e.id === 'mc1')!.vars).toEqual([{ name: 'count', value: prim(3) }]);
    expect(last.envs.find((e) => e.id === 'mc2')!.vars).toEqual([{ name: 'count', value: prim(1) }]);
    // No per-call environment survives its call.
    expect(last.envs.map((e) => e.id).sort()).toEqual([GLOBAL, 'mc1', 'mc2']);
  });

  it('with var every callback captures the same environment; with let each gets its own', () => {
    const scheduled = (id: string) => {
      const w = preset(id).build().find((f) => f.world.timers.length === 3)!.world;
      return new Set(w.fns.filter((f) => w.timers.includes(f.id)).map((f) => f.env));
    };
    expect(scheduled('loop-var')).toEqual(new Set([GLOBAL]));
    expect(scheduled('loop-let')).toEqual(new Set(['it0', 'it1', 'it2']));
  });

  it('a released environment is shown once, then swept before the next step', () => {
    for (const p of PRESETS) {
      const frames = p.build();
      frames.slice(0, -1).forEach((f, i) => {
        const live = reachable(f.world);
        const released = f.world.envs.filter((e) => !live.envs.has(e.id)).map((e) => e.id);
        const next = new Set(frames[i + 1].world.envs.map((e) => e.id));
        released.forEach((id) => expect(next.has(id), `${p.id}: ${id} should be swept after frame ${i}`).toBe(false));
      });
    }
  });

  it('a stale closure reads the old snapshot but the live count', () => {
    expect(preset('stale').build().at(-1)!.world.out).toEqual(['0 5']);
  });
});

it('every frame points at a real line of its preset', () => {
  for (const p of PRESETS) for (const f of p.build()) if (f.line !== null) expect(f.line).toBeLessThan(p.code.length);
});
