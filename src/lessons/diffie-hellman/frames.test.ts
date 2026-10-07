import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { bruteCaption, eveSees, messagesFor, numberFrames, paintFrames, realCaption, verdict } from './frames';
import { DEFAULTS, bruteForce, exchange, type DhParams } from './model';

describe('numberFrames', () => {
  it('captions the honest exchange with the computed values and ends on the shared secret', () => {
    const x = exchange(DEFAULTS, false);
    const frames = numberFrames(DEFAULTS, x);
    const all = frames.map((f) => text(f.say));
    expect(all).toContain('Alice sends A = gᵃ mod p = 8. Eve sees 8, but getting a back from it is the hard part: the discrete logarithm.');
    expect(all.at(-1)).toContain('Shared secret 2 on both sides');
    expect(frames.at(-1)!.done).toBe(true);
    expect(frames.at(-2)!.step).toBe(messagesFor(DEFAULTS, x).length - 1);
  });

  it('walks every combination of Eve mode and preset to a verdict computed from the secrets', () => {
    const presets: DhParams[] = [DEFAULTS, { p: 31n, g: 5n, a: 7n, b: 11n }, { p: 23n, g: 2n, a: 6n, b: 15n }, { p: 10007n, g: 5n, a: 4321n, b: 8765n }];
    for (const p of presets) {
      for (const mitm of [false, true]) {
        const x = exchange(p, mitm);
        const last = text(numberFrames(p, x).at(-1)!.say);
        if (!mitm) {
          expect(x.sAlice).toBe(x.sBob);
          expect(last).toContain(`Shared secret ${x.sAlice.toLocaleString('en-US')} on both sides`);
        } else if (x.sAlice !== x.sBob) {
          expect(last).toContain('each shares a key with Eve, not with each other');
        } else {
          expect(last).toContain('only by coincidence');
        }
        if (mitm) expect(last).toContain('TLS signs the exchange');
      }
    }
  });

  it('owns up to a coincidence instead of claiming the secrets differ', () => {
    // Find a pair where Eve's two keys happen to match in this tiny group.
    let found: DhParams | null = null;
    for (let a = 1n; a <= 21n && !found; a++) {
      for (let b = 1n; b <= 21n && !found; b++) {
        const x = exchange({ p: 23n, g: 5n, a, b }, true);
        if (x.sAlice === x.sBob) found = { p: 23n, g: 5n, a, b };
      }
    }
    const v = text(verdict(exchange(found!, true)));
    expect(v).toContain('only by coincidence');
    expect(v).not.toContain('Alice ends up with');
  });

  it('shows Eve only the public values sent so far, and her fakes in man-in-the-middle mode', () => {
    const honest = messagesFor(DEFAULTS, exchange(DEFAULTS, false));
    expect(eveSees(honest, 0)).toEqual(['p = 23, g = 5']);
    expect(eveSees(honest, 2)).toEqual(['p = 23, g = 5']);
    expect(eveSees(honest, 6)).toEqual(['p = 23, g = 5', 'A = 5⁶ mod 23 = 8', 'B = 5¹⁵ mod 23 = 19']);
    const mitm = messagesFor(DEFAULTS, exchange(DEFAULTS, true));
    expect(mitm.map((m) => m.id)).toEqual(['pg', 'a', 'b', 'A', 'E1', 'B', 'E2', 'sa', 'sb']);
    expect(mitm.filter((m) => m.from === 'eve').every((m) => m.tone === 'orange')).toBe(true);
    expect(mitm.filter((m) => m.id === 'sa' || m.id === 'sb').every((m) => m.tone === 'bad')).toBe(true);
  });
});

describe('bruteCaption', () => {
  it('reports the real search, and says when the x found isn\'t Alice\'s a', () => {
    const x = exchange(DEFAULTS, false);
    expect(text(bruteCaption(23n, 6n, bruteForce(23n, 5n, x.A, x.B), x.sAlice))).toBe(
      'Eve tried x = 1, 2, 3 … and hit gˣ ≡ A at x = 6 after 6 tries. That\'s Alice\'s a. Then Bˣ mod 23 = 2: the shared secret. Toy numbers fall instantly.',
    );
    const weak = { p: 23n, g: 2n, a: 17n, b: 15n };
    const w = exchange(weak, false);
    const eve = bruteForce(23n, 2n, w.A, w.B);
    expect(eve.found).not.toBe(17n);
    expect(text(bruteCaption(23n, 17n, eve, w.sAlice))).toContain('isn\'t Alice\'s a = 17, but g makes the same A');
  });
});

describe('paint and real captions', () => {
  it('names the chosen paints and ends on the comparison', () => {
    const f = paintFrames('teal', 'lime');
    expect(f.map((x) => x.stage)).toEqual([0, 1, 2, 3, 4]);
    expect(text(f[1].say)).toContain('Alice teal, Bob lime');
    expect(text(f.at(-1)!.say)).toContain('amber, teal and lime in equal parts');
  });

  it('only claims agreement when the bytes match', () => {
    expect(text(realCaption('equal'))).toContain('same 256-bit secret');
    expect(text(realCaption('different'))).toContain('differ');
  });
});
