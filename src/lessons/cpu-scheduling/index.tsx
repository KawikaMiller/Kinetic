import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When more jobs are ready than there are CPUs, the scheduler picks who runs next, and every policy trades average speed, responsiveness and fairness differently.',
    what: 'A job alternates CPU bursts with waits for I/O. FCFS runs jobs in arrival order. SJF picks the shortest next burst, and SRTF also preempts the running job for a shorter one. Round robin (RR) gives each job a fixed quantum in turn. MLFQ keeps several queues: a job that uses its whole quantum drops a level, one that blocks early stays high, and a periodic boost lifts everyone back up. What Linux actually uses is fair share by virtual runtime (CFS, now EEVDF), which this lesson doesn\'t model.',
    analogy: 'One checkout lane. Serving in arrival order is fair until someone with a full trolley gets there first. Letting "just a few items" jump ahead is fastest on average, until the trolley never gets served.',
    useCases: [
      'Why a laptop stays responsive while a compile hogs the CPU',
      'Job queues (CI runners, batch clusters) that weigh short jobs against long ones',
      'Tuning time slices and priorities (nice values) on busy servers',
      'Interview questions on average waiting time, convoys and starvation',
    ],
    why: 'Every program you run competes for the CPU. Knowing the policies explains why a UI stutters under load, why a long batch job can sit forever behind small ones, and why "just make the time slice smaller" stops helping once switches eat the CPU. It builds on `interrupts-context-switch` (how the OS takes the CPU back) and `processes-threads`.',
    watch: 'The CPU lane shows who runs each tick; below it each job has its own lane. Each job has its own colour (sky, pink, orange, then grey; past four jobs the colours repeat and the names tell them apart). Solid = running, hatched = waiting in the ready queue, dashed outline = blocked on I/O. A yellow outline marks the slice running now, and the yellow line is the current time. Violet slivers are context switches and dark grey is the CPU sitting idle. Blue cells are the jobs in the ready queue (three queues, Q0 to Q2, for MLFQ). In the job table a red waiting number marks a starving job, and red text is a refused edit; in the compare table green marks the best value in each column.',
  },
  tryThis: [
    'Load "Convoy" under FCFS, then switch the Policy to SJF: the three short jobs stop waiting behind Big.',
    'Load "Starvation" (SJF) and play: Long\'s waiting number turns red as short jobs keep cutting in. Then pick RR.',
    'Load "Quantum too small", then drag Switch cost to free: the violet slivers vanish and everything finishes sooner.',
    'Press "Compare all" on "Interactive + batch": no policy wins every column. Which one would you pick for a laptop?',
    'Type 99, -1 or 2/0 into the job table: each is refused with a reason and the schedule keeps its last good value.',
  ],
  keyIdeas: [
    'FCFS is simple, but one long job makes everyone behind it wait: the convoy effect.',
    'SJF and SRTF minimise average waiting, but they need burst lengths and can starve long jobs.',
    'Round robin buys response time with turnaround; a tiny quantum drowns in switch cost.',
    'MLFQ learns from behaviour: CPU hogs sink, interactive jobs stay on top, and boosts stop starvation.',
  ],
  quiz: [
    {
      q: 'P1 needs 24 ticks, P2 and P3 need 3 each, and all arrive at t = 0 in that order. What is the average waiting time under FCFS?',
      options: ['17 ticks', '3 ticks', '10 ticks', '27 ticks'],
      answer: 0,
      why: 'P1 waits 0, P2 waits 24 and P3 waits 27: 51 / 3 = 17. Running the two short jobs first (SJF) gives 6, 0 and 3, an average of 3. That gap is the convoy effect.',
    },
    {
      q: 'Why isn\'t round robin with a small quantum always the best policy?',
      options: [
        'Switches cost time, and turnaround stretches out',
        'It can starve a long job forever, unlike SJF',
        'It needs to know every job\'s burst length first',
        'It only works when all jobs arrive at the same time',
      ],
      answer: 0,
      why: 'RR is great for response time, but every quantum boundary can mean a context switch, and finishing everyone a bit at a time delays every job\'s completion. RR doesn\'t starve anyone, which is SJF\'s weakness, not RR\'s.',
    },
    {
      q: 'In the Starvation preset, SJF has the lowest average waiting time. What\'s the catch?',
      options: [
        'The long job waits while short ones keep jumping in',
        'SJF\'s average waiting time is actually the worst one',
        'Short jobs have to wait for the long job to finish',
        'Every short job is preempted halfway through its run',
      ],
      answer: 0,
      why: 'Average waiting hides the worst case. Each new short job beats Long to the CPU, so Long waits 12 ticks, while plain FCFS never makes any job wait more than 9. The average really is the lowest, which is why SJF is tempting.',
    },
    {
      q: 'In MLFQ, what happens to a job that uses its whole quantum?',
      options: ['It drops to a lower-priority queue', 'It moves up to a higher-priority queue', 'It is killed and has to start over', 'It keeps the CPU until it finishes'],
      answer: 0,
      why: 'Using the whole quantum looks like a CPU hog, so the job sinks a level, where quanta are longer but priority is lower. Jobs that block early (interactive ones) stay on top, and a periodic boost lifts everyone back so sunk jobs don\'t starve.',
    },
    {
      q: 'Why can\'t a real OS simply run SRTF everywhere?',
      options: ['It can\'t know how long each job will run', 'Preemption is not possible on modern CPUs', 'It gives the worst average waiting time', 'It only supports up to three jobs at once'],
      answer: 0,
      why: 'SRTF needs each job\'s remaining burst, which the OS can only guess from past behaviour. Preemption itself is routine: the timer interrupt makes it possible.',
    },
  ],
};

export default lesson;
