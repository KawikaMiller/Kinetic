import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Latency is how long one round trip takes; bandwidth is how fast bytes go once they flow. Small or chatty transfers are ruled by latency, and only a window at least the size of bandwidth × RTT lets you use all the bandwidth.',
    what: 'A network path has a round-trip time (RTT), set mostly by distance, and a bandwidth, the bits per second it can carry. Fetching anything costs some round trips (connection setup, the request) plus the bytes ÷ bandwidth. TCP can only have one window of unacknowledged bytes in flight, so throughput is the smaller of the bandwidth and window ÷ RTT. The bandwidth-delay product (bandwidth × RTT) is how many bytes must be in flight to keep the pipe full.',
    analogy: 'A motorway between two cities. Bandwidth is the number of lanes; latency is the length of the drive. Adding lanes doesn\'t get one car there sooner, and if you only own five cars and each must drive back before the next leaves, most of the lanes sit empty.',
    useCases: [
      'Why a page making 100 API calls across regions is slow on a fast connection',
      'Tuning TCP window sizes for long, fat links: backups, replication, transfers between data centres',
      'Deciding whether a feature needs a CDN or edge cache (cut the RTT) or a bigger pipe',
      'Reading a waterfall chart: which requests wait on round trips and which on bytes',
    ],
    why: 'The usual fix for "it\'s slow" is "buy more bandwidth", and for most API traffic it does nothing, because the time goes on round trips. Knowing when you\'re latency-bound (batch, cache, move closer) and when you\'re bandwidth-bound (compress, bigger pipe), and checking the window against the BDP, saves weeks of guessing. It builds on `tcp-udp` and `memory-hierarchy`.',
    watch: 'The pipe: a sender box on the left, a receiver on the right, and a pipe between whose length is the RTT and whose thickness is the bandwidth (both on log scales). Blue blocks are data in flight along the top lane, violet bars are ACKs returning along the bottom lane, and the dim grey part of the pipe is empty, unused capacity. The labels give the RTT, the bandwidth, and how many bytes one block stands for. Above it, the BDP readout is yellow and the throughput turns green when it reaches the link\'s full rate. In the plot, the blue curve is throughput against window size (both axes log), the green dashed line the bandwidth ceiling, the yellow dashed line the BDP, and the yellow dot your window. Transfer time: each file size has a bar split into amber (waiting on round trips) and sky blue (bytes on the wire), with its total and an amber "latency-bound" or blue "bandwidth-bound" chip. Chatty vs batched: on a time axis, the chatty lane is a run of red hatched segments, one round trip per call, and the batched lane one green bar; the totals above are red and green.',
  },
  tryThis: [
    'In The pipe, drag the window down from 5 MB to 64 KB on Cross-continent and watch the pipe empty out and the throughput drop.',
    'Pick Same rack, then Satellite (GEO): how big a window does each need to fill the pipe?',
    'In Transfer time, compare 10 KB and 1 GB, then double the bandwidth: which one cares?',
    'In Chatty vs batched, drag the bandwidth all the way up. Then drag the RTT down instead.',
  ],
  keyIdeas: [
    'Transfer time ≈ round trips × RTT + bytes ÷ bandwidth: small transfers are all round trips.',
    'Bandwidth-delay product = bandwidth × RTT: the bytes in flight needed to keep a link busy.',
    'Throughput = min(bandwidth, window ÷ RTT): a window under the BDP wastes the pipe.',
    'Chatty across a long RTT is slow at any bandwidth; batch, cache or move closer instead.',
  ],
  quiz: [
    {
      q: 'A dashboard makes 100 small API calls one after another to a server 80 ms away. The team doubles the bandwidth. What happens?',
      options: [
        'It barely speeds up: nearly all the time is round trips',
        'It loads about twice as fast, since bytes move twice as fast',
        'It slows down, because a bigger link adds queueing delay',
        'It speeds up only once the server CPU is upgraded too',
      ],
      answer: 0,
      why: '100 calls × 80 ms is 8 s of round trips, and the bytes themselves take a millisecond or two. Doubling bandwidth halves only that sliver. "Twice as fast" is the tempting answer, and it holds only for transfers big enough to be bandwidth-bound.',
    },
    {
      q: 'A 1 Gbit/s path has an 80 ms round trip. How many bytes must be in flight to keep it busy?',
      options: ['10 MB', '80 MB', '1.25 MB', '100 KB'],
      answer: 0,
      why: 'Bandwidth × RTT = 1,000,000,000 bits/s × 0.08 s = 80,000,000 bits, and ÷ 8 that is 10 MB. 80 MB forgets to turn bits into bytes, and 1.25 MB is one millisecond\'s worth, not 80.',
    },
    {
      q: 'The same 1 Gbit/s, 80 ms path, but the sender\'s window is 64 KB. Roughly what throughput does it get?',
      options: ['About 6.4 Mbit/s', 'The full 1 Gbit/s', 'About 800 Mbit/s', 'About 512 kbit/s'],
      answer: 0,
      why: 'One 64 KB window per 80 ms round trip is 64,000 × 8 ÷ 0.08 = 6.4 Mbit/s, under 1% of the link. The link speed only matters once the window reaches the BDP (10 MB here).',
    },
    {
      q: 'On a 1 Gbit/s link with an 80 ms RTT, which of these is latency-bound?',
      options: [
        'Fetching a 10 KB JSON response over a new connection',
        'Downloading a 1 GB disk image with a large window',
        'Copying 50 GB of backups with a well-tuned window',
        'Uploading a 4 GB video file with a large window',
      ],
      answer: 0,
      why: 'The 10 KB fetch spends three round trips (TCP, TLS, the request): 240 ms, against well under a millisecond of bytes. Every other transfer is big enough that bytes ÷ bandwidth (seconds to minutes) dwarfs the round trips.',
    },
    {
      q: 'A service calls another region 100 times to render one page. What fixes the slowness best?',
      options: [
        'Batch the calls into a few requests, or one',
        'Buy a link with ten times the bandwidth',
        'Compress every response with gzip first',
        'Give the service more CPU cores to work with',
      ],
      answer: 0,
      why: 'The page waits on 100 round trips; only fewer round trips (batching, caching, moving the data closer) shrink that. More bandwidth and compression shave the bytes, which were never the problem, and CPU doesn\'t shorten the distance.',
    },
  ],
};

export default lesson;
