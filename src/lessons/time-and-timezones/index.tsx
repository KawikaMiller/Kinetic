import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An instant is one moment for everyone; a wall-clock time like "09:00" only means something together with a time zone, and zones change their rules. Store instants in UTC plus the IANA zone, and let the platform convert.',
    what: 'UTC is the reference clock. A time zone (America/New_York, Europe/London) is a set of rules for turning UTC into local wall-clock time, including daylight saving: twice a year the offset changes, so one local hour is skipped in spring and one happens twice in autumn. An offset like -05:00 is only the rule in force at one moment; the zone is the whole rulebook. Libraries and the Intl API do the conversion from the IANA time zone database; code that adds hours by hand gets DST days wrong.',
    analogy: 'UTC is the train\'s real departure time; each station shows it on its own clock, and some stations move their clocks twice a year. Write down the real departure time and the station, never just what one station\'s clock said.',
    useCases: [
      'Scheduling: cron jobs, reminders and recurring meetings across time zones',
      'Storing timestamps in databases and APIs (ISO 8601 with a Z or an offset)',
      'Billing and reports that bucket events "per day" in the customer\'s zone',
      'Debugging "it ran twice" or "it never ran" bugs on DST weekends',
    ],
    why: 'Date bugs look fine in testing and fail twice a year in production: a job skipped on the spring-forward night, a charge applied twice in the autumn, a meeting an hour off for three weeks in March. Knowing instant vs wall time vs zone lets you store the right thing and find these bugs before your users do.',
    watch: 'DST days: a strip of 48 real hours, one column each. The UTC row is blue and the New York and London rows are violet, showing what each clock read at that moment; a thick left edge marks local midnight. At spring forward, a red edge and a red "02:00-02:59 skipped" label mark where New York\'s clock jumped; at fall back, the hour that happens twice is filled yellow. Below, a daily job\'s runs show UTC times in blue, a skipped day in red and a double run in yellow. Gap weeks: one tile per day with the London time of a 09:00 New York meeting in violet; tiles in the 4-hour gap weeks are outlined yellow. The meeting scheduler shows UTC in blue and local times in violet, a time that doesn\'t exist in red, one that happens twice in yellow, and stored values: naive local time in red, UTC plus zone in green. Falsehood cards show the belief in red and the truth in green.',
  },
  tryThis: [
    'On DST days, switch to "Fall back (1 Nov)": watch the 01:30 job run twice.',
    'Open "EU/US gap weeks": the London time of a 09:00 New York meeting changes from 14:00 to 13:00 and back.',
    'In "Schedule a meeting", enter 2026-03-08 and 02:30 in New York: that time doesn\'t exist.',
    'Enter 2026-11-01 and 01:30 in New York: two different moments share that wall-clock time.',
    'Flip the new Date("2026-03-08") falsehood: in New York it\'s still the 7th.',
  ],
  keyIdeas: [
    'An instant (UTC) is the same everywhere; a wall-clock time needs a zone to mean anything.',
    'A zone is a rulebook, an offset is one page of it: store America/New_York, not -05:00.',
    'On DST days one local hour doesn\'t exist and another happens twice; days are usually 23 or 25 hours (Lord Howe Island, with a 30-minute shift, gets 23.5 and 24.5).',
    'Store UTC + zone and convert with Intl or a date library, never by adding hours by hand.',
  ],
  quiz: [
    {
      q: 'Your app stores appointments as local time "2026-03-10 09:00" with no zone. What\'s the risk?',
      options: ['None, as long as it\'s ISO formatted', 'Different servers or users read it as different instants', 'It uses too much space', 'Sorting breaks'],
      answer: 1,
      why: 'Without a zone it\'s not an instant. A server in London and one in New York turn it into moments 4-5 hours apart. Store UTC plus the IANA zone.',
    },
    {
      q: 'A job runs daily at 02:30 America/New_York. What happens on 8 March 2026?',
      options: ['It runs at 02:30 as usual', 'There is no 02:30 that night, so a naive scheduler skips it', 'It runs twice', 'It runs at 01:30'],
      answer: 1,
      why: 'At 2:00 the clocks jump to 3:00, so 02:30 local never happens. Real schedulers vary in how they handle this, which is why jobs are often scheduled in UTC.',
    },
    {
      q: 'Why store "America/New_York" rather than the offset "-05:00"?',
      options: ['It\'s shorter', 'The offset changes with DST (and law); the zone name knows all the rules', 'Offsets are deprecated', 'Databases can\'t store offsets'],
      answer: 1,
      why: 'New York is -05:00 in winter and -04:00 in summer, and Bogotá is -05:00 all year. Only the zone tells you which offset applies on a future date.',
    },
    {
      q: 'In JavaScript, new Date("2026-03-08") is…',
      options: ['Midnight in your local time zone', 'Midnight UTC', 'Noon UTC', 'Invalid'],
      answer: 1,
      why: 'A date-only ISO string parses as UTC. In New York that\'s 19:00 on 7 March. "2026-03-08T00:00" without a Z parses as local time instead.',
    },
  ],
};

export default lesson;
