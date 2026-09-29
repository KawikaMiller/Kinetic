import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A load balancer spreads incoming requests across several servers. How it picks a server decides whether one slow or dead machine drags everyone down.",
    what: "Clients talk to one address, the load balancer, which forwards each request to one of many backend servers. Simple strategies like round robin and random ignore how busy each server is. Load-aware ones like least connections and power of two choices look at current load and steer around struggling servers. Health checks pull dead servers out, but only after a delay.",
    analogy: "Supermarket checkouts. Round robin sends each shopper to the next till in turn, even the one staffed by a trainee. Least connections sends you to the shortest line.",
    useCases: [
      "Nginx, HAProxy, AWS load balancers, Kubernetes Services",
      "Scaling a web tier horizontally by adding servers",
      "Rolling deploys and taking servers out for maintenance",
      "Surviving a server failure without users noticing",
    ],
    why: "Every system bigger than one server has a load balancer somewhere, and its strategy directly shapes tail latency (p99) and what happens when things fail. Seniors are expected to choose it deliberately and understand health checks, not just \"add a load balancer\".",
    watch: "Blue dots are requests, yellow squares are requests waiting in a server's queue, green dots are responses, and red means failed. The ring on each server shows how busy it is. Click a server to kill it. The chart runs every strategy on the same traffic, so their p99 lines compare fairly.",
  },
  tryThis: [
    'Leave "One slow server" on and flip between Round robin and Least conn. Watch api-5\'s queue.',
    'Click a server to kill it. Count the red failures before the health check pulls it.',
    'Kill a server while on Least conn: it looks "idle", so it gets flooded.',
    'Hit Traffic spike and compare the p99 lines in the chart.',
  ],
  keyIdeas: [
    'Blind strategies (round robin, random) ignore how busy a server is.',
    'Load-aware strategies (least connections, power of two) route around slow or overloaded servers.',
    'p99 latency shows the pain that averages hide.',
    'Health checks are delayed, so you always send some traffic to a dead box first.',
  ],
  quiz: [
    {
      q: 'One server is 4× slower than the rest. Which strategy keeps overloading it?',
      options: ['Least connections', 'Round robin', 'Power of two choices', 'None of them'],
      answer: 1,
      why: 'Round robin hands every server the same share regardless of how fast it drains its queue.',
    },
    {
      q: 'Why is "power of two choices" popular at huge scale?',
      options: [
        'It never picks a busy server',
        'It checks only 2 servers per request yet gets most of least-conn\'s benefit',
        'It needs no health checks',
        'It guarantees equal load',
      ],
      answer: 1,
      why: 'Comparing two random servers avoids the worst choices without every LB tracking every server\'s exact load.',
    },
    {
      q: 'Why did requests fail right after a server died, even with health checks?',
      options: [
        'The LB was misconfigured',
        'Health checks run periodically, so there\'s a window before the LB notices',
        'Clients retried too fast',
        'Least connections is broken',
      ],
      answer: 1,
      why: 'Detection takes a few failed checks; retries and outlier detection help cover that gap.',
    },
  ],
};

export default lesson;
