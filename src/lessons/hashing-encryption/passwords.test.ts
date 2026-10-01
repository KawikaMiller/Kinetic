import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { buildPasswordFrames } from './passwordFrames';
import { sha as hashOf } from './testVectors';
import { crackedBy, FAST_S, hashInput, LOOKUP, PASSWORD, SALTS, SLOW_BAR_DRAWN, SLOW_DAYS, SLOWDOWN, SPACE, USERS } from './passwordModel';

const frames = buildPasswordFrames();
const text = (i: number) => renderToStaticMarkup(frames[i].say as ReactElement);

describe('cracking-time arithmetic', () => {
  it('26^8 passwords: 20.9 s at 10 billion/s, 241.7 days at 10 thousand/s', () => {
    expect(SPACE).toBe(208_827_064_576);
    expect(FAST_S.toFixed(1)).toBe('20.9');
    expect(SLOW_DAYS.toFixed(1)).toBe('241.7');
    expect(SLOWDOWN).toBe(1e6);
  });

  it('the captions quote those figures, rounded', () => {
    const fast = frames.findIndex((f) => f.race === 'fast');
    const slow = frames.findIndex((f) => f.race === 'slow');
    expect(text(fast)).toContain('~21 s');
    expect(text(slow)).toContain('~242 days');
  });

  it('the slow bar is drawn far wider than to scale (which is why the stage says so)', () => {
    expect(SLOW_BAR_DRAWN).toBeGreaterThan(1000 / SLOWDOWN);
  });
});

describe('what each leak gives away (real SHA-256)', () => {
  it('unsalted: both rows are the same hash, and it is in the lookup table', () => {
    const rows = USERS.map((u) => hashOf(hashInput('hash', u)!));
    expect(rows[0]).toBe(rows[1]);
    expect(LOOKUP.map(hashOf)).toContain(rows[0]);
    expect(crackedBy('hash', hashOf)).toEqual(['alice', 'bob']);
  });

  it('salted: same password, different hashes, none in the table', () => {
    const rows = USERS.map((u) => hashOf(hashInput('salt', u)!));
    expect(rows[0]).not.toBe(rows[1]);
    expect(hashInput('salt', 'alice')).toBe(SALTS.alice + PASSWORD);
    expect(crackedBy('salt', hashOf)).toEqual([]);
  });

  it('the scripted frames crack exactly the users the real hashes give away', () => {
    for (const f of frames.filter((x) => x.breach)) {
      expect(f.cracked).toEqual(crackedBy(f.storage, hashOf));
      if (f.storage !== 'plain') expect(f.lookup).toBe(f.cracked.length ? 'hit' : 'miss');
    }
  });

  it('calls it a lookup table, not a rainbow table', () => {
    for (let i = 0; i < frames.length; i++) expect(text(i)).not.toMatch(/rainbow/i);
    expect(text(frames.findIndex((f) => f.lookup === 'hit'))).toContain('lookup table');
  });
});
