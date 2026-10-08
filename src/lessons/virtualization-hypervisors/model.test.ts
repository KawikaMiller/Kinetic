import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { instrCaption, trapFrames } from './frames';
import {
  CYCLES, deviceExits, EXITS_PER_PACKET, handle, HOST_GB, INSTRS, nestedWalkRefs, overcommit, STREAM, tally, TECHNIQUES, VIRTIO_BURST, VM_GB, type Handling, type Technique,
} from './model';

/**
 * An independent reference, from the rules rather than from handle()'s code:
 * - x86 privilege checks (Intel SDM): cli and out need CPL <= IOPL; mov cr3 and hlt need CPL 0;
 *   popf outside CPL <= IOPL silently leaves IF unchanged (no fault).
 * - classic: the guest kernel runs at CPL 1 with IOPL 0. A fault is a trap; a silent
 *   difference from what CPL 0 would do is bad.
 * - bt: anything whose behaviour at CPL 1 differs from CPL 0 gets rewritten.
 * - pv (Xen ABI): cli/sti/popf write the vcpu_info event mask; cr3 is mmuext_op, console
 *   output is console_io, hlt is sched_op (hypercalls).
 * - hw: the guest runs at CPL 0 in non-root mode; exits are what the VMCS controls ask for:
 *   HLT exiting and I/O exiting on, CR3-load exiting off (EPT).
 */
type Outcome = 'ok' | 'fault' | 'silent';
const IOPL = 0;
function atCpl(id: string, cpl: number): Outcome {
  switch (id) {
    case 'cli':
    case 'out':
      return cpl <= IOPL ? 'ok' : 'fault';
    case 'cr3':
    case 'hlt':
      return cpl === 0 ? 'ok' : 'fault';
    case 'popf':
      return cpl <= IOPL ? 'ok' : 'silent';
    default:
      return 'ok';
  }
}
const XEN_SHARED = new Set(['cli', 'popf']);
const VMCS_EXITS = new Set(['hlt', 'out']);
function reference(id: string, t: Technique): Handling {
  const deprivileged = atCpl(id, 1);
  switch (t) {
    case 'classic':
      return deprivileged === 'fault' ? 'trap' : deprivileged === 'silent' ? 'bad' : 'direct';
    case 'bt':
      return deprivileged === 'ok' ? 'direct' : 'translate';
    case 'pv':
      return deprivileged === 'ok' ? 'direct' : XEN_SHARED.has(id) ? 'shared' : 'hypercall';
    case 'hw':
      return VMCS_EXITS.has(id) ? 'trap' : 'direct';
  }
}
const TABLE: Record<string, Record<Technique, Handling>> = Object.fromEntries(
  Object.keys(INSTRS).map((id) => [id, Object.fromEntries((['classic', 'bt', 'pv', 'hw'] as Technique[]).map((t) => [t, reference(id, t)]))]),
) as Record<string, Record<Technique, Handling>>;

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
      expect(got.shared).toBe(handled.filter((h) => h === 'shared').length);
      expect(got.caught).toBe(handled.filter((h) => h !== 'direct' && h !== 'bad' && h !== 'shared').length);
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
        expect(text.includes('with a hypercall')).toBe(h === 'hypercall');
        expect(text.includes('shares with the hypervisor')).toBe(h === 'shared');
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

describe('PV verdict matches its numbers (review V1)', () => {
  it('PV is never called "fast"; spot-check the Xen rows', () => {
    expect(handle(INSTRS.cli, 'pv')).toBe('shared');
    expect(handle(INSTRS.popf, 'pv')).toBe('shared');
    expect(handle(INSTRS.cr3, 'pv')).toBe('hypercall');
    const last = captionText(trapFrames('pv').at(-1)!.say);
    expect(last.toLowerCase()).not.toContain('fast');
    expect(last).toContain('2 became plain writes to shared memory');
  });
});
