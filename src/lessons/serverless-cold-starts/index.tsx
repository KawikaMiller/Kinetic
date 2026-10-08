import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Functions run one request per instance and bill per request, so idle costs nothing, but any request that finds no warm instance waits for a new one to boot.',
    what: 'A function platform keeps a pool of instances. A request goes to a warm instance if one is free; otherwise the platform starts a new one: provision a sandbox, start the language runtime, then run your init code (imports, connections) before the handler can run. That wait is a cold start, and it can happen at any time, not only on the first request ever: whenever no warm instance is free, such as during a burst or after idle instances were reaped. Idle instances are reaped after a while. Provisioned concurrency keeps some instances warm for a price, and a concurrency limit throttles (429) anything beyond it instead of queueing. Some platforms can run several requests in one instance; this lesson models the classic one request per instance.',
    analogy: 'A food truck that only exists while someone is ordering. If a truck is parked and free, you are served at once; if all are busy, the company drives a new one to the curb and you wait while it unpacks.',
    useCases: [
      'APIs with spiky or rare traffic: webhooks, cron jobs, image resizing, glue between cloud services',
      'Choosing between functions, managed containers and VMs for a new service, and knowing what each leaves for you to run',
      'Tuning p99 latency: trimming init work, provisioning a few warm instances, or moving a steady workload to containers',
      'Explaining a surprise bill or a wave of 429 errors after a traffic spike',
    ],
    why: 'Mid-level engineers pick the compute model for a service and own its latency and bill. Knowing exactly when a cold start happens, what it is made of and what removes it (less init work, provisioned concurrency, a different model) turns "serverless is slow sometimes" into a decision. It builds on `containers` (what is being started), `processes-threads` (one request per instance is a concurrency model) and `boot-process` (the same init-before-useful-work idea), and `virtualization-hypervisors` (the sandbox underneath).',
    watch: 'Compute spectrum: columns are four ways to run code and rows are jobs; blue cells are yours, violet cells are split between you and the provider, dim cells are the provider\'s, and the yellow-edged row is the one you clicked. Function pool: each box in the scene is an instance slot. Yellow is cold-starting (provision, runtime start or function init), blue is running your handler, green is warm and idle, a dim fading box was just reaped, and a dashed empty outline is a free slot; blue pills are requests going to an instance and red pills are throttled 429s. On the timeline each row is a slot: yellow, amber and violet bars are the three cold-start phases, a blue bar is the handler, a hatched green bar is a warm instance waiting for work, and short red stubs on the bottom row are 429s; the vertical line is now. In the cost table the green figure is the cheaper option.',
  },
  tryThis: [
    'Press play on Function pool with the defaults (spiky traffic) and compare the p50 and p99 cards at the end: the typical request is fast, the cold-started ones set the tail.',
    'From the defaults, drag Init work up to 3 s and replay: the violet init bars stretch and the p99 grows by the same amount.',
    'From the defaults, set Provisioned to 7 and replay: no cold starts at all, but the cost table now favours the always-on VM.',
    'Pick Steady traffic and compare the cost table: constant load makes the VM the cheaper option.',
    'From the defaults, drag Concurrency limit down to 3 and replay: bursts now meet red 429 stubs and nothing waits in a queue.',
  ],
  keyIdeas: [
    'A cold start happens whenever no warm instance is free: first request, burst, or after idle instances are reaped.',
    'A cold start is provision, runtime start, then your init code; only the init part is yours to shorten.',
    'Provisioned concurrency trades money for latency: it keeps instances warm and bills for them even when idle.',
    'Serverless removes servers to run, not decisions: memory, timeouts, limits and dependencies are still yours.',
  ],
  quiz: [
    {
      q: 'When does a request in a function platform hit a cold start?',
      options: [
        'When no warm instance is free to take it, even mid-day',
        'Only on the very first request after you deploy',
        'Only after the platform restarts the whole region',
        'Whenever the handler runs for more than a second',
      ],
      answer: 0,
      why: 'Each instance serves one request at a time, so a burst finds every warm instance busy and starts new ones; reaped idle instances cause the same. Cold starts are not limited to the first request, and handler duration has nothing to do with them.',
    },
    {
      q: 'Serverless means there are no servers for you to run. What is still your job?',
      options: [
        'Choosing memory, timeout and concurrency limits',
        'Patching the operating system under the runtime',
        'Replacing failed hardware in the data centre',
        'Upgrading the hypervisor on the host machines',
      ],
      answer: 0,
      why: 'The provider patches the OS and hardware, but the settings that decide your latency, cost and failure behaviour are yours: memory size, timeout, concurrency limit, dependencies and init work.',
    },
    {
      q: 'Five requests arrive at the same moment, and 3 instances are provisioned and warm. How many of them wait for a cold start?',
      options: ['Two of the five', 'None of the five', 'All five of them', 'Three of the five'],
      answer: 0,
      why: 'Each warm instance takes one request, so three are served at once and the other two each need a new instance (the limit permits it). Provisioned concurrency only covers as many simultaneous requests as you provisioned.',
    },
    {
      q: 'Your function loads a large SDK at startup and p99 is high. Which change helps most?',
      options: [
        'Trim imports and defer rarely used setup',
        'Raise the concurrency limit so more can start',
        'Shorten the idle timer so instances are reaped sooner',
        'Put a rate limiter in front to slow requests down',
      ],
      answer: 0,
      why: 'Init code runs on every cold start, so less of it shortens each wait. A higher limit only allows more cold starts at once, and a shorter idle timer causes more of them.',
    },
    {
      q: 'A service gets heavy, constant traffic all day. Which is usually true about its cost?',
      options: [
        'An always-on VM is often cheaper than per-request billing',
        'Functions win, since idle capacity costs nothing at any load',
        'Both cost the same once the VM is busy enough',
        'Functions win, because cold starts are never billed',
      ],
      answer: 0,
      why: 'Per-request billing is linear, so constant load keeps paying for every request, while a VM costs the same busy or idle. Functions win when traffic is spiky or rare and the VM would mostly sit idle.',
    },
  ],
};

export default lesson;
