import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import { scanFrames } from './frames';
import lesson from './index';
import { linksFor } from './links';
import {
  DEFAULT_PATTERNS, DEFAULT_TEXT, ROOT, allLinks, buildMachine, clickTarget, naiveScan, nextToAssign, runMachine,
} from './model';

const machine = buildMachine(DEFAULT_PATTERNS);

describe('scenes', () => {
  it('every scene component carries its own key and no component is shared between scenes', () => {
    const els = sceneElements('aho-corasick');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('aho-corasick')).toEqual([]);
  });

  it('opens on the stream scene with the default patterns and text', () => {
    expect(DEFAULT_PATTERNS).toEqual(['he', 'she', 'his', 'hers']);
    expect(DEFAULT_TEXT).toBe('ushers');
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: Play to the end shows she at 1 to 3, he at 2 to 3 and hers at 2 to 5, with one failure follow', () => {
    const run = scanFrames(machine, DEFAULT_TEXT);
    const last = run.frames[run.frames.length - 1];
    expect(last.found.map((m) => `${m.pattern}@${m.start}`)).toEqual(['she@1', 'he@2', 'hers@2']);
    expect([last.reads, last.follows]).toEqual([6, 1]);
    expect(captionText(last.say)).toContain('6 letters read, 1 failure follow, 3 matches');
    expect(lesson.tryThis[0]).toContain('she at 1 to 3, he at 2 to 3, hers at 2 to 5');
  });

  it('try-this 2: stepping reaches the output link from state 5 (she) to state 2 (he), and the link is drawn on that frame', () => {
    const run = scanFrames(machine, DEFAULT_TEXT);
    const frame = run.frames.find((f) => f.step?.kind === 'out');
    expect(frame?.say).toBe('Output link from state 5 (she) to state 2 (he): he found at 2 to 3, ending at the same letter.');
    expect(frame?.state).toBe(2);
    const links = linksFor(machine, frame!);
    expect(links.find((l) => l.from === 5 && l.to === 2)?.tone).toBe('ok');
  });

  it('try-this 3: the root is accepted for states 1, 3, 2 and 6, then she for sh is refused naming h (state 1)', () => {
    let assigned = {};
    for (const [state, expected] of [[1, 1], [3, 3], [2, 2], [6, 6]] as const) {
      expect(nextToAssign(machine, assigned)).toBe(expected);
      const result = clickTarget(machine, assigned, ROOT);
      expect(result?.ok, `state ${state}`).toBe(true);
      assigned = result!.assigned;
    }
    expect(nextToAssign(machine, assigned)).toBe(4);
    const refused = clickTarget(machine, assigned, 5);
    expect(refused?.ok).toBe(false);
    expect(refused?.message).toContain("'h' (state 1), not 'she'");
    expect(refused?.assigned).toBe(assigned);
  });

  it('try-this 4: hishers gives his at 0, she at 2, he at 3 and hers at 3', () => {
    expect(FACTS.hishersMatches.split(', ').sort()).toEqual(['he at 3 to 4', 'hers at 3 to 6', 'his at 0 to 2', 'she at 2 to 4']);
    expect(lesson.tryThis[3]).toContain(FACTS.hishersMatches);
  });

  it('try-this 5: hishers makes 2 failure follows for 7 letters, and the by-hand scene walks to the end', () => {
    expect([FACTS.hishersFollows, FACTS.hishersReads]).toEqual([2, 7]);
    let assigned = {};
    while (nextToAssign(machine, assigned) !== undefined) {
      const next = nextToAssign(machine, assigned)!;
      assigned = clickTarget(machine, assigned, machine.fail[next])!.assigned;
    }
    expect(assigned).toEqual(allLinks(machine));
  });
});

describe('captions come from the model', () => {
  it('every frame of every preset reads cleanly, and the closing frame names the same counts the scan reports', () => {
    for (const patterns of [DEFAULT_PATTERNS, ['a', 'ab', 'bab', 'bc', 'bca', 'c']]) {
      const m = buildMachine(patterns);
      for (const text of ['ushers', 'hishers', 'abccab', 'a', 'zzzz']) {
        for (const outputsOn of [true, false]) {
          const run = scanFrames(m, text, outputsOn);
          for (const f of run.frames) expect(captionText(f.say), `${patterns} ${text}`).not.toMatch(/NaN|undefined|null|Infinity/);
          const scan = runMachine(m, text, outputsOn);
          expect([run.reads, run.follows, run.matches.length]).toEqual([scan.reads, scan.follows, scan.matches.length]);
          const last = run.frames[run.frames.length - 1];
          expect([last.reads, last.follows, last.found.length]).toEqual([scan.reads, scan.follows, scan.matches.length]);
        }
      }
    }
  });

  it('the broken-mode closing frame names the missing match and the rule', () => {
    const run = scanFrames(machine, DEFAULT_TEXT, false);
    const say = run.frames[run.frames.length - 1].say;
    expect(say).toContain('missing he at 2 to 3');
    expect(say).toContain("a pattern that ends here as a suffix of the state's string is not reported without output links");
    expect(run.missed).toHaveLength(1);
  });

  it('the work scene numbers: the naive scan compares 23 characters, the one pass reads 6 and follows 1', () => {
    expect(naiveScan(DEFAULT_PATTERNS, DEFAULT_TEXT).compared).toBe(23);
    expect([FACTS.ushersReads, FACTS.ushersFollows, FACTS.ushersNaive]).toEqual([6, 1, 23]);
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations name the model numbers', () => {
    expect(lesson.keyIdeas[0]).toContain("'sh' links to 'h' and 'she' links to 'he' (state 2)");
    expect(lesson.keyIdeas[1]).toContain('compares 23 characters');
    expect(lesson.quiz[4].why).toContain('2 follows for 7 letters');
  });
});
