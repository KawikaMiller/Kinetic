import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const n = (v: number) => v.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A sweep line turns a two-dimensional overlap question into a sorted list of events: move a line across, update a small active set at each event, and read the answer off as you go.',
    what: `Intervals here are half-open, [start, end): an interval ending at 10 and one starting at 10 do not overlap. To merge intervals, sort by start and sweep; each interval either extends the current output or opens a new one, and intervals that touch join, because that is exactly their union. To count the rooms a set of meetings needs, turn each meeting into a start (+1) and an end (-1) event, sort them, and keep a counter; its maximum is the answer, and at an equal time the end must go first or the counter overcounts. For horizontal and vertical segments, sweep over x with the horizontals that are alive kept sorted by y: insert a horizontal at its left end, ask each vertical for the y-range it spans, and remove a horizontal after its right end. Choosing a different sort key turns the same idea into other problems, such as activity selection, which sorts by end.`,
    analogy: 'A scanner passing over a page: it does not look at the whole page at once, it keeps only what is under the scan line and notes each time something starts or stops being under it.',
    useCases: [
      'Calendars and scheduling: merging busy times, counting rooms or servers needed at once',
      'Computational geometry: finding overlaps between rectangles and crossings between segments',
      'Log and metrics analysis: peak concurrency, sessions overlapping in time',
      'Rendering and GIS: scan-line fills and map overlay, where the sweep line moves across the picture',
    ],
    why: 'Most interval and overlap problems are the same pattern: sort events, keep an active set, decide the tie order. Interviews and real scheduling code both go wrong on the convention (do touching intervals overlap?) and on the event order at equal times.',
    watch: 'The sweep line is yellow (--hi). A live interval or active horizontal segment is blue (--info), one not live or not reached is grey (--dim), a merged output interval, a chosen activity and a found crossing are green (--ok), and an overcount caused by the wrong tie order is red (--bad). In the room assignment view each room is its own colour, with no meaning beyond telling rooms apart.',
  },
  tryThis: [
    `In Merge intervals, on the defaults (a calendar day of ${F.mergeCount} intervals): the sweep builds ${F.mergedCount} merged intervals, ${F.mergedList}. Press Touching: [1, 3), [3, 5) and [5, 7) join, giving ${F.touchMergedCount} merged intervals, ${F.touchMergedList}.`,
    `In How many rooms, on the defaults ([9, 10), [10, 11) and [9.5, 10.5)): the maximum counter is ${F.roomsEndFirst} and the heap greedy also needs ${F.roomsHeap} rooms. Switch the tie rule to Start before end (bug): the counter reaches ${F.roomsStartFirst}, with ${F.overEvents} red overcount event.`,
    `In Crossing segments, on the defaults (4 horizontal and 4 vertical segments): ${F.segCrossings} crossings, the sweep makes ${F.segSweep} comparisons against ${F.segBrute} for checking all ${F.segPairs} pairs, so it does not win at this size. The note below gives ${F.bigN} by ${F.bigN} segments (model only): ${n(F.bigSweep)} against ${n(F.bigBrute)}. Press Touches and T-junctions: ${F.touchSegCrossings} crossings, touches included.`,
    `In Choose the sweep key, on the defaults (${F.selectCount} activities): sorting by end and taking each one that starts at or after the last end chooses ${F.selectChosen}.`,
  ],
  keyIdeas: [
    `Half-open intervals that touch do not overlap: [9, 10), [10, 11) and [9.5, 10.5) need ${F.roomsEndFirst} rooms, not ${F.roomsStartFirst}.`,
    'The same touching intervals do join when you take a union: [1, 3) and [3, 5) merge into [1, 5), because that is exactly what they cover together.',
    `A sweep orders its events and fixes the order at a tie: for closed segments it is insert, query, remove, which found ${F.segCrossings} crossings on the default grid including touches.`,
    `A sweep pays for sorting, so it can lose on small inputs: ${F.segSweep} against ${F.segBrute} comparisons at 4 by 4, and ${n(F.bigSweep)} against ${n(F.bigBrute)} at ${F.bigN} by ${F.bigN} on the lesson's seeded sparse input.`,
  ],
  quiz: [
    {
      q: 'Meetings run [9, 10), [10, 11) and [9.5, 10.5), each half-open. How many rooms are needed?',
      options: [
        'Two: the first two only touch at 10 and can share a room',
        'Three: all the meetings are in progress together around 10, so each needs its own room',
        'One: the day is short enough for one room',
        'Six: a room is needed for every start and end event',
      ],
      answer: 0,
      why: `A half-open [9, 10) is over at 10, so at the instant 10 two meetings are live. The sweep reports a maximum of ${F.roomsEndFirst} and the heap greedy opens ${F.roomsHeap} rooms; counting a start before an end at 10 gives ${F.roomsStartFirst}, which is the bug the red mark shows.`,
    },
    {
      q: 'Why does the rooms sweep need an end event for each meeting, and not only the starts sorted?',
      options: [
        'Nothing would lower the counter when a meeting ends, so it would count meetings instead of overlaps',
        'The ends decide which room each meeting gets, since rooms are named by their end time',
        'Sorting by start alone is slower than sorting starts and ends together',
        'The end events are used to check that each meeting has a positive length',
      ],
      answer: 0,
      why: `The counter is the number of meetings live at the sweep line, so it has to go down when one finishes. In the lesson the events for the three default meetings take the counter up and down and peak at ${F.roomsEndFirst}; with starts alone it would end at 3.`,
    },
    {
      q: 'In the crossing-segments sweep a horizontal segment ends at x = 5 and a vertical segment stands at x = 5. Which event order counts the touch?',
      options: [
        'Insert starting horizontals, query the verticals, then remove ending horizontals',
        'Remove ending horizontals first, then query the verticals at that x',
        'Query the verticals first, then insert the horizontals that start at that x',
        'Any order, since the touch is found at the end by comparing every pair',
      ],
      answer: 0,
      why: `The segments are closed, so a shared point counts, and the horizontal has to still be in the active set when the vertical asks. Removing first or querying before inserting misses the touch; the lesson's touching preset reports ${F.touchSegCrossings} crossings with the right order, matching a brute-force pair check in the tests.`,
    },
    {
      q: 'Why does activity selection sort by end time, not by start time?',
      options: [
        'The activity that finishes first leaves the most room for the rest',
        'The activity that starts first is always the shortest one, so it is cheapest to fit in',
        'Sorting by end gives the activities in the order they were booked',
        'An activity can only be chosen once the sweep line has passed its start',
      ],
      answer: 0,
      why: `Taking the earliest finish keeps the remaining time as large as possible, so nothing better is lost. On the lesson's ${F.selectCount} activities it chooses ${F.selectChosen}, which a brute force over each possible subset confirms is the largest set that fits. Sorting by start can pick a long early activity that blocks several short ones.`,
    },
  ],
};

export default lesson;
