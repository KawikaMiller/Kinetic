import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A test double stands in for a real dependency so a unit test is fast and repeatable, and each kind (dummy, stub, spy, mock, fake) can see different things, so the kind you pick decides which bugs the test can catch.',
    what: 'Gerard Meszaros named five kinds. A dummy is passed in but never used. A stub returns canned answers. A spy records how it was called so the test can check afterwards. A mock is set up with expectations and verifies the calls itself (behaviour verification, where most tests check the result, which is state verification). A fake is a working, simplified implementation, like an in-memory ledger. Doubles buy speed and determinism, but they only know what the test author told them, so a test that mocks everything mostly checks that the code calls its mocks.',
    analogy: 'Rehearsing a play with stand-ins: one just stands there (dummy), one reads the same line every time (stub), one takes notes on what you said (spy), and one walks off if you skip your cue (mock). None of them tells you the real actor plays the scene differently.',
    useCases: [
      'Unit tests that replace a payment API with a stub or a fake so they run in milliseconds offline',
      'jest.fn(), Sinon spies and unittest.mock checking that an email was sent exactly once',
      'In-memory fakes (a fake repository, an SQLite file instead of the production database) for fast service tests',
      'Fake clocks and seeded random sources so time and chance stop making tests flaky',
    ],
    why: 'Picking the wrong double is how test suites end up green while production breaks: a stub hides a bug in the code it replaced, and a mock copied from the code enshrines the code\'s own wrong assumption. Knowing what each kind can observe lets you write unit tests that are fast and still catch the bugs you care about, and know which integration test you still need on top (`test-pyramid`).',
    watch: 'checkout(), the function under test, is solid yellow in the middle. Its four dependencies are washed violet when real and sky blue when a double, with the kind written on a badge under each box in the same colour. When a call is made its arrow turns blue and the dependency box fills solid. In the code panels a red-tinted line is a planted bug, the test line that built the stand-in being called gets a yellow bar, and in the Over-mocking scene so does the refactored line. The console prints a pass in green and a failure in red, with the calls in grey. With a bug planted, the table below the graph shows each kind for that dependency: caught in green, shipped in red, fails anyway in orange, with the current kind\'s heading in yellow.',
  },
  tryThis: [
    'Plant Email never sent and run the test: the mock EmailSender catches it. Switch EmailSender to stub and run again: it ships.',
    'Plant Tax rounding wrong: the stubbed TaxService hides it. Pick spy or real for TaxService and run again.',
    'Plant Charges twice and compare stub, fake and mock for PaymentGateway in the table.',
    'Set PaymentGateway to real and press Run the test four times: slow, over the network, and run #4 times out.',
    'Open the Over-mocking scene and run it: everything is mocked, the integration bug is there, and the test passes.',
  ],
  keyIdeas: [
    'A stub feeds answers in; a mock or spy checks the calls that go out.',
    'A double can only catch what it can observe, so pick it for the bug you want to catch.',
    'A stub hides bugs in the code it replaces: that code needs its own tests.',
    'Mocks copied from the code test your assumptions, not the real API, and break on harmless refactors.',
  ],
  quiz: [
    {
      q: 'What actually separates a mock from a stub?',
      options: [
        'A mock checks how it was called; a stub only hands back answers',
        'A mock comes from a library; a stub is something written by hand',
        'A stub belongs in unit tests; a mock only in integration tests',
        'Nothing: they are the same thing, and the name varies by framework',
      ],
      answer: 0,
      why: 'A stub supplies indirect inputs (canned return values) and the test checks the result. A mock carries expectations about the calls it receives and fails the test when they are not met. Libraries happily make both, which is why people say they are the same thing; the difference is what the test verifies.',
    },
    {
      q: 'A test mocks every dependency and passes, but in production the gateway rejects the request: it wants a field called currency. Why did the test miss it?',
      options: [
        "The mock was set up from the code's assumptions, not the real API",
        'Mocks are not able to check the arguments a method is called with',
        'The test should have passed a dummy for the payment gateway',
        'The bug was in production settings, so no test could ever see it',
      ],
      answer: 0,
      why: "The mock expected exactly what checkout sends, currencyCode included, because that's what the author copied from the code. Mocks can check arguments; they check them against the test's beliefs. A fake that enforces the real API's rules, or a contract or integration test, is what catches it.",
    },
    {
      q: 'checkout must send a receipt email. Which stand-in for EmailSender lets a test notice when it does not?',
      options: [
        'A mock, a spy, or a fake outbox the test looks inside',
        'A stub that returns success for every send() call',
        'A dummy, since the test never reads anything back',
        'The real mail server, as long as the call is quiet',
      ],
      answer: 0,
      why: 'Missing a call is invisible to anything that only answers calls. Something has to record sends so the test can ask "was it sent, once, to Ada?". A dummy is the most tempting wrong answer: with the bug it passes (it is never called), and without the bug it fails, so it tells you nothing.',
    },
    {
      q: 'The tax stub returns 330 and every checkout test passes, yet customers are charged a cent too little. Where is the bug most likely?',
      options: [
        'In the real TaxService, which the stub replaced',
        'In checkout, which adds the tax the wrong way round',
        'In the stub, which should have returned 329 cents',
        'In the test runner, which rounds money to the cent',
      ],
      answer: 0,
      why: "With the stub in place, checkout's arithmetic was tested and is fine, and the real TaxService never ran. Here it floors 329.9175 to 329 instead of rounding to 330. Changing the stub to 329 would just copy the bug into the test.",
    },
  ],
};

export default lesson;
