import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { RISK, stackFrames, uafFrames } from './frames';
import { ASAN_STACK, cListing, RUST_LISTING, RUST_PANIC } from './listings';
import { PRESETS, stackRun, type DefenceId, type Defences } from './model';
import { byteTone, framePicture } from './picture';

const enc = (t: string) => new TextEncoder().encode(t);
const IDS: DefenceId[] = ['memorySafe', 'boundsCheck', 'canary', 'nx', 'aslr'];
const COMBOS: Defences[] = Array.from({ length: 32 }, (_, m) => Object.fromEntries(IDS.map((id, i) => [id, Boolean(m & (1 << i))])) as Defences);
const INPUTS = [...PRESETS.map((p) => p.text), 'Margaret', '', 'Ada Lovelace Byron'];

const FINAL: Record<string, RegExp> = {
  fits: /^Fits/,
  truncated: /^Stopped by the bounds check/,
  panic: /^Stopped by Rust/,
  aborted: /^Stopped by the canary/,
  quiet: /silent bug|nothing changed/,
  corrupted: /The run stops here/,
};

describe('stack scene: every input and every defence combination', () => {
  for (const text of INPUTS) {
    it(JSON.stringify(text), () => {
      for (const d of COMBOS) {
        const run = stackRun(enc(text), d, 1);
        const frames = stackFrames(run);
        const last = frames.at(-1)!;
        const say = captionText(last.say);
        expect(last.done).toBe(true);
        expect(say).toMatch(FINAL[run.kind]);
        expect(say.includes(RISK)).toBe(run.kind === 'corrupted');
        expect(say.includes('NX is on')).toBe(run.kind === 'corrupted' && d.nx);
        expect(say.includes('ASLR is on')).toBe(run.kind === 'corrupted' && d.aslr);
        if (run.kind === 'corrupted') expect(say.includes('return address')).toBe(run.changed.includes('ret'));
        if (run.kind === 'fits' && !d.memorySafe) expect(say.includes('canary check passes')).toBe(d.canary);
        if (run.kind === 'truncated') expect(say).toContain(`returns ${text.length}`);

        // Copy steps: one per 8-byte row, each naming its range and where it landed.
        const copies = frames.filter((f) => f.fresh);
        expect(copies).toHaveLength(Math.ceil(run.written / 8));
        if (run.written) expect(copies.at(-1)!.upTo).toBe(run.written);
        for (const f of copies) {
          const [from, to] = f.fresh!;
          const t = captionText(f.say);
          expect(t).toContain(from === to - 1 ? `Byte ${from}` : `Bytes ${from}–${to - 1}`);
          expect(t.includes('run past')).toBe(from >= 8);
        }
        // The canary step appears exactly for a C build with the canary on.
        expect(frames.some((f) => captionText(f.say).startsWith('The epilogue compares the canary'))).toBe(d.canary && !d.memorySafe);
      }
    });
  }
});

describe('stack picture', () => {
  it('the canary is a guard region, red exactly when its bytes changed, and only with the canary on', () => {
    for (const d of COMBOS) {
      for (const text of INPUTS) {
        const run = stackRun(enc(text), d, 1);
        const pic = framePicture(run, run.written, null);
        const guard = pic.regions.filter((r) => r.variant === 'guard');
        expect(guard.length).toBe(d.canary ? 1 : 0);
        if (d.canary) expect(guard[0].tone).toBe(run.changed.includes('canary') ? 'bad' : 'violet');
      }
    }
  });

  it('bytes inside the buffer are info, past it bad, unwritten untoned', () => {
    expect(byteTone(13, 3)).toBe('info');
    expect(byteTone(13, 9)).toBe('bad');
    expect(byteTone(13, 13)).toBeUndefined();
  });
});

describe('listings', () => {
  it('the copy line matches the defence', () => {
    expect(cListing(false, false).lines[2]).toContain('strcpy(name, input)');
    expect(cListing(true, false).lines[2]).toContain('snprintf(name, sizeof name');
    expect(cListing(false, true).notes[3]).toContain('canary');
  });
  it("the Rust panic points at name[i] = b (line 4, column 9)", () => {
    const line = RUST_LISTING.lines[3];
    expect(line.indexOf('name[i] = b')).toBe(8);
    expect(RUST_PANIC[0]).toContain('main.rs:4:9');
  });
  it('the illustrative ASan report matches Grace Hopper: 13 bytes, overflowing at offset 8 of name', () => {
    expect(ASAN_STACK.join('\n')).toContain(`WRITE of size ${'Grace Hopper'.length + 1}`);
    expect(ASAN_STACK.join('\n')).toContain('[32, 40)');
    expect(ASAN_STACK.join('\n')).toContain('offset 40');
  });
});

describe('use-after-free captions', () => {
  it('each defence ends with its own verdict, and the print step quotes what was printed', () => {
    const want = { none: /^Use after free/, null: /^Stopped:/, rust: /^Stopped at compile time/, gc: /^No use after free possible/ } as const;
    for (const d of ['none', 'null', 'rust', 'gc'] as const) {
      const { steps, frames } = uafFrames(d);
      expect(captionText(frames.at(-1)!.say)).toMatch(want[d]);
      expect(frames).toHaveLength(steps.length + 1);
      const out = steps.at(-1)!.state.out;
      if (out.length) expect(captionText(frames[steps.length - 1].say)).toContain(`It prints "${out[0]}"`);
    }
  });
  it('the stale write caption counts the changed bytes', () => {
    const { frames } = uafFrames('none');
    expect(frames.map((f) => captionText(f.say)).some((t) => t.includes("4 bytes of q's data change"))).toBe(true);
  });
});
