import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A build system keeps a graph of targets and their inputs, and after an edit rebuilds only the targets whose inputs really changed, in dependency order, as many at once as the graph allows.',
    what: 'Each target (an object file, a library, a binary) declares its inputs. Modern tools like Bazel give every build step a key: a hash of its command plus its declared inputs\' hashes. Same key, same output, so the step is skipped or served from a cache, and a step that rebuilds to identical bytes stops the wave right there (early cutoff). Classic make compares timestamps instead, so any newer file triggers everything downstream. Either way the graph has to be right: an input that isn\'t declared is invisible, so its changes never trigger a rebuild.',
    analogy: 'A recipe book with notes of which dishes use which ingredients. Change the salt and you remake only the dishes that use it, but if a recipe forgot to list salt, that dish keeps tasting of the old salt.',
    useCases: [
      'Bazel, Buck2 and Pants rebuilding only the targets an edit affects, with a shared remote cache',
      'make and Ninja deciding what to recompile from file timestamps',
      'Gradle, Turborepo and Nx caching task outputs by a hash of their inputs',
      'CI pipelines that skip test jobs whose inputs haven\'t changed since the last green run',
    ],
    why: 'Slow builds cost every engineer on a team many times a day, and wrong builds are worse: a stale object or a poisoned cache ships code nobody wrote. Knowing how keys, edges and caches work explains "works after a clean build" bugs, and the order rules come straight from `topological-sort`. A CI job graph is the same idea one level up (`ci-pipelines`).',
    watch: 'The graph runs left to right: source files, then objects, libraries, and the app and test binaries. An edited file is yellow, and so is a target while it builds. Targets waiting to rebuild are washed blue and turn solid blue once rebuilt; cache hits are green, up-to-date targets are dim. On the last step a stale output turns red and a poisoned cache entry orange, and the same rows are coloured in the Cache keys table. A dashed red arrow is an input a target reads but doesn\'t declare. The node you picked has a thicker outline. The timeline has one lane per worker: yellow while building, blue when done, green for a cache fetch, with a cursor at the current time. In the side panel a red or orange note flags an input missing from the key.',
  },
  tryThis: [
    'Select math.c, press Comment only, then Build: math.o rebuilds, and its unchanged output turns the rest into cache hits.',
    'Switch Change detection to Timestamps (make) and do the same comment edit: the whole chain rebuilds.',
    'Press Touch (save, no change) on a file in each mode and compare what rebuilds.',
    'Load Missing dependency, edit math.h with Change code, and build: main.o is skipped and app ends up stale.',
    'Load Hermeticity break and press Clean build: main.o comes from the remote cache poisoned; then declare LOG_LEVEL and try again.',
  ],
  keyIdeas: [
    'Rebuild what can reach the change, in topological order, and nothing else.',
    'Content hashes beat timestamps: a touch or a comment-only edit can stop at the first step (early cutoff).',
    'A missing dependency edge means a missing rebuild: the build is fast and wrong.',
    'A cache is only safe when every step is hermetic: every input it reads is in its key.',
  ],
  quiz: [
    {
      q: 'You fix a typo in a comment in math.c. With content hashes and early cutoff, what gets rebuilt?',
      options: [
        'Only math.o; its bytes come out the same, so the rest are hits',
        'math.o and everything after it, because math.c is now newer',
        'Nothing at all, because comments never change any build step',
        'The whole project, because any source edit forces a clean build',
      ],
      answer: 0,
      why: "math.c's hash changed, so math.o's key changed and it recompiles, but the compiler drops comments and the object comes out identical. Everything downstream sees the same input hashes, so their keys match. \"It's newer\" is make's rule, the misconception this lesson is about: timestamps can't tell a comment from code.",
    },
    {
      q: "main.c includes math.h, but the build file doesn't list it for main.o. You change a constant in math.h. What happens?",
      options: [
        'main.o is skipped, and the app ships with the old constant',
        'The compiler notices the include and rebuilds main.o anyway',
        'The build fails at once with a missing dependency error',
        'Every target is rebuilt, because a header has changed',
      ],
      answer: 0,
      why: "The build system decides from the declared graph, and that graph says main.o doesn't depend on math.h. So main.o keeps its old bytes, compiled against the old constant, and app links them. Nothing errors, which is why missing edges are nasty (sandboxed builds like Bazel's catch it by hiding undeclared files).",
    },
    {
      q: 'A build has 24 s of total work and a critical path of 8 s. With as many workers as you like, the fastest finish is:',
      options: ['8 s', '24 s', '6 s', 'Under 1 s'],
      answer: 0,
      why: 'Steps on the critical path wait for each other, so no amount of parallelism finishes before that chain does: 8 s. 24 s is one worker doing everything; 6 s is 24 s split evenly over four workers, which the chain makes impossible.',
    },
    {
      q: 'Why is a shared remote cache dangerous when a build step reads an environment variable it does not declare?',
      options: [
        "The key ignores the variable, so another machine's output is served",
        'Remote caches cannot store outputs built with any environment set',
        'The variable makes the key change on every build, so it never hits',
        'Reading the environment makes that build step run on one worker',
      ],
      answer: 0,
      why: "The key only covers declared inputs, so two machines with different values compute the same key, and whoever built first fills the cache for everyone: a poisoned entry. It's the opposite of \"never hits\": the trouble is that it hits when it shouldn't. Declaring the variable puts it in the key.",
    },
  ],
};

export default lesson;
