import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Capacity math is unit arithmetic: turn users into requests per second, requests into bytes and servers, check the answer is in the right units, and aim to be right within a factor of ten.',
    what: 'A back-of-the-envelope estimate chains a few multiplications: daily users × actions ÷ seconds per day gives requests per second; record size × writes × retention × replicas gives storage; payload × rate gives bandwidth; peak ÷ per-server capacity gives servers. Carrying the units through each step catches the common slips (bits against bytes, TB against TiB, per day against per second). The latency ladder adds how long each kind of step takes, so a request path can be summed against a budget.',
    analogy: 'Estimating how many pizzas a party needs: guests × slices each ÷ slices per pizza. You do not need the exact guest count, only the right units and the right order of magnitude, and you add a few extra for the hungry ones.',
    useCases: [
      'System design interviews and design docs: sizing a service before building it',
      'Checking a vendor quote, a cloud bill or a capacity plan for a plausible order of magnitude',
      'Deciding whether one machine, one database or one network link can carry a workload',
      'Spotting a unit slip in a dashboard: bits against bytes, per second against per minute',
    ],
    why: 'Most early design decisions are made with numbers nobody has measured yet. A quick, unit-checked estimate shows whether an idea is feasible, which resource will run out first and which assumptions matter, long before any benchmark exists. It also gives you a sanity check on every later number.',
    watch: 'Blue numbers are inputs you set and yellow ones are quantities derived from them; in the unit strip a grey struck-through unit is one that cancels. A red line is a refusal of text that is not a plain number; the grey worked example under the unit strip shows the unit algebra refusing to add bytes to bits. In the latency scene the stacked bar has one colour per kind of step and the target is marked green while the path is inside the budget and red once it is over. In the server scene yellow squares are the servers the peak needs and violet ones are redundancy. In the guess scene the error is green within a factor of ten and red beyond it.',
  },
  tryThis: [
    'In Users to QPS, as loaded, read 11,574 requests per second on average and 34,722 at peak; switch seconds per day to 100,000 and the rate drops to 10,000, about 14% low.',
    'In Storage and bandwidth, as loaded, a million 1,000-byte writes a day kept a year with 3 replicas is 1.095 TB; switch to binary units and the same bytes read 0.996 TiB.',
    'In How many servers?, as loaded, a 50,000 requests per second peak needs 53 servers; choose N + 1 and it becomes 54.',
    'In The latency ladder, as loaded, the path adds up to about 10 ms, inside the 200 ms budget; give it two cross-continent round trips and it goes over.',
    'In Guess first, pick 10⁴ for the chat app: the answer is 11,574 requests per second and you are 0.06 orders low. Pick 10³ and you are more than a factor of ten off.',
  ],
  keyIdeas: [
    'Carry the units: users/day × requests/user ÷ seconds/day is requests/second, and 100,000 in place of 86,400 seconds a day shifts the answer by about 14%.',
    'Size for the peak, not the average: the peak factor is an assumption to measure, and a factor of 3 is a placeholder.',
    'Bits are not bytes and a TiB is not a TB: 10 Gbit/s carries 1.25 GB/s, and 2⁴⁰ bytes is about 10% more than 10¹².',
    'Estimates are good to an order of magnitude: latency figures are rough ratios, and real capacity comes from measuring.',
  ],
  quiz: [
    {
      q: 'A service has 100 million daily users who each make 10 requests a day. About how many requests per second is that on average?',
      options: ['About 11,600 per second', 'About 1,160 per second', 'About 116,000 per second', 'About 11.6 million per second'],
      answer: 0,
      why: '100,000,000 × 10 = 10⁹ requests a day, and 10⁹ ÷ 86,400 ≈ 11,574 per second. The other options are off by a power of ten, the usual slip when seconds per day is misremembered.',
    },
    {
      q: 'A network link is rated at 10 gigabits per second. About how many bytes can it carry per second?',
      options: ['About 1.25 GB per second', 'About 10 GB per second', 'About 125 MB per second', 'About 80 GB per second'],
      answer: 0,
      why: 'Bits divide by 8 to give bytes: 10 Gbit/s ÷ 8 = 1.25 GB/s. Reading Gbit as GB gives 10, and multiplying by 8 instead of dividing gives 80.',
    },
    {
      q: 'Traffic averages 10,000 requests per second with a peak three times that, and one server handles 1,000 requests per second at its target utilisation. How many servers do you plan for?',
      options: ['30, to cover the peak', '10, to cover the average', '3, one per peak factor', '13, the average plus spares'],
      answer: 0,
      why: 'Capacity is sized for the peak: 3 × 10,000 = 30,000 requests per second ÷ 1,000 = 30 servers. Ten servers would run the busy hour at three times the target utilisation.',
    },
    {
      q: 'A latency table says a main-memory read takes about 100 ns and an SSD read about 50 µs. How should you use those numbers?',
      options: [
        'Rough orders of magnitude: hardware varies, the ratio is the point',
        'Exact figures that hold on any machine you will ever use',
        'Hard upper bounds that a healthy system stays under',
        'Averages measured on your own production fleet last year',
      ],
      answer: 0,
      why: 'The usual latency tables are from-memory orders of magnitude, and real hardware differs by a factor of a few. What carries over is the ratio: an SSD read costs roughly 500 memory reads.',
    },
  ],
};

export default lesson;
