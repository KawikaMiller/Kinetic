import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Cloud cost is a unit-economics problem: committing capacity trades a lower hourly price for paying whether or not it is used, moving bytes between zones is a bill of its own, and a colder storage tier wins below a break-even rate of reads.',
    what: 'A day has a load profile, and each hour needs some number of instances. You can pay on demand for what an hour needs, or commit to a level and pay for it through the whole day at a lower price; a commitment saves money up to the level the profile reaches for enough hours, and committing the peak can cost more than committing nothing. Work that can be redone can run on interruptible capacity, which is cheaper per hour but lost hours are repeated. Data crossing zone boundaries and storage tiers add lines that a compute budget leaves out. Dividing the day\'s cost by its requests gives the unit cost. The prices on this page are illustrative round numbers, not any provider\'s.',
    analogy: 'A commitment is a monthly gym pass against paying per visit: the pass wins if you go often enough and loses if you buy the biggest one and go twice. The network line is the taxi fare between two of your own offices, a cost nobody put in the budget because no one thought of it as a cost.',
    useCases: [
      'Choosing how much steady capacity to commit to and how much to leave on demand',
      'Reading cost per request as a number that moves with utilisation, not a fixed price',
      'Finding out whether chatty service-to-service traffic costs as much as the compute behind it',
      'Deciding when moving rarely read data to a colder storage tier saves money',
    ],
    why: 'Cost is a design input as much as latency is. The arithmetic here (a break-even in hours, a crossing share, a break-even in reads) lets you check a savings claim from a slide, find the line item a budget missed, and see that a discount you bought can lose money if the profile changes.',
    watch: 'In the hourly chart blue is committed capacity in use, translucent red is committed capacity paid for and idle, yellow is burst paid on demand and violet is burst on interruptible capacity. A green dot marks the cheapest level and the dashed red line is the cost of committing nothing. In the bytes scene red is data crossing a zone boundary and the cost that follows, green is data that stays in its zone, and the compute bar is blue. In the bill, compute is blue, transfer red and storage amber.',
  },
  tryThis: [
    'In What a day costs (web traffic, nothing committed) the illustrative cost is $112.00 per day and $5.56 per million requests. Set Committed instances to 4: $89.60 and $4.44 per million, with 87.5% of the paid capacity used.',
    'Raise Committed to 8, the peak: $115.20, more than committing nothing ($112.00), and the paid capacity used drops to 58.3%.',
    'In Moving bytes (3 zones, none kept in-zone) 6,720 GB cross a zone boundary and cost $134.40 per day, more than the $89.60 of compute. Raise the same-zone share to 90%: 672 GB and $13.44.',
    'In Storage tier and the bill (4 committed instances, 3 zones, standard tier, 1.2 reads) the day costs $227.33, or $11.28 per million requests. Choose the colder tier and slide the reads to 0.0: storage falls from $3.33 to $1.33 per day; slide to 3.0 and it rises to $6.33.',
  ],
  keyIdeas: [
    'Committing capacity trades a lower price for paying whether or not it is used: in this toy the cheapest level is the highest one the profile reaches for more than 60% of the day, 4 instances here, and committing the 8-instance peak costs $115.20 against $112.00 for committing nothing.',
    'Cost per request is the day\'s cost over its requests, so it moves with utilisation: the same day costs $5.56 per million requests with nothing committed and $4.44 at the cheapest commitment, with 87.5% of the paid capacity used.',
    'Bytes between zones are a line item of their own: in this toy at 3 zones with no zone-local routing they cost $134.40 per day against $89.60 of compute, and keeping 90% of calls in-zone brings them to $13.44.',
    'A colder storage tier trades a lower monthly price for a read charge, so it wins below a break-even rate of reads: 1.20 full reads per GB-month on the page\'s ratios. The prices on this page are invented round numbers.',
  ],
  quiz: [
    {
      q: 'Committing to your peak load saves the most. When is that wrong?',
      options: [
        'When the peak lasts a few hours, the committed instances sit idle the rest of the day and can cost more than paying on demand',
        'Never wrong, since the commitment price is lower than the on-demand price for each hour of the day',
        'When prices rise during the year, because the commitment price then stops applying to the committed hours',
        'When interruptible capacity is also in use, because the two cannot be combined within a single day',
      ],
      answer: 0,
      why: 'Committed instances are billed for 24 hours. In the toy the peak of 8 instances is needed for 8 hours, so committing 8 costs $115.20 against $112.00 for committing nothing.',
    },
    {
      q: 'A profile needs 2, 4 and 8 instances for 8 hours each, and a commitment costs 60% of the on-demand price. Which commitment level is cheapest?',
      options: [
        '4: the profile needs 3 or more for 16 hours, above the 14.4-hour break-even, and 5 or more for 8, below it',
        '2: the level the profile needs in every hour of the day, so no committed instance ever sits idle at any hour',
        '8: the peak, because the commitment price is lower than the on-demand price for every hour that it is used',
        '0: paying on demand wastes nothing, and a commitment is paid for whether it is used or not used',
      ],
      answer: 0,
      why: 'Committing 0, 2, 3, 4, 6 and 8 costs $112.00, $92.80, $91.20, $89.60, $102.40 and $115.20. A level is worth committing when the profile reaches it for more than 60% of the 24 hours, 14.4 of them.',
    },
    {
      q: 'A team budgets for compute. What often surprises them?',
      options: [
        'Data moving between zones can cost as much as the compute behind it, and it grows with chatty traffic',
        'Storage turns out to be the largest line on the bill, whatever the shape of the traffic or the services',
        'Traffic that stays inside one zone is billed at the highest rate of any kind of traffic',
        'Network charges disappear once a service runs in several zones, because the load is spread',
      ],
      answer: 0,
      why: 'In the toy at 3 zones with no zone-local routing, 6,720 GB a day cross a boundary and cost $134.40, more than the $89.60 of compute; keeping 90% of calls in-zone cuts it to $13.44.',
    },
    {
      q: 'A colder tier charges 40% of the standard monthly price for storage and 50% of it per full read of a GB. At how many full reads per GB-month do the tiers cost the same?',
      options: ['About 1.2', 'About 0.6', 'About 2.4', 'About 0.5'],
      answer: 0,
      why: 'Standard costs S per GB-month; the colder tier costs 0.4 S + 0.5 S r. Setting them equal gives r = (1 - 0.4) / 0.5 = 1.2 full reads per GB-month.',
    },
  ],
};

export default lesson;
