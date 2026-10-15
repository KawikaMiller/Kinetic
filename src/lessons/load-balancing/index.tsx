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
    why: "Most systems with more than one server have a load balancer somewhere (a cloud load balancer, a proxy, a Kubernetes Service), and its strategy directly shapes tail latency (p99) and what happens when things fail. Seniors are expected to choose it deliberately and understand health checks, not just \"add a load balancer\".",
    watch: "Blue dots are requests, yellow squares are requests waiting in a server's queue (red when it is nearly full), green dots are responses, and red rings mark requests that failed or were dropped. The ring on each server shows how busy it is: green, then yellow, then red as it fills. A server that has died gets a red outline and says DOWN. Click a server box, or use the server buttons, to kill or revive it. The chart runs every strategy on the same seeded traffic, so their p99 lines compare fairly; the chips say the traffic is simulated and the speeds and delays are illustrative.",
  },
  tryThis: [
    'Leave "One slow server" on and flip between Round robin and Least conn. With round robin api-5\'s queue fills up and requests are dropped; with least connections it stays short.',
    'Click a server (or its button) to kill it. Count the red failures before the health check pulls it, then watch them stop.',
    'Pick Least conn, let it run for ten seconds or so, then kill a server: its count drops to zero, so it looks idle and gets more than its share of requests until the health check catches up.',
    'Let it run for about ten seconds, then hit Traffic spike and compare the p99 lines in the chart: round robin and random end up highest.',
  ],
  keyIdeas: [
    'Blind strategies (round robin, random) ignore how busy a server is.',
    'Load-aware strategies (least connections, power of two) route around slow or overloaded servers.',
    'p99 latency shows the pain that averages hide.',
    'Health checks are delayed, so some requests go to a dead server before the balancer notices.',
  ],
  quiz: [
    {
      q: 'One server is 4× slower than the rest. Which strategy hands it the same share as the others?',
      options: [
        'Least connections, which splits traffic evenly',
        'Round robin, which deals out requests in turn',
        'Power of two choices, which always picks the slowest',
        'Weighted round robin with weights that match the speeds',
      ],
      answer: 1,
      why: 'Round robin deals requests out in turn, so the slow server gets as many as the rest and its queue grows. Weighted and load-aware strategies adapt to it.',
    },
    {
      q: 'Why is "power of two choices" popular at huge scale?',
      options: [
        'It never picks a busy server, so queues can never form anywhere',
        'It compares only two servers and still avoids the worst picks',
        'It needs no health checks because it samples live servers',
        'It gives every server exactly the same load at all times',
      ],
      answer: 1,
      why: "Comparing two random servers avoids the worst choices without the balancer tracking each server's exact load.",
    },
    {
      q: 'Why did requests fail right after a server died, even with health checks?',
      options: [
        'The balancer was misconfigured and skipped its health checks',
        'Health checks run on a timer, so there is a window before it notices',
        'Clients retried too fast and overloaded the already dead server',
        'Least connections is broken and cannot see failed requests',
      ],
      answer: 1,
      why: 'Detection takes a few failed or missed checks; retries and outlier detection help cover that gap.',
    },
    {
      q: 'A team says "least connections is the best strategy, full stop". When can it hurt?',
      options: [
        'A dead server with zero connections looks idle until a health check removes it',
        'It cannot see which server is slow, so it splits the traffic evenly anyway',
        'It needs every client to remember which server it used last time',
        'It only works when all the servers have exactly the same speed',
      ],
      answer: 0,
      why: "A server that has just died holds no connections, so its count looks lowest and it keeps being picked until the health check pulls it. That is why health checks matter even with a load-aware strategy.",
    },
  ],
};

export default lesson;
