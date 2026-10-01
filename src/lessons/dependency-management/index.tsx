import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A version range in package.json is a rule about which future releases you accept; a lockfile pins what you actually got, so every machine installs the same code.',
    what: 'Semantic versioning numbers releases MAJOR.MINOR.PATCH: MAJOR for breaking changes, MINOR for new features, PATCH for fixes. A range like ^1.4.2 accepts any 1.x from 1.4.2 up, so installing the same package.json on different days can give different code. A lockfile (package-lock.json) records the exact version of every package, direct and transitive, so installs are repeatable until you upgrade on purpose.',
    analogy: 'package.json is a shopping list that says "a loaf of wholemeal bread, any brand"; the lockfile is the receipt from last time: this brand, this loaf.',
    useCases: [
      'Reading and writing dependency ranges in package.json (and pyproject, Cargo.toml, go.mod...)',
      'Debugging "works on my machine, broken in CI" after a transitive release',
      'Choosing npm ci over npm install in pipelines',
      'Tracing why two copies of a library ended up in your bundle, or why a security fix won\'t install',
    ],
    why: 'Almost every project you touch pulls in hundreds of packages you didn\'t write. Knowing what ^ and ~ actually allow, and why the lockfile gets committed, saves you from a whole class of mystery breakages and lets you answer the security team when an advisory lands.',
    watch: 'Semver ranges: each published version is a chip. Green chips satisfy the range, the solid yellow chip is the highest match (what npm installs), and faded chips are excluded; a small PRE tag marks pre-releases. The violet text under the range is what it really means. The anatomy boxes colour MAJOR red (breaking), MINOR blue (feature), PATCH green (fix) and a pre-release tag yellow. Lockfiles: the month strip shows tiny-date releases; green were published, faded dashed ones aren\'t out yet, and the red 1.5.0 is the regression. The laptop and CI cards outline yellow while they act, and their test line turns green or red. Transitive deps: boxes are folders in node_modules; c-utils copies outline violet when there are two, fill red when vulnerable and green when fixed, and dashed grey arcs show which package requires the top-level copy.',
  },
  tryThis: [
    'Compare the ^1.4.2 and ~1.4.2 presets: watch 1.5.0 and 1.6.3 switch off.',
    'Pick ^0.3.1: with a leading zero, the caret only lets PATCH move.',
    'Click 1.5.0-beta.1 under ^1.4.2 to see why pre-releases are left out, then try the ^1.5.0-beta.1 preset.',
    'In Lockfiles, play with the lockfile Not committed, then switch it to Committed and replay.',
    'In Transitive deps, release the fix Only on 2.x, then switch B to 3.3.0.',
  ],
  keyIdeas: [
    'MAJOR.MINOR.PATCH = breaking.feature.fix: the version is a promise about compatibility.',
    '^ allows changes that don\'t touch the leftmost non-zero number; ~ allows only PATCH changes.',
    'Commit the lockfile and use npm ci in CI: same lockfile, same code, on every machine.',
    'Incompatible ranges mean duplicate copies, and a fix that one range can\'t reach needs a maintainer to act.',
  ],
  quiz: [
    {
      q: 'What does ^1.4.2 accept?',
      options: ['Any newer version, including 2.0.0', '>=1.4.2 and <2.0.0', 'Only 1.4.x', 'Exactly 1.4.2'],
      answer: 1,
      why: 'The caret locks the leftmost non-zero number, here MAJOR 1. It accepts newer MINOR and PATCH releases but never a new MAJOR, which is where breaking changes go.',
    },
    {
      q: 'What does ^0.3.1 accept?',
      options: ['>=0.3.1 <1.0.0', '>=0.3.1 <0.4.0', 'Only 0.3.1', 'Anything above 0.3.1'],
      answer: 1,
      why: 'Below 1.0.0 the MINOR number carries breaking changes, so the caret locks it: ^0.3.1 means >=0.3.1 <0.4.0.',
    },
    {
      q: "Your package.json hasn't changed, but CI broke after a dependency released a new patch version. What prevents this?",
      options: [
        'Committing the lockfile, installing with npm ci',
        'Using ~ instead of ^ for every dependency',
        'Deleting node_modules before every build',
        'Pinning the Node.js version used in CI',
      ],
      answer: 0,
      why: "The lockfile pins the exact resolved version (and every transitive one). npm ci installs exactly that, so CI runs the code you tested until you upgrade deliberately. ~ still accepts new patches, so it wouldn't help.",
    },
    {
      q: 'A security fix exists only for c-utils 2.x. A package you use requires c-utils ^1.4.0, and that copy is already the newest 1.x. What does npm update do for it?',
      options: [
        'Nothing: 2.x is outside its range',
        'Upgrades that copy to 2.x for the fix',
        'Removes the package that needs 1.x',
        'Fails the install with a version error',
      ],
      answer: 0,
      why: "npm never installs a version outside the range a package asked for, even for a security fix. That package's maintainers must widen their range, or you override it knowingly.",
    },
  ],
};

export default lesson;
