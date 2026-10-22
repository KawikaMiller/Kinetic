import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { kernelCaption, ringsCaption, seccompCaption, viewsCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { ALLOCATE_RANGE, FORKS_RANGE, MEMORY_LIMIT_RANGE, NAMESPACE_ORDER, PIDS_LIMIT_RANGE, memoryOutcome, pidsOutcome, type NamespaceId } from './isolation';
import { initialKernel, initialRings, initialSeccomp, initialViews } from './opening';
import { ACTION_ORDER, RING_ORDER, allRingSets, decide, ringSet } from './rings';
import { NEEDED, SYSCALL_NAMES, checkMinimal, replay } from './seccomp';
import { SURFACE_MODES } from './surface';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CLEAN = /NaN|undefined|\[object|null/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('sandboxing-isolation');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('sandboxing-isolation')).toEqual([]);
  });

  it('each scene opens on its own fresh state, and editing one copy does not change the next', () => {
    const a = initialRings();
    a.rings.push('microvm');
    expect(initialRings().rings).toEqual(['process', 'namespaces', 'cgroup']);
    const s = initialSeccomp();
    s.allowed.push('socket');
    expect(initialSeccomp().allowed).not.toContain('socket');
    const v = initialViews();
    v.namespaces.push('user');
    expect(initialViews().namespaces).not.toContain('user');
    expect(initialKernel()).toEqual({ mode: 'process' });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the file read is blocked by namespaces, the kernel bug is allowed, and microVM makes it limited by microVM', () => {
    const start = ringSet(...initialRings().rings);
    expect(initialRings().action).toBe('file');
    expect(decide('file', start)).toEqual({ kind: 'blocked', by: 'namespaces' });
    expect(decide('kernel-bug', start)).toEqual({ kind: 'allowed' });
    expect(decide('kernel-bug', ringSet(...start, 'microvm'))).toEqual({ kind: 'limited', by: 'microvm' });
    expect([FACTS.fileVerdict, FACTS.kernelBugVerdict, FACTS.kernelBugWithMicrovm]).toEqual(['blocked by namespaces', 'allowed', 'limited by microVM']);
    expect(lesson.tryThis[0]).toContain('blocked by namespaces');
    expect(lesson.tryThis[0]).toContain('limited by microVM');
  });

  it('try-this 2: 9 of 20 calls allowed kills the resizer at call 3 (mmap); mmap and munmap make the list minimal; everything grants 7 distinct capabilities from 8 risky calls', () => {
    const start = initialSeccomp();
    expect(start.allowed).toHaveLength(9);
    const r = replay(new Set(start.allowed), start.otherwise);
    expect([r.firstDenied, r.ending]).toEqual([2, 'killed']);
    expect(FACTS.deniedName).toBe('mmap');
    const fixed = new Set([...start.allowed, 'mmap', 'munmap']);
    expect(checkMinimal(fixed).minimal).toBe(true);
    expect(replay(fixed, 'kill').ending).toBe('completed');
    const all = checkMinimal(new Set(SYSCALL_NAMES));
    expect([all.runs, all.minimal, all.extra.length]).toEqual([true, false, 9]);
    expect(FACTS.everythingExtras).toBe(7); // socket and connect share one grant
    expect(expectCaption(seccompCaption(start.allowed, start.otherwise))).toContain('Call 3 of 14');
    expect(lesson.tryThis[1]).toContain('killed at call 3 of 14, mmap');
  });

  it('try-this 3: 5 of 7 namespaces and root is host root; user on maps uid 0 to 100,000; 192 against 128 MiB kills at byte 134,217,729; 30 forks against 16 start 15', () => {
    const v = initialViews();
    expect(v.namespaces).toHaveLength(5);
    expect(v.namespaces).not.toContain('user');
    expect(memoryOutcome(v.memoryLimitMiB, v.allocateMiB).killedAtByte).toBe(134_217_729);
    expect(pidsOutcome(v.pidsLimit, v.forks)).toMatchObject({ started: 15, firstFailure: 16 });
    expect([FACTS.killedAtByte, FACTS.started, FACTS.userMap, FACTS.userOutside]).toEqual(['134,217,729', 15, '0 100000 65536', '100,000']);
    expect(lesson.tryThis[2]).toContain('byte 134,217,729');
  });

  it('try-this 4: 300, 20 and 12 on the three surfaces', () => {
    expect(SURFACE_MODES.map((m) => m.value)).toEqual(['process', 'seccomp', 'microvm']);
    expect([FACTS.host, FACTS.filter, FACTS.hypervisor, FACTS.kernelMode]).toEqual([300, 20, 12, 'process']);
    expect(expectCaption(kernelCaption('microvm'))).toContain('12 devices and interfaces');
    expect(lesson.tryThis[3]).toContain('12 interfaces and a guest kernel');
  });
});

describe('captions across the control cross product', () => {
  it('rings: every action with every one of the 64 ring sets is clean and says what the table says', () => {
    for (const rings of allRingSets()) {
      const on = RING_ORDER.filter((r) => rings.has(r));
      for (const action of ACTION_ORDER) {
        const text = expectCaption(ringsCaption(action, on));
        expect(text).not.toMatch(CLEAN);
        const d = decide(action, rings);
        if (d.kind === 'allowed') expect(text).toContain('allowed');
        else expect(text).toContain(`${d.kind} by `);
      }
    }
  });

  it('seccomp: 300 seeded random lists and both default actions give clean captions that agree with the replay', () => {
    const rnd = mulberry32(28);
    for (let k = 0; k < 300; k++) {
      const list = SYSCALL_NAMES.filter(() => rnd() < 0.5 + (k % 5) * 0.1);
      for (const otherwise of ['kill', 'errno'] as const) {
        const text = expectCaption(seccompCaption(list, otherwise));
        expect(text).not.toMatch(CLEAN);
        const r = replay(new Set(list), otherwise);
        if (r.firstDenied === null) expect(text).toContain('The whole script of 14 calls ran.');
        else expect(text).toContain(`Call ${r.firstDenied + 1} of 14`);
        if (checkMinimal(new Set(list)).minimal) expect(text).toContain('smallest');
      }
    }
    expect(NEEDED).toHaveLength(11);
  });

  it('views: the slider extremes and random points are clean and say killed or fits from the same function', () => {
    const rnd = mulberry32(5);
    const pick = (lo: number, hi: number, step: number) => lo + randInt(0, Math.floor((hi - lo) / step), rnd) * step;
    for (let k = 0; k < 200; k++) {
      const limit = k === 0 ? MEMORY_LIMIT_RANGE.min : k === 1 ? MEMORY_LIMIT_RANGE.max : pick(MEMORY_LIMIT_RANGE.min, MEMORY_LIMIT_RANGE.max, MEMORY_LIMIT_RANGE.step);
      const alloc = k === 0 ? ALLOCATE_RANGE.max : k === 1 ? ALLOCATE_RANGE.min : pick(ALLOCATE_RANGE.min, ALLOCATE_RANGE.max, ALLOCATE_RANGE.step);
      const pids = k < 2 ? PIDS_LIMIT_RANGE.min + k * 60 : pick(PIDS_LIMIT_RANGE.min, PIDS_LIMIT_RANGE.max, 1);
      const forks = k === 0 ? FORKS_RANGE.max : k === 1 ? 0 : pick(FORKS_RANGE.min, FORKS_RANGE.max, 1);
      const spaces = NAMESPACE_ORDER.filter(() => rnd() < 0.5) as NamespaceId[];
      const text = expectCaption(viewsCaption(spaces, limit, alloc, pids, forks, 100));
      expect(text).not.toMatch(CLEAN);
      expect(text.includes('kills the plugin')).toBe(memoryOutcome(limit, alloc).killed);
      expect(text.includes('fail')).toBe(pidsOutcome(pids, forks).failed > 0);
      expect(text.includes('is uid 0 on the host too')).toBe(!spaces.includes('user'));
    }
  });
});

describe('the lesson stays inside the simulation', () => {
  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources)).toEqual([]);
  });

  it('chips every scene as simulated', () => {
    for (const file of ['./RingsScene.tsx', './SeccompScene.tsx', './ViewsScene.tsx', './KernelScene.tsx']) expect(sources[file]).toContain('<Provenance kind="simulated">');
    expect(sources['./SeccompScene.tsx']).toContain('<Provenance kind="from-memory">');
    expect(sources['./KernelScene.tsx']).toContain('<Provenance kind="illustrative">');
  });

  it('contains no exploit, escape technique, shell command or real address', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/\bescape technique|\bexploit(?:ed|s|ing)?\b(?! )|\/bin\/(?:sh|bash)|nsenter|unshare\b|docker run|chroot\(/i);
      expect(text, file).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b(?<!10\.0\.0\.5)/);
    }
  });
});

describe('the "no single boundary" claim follows the model', () => {
  it('the microVM alone allows none of the 8 actions: 3 are blocked and 5 only limited (hand-counted from the rule table in the review), and no ring set blocks the kernel bug', () => {
    expect([FACTS.microvmBlocked, FACTS.microvmLimited, FACTS.microvmAllowed]).toEqual([3, 5, 0]);
    expect(FACTS.bestSingleBlocked).toBe(4);
    expect(FACTS.allSixKernelBugVerdict).toBe('limited');
    expect(allRingSets().some((s) => decide('kernel-bug', s).kind === 'blocked')).toBe(false);
    expect(lesson.keyIdeas[0]).toContain('limits 5 of them');
  });

  it('a limited action names every limiting ring that is on, so the microVM is credited next to the seccomp filter', () => {
    const text = expectCaption(ringsCaption('kernel-bug', ['seccomp', 'microvm']));
    expect(text).toContain('seccomp filter: fewer system calls');
    expect(text).toContain('microVM: it reaches the guest kernel');
  });
});
