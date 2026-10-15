import type { LessonModule } from '../../core/types';
import { EVENT_COUNT } from './events';
import { LONG_SLIDE, disorderFacts, latenessFacts, mergeFacts, replayFacts, slidingFacts } from './facts';
import { ROOMY_LATENESS } from './engine';
import { Stage } from './Stage';

const disorder = disorderFacts();
const sliding = slidingFacts();
const merge = mergeFacts();
const lateness = latenessFacts();
const replay = replayFacts();
const fate = (f: string) => (f === 'late' ? 'counted late' : f === 'dropped' ? 'dropped' : 'on time');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Stream results are windows over event time, closed by a watermark: it says how far the stream has surely got, and an event behind it is late, counted if there is allowed lateness and lost if not.',
    what: 'Clicks arrive out of order, so "when it happened" (event time) and "when the job saw it" (processing time) differ. A window groups events by event time: tumbling windows tile the line, sliding ones overlap, session ones close up a burst per user. The job cannot know that no earlier event is still coming, so it follows a watermark, here the largest event time seen minus a bound; a window fires when the watermark passes its end, and a later event for it is late.',
    analogy: 'A teacher collecting homework due at noon: she cannot wait forever for the stragglers, so she closes the pile when the last bell has rung plus a few minutes of grace, and late work after that goes in a separate box or is refused.',
    useCases: [
      'Counting clicks, orders or sensor readings per minute from a message stream',
      'Building sessions of user activity from events that arrive out of order',
      'Choosing how long to wait for late data before publishing a result',
      'Reprocessing a topic from the start and getting the same numbers',
    ],
    why: 'Counting by arrival time looks fine in a demo and is quietly wrong the day the network is slow. Knowing what a watermark promises, and what lateness costs in delay, state and dropped data, is what makes a stream job both correct and affordable.',
    watch:
      'Event time and arrival: each line joins a click\'s happening (top) to its arrival (bottom), red when they fall in different minutes, and the dots are tinted by user. Windows: bars are windows with their counts, in rows so overlaps stay apart, hollow dots have not arrived yet. Watermarks: the yellow vertical line is the watermark, violet bars are open windows and dim dashed ones are fired, a green dot was on time, a blue one late but counted, a red one dropped, and the green-to-red bars compare each window with the truth. The broken way: a red count is wrong against the event-time column. Chips say what is simulated, scripted, a toy or from memory.',
  },
  tryThis: [
    `In "Event time and arrival" at the default delay bound of 20 s, ${disorder.atDefault.crossing} of ${EVENT_COUNT} clicks cross a minute boundary and ${disorder.atDefault.wrong} of ${disorder.atDefault.minutes} minutes disagree. Move the delay bound to 0 and both read ${disorder.atZero.wrong}.`,
    `In "Windows", pick Sliding (60 s every 20 s): each event lands in ${sliding.counts[0]} windows. Raise Slide L to ${LONG_SLIDE} s, longer than the size: ${sliding.gapEvents} events land in no window.`,
    merge
      ? `In "Windows", pick Session (gap 20 s) and move Events arrived up one step at a time: at arrival ${merge.at} two sessions merge, and the window count falls from ${merge.from} to ${merge.to}.`
      : 'In "Windows", pick Session and move Events arrived up one step at a time to watch sessions merge.',
    `In "Watermarks and lateness", at the end of the stream ${lateness.dropped} events are dropped with an allowed lateness of 0 s and ${lateness.undercounted} windows come up short. Raise Allowed lateness to ${ROOMY_LATENESS} s: ${lateness.roomyDropped} are dropped. Then press "Send a straggler": it is ${fate(lateness.stragglerRoomy)}; set the lateness back to 0 s and it is ${fate(lateness.stragglerStrict)}.`,
    `In "The broken way", counting by arrival is wrong in ${replay.wrong} of ${replay.minutes} minutes. Switch the job to event time and all of them match. Set Run to a replay read backwards: the event-time column ${replay.eventUnchanged ? 'does not change' : 'changes'} and the arrival column ${replay.arrivalChanged ? 'does' : 'does not'}.`,
  ],
  keyIdeas: [
    'Event time is when something happened and processing time is when the job saw it: in this model counting by arrival is wrong wherever a delay carries an event across a window edge.',
    'A window is a half-open range [start, end): in this model a tumbling window holds each event once, a sliding one holds it in size divided by slide windows, and a session grows while events keep arriving less than a gap apart.',
    'The watermark is a heuristic about how far the stream has got, so in this model an event behind it by more than the allowed lateness is dropped, and more lateness trades held state and delay for fewer drops.',
    'Event-time results do not depend on arrival order unless events are dropped, so a replay gives the same answer, while processing-time results depend on when the replay runs.',
  ],
  quiz: [
    {
      q: 'A one-minute window ends at 12:01:00. A click from 12:00:58 reaches the job at 12:01:05. Does an event-time job count it in the 12:00 window?',
      options: [
        'Yes, if the watermark has not passed the window by more than the allowed lateness; the watermark decides, not the clock',
        'No, because the window closed when the wall clock reached 12:01:00 and later arrivals belong to the next window',
        'Yes, always, because event time means the job waits for every click that happened before the window ended',
        'No, because a click counts in the window where it arrived, and the delay is treated as part of the event',
      ],
      answer: 0,
      why: 'Windows are closed by the watermark, which follows the largest event time seen, not by the clock. A late click is still counted while the watermark is within the allowed lateness of the window end, and dropped after that.',
    },
    {
      q: 'In a job with a bounded-out-of-orderness watermark, what makes a window fire?',
      options: [
        'The watermark, the largest event time seen minus the bound, reaching the window\'s end',
        'The wall clock reaching the window\'s end plus the bound, whatever the events say',
        'The first event whose time falls after the end of the window arriving, however large the bound is',
        'A timer started when the window\'s first event arrives and set to the length of the window',
      ],
      answer: 0,
      why: 'The job cannot know no earlier event is coming, so it fires when the watermark says the stream has surely passed the window. A larger bound waits longer and loses fewer events.',
    },
    {
      q: 'A sliding window of 60 s starts every 20 s. How many windows does one event fall in?',
      options: [
        'Three: a window starts every 20 s and lasts 60 s, so three of them overlap at any time',
        'One: the event belongs to the window that started closest before it, like a tumbling window',
        'Two: the window that is open when it happens and the one that opens next',
        'Sixty: a window starts at every second, and an event counts in every one it touches',
      ],
      answer: 0,
      why: 'Windows start at multiples of the slide and last the size, so a time lies in size divided by slide of them when slide divides size. A slide longer than the size leaves gaps where an event lands in none.',
    },
    {
      q: 'Two sessions of one user are 25 s apart and the gap is 20 s, so they are separate. Both are still open when an event timed between them, 10 s from each, arrives. What happens?',
      options: [
        'They merge into one session that also holds the new event, since it is less than a gap from both',
        'The new event starts a third session, because it arrived after both of the others had been created',
        'The new event joins the nearer session only, and the two original sessions stay apart as before',
        'The new event is dropped, because sessions are fixed once they have been created by their first events',
      ],
      answer: 0,
      why: 'An event within a gap of two sessions bridges them, so they become one that runs from the first event to the last plus the gap. Sessions are rebuilt from the events, so a late bridging event can change their boundaries.',
    },
    {
      q: 'A job counts clicks per minute by arrival time, and the log is replayed after an outage. What can happen to its counts?',
      options: [
        'They change, because the replay delivers events at different times than the original run did',
        'They stay the same, because the replayed log holds exactly the same events as before',
        'They double, because each replayed event is counted once for the run and once for the replay',
        'They stay the same, because arrival time is stored in the log along with each event',
      ],
      answer: 0,
      why: 'Processing time is the moment the job sees an event, so a replay at another pace or order gives other counts. An event-time job reads the time inside the event and gets the same answer, provided it keeps events until the stream ends.',
    },
  ],
};

export default lesson;
