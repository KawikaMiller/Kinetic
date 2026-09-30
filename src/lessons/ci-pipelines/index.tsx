import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A CI pipeline builds and tests every push automatically, as a graph of jobs that run in parallel wherever they don\'t depend on each other, and blocks anything broken from shipping.',
    what: 'Continuous integration runs the same checks for every change: install dependencies, lint, type-check, build, then test. The jobs form a dependency graph (a DAG): a job starts as soon as everything it needs has passed, so independent jobs run side by side. If a job fails, everything that depends on it is blocked, including deploy, so a broken change never reaches production.',
    analogy: 'A kitchen line: the salad and the soup are made at the same time by different cooks, but nothing leaves the pass until every dish on the ticket is done and checked.',
    useCases: [
      'Running tests on every pull request before it can merge (GitHub Actions, GitLab CI, Jenkins, CircleCI)',
      'Caching dependencies and sharding slow test suites to keep feedback under ten minutes',
      'Building an artifact once and promoting that exact file to staging and production',
      'Reading a red pipeline to find which job failed and why',
    ],
    why: 'On your first day your code goes through CI, and "why is my PR red?" is a question you\'ll answer weekly. Knowing that pipeline time is the longest chain, not the sum of jobs, tells you what to speed up: cache the install, shard the slowest tests, and parallelise what doesn\'t depend on each other.',
    watch: 'Each box is a job, arranged left to right by what it depends on; grey arrows are dependencies. A running job is yellow with a filling bar, passed jobs green, a failed job red, and blocked, cancelled or skipped jobs are faded. With the cache on, install turns blue for a cache hit. The critical path (the chain that decides the total time) gets a violet dashed outline, violet arrows, and violet-ringed bars. In the wall-clock panel each job is a bar from its start to its finish (dashed outline = the planned run) and the yellow line is now. The YAML highlights the jobs running now, the artifacts list lights up blue as dist/ and the package are produced, and a failing test shows its log in red.',
  },
  tryThis: [
    'Press play and compare Wall clock with Sum of all jobs: the pipeline is much faster than the work it does.',
    'Switch the Dependency cache to Cached: install shrinks and the whole run finishes 82 s sooner.',
    'Set Unit test shards to 4 and watch the violet critical path move off the unit tests.',
    'Press Break a test, then play: e2e, package and deploy never run. Now switch Fail fast on and replay.',
    'Push to a feature branch: deploy disappears, because it only runs on main.',
  ],
  keyIdeas: [
    'A pipeline is a DAG: a job starts as soon as all of its dependencies pass.',
    'Total time is the longest dependency chain (the critical path), not the sum of all jobs.',
    'Speed it up on the critical path: cache installs, shard slow tests, build once and reuse the artifact.',
    'A failure blocks everything downstream, so broken code can\'t deploy; fail fast saves runner time too.',
  ],
  quiz: [
    {
      q: 'Jobs take 90 s, 20 s, 60 s and 120 s, and the pipeline runs them as install → (lint | build → tests). What decides how long you wait?',
      options: ['The sum of all jobs: 290 s', 'The longest chain of dependencies', 'The slowest single job', 'The number of jobs'],
      answer: 1,
      why: 'Independent jobs run at the same time, so you only wait for the longest path through the graph: install → build → tests = 270 s here, not 290 s.',
    },
    {
      q: 'Unit tests fail. What happens to the deploy job?',
      options: ['It runs, then rolls back', 'It\'s blocked and never runs', 'It runs if lint passed', 'It runs in a sandbox'],
      answer: 1,
      why: 'Deploy depends (transitively) on the tests. A failed dependency blocks every job downstream, which is the whole point: red builds don\'t ship.',
    },
    {
      q: 'Which change speeds up a pipeline whose critical path is install → build → unit tests?',
      options: ['Adding more lint rules', 'Running lint on a faster runner', 'Caching dependencies and sharding the unit tests', 'Deploying more often'],
      answer: 2,
      why: 'Only work on the critical path changes the total. Lint isn\'t on it, so making lint faster saves nothing; the cache shortens install and shards split the unit tests.',
    },
  ],
};

export default lesson;
