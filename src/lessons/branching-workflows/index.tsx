import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The longer work lives on a branch, the more everyone else\'s code moves underneath it: long-lived branches merge in painful batches, while trunk-based teams integrate small changes every day.',
    what: 'In a GitFlow-style workflow, features live on their own branches for days or weeks, merge into a develop branch, and reach production in a scheduled release. In trunk-based development, everyone merges small, reviewed changes into main at least daily; unfinished features ship hidden behind feature flags. The difference is how long changes stay invisible to each other: that decides how many conflicts pile up and how long code waits to reach users.',
    analogy: 'Two people editing the same document: sync every few minutes and you fix tiny clashes as you go; work offline for a week and you spend an afternoon untangling who changed which paragraph.',
    useCases: [
      'Choosing a branching strategy for a team or a new repo',
      'Understanding why a "merge day" before a release is always painful',
      'Shipping half-built features safely behind a flag',
      'Making CI meaningful: it can only test code that has actually been integrated',
    ],
    why: 'Every team you join has a branching convention, and you\'ll be asked to keep PRs small and merge often. Knowing why lets you avoid the week-long branch that nobody can review and nobody can merge.',
    watch: 'The numbered strip is the week; today is yellow. Each panel is one strategy\'s commit graph: every circle is one day of one developer\'s work (the number is the day), and each developer\'s lane has its own colour (never green, yellow or red, which mean status here); main and develop are grey. With flags on, trunk work commits straight to main, so that side has no lanes, only status colours. A red ring and red badge mean a merge (or a trunk commit) had that many conflicts to resolve. Green rings are merges and changes landing in main, and on the trunk side a dimmed ring is unfinished work merged behind a feature flag that\'s off. Tags above the circles are branch names. The numbers beside each graph count conflicts so far, average days from commit to production, how often everyone\'s code is integrated, and a typical PR size.',
  },
  tryThis: [
    'Press play and watch integration day on the top graph: the conflicts arrive all at once.',
    'Set the long-lived branch lifetime to 10 days: more conflicts, and they all land on the last day.',
    'Turn the trunk\'s feature flags Off: unfinished features can\'t merge, so trunk branches live for 3 days too.',
    'Change the team size to 4 and press New week: conflicts grow with the number of people editing in parallel.',
  ],
  keyIdeas: [
    'Conflicts come from changes that can\'t see each other: the longer a branch lives, the more of them pile up.',
    'Trunk-based development merges small reviewed changes at least daily; flags hide unfinished work.',
    'Long branches also delay production: code waits for the branch and then for the release.',
    'CI only tests integrated code, so integrating rarely means CI rarely tests what you\'ll ship.',
  ],
  quiz: [
    {
      q: 'What does trunk-based development actually mean?',
      options: [
        'Everyone pushes unreviewed code straight to main',
        'Small, reviewed changes merge into main at least daily; unfinished work hides behind flags',
        'There are no branches at all, ever',
        'Only the tech lead can merge',
      ],
      answer: 1,
      why: 'Trunk-based teams still use short-lived branches and code review. The rule is that branches live for hours, not weeks, so main always holds everyone\'s current work.',
    },
    {
      q: 'Why do long-lived feature branches cause big merge conflicts?',
      options: [
        'Git is slower with old branches',
        'While the branch lives, others change the same code without seeing your changes',
        'Branches expire after a week',
        'Code review takes longer',
      ],
      answer: 1,
      why: 'Every day a branch stays open, more of main changes underneath it. The overlaps all surface at once when it finally merges.',
    },
    {
      q: 'How can a half-finished feature merge into main without users seeing it?',
      options: ['Comment the code out', 'Put it behind a feature flag that\'s off', 'Merge it with a failing test', 'Squash the commits'],
      answer: 1,
      why: 'A feature flag ships the code dark. It\'s integrated and tested with everything else, and you switch it on when it\'s ready.',
    },
  ],
};

export default lesson;
