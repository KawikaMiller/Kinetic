import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A debugger pauses your running program on a line you choose, so you can see every variable and the chain of calls that got you there, then move forward one step at a time. It answers "where does this value go wrong?" without guessing or littering the code with console.log.',
    what: 'You set a breakpoint on a line; when execution reaches it, the program freezes. The call stack shows which function called which, the scope pane shows every variable in the selected frame, and watch expressions re-evaluate at each pause. Step over runs the current line (including any function it calls) and pauses on the next one; step into pauses inside the call instead; step out finishes the current function and pauses back in the caller; resume runs to the next breakpoint. Conditional breakpoints only pause when an expression is true, and logpoints print a message without pausing at all.',
    analogy: 'Watching a recipe being cooked on a video you can pause: freeze on any step, look at everything on the counter, skip a sub-recipe you trust ("make the sauce") in one jump, or zoom into it when you suspect it.',
    useCases: [
      'Finding where a wrong value first appears in a chain of function calls',
      'Pausing only on the one loop iteration or request that misbehaves',
      'Understanding unfamiliar code by stepping through it',
      'Logging values from code you can\'t (or don\'t want to) edit and redeploy',
    ],
    why: 'Guess-and-print debugging costs a rebuild per question and only shows what you thought to print. A debugger shows everything at the moment it matters, and finding the bug in five presses instead of fifty is the difference between minutes and an afternoon.',
    watch: 'The line where the program is paused is highlighted yellow; lines that haven\'t run yet are dimmed. Breakpoints are red dots in the gutter (as in VS Code; Chrome DevTools uses a blue line-number marker instead), conditional breakpoints are orange dots with a ?, and logpoints are violet diamonds. The top frame of the call stack is solid yellow (running); the frame you select to inspect is outlined blue. In the scope pane, a value that just changed flashes green. Yellow text at the end of a line shows variables\' current values. In the console, program output is green, logpoint output violet, your results blue and errors red; an expression outside the supported subset is orange.',
  },
  tryThis: [
    'Press Resume: execution pauses at the breakpoint on line 20. Now press Step over and watch total become 90 without ever visiting subtotal().',
    'Restart, then use Step into on line 20 instead: you land inside subtotal(), with a new frame on the stack.',
    'Choose "Conditional", click line 9 and Resume: it pauses only when i === 3. Then do the same with "Logpoint": the console fills with totals and nothing pauses.',
    'While paused inside applyDiscount(), click checkout() in the call stack to see its variables.',
    'Try the mission: find the bug in fewer presses than "Step into only".',
  ],
  keyIdeas: [
    'A breakpoint freezes the program; the call stack and scope show exactly how you got there.',
    'Step over still runs the whole call; it just doesn\'t pause inside it.',
    'Step into enters a call, step out finishes it and pauses on the line after the call site.',
    'Conditional breakpoints and logpoints target the one iteration that matters, without editing code.',
  ],
  quiz: [
    {
      q: 'You press Step over on a line that calls subtotal(items). What happens?',
      options: [
        'subtotal runs fully, then you pause on the next line',
        'subtotal is skipped and not executed',
        'You pause on the first line inside subtotal',
        'The program resumes to the next breakpoint',
      ],
      answer: 0,
      why: "Step over doesn't skip anything: the call runs (and its result is assigned), the debugger just doesn't pause inside it. Pausing inside is Step into. If there's a breakpoint inside, it still pauses there.",
    },
    {
      q: 'A loop runs 10,000 times and goes wrong only when id === 4217. Best tool?',
      options: [
        'A plain breakpoint and pressing Resume 4,217 times',
        'A conditional breakpoint: id === 4217',
        'Step into until you get there',
        'console.log every id',
      ],
      answer: 1,
      why: "A conditional breakpoint evaluates its expression each time the line runs and only pauses when it's true.",
    },
    {
      q: "You're paused inside applyDiscount(total, code). How do you see the variables of the function that called it?",
      options: [
        "Click the caller's frame in the call stack",
        'Step out, losing your place in the callee',
        'Add console.log in the caller and reload',
        "You can't while paused in the callee",
      ],
      answer: 0,
      why: "Selecting a lower frame shows its scope and the line it's waiting on, without moving execution, so there's no need to step out or reload.",
    },
    {
      q: 'What does a logpoint do?',
      options: [
        'Logs a message each time the line runs, no pause',
        'Pauses there and logs every variable',
        'Writes each hit to a log file on disk',
        'Records a full stack trace, then pauses',
      ],
      answer: 0,
      why: "It's a console.log you add from the debugger: it never pauses, and there's no code change, no rebuild and nothing to forget to delete.",
    },
  ],
};

export default lesson;
