import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Git stores snapshots, not diffs: every commit points to a full tree of files, identified by the hash of its contents. Branches are just movable pointers to commits.",
    what: "Git keeps three kinds of object. A blob holds a file's contents, a tree lists the files and folders in a directory, and a commit points to one root tree plus its parent commit(s). Each object is named by the hash of its content, so an unchanged file keeps the same hash and is stored only once. A branch is a tiny file containing one commit hash, and HEAD records which branch you're on.",
    analogy: "Commits are photos of your whole desk, but the album is clever: any object that looks identical to one in an earlier photo is stored once and just referenced again. Branches are sticky notes you move from photo to photo.",
    useCases: [
      "Understanding what merge, rebase, reset and cherry-pick actually do",
      "Recovering \"lost\" work from the reflog after a bad rebase or reset",
      "Choosing between merge commits and rebasing in a team workflow",
      "Reading git log --graph and making sense of detached HEAD",
    ],
    why: "Git is the tool you'll use every single day, and most git panic comes from not knowing what it is doing underneath. Once you see commits as snapshots and branches as pointers, merges, rebases and recovery stop being scary.",
    watch: "Circles are commits labelled with their short hash; colour shows which branch lane created them, and a thick ring is a merge commit with two parents. Tags are branch pointers, and the yellow HEAD tag is where you are. Faded dashed commits are unreachable (left behind by a rebase). The panel on the right opens the selected commit: yellow NEW objects were created by it, faded ones are reused from its parent by hash.",
  },
  tryThis: [
    'Commit a change to app.js, then look at the panel: README.md is reused, not copied.',
    'Make a New branch, commit on it, checkout main and merge it in: a fast-forward.',
    'Commit on both branches, then merge: a real merge commit with two parents.',
    'Instead of merging, rebase the feature branch: new hashes, old commits left faded.',
  ],
  keyIdeas: [
    'A commit is a full snapshot (a root tree) plus its parent commit(s).',
    'Objects are named by the hash of their content, so identical files are stored once.',
    'A branch is a pointer to a commit; committing just moves it forward.',
    'Rebase rewrites commits: same changes, new parents, new hashes.',
  ],
  quiz: [
    {
      q: 'You change one file out of 100 and commit. Roughly what new objects does git store?',
      options: ['100 new blobs', 'One new blob, the trees above it, and one commit', 'Only a diff of the changed lines', 'A full copy of the repository'],
      answer: 1,
      why: 'Unchanged files keep their hashes and are reused. Only the changed blob, its parent trees and the commit are new.',
    },
    {
      q: 'What is a git branch, physically?',
      options: ['A copy of all the files', 'A pointer to one commit hash', 'A list of diffs', 'A separate repository'],
      answer: 1,
      why: 'A branch is a tiny ref file containing a commit hash. That’s why creating one is instant.',
    },
    {
      q: 'Why do commits get new hashes after a rebase?',
      options: ['Git adds random salt', 'Their parent changed, and the parent is part of the hashed content', 'The files are compressed differently', 'They don’t; the hashes stay the same'],
      answer: 1,
      why: 'A commit’s hash covers its tree, message and parent(s). New parent → new hash, even with identical changes.',
    },
  ],
};

export default lesson;
