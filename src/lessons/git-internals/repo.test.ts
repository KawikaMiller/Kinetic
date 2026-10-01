import { describe, expect, it } from 'vitest';
import {
  ancestors, blobId, branch, byId, checkout, commit, FILES, initialRepo, merge, objectCount, rebase, reachable,
  rootTreeId, srcTreeId, type Repo,
} from './repo';

const tipOf = (repo: Repo, b = repo.head) => byId(repo, repo.branches[b]);

/** feature-1 off main, then one commit on each side touching the given files. */
function diverged(mainFile: (typeof FILES)[number], featureFile: (typeof FILES)[number]) {
  let repo = branch(initialRepo()).repo; // HEAD = feature-1
  repo = commit(repo, featureFile).repo;
  repo = checkout(repo, 'main').repo;
  repo = commit(repo, mainFile).repo;
  return checkout(repo, 'feature-1').repo;
}

describe('content addressing', () => {
  it('names objects by content: same content, same id; different content, different id', () => {
    expect(blobId('hello')).toBe(blobId('hello'));
    expect(blobId('hello')).not.toBe(blobId('hello!'));
    expect(blobId('x')).toMatch(/^[0-9a-f]{7}$/);
  });

  it('a commit stores one new blob, only the trees above it, and one commit; the rest is reused', () => {
    const before = initialRepo();
    for (const file of FILES) {
      const { repo } = commit(before, file);
      const tip = tipOf(repo);
      const parent = byId(repo, tip.parents[0]);
      for (const f of FILES) {
        expect(blobId(tip.files[f]) === blobId(parent.files[f])).toBe(f !== file);
      }
      const srcChanged = file.startsWith('src/');
      expect(srcTreeId(tip.files) !== srcTreeId(parent.files)).toBe(srcChanged);
      expect(rootTreeId(tip.files)).not.toBe(rootTreeId(parent.files));
      // new objects = 1 blob + (src tree?) + root tree + 1 commit, exactly what the caption says
      expect(objectCount(repo) - objectCount(before)).toBe(1 + (srcChanged ? 1 : 0) + 1 + 1);
    }
  });

  it('counts the initial repo’s objects: 2 commits, their trees and the distinct blobs', () => {
    // c1: blobs readme/app v1/util; c2 adds app v2 → 4 blobs; 2 src trees; 2 root trees; 2 commits
    expect(objectCount(initialRepo())).toBe(4 + 2 + 2 + 2);
  });
});

describe('branches are pointers', () => {
  it('a new branch creates no commit and points at the current commit', () => {
    const start = initialRepo();
    const { repo } = branch(start);
    expect(repo.commits.length).toBe(start.commits.length);
    expect(repo.branches[repo.head]).toBe(start.branches.main);
    expect(objectCount(repo)).toBe(objectCount(start));
  });

  it('checkout only moves HEAD', () => {
    const { repo } = checkout(branch(initialRepo()).repo, 'main');
    expect(repo.head).toBe('main');
    expect(repo.commits.length).toBe(2);
  });
});

describe('merge', () => {
  it('fast-forwards when main is simply behind', () => {
    let repo = branch(initialRepo()).repo;
    repo = commit(repo, 'src/app.js').repo;
    repo = checkout(repo, 'main').repo;
    const r = merge(repo, 'feature-1');
    expect(r.kind).toBe('ff');
    expect(r.repo.branches.main).toBe(r.repo.branches['feature-1']);
  });

  it('is up to date when the other branch is already in history', () => {
    let repo = branch(initialRepo()).repo;
    repo = commit(repo, 'src/app.js').repo;
    expect(merge(repo, 'main').kind).toBe('uptodate');
  });

  it('makes a two-parent merge commit with both sides’ changes when they touched different files', () => {
    const repo = checkout(diverged('README.md', 'src/app.js'), 'main').repo;
    const r = merge(repo, 'feature-1');
    const m = tipOf(r.repo);
    expect(r.kind).toBe('merge');
    expect(r.conflicts).toEqual([]);
    expect(m.parents).toHaveLength(2);
    expect(m.files['README.md']).toBe(tipOf(repo, 'main').files['README.md']);
    expect(m.files['src/app.js']).toBe(tipOf(repo, 'feature-1').files['src/app.js']);
  });

  it('reports a conflict when both sides changed the same file', () => {
    const repo = checkout(diverged('README.md', 'README.md'), 'main').repo;
    const r = merge(repo, 'feature-1');
    expect(r.conflicts).toEqual(['README.md']);
  });
});

describe('rebase', () => {
  it('replays the branch’s commits with new hashes and leaves the originals unreachable', () => {
    const repo = diverged('README.md', 'src/app.js');
    const oldTip = tipOf(repo);
    const r = rebase(repo, 'main');
    const newTip = tipOf(r.repo);
    expect(r.kind).toBe('rebase');
    expect(r.info).toBe('1');
    expect(newTip.id).not.toBe(oldTip.id);
    expect(newTip.parents).toEqual([r.repo.branches.main]);
    expect(reachable(r.repo).has(oldTip.id)).toBe(false);
    expect(ancestors(r.repo, newTip.id).has(r.repo.branches.main)).toBe(true);
    // both sides' changes survive
    expect(newTip.files['README.md']).toBe(tipOf(repo, 'main').files['README.md']);
    expect(newTip.files['src/app.js']).toBe(oldTip.files['src/app.js']);
    expect(r.conflicts).toEqual([]);
  });

  it('reports a conflict instead of silently overwriting main’s change to the same file', () => {
    const repo = diverged('README.md', 'README.md');
    const mainReadme = tipOf(repo, 'main').files['README.md'];
    const featureReadme = tipOf(repo).files['README.md'];
    const r = rebase(repo, 'main');
    const tip = tipOf(r.repo);
    expect(r.conflicts).toEqual(['README.md']);
    expect(tip.files['README.md']).not.toBe(featureReadme);
    expect(tip.files['README.md']).not.toBe(mainReadme);
    // merge and rebase agree on what conflicts
    expect(merge(checkout(repo, 'main').repo, 'feature-1').conflicts).toEqual(r.conflicts);
  });

  it('agrees with merge about conflicts for every pair of edited files', () => {
    for (const mainFile of FILES) {
      for (const featureFile of FILES) {
        const repo = diverged(mainFile, featureFile);
        const viaRebase = rebase(repo, 'main').conflicts;
        const viaMerge = merge(checkout(repo, 'main').repo, 'feature-1').conflicts;
        expect(viaRebase).toEqual(viaMerge);
        expect(viaRebase).toEqual(mainFile === featureFile ? [mainFile] : []);
      }
    }
  });

  it('fast-forwards when the branch has nothing of its own (behind, or at the same commit)', () => {
    let repo = commit(initialRepo(), 'src/util.js').repo; // main moves on
    repo = branch(checkout(repo, 'main').repo).repo; // feature at main tip
    repo = checkout(repo, 'main').repo;
    repo = commit(repo, 'README.md').repo;
    repo = checkout(repo, 'feature-1').repo;
    expect(rebase(repo, 'main').kind).toBe('ff');
    const same = branch(initialRepo()).repo;
    expect(rebase(same, 'main').kind).toBe('ff');
  });
});
