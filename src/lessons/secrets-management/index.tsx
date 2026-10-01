import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Secrets (API keys, passwords, signing keys) never go in your code or your git history. Once one is pushed, assume it\'s public: deleting it doesn\'t help, rotating it does.',
    what: 'Code is the same everywhere and belongs in the repo. Config (ports, URLs, log levels) changes per environment. Secrets grant access, so they\'re kept out of the repo entirely: in a local .env file that git ignores, in environment variables, or in a secret manager that injects them when the app is deployed. Git keeps every version of every file, so a key committed once stays in the history even after you delete the line, and public repositories are scanned by bots within minutes.',
    analogy: 'Writing your house key\'s code on a postcard: tearing up your copy later doesn\'t matter, the postman has read it. You change the lock.',
    useCases: [
      'Setting up a new project: .env in .gitignore before the first commit',
      'Reading keys from process.env (or your platform\'s secret store) instead of typing them in',
      'Turning on a pre-commit or CI secret scanner',
      'Responding to "I think I pushed a key": rotate it first, clean up second',
    ],
    why: 'Leaked keys are one of the most common ways companies get breached, and juniors are the ones setting up config and running their first pushes. Knowing that rotation is the fix, and that deleting or ignoring isn\'t, turns a potential incident into a five-minute job.',
    watch: 'The secret is red wherever it appears, in config.js and on the commits that hold it; a safe reference like process.env.STRIPE_KEY is green, and ordinary commits are blue. Once a key is rotated it turns grey and struck through, and so do the commits holding it, because it\'s dead. In the sorting scene each item turns green in the right place and red in the wrong one.',
  },
  tryThis: [
    'Play "The leak" to the end: a scanner bot has the key less than a minute after the push.',
    'In "Fix it", try "Delete the line": the history graph still shows the red commit.',
    'Try "Add it to .gitignore": config.js stays tracked, key and all.',
    'Try "Rotate the key": the key turns grey, the only fix that stops the misuse.',
  ],
  keyIdeas: [
    'Code in the repo, config in the environment, secrets in a secret manager or ignored .env.',
    'Git history keeps deleted lines: a committed secret is still there.',
    '.gitignore only stops untracked files; it doesn\'t untrack or hide anything already committed.',
    'If a secret leaks, rotate it immediately. Rewriting history is cleanup, not the fix.',
  ],
  quiz: [
    {
      q: 'You notice you pushed an API key to a public repo ten minutes ago. What\'s the first thing to do?',
      options: [
        'Delete the line and push a new commit',
        'Add the file to .gitignore',
        'Rotate the key: revoke it and issue a new one',
        'Make the repository private',
      ],
      answer: 2,
      why: 'Assume it\'s already been copied. Revoking the key makes every copy useless; the other steps leave the old key working.',
    },
    {
      q: 'config.js is already committed. You add "config.js" to .gitignore. What happens to it?',
      options: [
        'Git deletes it from the repository',
        'Nothing: it stays tracked and keeps being committed',
        'Git removes it from history',
        'It becomes read-only',
      ],
      answer: 1,
      why: '.gitignore only stops untracked files being added. To stop tracking a file you have to remove it from the index (git rm --cached), and it\'s still in the history.',
    },
    {
      q: 'Which of these is a secret, rather than config?',
      options: ['The port the server listens on', 'The log level', 'The key that signs login tokens', 'The payment API\'s base URL'],
      answer: 2,
      why: 'Whoever has the signing key can forge a login for any user. The others vary by environment but aren\'t dangerous to know.',
    },
  ],
};

export default lesson;
