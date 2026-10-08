import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Generics let one definition work for many types while the compiler still checks every use; whether the type arguments survive to run time (erased, kept, or stamped out as copies) depends on the language.',
    what: 'Parametric polymorphism is code written once with a type parameter T (Box<T>, max<T>) that behaves the same for every type. It differs from ad-hoc polymorphism (overloading: a separate implementation per type, like + on numbers and strings) and subtype polymorphism (a Cat used wherever an Animal is expected). Compilers implement generics in three ways: check, then erase the type arguments (Java, TypeScript); keep them at run time (C#); or stamp out a specialised copy per type (Rust, C++). Variance decides whether a List<Cat> may be used as a List<Animal>: reading through it is safe, writing is not.',
    analogy: 'A labelled storage box: the label (T = string) is checked whenever something goes in, so you never have to look inside to know what comes out. Erasure peels the label off once checking is done; a reified type keeps it on the box.',
    useCases: [
      'Collections and wrappers: List<T>, Map<K, V>, Optional<T>, Promise<T>',
      'Utility functions like max, sort and groupBy that work for any comparable type',
      'Typed API clients and repositories (Repository<User>) with no copy per model',
      'Reading Java wildcard errors, or why Java has no new T()',
    ],
    why: 'Generics are in every typed codebase, and their sharp edges come up in code review and interviews: casts that blow up at run time, why Java has no new T(), ? extends versus ? super, and why TypeScript lets a Dog into a Cat[]. It builds on `type-systems` (the type variables inference leaves behind are generics) and `oop-fundamentals` (subtype polymorphism), and the two references to one list in Variance are the aliasing from `value-vs-reference`.',
    watch:
      'In Why generics, the box\'s violet tag is the type parameter and the value inside is a blue pill: green once it is used safely, red when the run-time crash comes, and a dashed orange pill above the box when the compiler rejected it. In the code, the yellow-barred line is the one running or being checked (in One class per type, the duplicated lines), an orange-tinted line was rejected at compile time, a red-tinted line threw at run time (or, in Variance, compiled into a corrupted list) and a green-tinted line was checked safe; console text is green for output, orange for compiler errors and red for the uncaught error. In Erasure vs copies, the generic definition is a violet box, compiled code (and C#\'s runtime types) are blue, joined by violet dashed links; the use being compiled is yellow, and the yellow bar under Compiled copies is the illustrative code size. In Variance, references are violet arrows from the slots to the one list; the value read or written travels as a pill along a dashed grey route: green when safe, orange when stopped at the orange compiler gate (an orange slot when the declaration itself is rejected), and red when it throws at run time (the list box turns red) or slips in unchecked (Dog ⚠ in the list).',
  },
  tryThis: [
    'In Why generics, play Untyped (any): 42 goes in, as string changes nothing, and line 7 throws only once it runs.',
    'Switch the Version to Box<T>: the same mistake is rejected by tsc, in orange, before anything runs.',
    'In Erasure vs copies, pick Rust, then Java: the same 4 uses compile to 3 copies, then to 1.',
    'In Variance, keep List<? extends Animal> and pick write a Dog, then view the cats as Animal[] (Java) and Animal[] (TypeScript).',
    'Pick Bounded T in Why generics and turn the Bound on: compareTo becomes callable.',
  ],
  keyIdeas: [
    'Parametric polymorphism: one definition for every type T, checked at each use, with no casts.',
    'Java and TypeScript erase type arguments after checking; C# keeps them; Rust and C++ copy the code per type.',
    'A List<Cat> is not a List<Animal>: reading through the wider type is safe, writing is not.',
    'A bound like T extends Comparable<T> says what every T can do, so the body may use it.',
  ],
  quiz: [
    {
      q: 'In Java, `new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()` is true. Why?',
      options: [
        'Java erases type arguments, so both are the same ArrayList class',
        'The JVM caches one list object and hands it to both calls',
        'getClass() ignores generics only for empty lists like these',
        'Integer and String share a common base class in the JVM',
      ],
      answer: 0,
      why: 'After checking, javac erases the type arguments: one ArrayList class serves every element type, so at run time there is nothing left to compare. They are two different objects; only their class is shared. C# would print False, because it keeps type arguments at run time.',
    },
    {
      q: 'A Rust program uses Vec<i32>, Vec<String> and Vec<Point>. What does the compiler produce?',
      options: [
        'Three specialised copies of the Vec code, one per type',
        'One shared copy that checks the element type at run time',
        'One copy that stores every element behind a generic pointer',
        'Three copies in debug builds, one shared copy in release',
      ],
      answer: 0,
      why: 'Rust monomorphises: each distinct type argument gets its own copy of the code, specialised for that type. That makes each copy fast, at the cost of binary size and compile time, in every build mode. A single shared copy is the erasure approach, which Java uses.',
    },
    {
      q: 'Java will not let you pass a `List<Cat>` where a `List<Animal>` is expected. What would go wrong if it did?',
      options: [
        'Code holding the List<Animal> could add a Dog to the cats',
        'Reading a Cat back out of it as an Animal would need a cast',
        'The list would have to be copied into a new list first',
        'Cat methods like meow() would vanish from the objects',
      ],
      answer: 0,
      why: 'A List<Animal> accepts any Animal, so through it you could add a Dog to a list that the rest of the code believes holds only cats. Reading is the safe direction (every Cat is an Animal, no cast needed), which is why List<? extends Animal> allows reads and blocks writes.',
    },
    {
      q: 'In TypeScript, `const animals: Animal[] = cats; animals.push(new Dog());` compiles. What happens when it runs?',
      options: [
        'It runs; cats now holds a Dog and fails later when used',
        'It throws a TypeError at the push, like ArrayStoreException',
        'The push is skipped because the array is really a Cat[]',
        'The Dog is converted to a Cat as it enters the array',
      ],
      answer: 0,
      why: 'TypeScript arrays are covariant and nothing checks at run time, because the types are erased to plain JavaScript. The push succeeds, and the damage shows up later, far away, when code calls cats[1].meow(). Java arrays are also covariant, but the JVM checks each store and throws ArrayStoreException.',
    },
    {
      q: 'Why does declaring `<T extends Comparable<T>>` let the body of max call `a.compareTo(b)`?',
      options: [
        'Every T a caller picks must have compareTo, so it exists',
        'It makes Java check for compareTo at run time instead',
        'It converts both arguments to Comparable before the call',
        'It turns off type checking inside the body of max only',
      ],
      answer: 0,
      why: 'A bound is a promise checked at every call site: callers may only pick a T that implements Comparable<T>. Inside the body, the compiler can then rely on compareTo existing. Nothing is converted or checked at run time, and checking stays on.',
    },
  ],
};

export default lesson;
