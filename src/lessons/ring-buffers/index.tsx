import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A ring buffer is a fixed array used as a queue: the read and write positions chase each other round it and wrap from the last slot to the first, so nothing ever moves or grows.',
    what: "Instead of shifting items along, a ring buffer keeps two positions in a fixed array: head, where the next item is read, and tail, where the next one is written. Each moves on with (i + 1) % N, so it wraps back to slot 0. The catch: when head == tail the buffer could be empty or full, so every implementation needs a rule to tell the two apart.",
    analogy: 'A sushi conveyor belt with a fixed number of plates: the chef puts dishes on at one spot, diners take them off at another, and the belt just goes round.',
    useCases: [
      "The kernel's message log (dmesg) and crash flight recorders that keep only the latest events",
      'Audio and video pipelines between a decoder and the sound or graphics card',
      'Network card receive and transmit rings shared with the driver',
      'Bounded producer–consumer queues such as the LMAX Disruptor and Linux kfifo',
    ],
    why: "Ring buffers are the queue of choice whenever memory must be fixed and operations fast: kernels, drivers, audio, trading systems and every bounded producer–consumer queue. Telling full from empty is a classic interview question, and getting it wrong is a classic off-by-one bug.",
    watch:
      'The ring and the flat strip are the same N slots. Filled slots are tinted yellow and show their item number; empty slots are grey (dimmed on the strip), and with "Keep one slot empty" the slot just behind head, which is never filled, has a dashed grey outline on the ring and stays an undimmed empty cell on the strip. The blue arrow is head (the next read) and the violet arrow is tail (the next write); when they point at the same slot, the strip shows one violet "head = tail" marker. On the ring an overwritten slot flashes orange and a dropped item flashes as a red × beside the tail arrow, with a matching orange or red tag under the readout. In the readout, a test that is true right now turns yellow. A refused size shows its reason in a red box, along with which buffer is still on screen.',
  },
  tryThis: [
    'With 8 slots, press "Enqueue ×5" twice: only 7 fit, because "Keep one slot empty" gives up a slot to tell full from empty.',
    'Switch "Full or empty?" to "Separate count" and fill it: all 8 fit, and head == tail now means full.',
    'Pick "Masked counters" and set N to 12: it is refused. Go back to 8, press "Start counters near 2³²" and enqueue a few: tail wraps round to 0 while head is still near 2³², yet the size stays right; dequeue and head wraps too.',
    'Set "When full" to "Overwrite oldest", fill the buffer and keep enqueuing: the oldest items flash orange as they are lost, like a kernel log.',
    'Choose "Drop newest", make the producer faster than the consumer and press Resume: the buffer sits full and Dropped keeps climbing.',
  ],
  keyIdeas: [
    'head reads, tail writes, and both advance with (i + 1) % N, wrapping back to slot 0.',
    'head == tail on its own is ambiguous: keep one slot empty, keep a count, or use free-running counters.',
    'Masked counters need N to be a power of two: then counter & (N − 1) is counter % N, even across the 32-bit wrap.',
    'One producer, one consumer and no shared count: each index has one writer, so the ring can skip the lock. A shared count, overwrite-oldest or more producers need atomics.',
  ],
  quiz: [
    {
      q: 'A ring buffer uses every slot and keeps no count. You see head == tail. What do you know?',
      options: [
        "It's empty or full, and you can't tell which",
        "It's empty: nothing has been written yet",
        "It's full: tail has caught up with head",
        "It's half full, with the pointers crossed",
      ],
      answer: 0,
      why: "An empty buffer and a full one both have head and tail on the same slot. That's why real rings keep one slot empty, keep a count, or use free-running counters whose difference is the size. \"Empty\" is the tempting answer, and the classic bug.",
    },
    {
      q: 'With 8 slots and the keep-one-slot-empty rule, how many items fit?',
      options: ['7', '8', '9', '4'],
      answer: 0,
      why: '(tail + 1) % N == head already counts as full, so one slot always stays empty: 8 − 1 = 7. A separate count, or masked counters, let all 8 be used.',
    },
    {
      q: 'Why must N be a power of two to use counter & (N − 1)?',
      options: [
        'N − 1 is then all 1 bits, so & acts like % N',
        '& only works on numbers smaller than 256',
        'The counters would otherwise overflow sooner',
        'Arrays can only have power-of-two lengths',
      ],
      answer: 0,
      why: 'For N = 8, N − 1 is 111 in binary, so counter & 7 keeps the last three bits: exactly counter % 8, and still right when a 32-bit counter wraps, because 2³² divides evenly by 8. For N = 12, 11 is 1011 in binary, and the & skips slots. Overflow comes at 2³² either way.',
    },
    {
      q: 'A log ring is full and a new message arrives. Which policy keeps the newest messages?',
      options: ['Overwrite the oldest', 'Drop the newest', 'Block the producer', 'Grow the array'],
      answer: 0,
      why: 'Overwriting moves head past the oldest entry and writes the new one, so the buffer always holds the latest N, which is what dmesg and flight recorders want. Dropping keeps the oldest, blocking makes the logger wait, and growing gives up the fixed memory.',
    },
    {
      q: 'A ring keeps one slot empty and blocks when full. Why can it skip the lock with one producer and one consumer, but not with two producers?',
      options: [
        'Each pointer then has just one writer',
        'Two producers make the array twice as long',
        'The consumer has to read twice as fast',
        'Producers would need separate rings anyway',
      ],
      answer: 0,
      why: 'With one of each, only the producer writes tail and only the consumer writes head, so each side just reads the other\'s pointer (with the right memory ordering). Two producers can read the same tail and write the same slot, losing an item, so they need an atomic compare-and-swap or a lock. The single-writer trick also needs the design to keep it: a shared count is written by both sides, and overwrite-oldest has the producer move head.',
    },
  ],
};

export default lesson;
