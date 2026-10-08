import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Strategy, Observer, Command and State are named ways to organise how objects behave and talk: swap an algorithm, broadcast a change, turn an action into an undoable object, and replace tangled flags with a state machine.',
    what: 'A Strategy puts each interchangeable algorithm (a shipping rule) in its own small function, chosen at run time, so adding one does not edit a growing switch. An Observer lets a subject notify any number of subscribers without knowing what they do, but the subject keeps a reference to each until it is told to let go. A Command turns an action into an object that can run, be undone, be replayed or be logged; undo and redo are two stacks of them. A State machine lists the few states something can be in and the events that move it between them, instead of several booleans whose combinations nobody checked.',
    analogy: 'A strategy is choosing a courier at checkout. An observer is a newsletter: the sender mails whoever is on the list, and anyone who moves house without unsubscribing keeps getting mail. A command is a line in a to-do list with an "undo" next to it; a state machine is a traffic light that can only show one colour.',
    useCases: [
      'Pricing, sorting, retry or compression rules that vary by customer, config or request',
      'Event listeners, store subscriptions and webhooks: anything that notifies several parties',
      'Undo and redo in editors, and queues of jobs you can log, retry or send to a server',
      'UI flows, order and payment lifecycles, connection handling, and any "what can I press now" logic',
    ],
    why: 'These patterns show up in every codebase under other names: callbacks, listeners, reducers, job queues, status enums. Knowing them explains real bugs, above all the observer that is never unsubscribed, one of the commonest leaks in long-running apps, and why flag soup breeds impossible states. They build on `oop-fundamentals` and `closures-scope`; the observer is the same idea as event listeners in `dom-events`, and its leak is the one in `memory-leaks`.',
    watch:
      'In Strategy, the chosen carrier and its price are yellow, and lines the new carrier adds are tinted orange. In Observer, the price feed and notifications are blue (a notification is a travelling pill); a live subscriber is green, one that was unmounted without unsubscribing is red, and a detached one is dimmed grey. In Command, the selected shape has a yellow ring, undo-stack entries are violet and redo-stack entries light blue (the top entry is the next to be undone or redone), and unavailable buttons are dimmed. In State, the current state is a solid yellow circle, the transition just taken a thick yellow arrow, and presses that do nothing in this state are dimmed grey with their reason listed. In the flags table, nonsense combinations are tinted red, valid ones outlined in grey, and the current state\'s row has yellow rings.',
  },
  tryThis: [
    'In Strategy, press + add overnight with Code on one switch, then again on strategy table: one edits the working function, the other does not.',
    'Pick free over 50 and compare the $50 and $51 orders: exactly 50 still pays.',
    'In Observer, press preset: forgotten unsubscribe, then Publish a price three times: the dead chart is still called and the retained count climbs.',
    'In Command, draw three shapes, undo twice, then draw once more: the redo stack empties.',
    'In State, press play, then network drop, then pause (dimmed: read the reason), and switch Same logic as to boolean flags.',
  ],
  keyIdeas: [
    'Strategy: each interchangeable algorithm is its own function, chosen at run time, so adding one touches no existing code.',
    'Observer: the subject holds a reference to every subscriber until it unsubscribes, so a forgotten unsubscribe keeps a dead one alive and called.',
    'Command: an action as an object that can run and reverse itself, which is all undo, redo, logging and job queues need.',
    'State: a table of states and events beats boolean flags, which allow combinations no one meant (four flags, 16 combinations, 4 real).',
  ],
  quiz: [
    {
      q: 'A component subscribes to a price feed on mount and is later removed without unsubscribing. What happens?',
      options: [
        'The feed keeps calling it and it cannot be freed',
        'It is garbage collected, and the feed skips it',
        'The feed throws an error the next time it notifies',
        'It is freed once its last message has been handled',
      ],
      answer: 0,
      why: 'The subject holds a reference to the subscriber, so it stays reachable: it is still called on every publish and its memory is never reclaimed. "Observers clean themselves up" is the misconception; nothing is released until it unsubscribes. The feed does not know the component is gone, so it does not throw either.',
    },
    {
      q: 'You undo twice, then perform a new action. What happens to the two undone commands?',
      options: [
        'They are discarded: the redo stack is cleared',
        'They stay on the redo stack for a later redo',
        'They are replayed after the new action runs',
        'They move back onto the undo stack, in order',
      ],
      answer: 0,
      why: 'Redo only makes sense for a future that follows the present state. A new action creates a different history, so the undone commands no longer apply and the redo stack is cleared. Keeping them would let a redo apply a command to a document it was never made for.',
    },
    {
      q: 'What is the main downside of adding a fourth carrier as one more case in a shipping `switch`?',
      options: [
        'It edits the working function, putting every carrier at risk',
        'A switch can never hold more than three cases in JavaScript',
        'Switch statements run much slower than a table lookup does',
        'The strategy table avoids having to test the new carrier',
      ],
      answer: 0,
      why: 'In the switch version the new case goes inside shipping(), which already works, so any slip can break the existing carriers. A new entry in a table of strategies leaves that function alone. Speed is irrelevant at this scale, and either version still needs a test for the new carrier.',
    },
    {
      q: 'A player with flags isPlaying, isPaused, isBuffering and isStopped has 16 combinations. How many are real states?',
      options: ['4, one per state', '16, every combination', '8, half of them', '5, one more than states'],
      answer: 0,
      why: 'A real state is exactly one flag set: Playing, Paused, Buffering or Stopped. The other 12 (nothing set, or two or more at once) are impossible states the flags can still represent, which is the argument for one state variable and a transition table.',
    },
    {
      q: 'In the state machine, pressing pause while Stopped does nothing. Why is that better than allowing it?',
      options: [
        'The machine lists valid transitions, so others are refused',
        'Allowing it would crash, because a stopped player has no state',
        'Pause is only ever valid in the Playing and Buffering states',
        'Refusing keeps the pause button hidden from the interface',
      ],
      answer: 0,
      why: 'Every (state, event) pair is either in the transition table or not, so an event that makes no sense is ignored in one place. With flags, each handler has to re-check every other flag. Pause is valid in Playing only in this model, and whether the button is hidden or dimmed is a UI choice (here it is dimmed, with the reason shown).',
    },
  ],
};

export default lesson;
