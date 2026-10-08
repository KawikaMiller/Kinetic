import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'SOLID is five rules of thumb for keeping a change in one place: apply them where change actually happens, not to every class by default.',
    what: 'Single responsibility (one reason to change), Open/closed (add behaviour without editing what works), Liskov substitution (a subtype must keep its base type\'s promises), Interface segregation (no client depends on methods it doesn\'t use) and Dependency inversion (depend on abstractions, not concrete details). Robert C. Martin gathered them; Michael Feathers coined the acronym; Liskov substitution is Barbara Liskov\'s and open/closed is Bertrand Meyer\'s. They are heuristics with costs: every interface is one more thing to read.',
    analogy: 'Like wiring a house with sockets instead of soldering every appliance to the mains. Sockets cost a little up front, and pay off the first time you swap a lamp, but nobody fits a socket for the doorbell.',
    useCases: [
      'Adding a new export format or payment method without reopening code that already works',
      'Spotting a subclass that throws "not supported", a sign it should not be a subclass',
      'Splitting a class two teams keep editing for different reasons',
      'Arguing in a code review about whether a new interface earns its keep',
    ],
    why: 'Junior code often works but resists change: one edit forces five more, or a subclass quietly breaks a caller. SOLID gives you names for those smells and a few standard fixes, and it comes up in design interviews. Just as useful is knowing when not to apply it, so you don\'t bury a small program in interfaces.',
    watch:
      'Boxes are classes and functions (grey), with interfaces tinted violet. Solid blue arrows mean "extends", dashed blue arrows "implements", and grey arrows "uses" (it names that class). Press play and the change ripples through: the class where it starts, or a class it adds, turns solid yellow; classes it has to edit turn solid red; classes that depend on edited code are tinted orange (re-test); the rest are tinted green (left alone). The code panel tints the changed lines yellow with a bar on the left. In the L scene, the function being run is solid yellow, a subclass that works is tinted green and one that breaks is solid red; the output prints each call in grey, results in green and the thrown error in red. In the stats, Edited is red, Added yellow and Re-test orange (grey at zero), and the comparison is green when this design touches no more classes than the other, red when it touches more. The principle letter is violet, and the design tag is a grey pill.',
  },
  tryThis: [
    'On S, play the violating design, then switch Design to Fixed and play again: 3 classes touched against 2.',
    'On O, play the fixed design: adding CsvExporter edits only one line of wiring, and no exporter that already worked.',
    'On L, play the violating design: saveAll throws a real TypeError for ReadOnlyFile, though the code is valid JavaScript.',
    'On I, play the violating design and watch SimpleScanner turn red: it gains a sixth method that just throws.',
    'Read each principle\'s "When it\'s overkill" note, and on D notice the fixed design adds an interface you\'d skip if nothing ever swapped the repository.',
  ],
  keyIdeas: [
    'The point of SOLID is that a likely change edits few classes. Measure a design by what a real change touches.',
    'A subclass that compiles can still break its callers: substitutability is about behaviour, not types.',
    'Fat interfaces force stubs; small, client-shaped interfaces keep unrelated classes out of a change.',
    'Every abstraction has a cost. Add interfaces where a second implementation or a test double needs them.',
  ],
  quiz: [
    {
      q: 'A teammate says SOLID means every class should get its own interface. What is the better reading?',
      options: [
        'Add one where a second implementation or a test double needs it',
        'Give every class one, so that any class can be swapped out later',
        'Only interfaces may depend on interfaces, never concrete classes',
        'Interfaces belong to the D principle; the other four forbid them',
      ],
      answer: 0,
      why: 'Dependency inversion asks high-level code to depend on an abstraction where the details vary. An interface with one implementation that never changes and is never faked is pure indirection, which is what each scene\'s "overkill" note warns about. "Every class" is the tempting answer, and the misconception.',
    },
    {
      q: 'ReadOnlyFile extends File compiles fine, but its write() throws. Which principle does that break?',
      options: [
        'Liskov: code written for File breaks when handed the subclass',
        'Single responsibility: the class now does reading and writing',
        'Open/closed: the subclass reached in and changed the File class',
        'None: it compiles, so the type checker has accepted the design',
      ],
      answer: 0,
      why: 'Substitution is about behaviour: saveAll was written against File\'s promise that write() works, and the subclass breaks that promise at runtime, as the real TypeError shows. Compiling only proves the method signatures line up, which is the misconception this question targets.',
    },
    {
      q: 'In the fixed O design, adding CSV still edits one existing function. Which one?',
      options: [
        'exporterFor, which maps a format name to an exporter',
        'Exporter, the interface that every format implements',
        'ReportJob, which runs an export for every report',
        'PdfExporter, the format that the product shipped first',
      ],
      answer: 0,
      why: 'Something has to know that "csv" means CsvExporter; that wiring is the one edit. The interface and every working exporter stay closed, so nothing that already shipped is reopened. "Closed for modification" never meant zero edits anywhere.',
    },
    {
      q: 'Why does "Add duplex printing" force a change to SimpleScanner in the violating design?',
      options: [
        'It implements the fat Printer interface, so it must stub the new method',
        'It calls print() on every page it scans, which now prints both sides',
        'It extends OfficePrinter, which gained a brand new duplex method',
        'The scanner driver has to learn a duplex setting for the paper tray',
      ],
      answer: 0,
      why: 'A class that implements an interface must provide every method on it, used or not. With one fat Printer interface, a printing feature lands on a device that cannot print. Split into Printing and Scanning, the scanner never hears about it.',
    },
    {
      q: 'In the violating S design, why must Dashboard and MonthlyJob be re-tested after a PDF layout change?',
      options: [
        'Both use Report, which is the class the layout change edited',
        'Both render PDFs of their own, which the change also edited',
        'The change edited lines of code inside both of those classes',
        'Every class must be re-tested after any change to the codebase',
      ],
      answer: 0,
      why: 'Neither class changed, but both depend on Report, and Report now ships different code. With totals in their own class, Dashboard depends only on Totals and is left alone. Re-testing everything is what teams do when they can\'t tell what depends on what, which is the cost this principle tries to cut.',
    },
  ],
};

export default lesson;
