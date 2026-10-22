import picomatch from 'picomatch';
import { describe, expect, it } from 'vitest';
import { watchIgnoreGlobs } from './watch-ignore.ts';

const ignores = (root, file) => watchIgnoreGlobs(root).some((glob) => picomatch(glob)(file));

describe('watchIgnoreGlobs', () => {
  const root = 'K:/Programming/kinetic';
  it('ignores worktrees, screenshots and build output under the root', () => {
    expect(ignores(root, `${root}/.claude/worktrees/x/y.ts`)).toBe(true);
    expect(ignores(root, `${root}/.claude/worktrees/x/index.html`)).toBe(true);
    expect(ignores(root, `${root}/.smoke/latest/a.png`)).toBe(true);
    expect(ignores(root, `${root}/dist/index.html`)).toBe(true);
  });
  it('leaves source alone', () => {
    expect(ignores(root, `${root}/src/x.ts`)).toBe(false);
    expect(ignores(root, `${root}/index.html`)).toBe(false);
    expect(ignores(root, `${root}/.claude/settings.json`)).toBe(false);
  });
  it('a root that is itself a worktree still watches its own files', () => {
    const own = 'K:/Programming/kinetic/.claude/worktrees/t4-a';
    expect(ignores(own, `${own}/src/x.ts`)).toBe(false);
    expect(ignores(own, `${own}/index.html`)).toBe(false);
    expect(ignores(own, `${own}/.claude/worktrees/nested/a.ts`)).toBe(true);
  });
  it('accepts Windows separators and escapes glob characters in the root', () => {
    expect(ignores(String.raw`K:\a\b`, 'K:/a/b/.claude/worktrees/q/r.ts')).toBe(true);
    const odd = 'K:/my (copy)/[kinetic]';
    expect(ignores(odd, `${odd}/.claude/worktrees/q/r.ts`)).toBe(true);
    expect(ignores(odd, `${odd}/src/r.ts`)).toBe(false);
  });
});
