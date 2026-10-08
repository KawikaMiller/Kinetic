import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A server has a handful of hard limits it never mentions until it hits one: disk bytes, inodes, file descriptors, database connections, ephemeral ports and memory. Each fills quietly, fails with its own error, and drags others down with it. Watch the gauges and alert at 80%.',
    what: 'Each resource has a ceiling: free bytes on the disk, the count of inodes (the records that name files), the per-process limit on open descriptors, the size of a connection pool, the range of local ports for outgoing connections (counted per destination address and port) and the container memory limit. A leak fills one of them a little with every request. When it reaches the ceiling the system returns a specific error (ENOSPC, EMFILE, EADDRNOTAVAIL, a pool timeout, an OOM kill with exit code 137), and the failure spreads: a full disk stops log writes, the health check, if it writes a log, fails, and the orchestrator restarts a process into the same full disk. A restart clears a leaked descriptor, connection or byte of memory but not a full disk, so the leak just starts over. The mechanisms are taught in the lessons linked on each gauge; this one is about seeing the limits together.',
    analogy: 'A restaurant kitchen has more than one thing that can run out: clean plates, burners, tickets on the rail, fridge space. Service stops when any one is gone, and a manager who only watches the plates is surprised when it is the burners.',
    useCases: [
      'Setting alerts at 80% of every limit, so a leak becomes a warning hours before an outage',
      'Reading an error like ENOSPC, EMFILE or EADDRNOTAVAIL and knowing which gauge to check first',
      'Explaining why "disk full" with free bytes means inodes, and why a restart is not a fix',
      'Reviewing code for the usual leaks: unclosed sockets, unreturned connections, unbounded caches, unrotated logs',
    ],
    why: 'Resource exhaustion is the common cause behind outages that look unrelated, and the symptoms mislead: requests that hang for 30 seconds point at the pool, not the network. It builds on `file-descriptors`, `connection-pooling`, `memory-leaks`, `file-systems` and `sockets-api`, which teach the mechanisms this lesson only puts side by side. Planning how much capacity to buy is a different problem and is not covered here.',
    watch: 'Each gauge bar is blue while it fills, yellow once it passes the orange alert line at 80%, and red at its limit. A grey gauge is idle: no enabled leak touches it. In the cascade, the first limit hit is red and the effects it sets off are orange. In the games the culprit is green and the ruled-out gauges grey. Green and red here are about status, not about different categories.',
  },
  tryThis: [
    'In Gauges the default leaks are unrotated logs and tiny temp files, with the clock at 20 hours: the inode gauge is red at its limit while disk bytes is yellow with about 18 GiB still free. Switch off "Logs never rotated" and the disk drops under half full while the inodes still run out. ENOSPC does not always mean out of bytes.',
    'Press "all" under Alert at 80% and drag the clock back to 0 and play it: every gauge that will fail raises an alert first. Note how much earlier each one fires, and that the port gauge only gives seconds.',
    'Switch off the default leaks and turn on "A new outbound connection per request", then raise Traffic past 470 requests a second (the exact edge is 468 fits, 469 does not, because other connections already hold about 150 ports): the ephemeral ports run out within a minute, and no amount of waiting makes that worse or better.',
    'Open The cascade after each different first failure and compare the orange effects, then read the last bar: which restarts bring the problem straight back?',
    'Play Find the limit: read each symptom and check a gauge. A wrong guess costs ten minutes and shows how full that gauge really was.',
  ],
  keyIdeas: [
    'Every limit has its own error name, and the name tells you which gauge to read first: ENOSPC is disk or inodes, EMFILE is descriptors, EADDRNOTAVAIL is ports, exit code 137 is the OOM killer.',
    'The first limit hit spreads: logs, health checks and restarts depend on the same resources, so one full gauge becomes a chain of failures.',
    'A restart is not a fix. It frees a leaked descriptor, connection or memory, but a full disk stays full and a leak refills the limit on its own schedule.',
    'Alert at 80% of every limit. A gauge that only alerts when it is already at 100% turns a slow leak into an outage.',
  ],
  quiz: [
    {
      q: 'A service cannot create files and logs ENOSPC, but df shows the disk is 44% full. What is most likely exhausted?',
      options: [
        'The inodes, which name files, even though bytes are free',
        'The write cache, which holds data not yet put on disk',
        'The disk quota for the other users on the same machine',
        'The read cache, which must be emptied before a write',
      ],
      answer: 0,
      why: 'ENOSPC is returned when either bytes or inodes run out. In the lesson, with only the temp-file leak switched on, a flood of tiny temp files fills all 6,553,600 inodes while the disk is still under half full (44%); df -i shows the inode count. With the logs leak also on, the disk is already yellow by then, but the inodes are still what stops file creation.',
    },
    {
      q: 'Each new outbound connection takes a local port and keeps it for 60 seconds after closing. With the Linux default range of 28,232 ports, about when does a service opening one connection per request to a single upstream address and port run out?',
      options: [
        'Around 470 requests a second',
        'Around 47 requests a second',
        'Around 4,700 requests a second',
        'Around 28,000 requests a second',
      ],
      answer: 0,
      why: 'In steady state the ports in use are the request rate times 60 seconds, so 28,232 divided by 60 is about 470 a second. In the lesson about 150 ports are already held by other connections, which moves the exact edge to 468 fits and 469 does not. Real limits are counted per destination address and port, so spreading calls over many upstreams, keep-alive or pooling raise it. It happens within a minute of the traffic arriving, not after hours of leaking.',
    },
    {
      q: 'After a restart, a service works for about 11 hours and then fails the same way again. What does that pattern most suggest?',
      options: [
        'A leak refills a limit after each restart, such as open descriptors',
        'The restart did not clear the file system, so it is still full',
        'The restart lowered every limit, so they are hit sooner each time',
        'The orchestrator is restarting it slowly because it is overloaded',
      ],
      answer: 0,
      why: 'A restart frees descriptors, connections and memory, so a leak of one of them starts again from the baseline and reaches the limit on the same schedule: about 10.7 hours for the lesson\'s leaked sockets at 100 requests a second. A full disk would fail at once, not 11 hours later.',
    },
    {
      q: 'With the default leaks, the inode gauge hits its limit after about 17.6 hours. How much earlier does an alert at 80% of its limit fire?',
      options: [
        'About 3.6 hours earlier',
        'About 14 hours earlier',
        'About 20 minutes earlier',
        'It fires at the same moment',
      ],
      answer: 0,
      why: 'The gauge grows by 360,000 inodes an hour, so it passes 80% (5,242,880) after about 14.0 hours and 100% after about 17.6, which leaves about 3.6 hours. For a steadily filling gauge the 80% alert always comes first, with a warning that scales with the fill rate.',
    },
    {
      q: 'A container disappears every few hours, its own logs show nothing, and its exit code is 137. What happened?',
      options: [
        'The kernel killed it with SIGKILL for going over its memory limit',
        'The process exited by itself after catching an unhandled error',
        'The orchestrator stopped it politely, and it shut down with code 137',
        'The disk filled up, so the exit code could not be written to the log',
      ],
      answer: 0,
      why: 'An exit code above 128 means a signal: 137 is 128 plus 9, SIGKILL. The OOM killer cannot be caught, so the process has no chance to log anything. In the lesson the unbounded cache reaches the 2 GiB limit and its cascade has no health-check step, because the restart follows the kill directly.',
    },
  ],
};

export default lesson;
