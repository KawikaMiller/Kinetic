import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "The part of a job that can't run in parallel caps the speedup: with a serial fraction s, no number of cores gets past 1 / s.",
    what: "Amdahl's law: if a fraction s of a job has to run on one core, n cores give a speedup of 1 / (s + (1 − s) / n), which flattens out at 1 / s. Gustafson's law looks at it the other way round: keep the time fixed and grow the job with the cores, and the scaled speedup s + (1 − s) · n climbs almost in a straight line. Both are idealised; real coordination costs make the curve bend down past some core count.",
    analogy: 'A dinner party where chopping goes faster with every helper, but there is one oven for the cake: ten helpers finish the vegetables sooner, and everyone still waits for the cake.',
    useCases: [
      'Deciding how many build agents or CI shards are worth paying for',
      'Sizing thread pools and worker counts for a batch job',
      'Explaining why a parallel query or MapReduce job stops speeding up',
      'Capacity planning for clusters where the problem grows with the machines',
    ],
    why: 'Throwing cores at a slow job is the reflex fix, and it often disappoints. Amdahl tells you how much the serial part (start-up, linking, a single-threaded merge, a lock everyone takes) limits you before you buy the hardware, and points at the serial part as the thing to shrink.',
    watch:
      'The job bars are to scale against the one-core time: the serial part is orange and stays one lane, the parallel part is blue and splits into lanes (up to 8 drawn, the rest summarised), and the coordination overhead, when switched on, is red. In Gustafson mode the bars show the fixed time instead, and the one-core equivalent is stated, not drawn. On the log-log plot the thick blue curve is the current s and the yellow dot the current core count; the dashed grey line is perfect n× speedup and the faint dashed line the 1 / s ceiling. The dashed sky, violet, amber and pink curves are the 50%, 10%, 5% and 1% presets, hidden while overhead is on. With overhead, the red curve bends down and a green line marks the best core count. The preset chips use their curve colours and the build chip is orange.',
  },
  tryThis: [
    'Click the "Build: 20% linking" chip and push Cores to 256: the speedup crawls toward the 5× ceiling.',
    'Set the serial fraction to 5% and step Cores from 8 to 16: the caption shows the time drops by far less than half.',
    'Switch Law to "Gustafson (job grows)": 5% serial (here, the serial share of the parallel run’s time) gives over 240× at 256 cores, because the work grew too.',
    'Back in Amdahl, raise "Overhead per extra core": the red curve peaks, the green line marks the best core count, and more cores than that make it slower.',
    'Compare the dashed presets: 50% serial tops out at 2×, while 1% keeps climbing, to about 72× at 256 cores.',
  ],
  keyIdeas: [
    'Speedup on n cores is 1 / (s + (1 − s) / n), and it can never pass 1 / s.',
    'Doubling the cores halves the run time only if nothing at all is serial.',
    'Gustafson: when the work grows with the cores, scaled speedup s + (1 − s) · n grows almost linearly.',
    'Coordination costs make the speedup peak and then fall: more cores can make a job slower.',
  ],
  quiz: [
    {
      q: 'A job is 10% serial and runs on 8 cores. You double to 16 cores. What happens to the run time?',
      options: ['It drops by about 26%', 'It drops by exactly 50%', 'It drops by about 10%', "It doesn't change at all"],
      answer: 0,
      why: 'The 10% serial part does not shrink: 0.1 + 0.9 / 8 = 0.2125 of the one-core time becomes 0.1 + 0.9 / 16 ≈ 0.156, a 26% cut. Exactly half would need the whole job to split across the cores, which is the misconception.',
    },
    {
      q: 'A build is 20% serial (linking). What is the most that any number of cores can speed it up?',
      options: ['5×', '20×', '80×', 'No limit'],
      answer: 0,
      why: '1 / s = 1 / 0.2 = 5. Even with endless cores the linking still takes 20% of the original time. 20× and 80× don’t come out of the formula at all: only with no serial part would the speedup keep growing, to n on n cores.',
    },
    {
      q: "Why can huge clusters still pay off despite Amdahl's law?",
      options: [
        'The job grows with the cluster, so serial work matters less',
        "Amdahl's law only applies to programs running on one machine",
        'Their cores run faster than the cores in a laptop do',
        'They remove the serial part by adding more memory',
      ],
      answer: 0,
      why: "Gustafson's view: keep the time fixed and give each core more work. The serial part stays the same size while the parallel part grows, so the scaled speedup climbs almost linearly. Amdahl's law still holds on a cluster, for a job of fixed size.",
    },
    {
      q: 'With a coordination cost for every extra core, what happens as you keep adding cores?',
      options: ['Speedup peaks, then falls', 'Speedup keeps rising forever', 'Speedup stays at exactly 1/s', 'Speedup becomes exactly n'],
      answer: 0,
      why: 'Each extra core adds a little coordination time while the parallel saving keeps shrinking, so the run time is lowest at n* = √((1 − s) / c). Past that, more cores make the job slower. Without the cost, it would keep rising toward 1 / s but never reach it.',
    },
  ],
};

export default lesson;
