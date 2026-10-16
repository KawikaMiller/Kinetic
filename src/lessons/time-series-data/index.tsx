import { bytes, decimal } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { cardinalityFacts, encoderFacts, gapFacts, retentionFacts, spikeFacts } from './facts';
import { RAW_POINT_BYTES } from './gorilla';
import { SPIKE_AGE_DAYS, TIER_LABELS, tierCovering, DEFAULT_POLICY } from './retention';
import { POINTS_PER_DAY, SPIKE_POINTS, STEP_SECONDS } from './series';
import { Stage } from './Stage';

const hour = spikeFacts();
const gap = gapFacts();
const enc = encoderFacts();
const ret = retentionFacts();
const card = cardinalityFacts();
const ZOOM_FROM = 13;
const ZOOM_TO = 15;
const zoomPoints = ((ZOOM_TO - ZOOM_FROM) * 3600) / STEP_SECONDS;
const weekTier = TIER_LABELS[tierCovering(DEFAULT_POLICY, 7)!];
const n = (x: number) => x.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Time-series data is a huge number of timestamped points, so it is stored compactly and thinned over time. Rolling up by average hides spikes, so rollups keep (sum, count, min, max); delta-of-delta and XOR encoding shrink regular series; and every label multiplies the number of series.',
    what: 'A day of metrics at one point every ten seconds is stored, rolled up into minute and hour buckets with a choice of aggregate, and compressed by a real Gorilla-style encoder that writes timestamps as delta of delta and values as an XOR with the previous one. Then a retention policy keeps raw data briefly and rollups longer, and a calculator shows how labels multiply the count of series.',
    analogy: 'A weather station\'s paper logs. Last week\'s sheets are kept minute by minute, last year\'s only as daily summaries, and a summary that only records the average temperature will not show that one afternoon spiked. Writing "same as the line above" for a steady reading is the compression trick.',
    useCases: [
      'Choosing how long to keep raw metrics and how coarsely to keep older ones',
      'Understanding why dashboards that average over long windows hide short spikes',
      'Reading why steady metrics compress to a few bits a point and noisy ones do not',
      'Estimating the cost of adding a label such as a user id to a metric',
    ],
    why: 'Metrics systems store billions of points a day, so every choice (resolution, aggregate, label) is a storage cost and a blind spot. Knowing what an average erases and what a label multiplies lets you keep the data that answers the questions you will ask later.',
    watch:
      'Raw points are a blue line and rollup buckets a violet one, with the spike marked in yellow; a green value kept the spike or is the exact average, and a red one lost the spike or is the average of averages. In the encoder, amber chips are timestamp bits and sky-blue chips value bits, and the line is the bits each point took. In the retention scene the three tiers are amber, pink and sky bars on a UTC calendar, with a spike marker that is green if it survives and red if not. Chips say what is simulated, a toy, illustrative, real or from memory.',
  },
  tryThis: [
    `In "The raw series" a day is ${n(POINTS_PER_DAY)} points, ${bytes(POINTS_PER_DAY * RAW_POINT_BYTES)} at ${RAW_POINT_BYTES} bytes a point. Set Zoom from hour to ${ZOOM_FROM} and to hour to ${ZOOM_TO}: ${n(zoomPoints)} points are in view and the spike is a rise of ${SPIKE_POINTS} of them.`,
    `In "Downsample and what it hides" the one-hour average shows the spike's bucket as ${decimal(hour.avg, 2)} against a raw peak of ${decimal(hour.peak, 2)}. Pick Max: it shows ${decimal(hour.max, 2)}. Turn Missing data on, with one-minute buckets: the average of averages is ${decimal(gap.naive, 3)} and the exact average is ${decimal(gap.exact, 3)}.`,
    `In "Compression" regular timestamps and constant values take ${decimal(enc.regular, 1)} bits a point, ${decimal(enc.regularRatio, 1)} times smaller than raw. Pick Noisy floats: ${decimal(enc.noisy, 1)} bits a point.`,
    `In "Retention tiers" the default policy stores ${bytes(ret.total)} a series, the last week comes from ${weekTier}, and a one-minute spike from ${SPIKE_AGE_DAYS} days ago is ${ret.spikeAvg.visible ? 'visible' : 'erased'}. Switch Rollups keep to sum, count, min, max: it is ${ret.spikeFull.visible ? 'visible' : 'erased'}.`,
    `In "High cardinality" the four labels give ${n(card.base)} series. Add a user_id label: ${n(card.withUser)}, and ${bytes(card.userDay)} of raw points a day against ${bytes(card.baseDay)}.`,
  ],
  keyIdeas: [
    'An average over a bucket can erase a short spike that the maximum keeps, so in this model a rollup that keeps only averages has lost it.',
    'The average of bucket averages equals the true average when the buckets hold equal numbers of points, and not otherwise, so rollups keep (sum, count) and add them.',
    'Delta-of-delta and XOR encoding make steady series cost a bit or two a point, while noisy floats cost many more bits in this scheme.',
    'Each label multiplies the number of series by the number of values it takes, so a label with many values dominates storage.',
  ],
  quiz: [
    {
      q: 'A dashboard shows one-hour averages of latency. A two-minute spike last Tuesday does not appear. What happened?',
      options: [
        'The hour\'s average pulled the spike down toward the baseline; a max rollup would have kept it',
        'The spike was removed as noise, because a rollup discards every point that is far from the other points',
        'The database stopped recording during the spike, since a busy system skips points so that it can keep up',
        'The spike was moved to the next hour by the rollup, where it was merged with the average of that hour',
      ],
      answer: 0,
      why: 'One hour holds 360 points and the spike covers 12 of them, so the average barely moves. Keeping min and max in the rollup keeps what an average hides.',
    },
    {
      q: 'Two minute buckets hold 6 points and 1 point, with averages 10 and 40. What is the average of the whole stretch?',
      options: [
        'The sums over the counts, (60 + 40) / 7, about 14.3, not the 25 of the averages',
        'The average of the two averages, 25, because each bucket counts once in a rollup of rollups of the data',
        'The larger of the two averages, 40, because a rollup keeps the bucket that looks the most unusual of all',
        'The smaller of the two averages, 10, because most of the points in the stretch fall in the first bucket',
      ],
      answer: 0,
      why: 'Averages of averages weight each bucket equally whatever its count. Adding sums and counts is exact, which is why rollups store both.',
    },
    {
      q: 'Why does a steady metric at a regular interval compress to a bit or two a point in a Gorilla-style encoder?',
      options: [
        'A zero delta of delta and a zero XOR each take one bit, and a steady series has both',
        'The encoder drops every point that repeats the previous one and writes only how many points were dropped',
        'The values are rounded to the nearest whole number, so equal readings need no digits to be written at all',
        'Timestamps are not stored, because a regular interval can always be worked out from the first one alone',
      ],
      answer: 0,
      why: 'In this scheme a zero delta of delta costs one bit and a zero XOR costs one bit, so a steady series costs about two bits a point. Noisy floats change many bits each time, so they cost far more.',
    },
    {
      q: 'A retention policy keeps raw data for 2 days and hourly averages for a year. Can you find a one-minute spike from last month?',
      options: [
        'No: only hourly averages reach back that far, and they dilute a spike; a max would keep it',
        'Yes: the raw data is still stored for every point, and only what is older than 2 days is hidden from the dashboards',
        'Yes: hourly averages are exact, so the spike appears in its bucket at its full height, just as it did when recorded',
        'No: spikes are always deleted first when data is rolled up, so that the space can be used for the rest of it',
      ],
      answer: 0,
      why: 'The hourly tier alone reaches back a month, and an hourly average dilutes a one-minute spike. Rollups that keep max would still show it.',
    },
    {
      q: 'What happens to storage when a metric gains a label holding a user id, with thousands of values?',
      options: [
        'The series count is multiplied by the number of user ids, so storage grows by about that factor',
        'Storage grows by the size of one more label name, because labels are shared between all of the series of a metric',
        'Nothing changes, because labels are only metadata and the points themselves stay exactly the same size as before',
        'It grows only while a user is active, since idle label values are dropped from the index of series after a while',
      ],
      answer: 0,
      why: 'A series exists for each combination of label values, so a label with many values multiplies the series count, and each series carries a point per ten-second step.',
    },
  ],
};

export default lesson;
