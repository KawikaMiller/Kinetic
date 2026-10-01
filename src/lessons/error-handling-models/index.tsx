import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When something fails, an exception jumps up the call stack to the nearest catch, while a result type makes every function return the failure explicitly.',
    what: "A thrown exception stops the current function and unwinds the call stack frame by frame: functions without a catch are skipped, finally blocks run on the way out, and the nearest catch handles it. If nothing catches it, the program crashes. With result types (Ok/Err values), nothing jumps: each function returns the error as a value, and its caller has to check it and pass it on.",
    analogy: 'An exception is a fire alarm: everyone leaves the building until someone whose job it is deals with it. A result type is a note passed back up a line of people: each person has to read it and decide whether to pass it on.',
    useCases: [
      'A request handler that catches everything once and turns it into a clean error response',
      'finally (or try-with-resources) releasing locks, files and connections even when something throws',
      'Result types in Rust, Go\'s (value, err) returns, and Result libraries in TypeScript for expected failures',
      'Error causes (new Error(msg, { cause })) keeping the original error for whoever debugs it',
    ],
    why: 'Every program fails somewhere. Juniors often wrap code in try/catch "to be safe" and end up hiding the real error; knowing how failure travels tells you where to catch, where to let it fly, and how not to lose it.',
    watch: "The program on the left highlights the line running now. The call stack on the right shows the frame running now in yellow, a throwing frame in red, frames the error skips (no catch there) dimmed before they pop, a frame running its finally block in violet, the frame whose catch handles the error in green, and a frame returning a value in blue. The console prints in green; if the error escapes main the stack box turns red and the console ends with a red Uncaught line. An error swallowed by an empty catch shows up as a red dashed \"lost forever\" note. The program is a small scripted example, and the trace comes from actually running it.",
  },
  tryThis: [
    'Press play with Make this fail on callBank: watch the error skip callBank, run chargeCard\'s finally, and land in handleRequest\'s catch.',
    'Switch How chargeCard and handleRequest react to Empty catch {}: the request "succeeds", but look at the red note.',
    'Pick No catch at all: every frame unwinds and the program crashes.',
    'Pick Rethrow with cause and read what handleRequest logs.',
    'Switch Failure model to Result type and count the if (!res.ok) checks.',
  ],
  keyIdeas: [
    'A thrown error unwinds the stack until the nearest catch; frames without one are skipped.',
    'finally runs on the way out whether the code succeeded or failed: use it for cleanup.',
    'An empty catch hides the failure; catch where you can actually handle it, usually at the boundary.',
    'Result types make failure explicit at every level: nothing jumps, but every caller must check.',
  ],
  quiz: [
    {
      q: 'You wrap chargeCard\'s body in try { … } catch {} "to be safe". What happens when the bank times out?',
      options: [
        'The request fails cleanly with a helpful error',
        'The error is hidden: the request looks successful, but nothing was charged',
        'The program crashes',
        'The catch retries the payment automatically',
      ],
      answer: 1,
      why: 'An empty catch swallows the error and the function just returns undefined. Catching everything doesn\'t make code safer; it makes failures invisible.',
    },
    {
      q: 'callBank throws. chargeCard has try/finally but no catch; handleRequest has a catch. What runs first after the throw?',
      options: ["handleRequest's catch", "chargeCard's finally", "main's next line", 'Nothing, the program crashes'],
      answer: 1,
      why: 'The error unwinds through chargeCard first, and its finally runs on the way out. Then handleRequest\'s catch handles it.',
    },
    {
      q: 'What does a result type (Ok/Err) change compared with exceptions?',
      options: [
        'Errors can no longer happen',
        'Failures become return values every caller has to check and pass on',
        'finally blocks run twice',
        'The call stack is no longer needed',
      ],
      answer: 1,
      why: 'Nothing jumps: each level returns the Err explicitly. It is clear and hard to ignore, but more verbose.',
    },
  ],
};

export default lesson;
