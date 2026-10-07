import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { instrCaption, trapFrames } from './frames';
import {
  CYCLES, deviceExits, EXITS_PER_PACKET, handle, HOST_GB, INSTRS, nestedWalkRefs, overcommit, STREAM, tally, TECHNIQUES, VIRTIO_BURST, VM_GB, type Handling, type Technique,
} from './model';

/**
 * The expected handling, typed out per instruction and technique from the x86 rules
 * (Intel SDM: cli/out/hlt/mov-cr3 fault outside ring 0 with IOPL 0; popf silently keeps IF;
 * VT-x exits on I/O and hlt when configured, and not on mov cr3 with EPT).
 */
const TABLE: Record<string, Record<Technique, Handling>> = {
  load: { classic: 'direct', bt: 'direct', pv: 'direct', hw: 'direct' },
  add: { classic: 'direct', bt: 'direct', pv: 'direct', hw: 'direct' },
  copy: { classic: 'direct', bt: 'direct', pv: 'direct', hw: 'direct' },
  cli: { classic: 'trap', bt: 'translate', pv: 'hypercall', hw: 'direct' },
  popf: { classic: 'bad', bt: 'translate', pv: 'hypercall', hw: 'direct' },
  cr3: { classic: 'trap', bt: 'translate', pv: 'hypercall', hw: 'direct' },
  out: { classic: 'trap', bt: 'translate', pv: 'hypercall', hw: 'trap' },
  hlt: { classic: 'trap', bt: 'translate', pv: 'hypercall', hw: 'trap' },
};

const ALL = TECHNIQUES.map((t) => t.value);

describe('handle(instruction, technique)', () => {
  it('matches the table for every instruction × technique', () => {
    for (const [id, row] of Object.entries(TABLE)) for (const t of ALL) expect(handle(INSTRS[id], t)).toBe(row[t]);
    expect(Object.keys(TABLE).sort()).toEqual(Object.keys(INSTRS).sort());
  });

  it('classic x86: popf outside ring 0 is the one that goes wrong with no assist', () => {
    const bad = Object.values(INSTRS).filter((i) => handle(i, 'classic') === 'bad').map((i) => i.id);
    expect(bad).toEqual(['popf']);
    for (const t of ['bt', 'pv', 'hw'] as Technique[]) expect(Object.values(INSTRS).some((i) => handle(i, t) === 'bad')).toBe(false);
  });

  it('ordinary instructions always run directly: a VM does not emulate every instruction', () => {
    for (const t of ALL) for (const i of Object.values(INSTRS)) if (i.kind === 'ordinary') expect(handle(i, t)).toBe('direct');
  });
});

describe('counters', () => {
  it('equal the classifier counts over the preset stream', () => {
    for (const t of ALL) {
      const handled = STREAM.map((i) => TABLE[i.id][t]);
      const got = tally(STREAM, t);
      expect(got.direct).toBe(handled.filter((h) => h === 'direct').length);
      expect(got.bad).toBe(handled.filter((h) => h === 'bad').length);
      expect(got.caught).toBe(handled.filter((h) => h !== 'direct' && h !== 'bad').length);
      expect(got.cycles).toBe(handled.reduce((s, h) => s + CYCLES[h], 0));
    }
  });

  it('hardware assist leaves the fewest instructions for the hypervisor', () => {
    const caught = ALL.map((t) => tally(STREAM, t).caught);
    expect(Math.min(...caught)).toBe(tally(STREAM, 'hw').caught);
  });
});

describe('frames and captions, every technique', () => {
  for (const t of ALL) {
    it(t, () => {
      const frames = trapFrames(t);
      expect(frames).toHaveLength(STREAM.length + 2);
      STREAM.forEach((instr, k) => {
        expect(frames[k + 1].i).toBe(k);
        const text = captionText(frames[k + 1].say);
        const h = handle(instr, t);
        expect(text.includes('VM exit') || text.includes('a trap')).toBe(h === 'trap');
        expect(text.includes('silently wrong')).toBe(h === 'bad');
        expect(text.includes('hypercall')).toBe(h === 'hypercall');
        expect(text.includes('rewrote')).toBe(h === 'translate');
      });
      const last = captionText(frames.at(-1)!.say);
      const tl = tally(STREAM, t);
      expect(last).toContain(`${tl.direct} of ${STREAM.length} ran directly`);
      expect(last).toContain(`${tl.cycles.toLocaleString('en-US')} cycles`);
      expect(last.includes('silently wrong')).toBe(tl.bad > 0);
      expect(frames.at(-1)!.i).toBe(-1);
    });
  }
  it('the hardware-assist trap caption names the right work for each exit', () => {
    expect(captionText(instrCaption(INSTRS.out, 'hw'))).toContain('serial port');
    expect(captionText(instrCaption(INSTRS.hlt, 'hw'))).not.toContain('serial port');
  });
});

describe('memory, I/O and overcommit', () => {
  it('nested paging: (n+1)(m+1) − 1 reads, 24 for two 4-level tables, against a brute-force count', () => {
    // Brute force: each of the guest's n table reads and the final data access needs a host walk of m reads,
    // plus the n guest table reads themselves.
    const brute = (n: number, m: number) => {
      let reads = 0;
      for (let step = 0; step <= n; step++) reads += m;
      return reads + n;
    };
    expect(nestedWalkRefs(4, 4)).toBe(24);
    for (let n = 1; n <= 5; n++) for (let m = 1; m <= 5; m++) expect(nestedWalkRefs(n, m)).toBe(brute(n, m));
  });

  it('virtio needs far fewer exits than an emulated NIC', () => {
    for (let p = 1; p <= 64; p++) {
      expect(deviceExits('emulated', p)).toBe(p * EXITS_PER_PACKET);
      expect(deviceExits('virtio', p)).toBe(Math.ceil(p / VIRTIO_BURST));
      expect(deviceExits('virtio', p)).toBeLessThan(deviceExits('emulated', p));
    }
  });

  it('the overcommit ratio comes from the slider: 4 VMs × 8 GB on 16 GB is 2×', () => {
    expect(overcommit(4, 3)).toEqual({ committed: 32, ratio: 2, used: 12, short: 0 });
    for (let n = 1; n <= 6; n++) for (let u = 1; u <= VM_GB; u++) {
      const o = overcommit(n, u);
      expect(o.ratio).toBe((n * VM_GB) / HOST_GB);
      expect(o.short).toBe(Math.max(0, n * u - HOST_GB));
    }
  });
});

describe('two-stage translation example', async () => {
  const { translate, GUEST_PT, EPT, EXAMPLE_GVA } = await import('./model');
  it('guest virtual → guest physical → host physical keeps the page offset (hand-worked)', () => {
    const gpa = translate(EXAMPLE_GVA, GUEST_PT)!;
    expect(gpa).toBe(0x42234);
    expect(translate(gpa, EPT)).toBe(0x9c8e2234);
    expect(translate(0x1000, GUEST_PT)).toBeNull();
  });
});

describe('I/O and overcommit captions, every slider value', async () => {
  const { ioCaption, overcommitCaption } = await import('./ioText');
  it('quote the exit counts the bars draw', () => {
    for (const d of ['emulated', 'virtio'] as const) {
      for (let p = 1; p <= 64; p++) {
        const text = captionText(ioCaption(d, p));
        expect(text).toContain(`${deviceExits('virtio', p)} exit`);
        expect(text).toContain(`${deviceExits('emulated', p)}`);
      }
    }
  });
  it('mention ballooning exactly when the guests touch more than the host has', () => {
    for (let n = 1; n <= 6; n++) {
      for (let u = 1; u <= VM_GB; u++) {
        const o = overcommit(n, u);
        const text = captionText(overcommitCaption(n, u));
        expect(text.includes('balloon')).toBe(o.short > 0);
        expect(text.includes('no overcommit')).toBe(o.ratio <= 1);
        if (o.short > 0) expect(text).toContain(`${o.short} GB more`);
      }
    }
  });
});
