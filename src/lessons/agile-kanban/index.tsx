import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Work flows faster when a team finishes what it started before starting more: limiting work in progress cuts how long each item takes without cutting how much gets done.',
    what: 'Agile teams make work visible on a board: Backlog, In progress, Review, Done. Kanban caps how many cards may be In progress at once (a WIP limit) and pulls the next card only when one finishes. Scrum instead plans fixed sprints, usually two weeks, and demos the finished work at a review. Little\'s law ties the numbers together: average cycle time = average work in progress ÷ throughput, so with the same throughput, more cards in flight means every card takes longer.',
    analogy: 'A motorway at rush hour: letting more cars on doesn\'t get more cars home per hour, it just makes every journey longer. Ramp meters (WIP limits) keep traffic moving.',
    useCases: [
      'Daily stand-ups around a Jira, Linear or GitHub Projects board',
      'Spotting a bottleneck: the column where cards pile up (often review)',
      'Forecasting: "at 1.2 cards a day, these 12 cards take about 10 days"',
      'Deciding whether to start a new ticket or help finish one that\'s stuck',
    ],
    why: 'From your first week you\'ll work on a board, estimate tickets and get asked "when will it be done?". Knowing why teams limit WIP, and that juggling five tickets makes each one slower, helps you stop starting and start finishing, and gives you a real answer instead of a guess.',
    watch: 'The top half is the board. Cards being worked on are yellow (with a progress line), blocked cards are red and say "wait", finished cards are green, and waiting cards are plain. In Kanban, violet dashed outlines in the In progress column are the empty WIP-limit slots, and the violet count shows cards / limit. The bottom half is the cumulative flow diagram: stacked bands for Done (green), Review (pink), In progress (violet) and Backlog (blue). The white vertical bar at the right edge is the current WIP (band thickness) and the white horizontal line is the approximate cycle time (the gap between starting and finishing). In Scrum, violet-outlined backlog cards are committed to the current sprint, and dashed vertical lines mark each sprint review with how many cards it demoed. The stats compare average WIP ÷ throughput with the measured cycle time (Little\'s law), and show lead time: from request to done.',
  },
  tryThis: [
    'Drag the WIP limit to "no limit" and watch cycle time and the In progress band balloon while throughput falls.',
    'Set the WIP limit to 3, wait about 20 days, and compare "WIP ÷ throughput" with the measured cycle time.',
    'Press "Block a card" with a limit of 3 and watch the backlog queue up behind it.',
    'Drop the WIP limit to 1: one developer\'s work is not enough, so the backlog grows.',
    'Switch Process to Scrum and compare lead time (under Cycle time) with Kanban: requests now wait for the next planning.',
  ],
  keyIdeas: [
    'Starting more work in parallel doesn\'t finish more work; it makes every item take longer.',
    'Little\'s law: cycle time = WIP ÷ throughput (in a steady system).',
    'A WIP limit makes a team finish before starting, and exposes blockers and bottlenecks.',
    'Scrum batches work into sprints; Kanban flows continuously. Both make work visible.',
  ],
  quiz: [
    {
      q: 'Your team finishes about 2 cards a day. You start twice as many cards at once. What happens, in the long run?',
      options: [
        'Same throughput, but each card takes about 2× longer',
        'Twice as many cards get finished every day',
        'Each card gets finished faster than before',
        'Nothing changes in throughput or speed',
      ],
      answer: 0,
      why: "Capacity limits throughput, so starting more doesn't finish more; more WIP just means more cards waiting (Little's law), and context switching often lowers throughput too.",
    },
    {
      q: "A board averages 6 cards in progress and finishes 2 cards per day. By Little's law, the average cycle time is about…",
      options: ['12 days', '3 days', '8 days', '0.33 days'],
      answer: 1,
      why: 'Cycle time = WIP ÷ throughput = 6 ÷ 2 = 3 days.',
    },
    {
      q: 'In progress is at its WIP limit and a teammate asks you to start a new ticket. What does Kanban suggest?',
      options: [
        'Start it anyway: more parallel work is more progress',
        'Help finish or unblock an in-progress card first',
        'Raise the limit permanently',
        'Move a card back to the backlog',
      ],
      answer: 1,
      why: 'The limit is a signal to swarm on finishing work, not a quota to route around.',
    },
  ],
};

export default lesson;
