import { describe, expect, it } from 'vitest';
import { blockAt, blockText, NULL_CRASH, runUaf, RUST_ERROR, UAF_PROGRAMS, type UafState } from './uaf';

/** Every (block address, byte index) whose value differs between two states. */
function diff(a: UafState, b: UafState): { addr: number; i: number }[] {
  const out: { addr: number; i: number }[] = [];
  for (const blk of b.blocks) {
    const old = blockAt(a, blk.addr);
    blk.bytes.forEach((x, i) => {
      if (!old || old.bytes[i] !== x) out.push({ addr: blk.addr, i });
    });
  }
  return out;
}

const staleIndex = (defence: 'none' | 'null' | 'gc') => UAF_PROGRAMS[defence].steps.findIndex((s) => s.line === UAF_PROGRAMS[defence].staleLine) + 1;

describe('use after free, no defence', () => {
  const steps = runUaf('none');
  const k = staleIndex('none');
  const before = steps[k - 1].state;
  const after = steps[k].state;

  it("q's block is the same memory p was given", () => {
    const pAddr = steps[1].state.vars.p;
    expect(typeof pAddr).toBe('number');
    expect(before.vars.q).toBe(pAddr);
    expect(steps.find((s) => s.state.vars.q !== undefined)!.reused).toBe(true);
  });

  it("the stale write changes q's bytes and nothing else", () => {
    const changed = diff(before, after);
    expect(changed.length).toBeGreaterThan(0);
    for (const c of changed) expect(c.addr).toBe(before.vars.q);
    expect(after.vars).toEqual(before.vars);
    expect(after.blocks.length).toBe(before.blocks.length);
    expect(blockText(blockAt(before, before.vars.q)!)).toBe('Grace');
    expect(blockText(blockAt(after, after.vars.q)!)).toBe('Lin');
  });

  it('prints the corrupted data', () => {
    expect(steps.at(-1)!.state.out).toEqual(['Lin']);
    expect(steps.at(-1)!.state.crash).toBeNull();
  });
});

describe('p = NULL after free', () => {
  const steps = runUaf('null');
  it('the stale write crashes cleanly and changes no byte', () => {
    const last = steps.at(-1)!;
    expect(last.line).toBe(UAF_PROGRAMS.null.staleLine);
    expect(last.state.crash).toBe(NULL_CRASH);
    expect(diff(steps.at(-2)!.state, last.state)).toEqual([]);
    expect(blockText(blockAt(last.state, last.state.vars.q)!)).toBe('Grace');
    expect(last.state.out).toEqual([]);
  });
});

describe('garbage collector', () => {
  const steps = runUaf('gc');
  const k = staleIndex('gc');
  it("q gets its own memory and the write through p changes only p's object", () => {
    const before = steps[k - 1].state;
    const after = steps[k].state;
    expect(before.vars.q).not.toBe(before.vars.p);
    const changed = diff(before, after);
    expect(changed.length).toBeGreaterThan(0);
    for (const c of changed) expect(c.addr).toBe(before.vars.p);
    expect(steps.at(-1)!.state.out).toEqual(['Grace']);
  });
});

describe('Rust ownership', () => {
  it('never runs', () => {
    expect(runUaf('rust')).toHaveLength(1);
  });
  it("the error's quoted source lines match the listing", () => {
    const lines = UAF_PROGRAMS.rust.lines;
    for (const l of RUST_ERROR) {
      const m = /^(\d+) \| (.*)$/.exec(l);
      if (m) expect(m[2]).toBe(lines[Number(m[1]) - 1]);
    }
    expect(RUST_ERROR[1]).toContain(`main.rs:${UAF_PROGRAMS.rust.staleLine + 1}:5`);
    expect(lines[UAF_PROGRAMS.rust.staleLine].indexOf('p')).toBe(4);
  });
});

describe('C listings', () => {
  it("each step's line is the line that does it", () => {
    for (const d of ['none', 'null'] as const) {
      const p = UAF_PROGRAMS[d];
      for (const s of p.steps) {
        const line = p.lines[s.line];
        const op = s.ops[0];
        const want = { malloc: 'malloc(16)', write: `strcpy(${op.v}`, free: 'free(p)', null: 'p = NULL', print: 'printf' }[op.kind];
        expect(line).toContain(want);
      }
    }
  });
});
