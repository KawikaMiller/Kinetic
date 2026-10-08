import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Factory, Builder, Adapter and Decorator are named fixes for recurring problems in making and composing objects; each one is worth it only when its problem is really there.',
    what: 'A Factory puts the choice of which class to create in one place, so callers ask for "a payment client" instead of naming one. A Builder replaces a long list of positional arguments with named steps and one validation point. An Adapter makes an object you can\'t change fit the interface your code expects. A Decorator wraps an object in another with the same interface to add behaviour (logging, caching, retries) without touching it; decorators stack, and their order matters. All four trade a little indirection for a change that stays local.',
    analogy: 'A travel plug adapter lets your laptop (the app) use a foreign socket (the legacy API) without rewiring either. A decorator is a phone case: same phone, same buttons, extra protection, and you can stack a wallet case on top.',
    useCases: [
      'Choosing a payment, storage or email provider from config without if-chains in every caller',
      'Building HTTP requests, SQL queries or test fixtures step by step',
      'Wrapping a vendor SDK or legacy service behind the interface your code wants',
      'Adding logging, caching, retries or timing around a function (middleware, higher-order functions)',
    ],
    why: 'These names come up in every code review and design discussion, and knowing them lets you spot when a change will be local and when it will touch ten files. Equally important is knowing when not to use them: a factory with one implementation or a builder for three arguments is just noise. They build on `oop-fundamentals` (interfaces), `closures-scope` (decorators as wrapping functions) and `functional-programming` (higher-order functions); handing dependencies in from outside is a later step, `dependency-injection`.',
    watch:
      'In Factory, each file is a code panel; lines a change touches are tinted orange (with the file name in orange), and the Files touched number is orange for many files and green for one. In Builder, each positional argument has a violet dashed underline and its name appears in violet when revealed; build() prints the request in green when it accepts it and red ✕ lines when it refuses. In Adapter, the call travels in as a blue pill and the response comes back out green; the adapter box and its converted shape are violet, and a call that doesn\'t fit is red, with the legacy box outlined red. In Decorator, the layers are nested boxes around fetchUser: the layer handling the call is yellow, layers the call has reached are blue, layers not reached are grey and dashed, and a caching box filled green is a cache hit. The call travels in as a blue pill, the response out as a green one, an error as a red one; layer reports print in light blue and the core\'s own lines in grey. In the Recognise it strip, the current pattern has a yellow bar.',
  },
  tryThis: [
    'In Factory, press + add adyen: four files light orange. Switch Code to createPaymentClient() and only payments.ts does.',
    'In Builder, turn on show what each one means, then set retries to 9 and timeout to 0 ms: build() refuses with both reasons.',
    'In Adapter, set Between them to nothing (plug in directly) and play: the call does not fit.',
    'In Decorator, play caching outside retry, then retry outside caching: watch where the second call stops.',
    'Pick logging inside caching and play: the second call is a cache hit, and logging never sees it.',
  ],
  keyIdeas: [
    'Factory: callers ask for "a payment client" and one place picks the class, so a new provider touches one file.',
    'Builder: named steps and one validation point beat seven positional arguments; in JavaScript an options object is often enough.',
    'Adapter fits an interface you can\'t change to the one you need; a decorator keeps the same interface and adds behaviour.',
    'Decorators stack and reorder at run time, and the order changes behaviour. Singleton is mostly global state in disguise: prefer passing the object in.',
  ],
  quiz: [
    {
      q: 'How is a logging decorator different from a subclass that adds logging?',
      options: [
        'It wraps any same-interface object at run time, and stacks',
        'It is faster, because it avoids the cost of a virtual method call',
        'It can only add behaviour before a call, never after it returns',
        'It changes the original class, so every instance gets the logging',
      ],
      answer: 0,
      why: 'A decorator is a separate object with the same interface that holds the original and forwards to it, so it can wrap any implementation, be added or removed at run time, and be stacked and reordered. "It is just a subclass" is the misconception: inheritance fixes one combination at compile time and changes the class itself. A decorator can act before and after the call; speed is not the point.',
    },
    {
      q: 'caching wraps retry, which wraps fetchUser. The second call is a cache hit. What does retry do on that call?',
      options: [
        'Nothing: the hit is answered before the call reaches retry',
        'It retries once anyway, to check the cached value is fresh',
        'It runs first, because inner layers always run before outer',
        'It retries the cache lookup itself until the lookup succeeds',
      ],
      answer: 0,
      why: 'Calls travel in from the outermost layer. caching is outside retry, so it answers the hit itself and the call never goes deeper. Put retry outside caching and the second call passes through retry first (as the lesson shows), which is why the order of decorators is part of the design.',
    },
    {
      q: 'Four call sites each pick `new StripeClient()` or `new PaypalClient()` themselves. Adding Adyen touches how many files?',
      options: ['4, every call site', '1, only the factory', '2, one per provider', '0, just a new class'],
      answer: 0,
      why: 'With no factory, the choice of class is repeated at every call site, so all four have to change, and missing one is a bug. With createPaymentClient(config), only the factory changes: the lesson computes 4 versus 1 from the code itself.',
    },
    {
      q: 'In JavaScript, when is a builder worth it over a plain options object?',
      options: [
        'When building has steps or rules to check in one place',
        'Always: options objects are slower and less type-safe',
        'Never: JavaScript cannot express the builder pattern',
        'Only when the constructor has more than three arguments',
      ],
      answer: 0,
      why: 'An options object already gives you named, order-free arguments, which solves most of the positional-argument problem. A builder adds value when construction has steps or rules (a GET with no body, sane retry limits) that build() can enforce in one place. Argument count alone is not the test.',
    },
    {
      q: 'You own both the app and the client library, and their interfaces don\'t match. What is usually best?',
      options: [
        'Change one interface to fit, rather than adding an adapter',
        'Add an adapter, since adapters are always the cleaner fix',
        'Add a decorator, which converts shapes the same way',
        'Copy the library into the app and rewrite both halves',
      ],
      answer: 0,
      why: 'An adapter earns its keep at a boundary you can\'t edit: a vendor SDK, a legacy service. When you own both sides, an adapter is an extra layer that hides a mismatch you could simply fix. A decorator keeps the same interface, so it can\'t convert between two different ones.',
    },
  ],
};

export default lesson;
