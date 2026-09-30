import type { ReactNode } from 'react';
import { byId, rootTreeId, srcTreeId, type Repo, type Result } from './repo';

/** The caption for what a git operation just did. */
export function describe(r: Result, before: Repo): ReactNode {
  const repo = r.repo;
  const tip = byId(repo, repo.branches[repo.head]);
  const name = <span className="hl">{repo.head}</span>;
  switch (r.kind) {
    case 'commit': {
      const p = byId(repo, tip.parents[0]);
      const newTrees = (rootTreeId(tip.files) !== rootTreeId(p.files) ? 1 : 0) + (srcTreeId(tip.files) !== srcTreeId(p.files) ? 1 : 0);
      return (
        <>
          Commit <span className="hl">{tip.id}</span>: only {r.info.split('/').pop()} changed, so git stored{' '}
          <b>1 new blob</b>, <b>{newTrees} new tree{newTrees === 1 ? '' : 's'}</b> and 1 commit. Everything else is reused by
          hash. {name} moves forward.
        </>
      );
    }
    case 'branch':
      return (
        <>
          A branch is just a tiny file holding one commit hash. <span className="hl violet">{r.info}</span> points at the
          same commit as before, and HEAD now points at {r.info}. No files were copied.
        </>
      );
    case 'checkout':
      return <>HEAD now points at {name}. Your working files switch to that commit's snapshot.</>;
    case 'ff':
      return (
        <>
          <span className="hl ok">Fast-forward</span>: {repo.head} was simply behind {r.info}, so git slid the pointer
          forward. No new commit needed.
        </>
      );
    case 'uptodate':
      return <>Already up to date: {r.info} is already part of {before.head}'s history.</>;
    case 'merge':
      return (
        <>
          Merge commit <span className="hl">{tip.id}</span> has <b>two parents</b>: history is kept exactly as it happened.
          {r.info ? <> Both sides changed <span className="hl bad">{r.info}</span>: a conflict you'd resolve by hand.</> : null}
        </>
      );
    case 'rebase':
      return (
        <>
          Rebase replayed <b>{r.info}</b> commit{r.info === '1' ? '' : 's'} on top of the other branch. Same changes, but new
          parents mean <b>new hashes</b> (marked ′). The originals are now unreachable (faded) until garbage collection.
        </>
      );
    case 'noop':
      return <>Nothing to rebase: {repo.head} has no commits of its own.</>;
  }
}
