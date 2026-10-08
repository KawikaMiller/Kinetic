import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A bundler walks the import graph from the entry point, removes the code nothing uses (tree shaking) and splits the rest into chunks, so a page ships only what its first screen needs and loads the rest when asked for. Importing one function does not always ship just that function.',
    what: 'The bundler starts at the entry module and follows every import, concatenating all that is reachable into a bundle. Tree shaking then removes unused exports, but only where it can prove they are unused: the code has to be ES modules (their imports and exports are fixed in the source), and a module that does something just by being imported (a side effect) has to stay. CommonJS `require` modules are kept whole. Code splitting turns a dynamic `import()` into a chunk loaded on demand; a module needed by several entry points goes in a shared chunk so it is not shipped twice. More files are not automatically faster: each one costs a request. How scripts are then loaded is in `critical-rendering-path`, and why a build tool caches its work is in `build-systems`.',
    analogy: 'Packing for a trip. Throwing everything reachable in one suitcase is the plain bundle, leaving the things you will not wear at home is tree shaking, and sending the skiing gear ahead by courier only when you reach the mountain is code splitting.',
    useCases: [
      'Reading a bundle analyzer and seeing why a small import pulled in a large library',
      'Choosing ES-module builds of dependencies so that tree shaking can work',
      'Lazy-loading a heavy route (a chart page, an editor) with `import()`',
      'Deciding where to stop splitting, because hundreds of tiny files cost more in requests than they save in bytes',
    ],
    why: 'JavaScript is the most expensive thing a page ships: it has to be downloaded, parsed and run before the page is usable. Knowing what a bundler can and cannot remove tells you why a bundle is big and which change shrinks it, instead of guessing at configuration.',
    watch: 'The graph shows the modules as boxes and imports as arrows. The module being visited is yellow, modules in the bundle (or the initial chunk) are blue, and modules shaken out are grey and dashed. A module kept only because of its side effects has an orange outline, the lazy chunk is violet and the shared chunk is sky blue. The dashed violet arrow is the dynamic import. The bar shows kilobytes: blue is shipped, grey is shaken out, and once split each chunk has its colour. In the export chips, blue is kept and grey with a line through it is removed. In the loading waterfall, blue bars are downloads for the first screen, violet ones are downloads after the click, and yellow ones are code running.',
  },
  tryThis: [
    'Press play on the default scene: the walk visits every module and the bundle grows to 211 KB, including `ui/button`, which nothing uses.',
    'Keep playing: `ui/button` is dropped, `utils` loses four of its five exports and `datelib` loses two, shrinking the bundle to 170 KB; then `reports` becomes a lazy chunk.',
    'Switch `ui/button` to "side effects" and press play again: it can no longer be dropped, so it stays with an orange outline.',
    'Switch `datelib` to "CommonJS" and replay: the date library is kept whole, 60 KB instead of 34 KB.',
    'In Load and navigate, compare "One bundle", "Shaken", "Split" and "Too fine" in the table: the split page is usable sooner but waits at the click, and the too-fine one is slower than the split one.',
  ],
  keyIdeas: [
    'A bundle holds everything reachable from the entry point, including code that nothing uses.',
    'Tree shaking removes only what it can prove unused: ES modules with no side effects. CommonJS modules and modules with side effects stay.',
    'A dynamic `import()` makes a lazy chunk; code needed by several chunks goes in a shared one.',
    'Splitting trades a smaller first load for a wait later, and too many tiny chunks cost more in requests than they save.',
  ],
  quiz: [
    {
      q: 'A page imports one small function from a large library. When does the final bundle contain only that function?',
      options: [
        'When it is ES modules with no side effects, so the rest can go',
        'Always, because the import statement names just the one function that it needs',
        'Only when the bundle is also minified, because minifying strips every unused function',
        'Never, because bundlers always ship an imported library in full whatever it is',
      ],
      answer: 0,
      why: 'Tree shaking needs the bundler to prove an export is unused: ES module syntax makes imports and exports static, and a side-effect-free module can be dropped safely. A CommonJS library is kept whole, and a library with side effects keeps its setup code. Minification shortens code but does not decide what is used.',
    },
    {
      q: 'A module is imported but nothing it exports is used. Why might the bundler still keep it?',
      options: [
        'It has side effects, so dropping it could change the app',
        'Bundlers keep every imported module so that later rebuilds are faster',
        'The module is larger than all of the other modules in the same chunk',
        'Imports are always kept until the code has also been minified',
      ],
      answer: 0,
      why: 'A module that registers something, patches a prototype or logs when it runs does work just by being imported, so a bundler that cannot tell has to keep it. Marking a package as side-effect free lets it be dropped when unused. Size and rebuild speed do not decide it.',
    },
    {
      q: 'The reports page needs a chart library and a date library, and the first screen needs the date library too. Where do they end up after splitting?',
      options: [
        'Charts in the reports chunk, dates in a shared chunk used by both',
        'Both libraries in the initial chunk, because the first screen needs one',
        'Both libraries in the reports chunk, since reports needs them both',
        'Each library is copied into every chunk that imports it',
      ],
      answer: 0,
      why: 'A module used by only one entry point stays in that point\'s chunk, so the chart library goes with reports. One that two entry points need goes in a shared chunk, so it is downloaded once and not copied into both.',
    },
    {
      q: 'Every module of an app is split into its own file. Compared with a sensible split, what usually happens?',
      options: [
        'More requests, and a first screen that is usually slower',
        'Nothing changes at all, because the same bytes are sent in total',
        'The first screen is faster, because every single file is smaller',
        'Caching stops working, because such small files are too small to cache',
      ],
      answer: 0,
      why: 'Each file costs a request with its own round trip, and browsers allow only so many at once, so many tiny files wait for each other even though the bytes are the same. Splitting helps while the bytes it avoids outweigh the round trips it adds. Small files cache fine.',
    },
  ],
};

export default lesson;
