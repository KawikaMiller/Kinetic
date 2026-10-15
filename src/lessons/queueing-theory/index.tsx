import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Queues grow as 1/(1 − ρ), not in a straight line: the last stretch of utilisation costs far more waiting than the first, and variable work makes it worse.',
    what: 'A queue forms whenever work arrives randomly at a server that takes time to serve it. For one server with Poisson arrivals and exponential service (M/M/1), the average time in the system is 1/(μ − λ): 5 service times at 80% busy, 10 at 90%, 100 at 99%. Little\'s Law, L = λ × W, ties the number in a system to the arrival rate and the time spent there, for any stable system. Service-time variability multiplies the wait (Pollaczek-Khinchine), and one shared queue in front of several servers waits less than separate queues.',
    analogy: 'A single checkout lane that takes about a minute per customer. At half load a customer rarely waits long; as the lane fills toward always busy, any small bunching of arrivals leaves a line that takes a long time to clear, because there is no idle time to catch up in.',
    useCases: [
      'Explaining why a service that is 90% utilised has long and erratic latency',
      'Sizing connection pools and worker pools from requests per second × seconds each',
      'Choosing between one shared queue and many separate queues in front of workers',
      'Judging how much a high-variance dependency (a slow query now and then) inflates waiting',
    ],
    why: 'Capacity targets, autoscaling thresholds and latency budgets all rest on how waiting grows with load. Knowing that the curve has no corner, that variability multiplies waits and that Little\'s Law holds for any boundary lets you reason about queues without simulating them, and tells you when a surprising number is a modelling assumption failing.',
    watch: 'One server: blue squares are waiting jobs, the yellow square is the job in service and the grey ones just finished; a red chip says how many more are waiting than the icons show. Each stat reads "measured so far" in blue above "theory" in violet, and ρ turns red at 100% and above, where no theory is shown. Little\'s Law: the blue step line is the number of jobs present, the violet fill is the area under it, and the stats compare that area with the sum of the jobs\' times. Fast server or a pool: each layout has its own colour edge (a plain category); a green number is the shorter time in its column. The curve: the violet line and hollow violet marks are the M/M/1 theory, the yellow rule is your ρ and the blue dot is the measured value.',
  },
  tryThis: [
    'In One server (M/M/1 at ρ = 80%), theory reads W = 0.5 s, five service times. Drag ρ to 90%: W doubles to 1 s.',
    'In One server, switch Service time to deterministic: the wait Wq halves from 0.4 s to 0.2 s. Switch to high variance: it becomes 1 s.',
    'In One server, drag ρ to 120%: the theory lines say there is no steady state and the queue keeps growing past the icons.',
    'In Little\'s Law, the area under N(t) and the sum of the jobs\' times agree to rounding. Pick "queue only": Lq = λ × Wq.',
    'In Fast server or a pool? (ρ = 70%), the shared queue has the shortest wait, but the single fast server has the shortest time in system.',
  ],
  keyIdeas: [
    'Little\'s Law, L = λ × W, holds for any stable system and any boundary you draw: the whole system, just the queue, or just the server.',
    'Waiting grows like 1/(1 − ρ): 80% busy is 5 service times in the system, 90% is 10, 99% is 100, and the curve has no corner.',
    'Variability builds queues: at the same utilisation and mean service time, CV² = 4 waits 2.5 times as long as exponential service, and deterministic service half as long.',
    'Pooling servers behind one queue cuts waiting at the same capacity, and one faster server still cuts time in system, because each job is served sooner.',
  ],
  quiz: [
    {
      q: 'A single server (M/M/1) goes from 80% to 90% utilised. What happens to the average time a job spends in the system?',
      options: [
        'It roughly doubles, from 5 service times to 10',
        'It grows about 12%, in step with the load',
        'It barely moves until the server is 100% busy',
        'It rises by 10%, matching the extra load',
      ],
      answer: 0,
      why: 'W = 1/(μ − λ), which is 5 service times at ρ = 0.8 and 10 at ρ = 0.9. The curve bends continuously, so waiting is steep well before 100%, and "just 20% worse than 60%" is the tempting mistake.',
    },
    {
      q: 'A service handles 1,200 requests per second and each request spends 25 ms inside it on average. How many requests are in flight on average?',
      options: ['30', '48', '300', '1,200'],
      answer: 0,
      why: 'Little\'s Law: L = λ × W = 1,200/s × 0.025 s = 30. Dividing the rate by the time gives 48, and 1,200 is the arrival rate, not the number in flight.',
    },
    {
      q: 'Two servers run at the same utilisation with the same mean service time, but the second has much more variable service (CV² = 4 against 1). What happens to its mean wait in the queue?',
      options: [
        'It is 2.5 times as long as the first server\'s',
        'It is the same, because the mean service time matches',
        'It is 4 times as long, one for each unit of CV²',
        'It is half as long, because variable service evens out',
      ],
      answer: 0,
      why: 'Pollaczek-Khinchine: the wait scales with (1 + CV²)/2, which is 2.5 at CV² = 4 and 1 at CV² = 1. Equal means do not give equal waits.',
    },
    {
      q: 'Four servers with one queue each are rebuilt as four servers sharing one queue, with the same arrivals and capacity. What changes in this model?',
      options: [
        'Waits shrink, since no server idles while a job waits',
        'Waits grow, since jobs now compete for one line',
        'Nothing, since the total capacity is unchanged',
        'Waits shrink only if each server also gets faster',
      ],
      answer: 0,
      why: 'In a shared queue a free server takes the next waiting job, so capacity is not stranded behind another server\'s line. Total capacity is the same, but the mean wait falls.',
    },
  ],
};

export default lesson;
