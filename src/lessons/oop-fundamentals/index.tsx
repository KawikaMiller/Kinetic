import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Objects bundle data with the methods that act on it. Calling a method looks it up on the object\'s class and then up the inheritance chain, so one call can run different code for different objects.',
    what: "A class describes a kind of object: its data and its methods. A subclass extends a class and inherits everything, and it can override a method with its own version. When you call obj.method(), the language looks on obj's own class first, then its parent, and so on up the chain, and runs the first implementation it finds. That is polymorphism: code written against Shape works with any subclass, with no if/else on the type. Encapsulation keeps data private so only the class's own methods can change it, which lets them protect rules (invariants) like \"balance never goes negative\".",
    analogy: "A remote with a single \"play\" button works on any player: the TV, the speaker and the game console each do their own thing when you press it. You don't need a different button for each device.",
    useCases: [
      'Plugins, UI components and drivers that share one interface',
      'Framework base classes you extend (controllers, models, components)',
      'Keeping invariants safe behind methods, like a bank balance or a cache size',
      'Deciding between inheriting from a class and composing it from parts',
    ],
    why: 'Almost every codebase and framework uses objects, inheritance and interfaces. Knowing how method lookup really works lets you read unfamiliar class hierarchies, and knowing when inheritance hurts (fragile base classes, broken is-a relationships) saves you from designs that are painful to change.',
    watch: "In Method dispatch, each box is a class listing only the methods defined on it, and violet arrows point from a subclass to the class it extends. The blue box is the object, and its [[Prototype]] arrow points at its class. The lookup rings the class it's checking in yellow, and the class where it finds the method in green, with that method's line lit in green and highlighted in the code. In Encapsulation, the violet dashed vault is the private field: a green path through a method is allowed, and a red one is refused. A direct poke at the field gets a red ✕ and shakes the vault. In Inherit vs compose, red boxes tagged \"now renders\" were changed by the base-class edit, and the violet Renderer box is a composed part with a has-a arrow. In Is a Square a Rect?, the shape is drawn to scale: blue while it's a valid square, red once its width and height differ.",
  },
  tryThis: [
    'In Method dispatch, call area() on the square: the lookup skips Square and finds Rect\'s version.',
    'Call describe() on the circle: Shape\'s code ends up running Circle\'s area().',
    'Call setWidth(5) on the circle: the lookup reaches the top and throws.',
    'In Encapsulation, try withdraw(500) and acct.#balance = 1e6.',
    'In Inherit vs compose, press the button under each design and compare what turns red.',
  ],
  keyIdeas: [
    'Method lookup starts at the object\'s class and walks up the inheritance chain.',
    'Polymorphism: the same call runs each class\'s own version, with no if/else on the type.',
    'Private fields plus methods let a class guard its invariants.',
    'Inheritance couples every subclass to the base; composition lets each object opt in.',
  ],
  quiz: [
    {
      q: 'Shape.describe() calls this.area(). A Circle calls describe(). Whose area() runs?',
      options: ["Shape's, because describe is defined on Shape", "Circle's, because the lookup starts again from the object", 'Both, one after the other', 'Neither: it throws'],
      answer: 1,
      why: "this is still the circle, so this.area() is looked up from Circle first. That's polymorphism: the base class calls whatever the real object provides.",
    },
    {
      q: 'What does polymorphism replace?',
      options: ['Loops', 'Chains of if (shape.type === ...) checks scattered through the code', 'Variables', 'Private fields'],
      answer: 1,
      why: 'Each class implements the method its own way, so callers just call it. No switch on the type is needed, and adding a new shape means adding a class, not editing every if/else.',
    },
    {
      q: 'Square extends Rect, and Rect has setWidth(w). What happens after sq.setWidth(5)?',
      options: ['Both sides become 5', 'Only the width changes, so the "square" is 5 × 2', 'It throws', 'Nothing'],
      answer: 1,
      why: "Square inherits Rect's setWidth, which only knows about width. The square's own rule (equal sides) breaks: a sign that Square isn't really a substitutable Rect.",
    },
    {
      q: 'Outside the class, code runs acct.#balance = 1e6. What happens?',
      options: ['The balance becomes 1,000,000', 'A SyntaxError: private fields can only be used inside the class', 'It silently does nothing', 'It creates a public field called #balance'],
      answer: 1,
      why: 'JavaScript rejects the code before it runs. Private (#) fields are only accessible from inside the class body, so the methods stay in control of the data.',
    },
  ],
};

export default lesson;
