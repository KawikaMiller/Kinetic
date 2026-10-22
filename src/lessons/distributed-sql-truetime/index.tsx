import type { LessonModule } from '../../core/types';
import { decimal } from '../../core/format';
import { BROKEN_SEED, DEFAULT_OPTIONS, raceInput, sweepModel } from './seeded';
import { Stage } from './Stage';
import { PRESET_TWO_SHARD, breakProbability, race, twoShardCommit } from './truetime';

const pct = (x: number) => `${decimal(100 * x, 1)}%`;
const closedOf = (o: typeof DEFAULT_OPTIONS) => breakProbability({ delta: o.delta, epsilon: o.epsilon, gapMax: o.gapMax, commitWait: o.commitWait });

const off = DEFAULT_OPTIONS;
const waitOn = { ...DEFAULT_OPTIONS, commitWait: true };
const smallEps = { ...waitOn, epsilon: 1 };
const farOff = { ...waitOn, delta: 25 };
const offRun = race(raceInput(BROKEN_SEED, off));
const waitRun = race(raceInput(BROKEN_SEED, waitOn));
const sweeps = { off: sweepModel(off), wait: sweepModel(waitOn), small: sweepModel(smallEps), far: sweepModel(farOff) };
const preset = twoShardCommit(PRESET_TWO_SHARD);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A clock that admits its error can order global transactions: a commit waits out the uncertainty, 2ε in this model, so a transaction that starts after another was acknowledged gets a larger timestamp, as long as every clock is within the assumed bound.',
    what: 'Each shard leader reads a clock with an error and takes the latest end of its uncertainty interval as the commit timestamp. Without a wait, a transaction that starts after an acknowledgement can still get an earlier timestamp and miss the write. With commit wait it cannot, while the clocks are within ε. You run the race on seeded clocks, see how often it breaks, read versions at a timestamp across two shards, and watch a two-phase commit choose the maximum prepare timestamp.',
    analogy: 'Two clerks stamp receipts with watches that may be a few minutes off. Each stamps the latest time its watch could possibly mean, then waits until even the earliest possible time has passed that stamp before handing the receipt over, so a receipt stamped later is later.',
    useCases: [
      'Reading how a globally distributed SQL database orders transactions (named only, from memory)',
      'Reasoning about the latency a design pays for external consistency',
      'Choosing a read timestamp for a consistent snapshot across shards',
      'Comparing commit wait with the uncertainty restarts of hybrid-clock designs',
    ],
    why: 'Ordering by clocks is cheap until a clock is wrong. Knowing which bound a design waits out, and what breaks when a clock exceeds it, tells you what the latency buys and what to monitor.',
    watch:
      'The two shards are plain categories (amber and sky). A commit timestamp is yellow, the commit-wait bar is violet and the uncertainty interval is blue. A violation, where T2 is timestamped earlier than T1, is red and an ordered pair is green. The closed-form curve is dashed grey, and replicas drawn dashed are shown, not run. The chips say what is simulated, illustrative, a toy or from memory.',
  },
  tryThis: [
    `Read the lane on seed ${BROKEN_SEED}: T2 started after T1 was acknowledged but took timestamp ${decimal(offRun.s2, 1)} against T1's ${decimal(offRun.s1, 1)}, so its read misses the write. The sweep line reads ${sweeps.off} of 200 seeds, ${pct(sweeps.off / 200)}, beside ${pct(closedOf(off))} in closed form.`,
    `Turn commit wait on: the acknowledgement moves ${decimal(waitRun.waitMs, 0)} ms later, T2 is ordered on this seed (${decimal(waitRun.s2, 1)} against ${decimal(waitRun.s1, 1)}), the bill reads ${decimal(waitRun.waitMs, 0)} ms, and the sweep line falls to ${sweeps.wait} of 200.`,
    `Lower ε to 1 with the wait still on: the order breaks again on ${sweeps.small} of 200 seeds, ${pct(sweeps.small / 200)}, against ${pct(closedOf(smallEps))} in closed form.`,
    `Raise δ to 25 with ε back at 7: the guarantee fails on ${sweeps.far} of 200 seeds because the clocks are further off than the system assumed.`,
    `Open Two shards, two-phase commit and load the preset: prepare timestamps ${preset.prepares[0]} and ${preset.prepares[1]} give commit timestamp ${preset.commitTimestamp}, and a wait of ${preset.waitMs} ms.`,
  ],
  keyIdeas: [
    'Commit wait trades latency for order: a write waits out 2ε after taking its timestamp, so a transaction that starts after the acknowledgement gets a larger one, assuming every clock is within ε of true time.',
    `ε is the assumed bound and δ the actual error. With the wait on, the order breaks when two clocks differ by 2ε plus the gap or more, in closed form ${pct(closedOf(smallEps))} at ε = 1 and 0 at ε = 7 for δ = 7 and G = 5, and the 200 seeds agree.`,
    'A snapshot read at a timestamp returns the latest version at or below it, so a transaction that wrote two shards at one timestamp is visible on both or on neither.',
    'The price is latency and throughput: each write waits 2ε, so serial writes to one key commit at most 1000 / (2ε) per second in this model. The replication of each shard is shown, not run, and the Spanner and CockroachDB descriptions are from memory.',
  ],
  quiz: [
    {
      q: 'What does commit wait buy?',
      options: [
        'A later transaction gets a larger timestamp, while clocks stay within ε',
        'Faster commits, since the leader can batch other work while it is waiting',
        'Agreement among replicas about the order of the entries in the log',
        'Protection against a crash of the shard leader during the commit',
      ],
      answer: 0,
      why: 'The wait pushes the acknowledgement past the end of the timestamp\'s uncertainty, so a transaction that starts afterwards takes a larger timestamp as long as the clocks stay inside the bound. It makes commits slower, and replication agreement is the consensus group\'s job.',
    },
    {
      q: 'Why does the model wait 2ε and not ε?',
      options: [
        'Because a commit needs two network round trips to finish',
        'Because an error of ε on each side can put two clocks 2ε apart',
        'Because every transaction needs a second timestamp to verify the first',
        'Because the interval has two ends, so the wait is doubled for style',
      ],
      answer: 1,
      why: 'Each clock may be off by up to ε in opposite directions, so the next leader\'s clock can read 2ε below the first one\'s. Waiting 2ε covers that gap.',
    },
    {
      q: 'A clock is 25 ms off while ε is 7 ms. What can happen?',
      options: [
        'Nothing, since commit wait always orders the transactions correctly',
        'A later transaction can get an earlier timestamp and miss a write',
        'The commit wait grows until the clock has been corrected again',
        'The transaction aborts before it can ever be acknowledged to the client',
      ],
      answer: 1,
      why: 'The wait covers only the bound the system assumed. A clock outside it can make a later transaction take a smaller timestamp, and the sweep shows the order breaking on a share of seeds.',
    },
    {
      q: 'x@5 = a, x@12 = b, x@20 = c. What does a snapshot read at 19 return?',
      options: [
        'c, the newest version in the table, whatever the timestamp',
        'a, the oldest version that is still visible to readers',
        'Nothing, because 19 is not the timestamp of any version',
        'b, the latest version whose timestamp is at or before 19',
      ],
      answer: 3,
      why: 'A snapshot read returns the latest version at or below its timestamp. Version 20 is in the future of this read and version 5 has been overwritten by 12.',
    },
    {
      q: 'ε = 7 ms. By this model, how many serial writes to one key can commit per second?',
      options: [
        '142, which is 1000 divided by 7, forgetting the doubling',
        '71, because 1000 divided by the 14 ms wait is about 71',
        '14, because each commit waits 14 ms before it finishes',
        '500, which is the figure for ε = 1 instead of ε = 7',
      ],
      answer: 1,
      why: 'Each write waits 2ε = 14 ms before the next can take a larger timestamp on that key, so 1000 / 14 is about 71 per second. This is a statement about the model, not a measurement of any product.',
    },
  ],
};

export default lesson;
