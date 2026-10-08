import { describe, expect, it } from 'vitest';
import { plural } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { listingCaption, makeParts, storeFrames, uploadEnd, uploadFrames, uploadRequests } from './frames';
import lesson from './index';
import { DEMO_KEYS, listAll, listObjects, listRequest } from './listing';
import { checkParts, clampFailPart, planParts, schedule } from './multipart';
import { FILE_SIZE, MIB, OPS, outcome, stepCount, STORES } from './store';

describe('captions: the three stores', () => {
  it.each(OPS)('%s: every frame reads cleanly, and the closing caption quotes each store\'s own numbers', (op) => {
    const frames = storeFrames(op);
    expect(frames).toHaveLength(stepCount(op) + 1);
    frames.forEach((f, i) => expect(f.step).toBe(i));
    for (const f of frames) expectCaption(f.say);
    const last = expectCaption(frames.at(-1)!.say);
    for (const s of STORES) {
      const o = outcome(op, s);
      expect(last).toContain(`${s[0].toUpperCase()}${s.slice(1)}: `);
      expect(last).toContain(plural(o.requests, o.unit));
    }
  });

  it('the rename captions say "not atomic" exactly while both prefixes exist', () => {
    const frames = storeFrames('rename');
    // Through request 5 something is still under reports/ and something already under archive/.
    const both = [false, true, true, true, true, true, false];
    frames.slice(1, -1).forEach((f, i) => expect(expectCaption(f.say).includes('not atomic')).toBe(both[i + 1]));
    expect(expectCaption(frames.at(-1)!.say)).toContain('half moved');
  });
});

describe('multipart frames', () => {
  it('for every part size and failing part, the frames read cleanly and end in the right verdict', () => {
    for (let mib = 1; mib <= 16; mib++) {
      const parts = makeParts(mib * MIB);
      for (const failPart of [null, 1, 2, parts.length]) {
        const attempts = schedule(parts, { failPart, seed: 11 });
        const frames = uploadFrames(parts, attempts);
        frames.forEach((f) => expectCaption(f.say));
        const ts = frames.map((f) => f.t);
        expect([...ts].sort((a, b) => a - b)).toEqual(ts);
        expect(frames.at(-1)!.complete).toBe(true);
        expect(frames.at(-1)!.t).toBeCloseTo(uploadEnd(attempts));
        const last = expectCaption(frames.at(-1)!.say);
        expect(last.includes('Complete refused')).toBe(!checkParts(parts).ok);
        const mentionsFailure = frames.some((f) => expectCaption(f.say).includes('failed part-way'));
        expect(mentionsFailure).toBe(failPart !== null);
        expect(last.includes('wasted')).toBe(failPart !== null && checkParts(parts).ok);
      }
    }
  });

  it('the HTTP panel lists a request per attempt, marks retries and ends with Complete', () => {
    const parts = makeParts(8 * MIB);
    const attempts = schedule(parts, { failPart: 3, seed: 11 });
    const end = uploadEnd(attempts);
    const lines = uploadRequests(parts, attempts, end, true);
    expect(lines[0]).toContain('?uploads');
    expect(lines.filter((l) => l.includes('?partNumber=')).length).toBe(attempts.length);
    expect(lines.filter((l) => l.includes('(retry)'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('failed'))).toHaveLength(1);
    expect(lines.at(-1)).toContain('200 OK');
    const small = makeParts(4 * MIB);
    expect(uploadRequests(small, schedule(small, { failPart: null, seed: 11 }), 99, true).at(-1)).toContain('400 EntityTooSmall');
    expect(uploadRequests(parts, attempts, 0, false)).toHaveLength(1 + attempts.filter((a) => a.start <= 0).length);
  });
});

describe('the try-this prompts, from the default state', () => {
  it('4 MiB parts are refused at Complete; 8 MiB parts with part 3 failing retry exactly part 3', () => {
    const four = planParts(FILE_SIZE, 4 * MIB);
    const verdict = checkParts(four);
    expect(verdict.ok).toBe(false);
    expect(four.slice(0, -1).filter((p) => p.size < 5 * MIB)).toHaveLength(9);
    const eight = makeParts(8 * MIB);
    const attempts = schedule(eight, { failPart: 3, seed: 11 });
    expect(attempts.filter((a) => a.attempt > 1).map((a) => a.part)).toEqual([3]);
    expect(checkParts(eight).ok).toBe(true);
    const q = lesson.quiz[3];
    expect(q.options[q.answer]).toContain('refused');
  });

  it('listing reports/ with a slash and 3 keys per page: two pages, the second holds the last key', () => {
    const pages = listAll(DEMO_KEYS, 'reports/', '/', 3);
    expect(pages.map((p) => p.entries.map((e) => e.name))).toEqual([['reports/', 'reports/2025/', 'reports/2026/'], ['reports/index.html']]);
    expect(expectCaption(listingCaption('reports/', '/', pages[0]))).toContain('truncated');
    expect(expectCaption(listingCaption('reports/', '/', pages[1]))).toContain('nothing more follows');
    const flat = listAll(DEMO_KEYS, 'reports/', null, 100);
    expect(flat).toHaveLength(1);
    expect(flat[0].entries.length).toBeGreaterThan(pages[0].entries.length);
  });

  it('the request line encodes the prefix and the continuation', () => {
    const page = listObjects(DEMO_KEYS, { prefix: 'reports/', delimiter: '/', maxKeys: 3, after: null });
    expect(listRequest('reports/', '/', 3, null)).toBe('GET /?list-type=2&prefix=reports%2F&delimiter=%2F&max-keys=3 HTTP/1.1');
    expect(listRequest('reports/', '/', 3, page.next)).toContain(`continuation-token=${encodeURIComponent(btoa('reports/2026/'))}`);
    expect(listRequest('a b&c', null, 1, null)).toBe('GET /?list-type=2&prefix=a%20b%26c&max-keys=1 HTTP/1.1');
  });
});

describe('the Fail part slider after the part size changes', () => {
  it('part 8 of 10 (4 MiB) is reset when 8 MiB leaves only 5 parts, so the slider never shows a part that is not failing', () => {
    expect(makeParts(4 * MIB)).toHaveLength(10);
    expect(makeParts(8 * MIB)).toHaveLength(5);
    expect(clampFailPart(8, makeParts(4 * MIB).length)).toBe(8);
    expect(clampFailPart(8, makeParts(8 * MIB).length)).toBe(0);
    expect(clampFailPart(5, makeParts(8 * MIB).length)).toBe(5);
    expect(clampFailPart(0, 5)).toBe(0);
  });
});
