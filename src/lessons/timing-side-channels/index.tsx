import type { LessonModule } from '../../core/types';
import { n } from './captions';
import { compareFacts, mitigationFacts, noiseFacts, traceFacts } from './facts';
import { Stage } from './Stage';

const compare = compareFacts();
const noise = noiseFacts();
const trace = traceFacts();
const mitigation = mitigationFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'How long code takes can depend on a secret: an early-exit comparison does more work the more of a guess is right, noise only raises how many measurements an observer needs, and the defender\'s test is that traces do not depend on secrets.',
    what: 'A function that returns at the first mismatching byte does a different amount of work for different guesses, and that difference is a signal. A constant-time comparison visits every byte and decides once at the end. Measurements are noisy, but the number of repeated observations needed to separate two cases grows with the square of the noise over the signal, so noise raises the cost of an observer without removing the leak. The defender checks whether the branches taken and the memory lines touched depend on the secret. Hardware that shares cache and predictor state between security domains is the root of a wider family of leaks, and each mitigation covers some classes at some price.',
    analogy: 'A guard who checks your badge number digit by digit and sends you away at the first wrong one. How long you stood at the desk tells you how many digits were right, even if he never says a word, and a busy lobby only means you need to watch for longer.',
    useCases: [
      'Comparing a token, a signature or a password hash without an early exit',
      'Reviewing crypto code for secret-dependent branches and table lookups',
      'Judging a claim like "the network adds too much noise for this to matter"',
      'Reading advice about Spectre-class mitigations and what each one costs',
    ],
    why: 'Timing differences are a quiet way for a secret to leave a system, and the fixes are cheap when you know where to look: a library comparison, equal-length digests, code whose behaviour does not depend on secrets. It builds on `branch-prediction` and `cache-coherence`, which show that branch and cache state are shared and observable.',
    watch:
      'Counting comparisons: a compared byte that matches is green, the first mismatch is red, and a byte never visited is a dim outline; the blue numbers give the order of the visits. The early-exit function\'s count is red because it carries the signal and the constant-time count is green. Noise: blue is the simulated time distribution when the first byte is wrong and violet when it is right. Traces: a leaking verdict is red and identical traces green, and the first differing event is red in the trace lists. Mitigations: a mitigation that is switched on is violet, and a class is green when covered, amber when only partly covered and red when open. Everything on this page is simulated, a toy or a fake token, and chips say which.',
  },
  tryThis: [
    `In "Counting comparisons" as it opens (the early-exit function, the guess matching the first ${n(compare.opening.early - 1)} bytes): early exit executes ${n(compare.opening.early)} comparisons and constant time ${n(compare.opening.constant)}. Press "All wrong": early exit drops to ${n(compare.allWrong.early)} while constant time stays at ${n(compare.allWrong.constant)}; press "All right": both are ${n(compare.allRight.early)}.`,
    `In "Counting comparisons", press "Wrong length": the guess is ${n(compare.wrongLengthBytes)} bytes against the token's ${n(compare.tokenBytes)}, so both functions stop at the length check with ${n(compare.wrongLength.early)} byte comparisons.`,
    `In "The signal in the noise" (signal 10, noise 40) about ${n(noise.opening)} observations per case separate the two distributions. Set the noise to ${n(noise.tenTimesSigma)}, ten times the signal: ${n(noise.tenTimes)}. Then raise the signal to 20: ${n(noise.strongerSignal)}. The difference never goes away; it only costs more to see.`,
    `In "Do the traces differ?" (a secret-dependent if, the far pair) the program leaks, with the traces differing at event ${n(trace.openingFirstDifference)}. Choose the pair "Same parity, same line": no leak for that pair, though the program is the same. Choose "One has a zero byte" and the broken compare: it leaks, and the constant-time compare does not.`,
    `In "Mitigations and what to use", switch on constant-time code: its class is ${mitigation.constantTimeCovers} and ${n(mitigation.afterConstantTime)} of ${n(mitigation.classes)} classes are still open. Switch on all ${n(mitigation.mitigations)}: ${n(mitigation.afterAllCovered)} classes covered, ${n(mitigation.afterAllPartly)} only partly and ${n(mitigation.afterAll)} open in this table, so the speculation and switch classes stay partial.`,
  ],
  keyIdeas: [
    'In this model an early-exit comparison executes one more comparison for each correct leading byte, up to the full token length, and a constant-time comparison executes the same number for every guess of one length.',
    'Noise raises how many observations are needed, roughly with the square of noise over signal, and does not remove the difference.',
    'A program is constant-time in this model when its branches and memory lines are identical for different secrets, and one passing pair is weak evidence.',
    'Use a library comparison for secrets, compare equal-length digests, and treat hardware mitigations as partial and priced.',
  ],
  quiz: [
    {
      q: 'The noise is ten times the per-byte timing difference. What changes for someone trying to observe the difference?',
      options: [
        'They need many more measurements to see it, but the difference is still there',
        'The difference is gone, because noise that large hides any signal from an observer',
        'They need the same number of measurements as on a quiet connection, since averaging cancels noise',
        'Nothing can be observed until the connection becomes quieter again, because the noise dominates',
      ],
      answer: 0,
      why: `The needed number of observations grows with the square of noise over signal: ${n(noise.tenTimes)} per case at ten times the signal, against ${n(noise.opening)} at four times. Noise raises the cost of an observer; it does not hide the leak.`,
    },
    {
      q: 'Which of these programs gives identical traces for ANY two different secrets in the lesson\'s model?',
      options: [
        'The masked select, which takes the same branches and touches the same lines whatever the secret',
        'The lookup indexed by a secret byte, since a table read is a single instruction',
        'The secret-dependent if, since only one of its branches is ever taken',
        'The broken compare, since it still does some comparisons before it returns',
      ],
      answer: 0,
      why: `The masked select does arithmetic on the secret but in this model it branches and loads the same way whatever the secret, so its traces match; the if and the lookup leak on some pairs, and the broken compare leaks on the zero-byte pair. On the far pair alone, ${n(trace.farLeakCount)} of ${n(trace.programs)} programs leak, which is why one pair proves little.`,
    },
    {
      q: 'Does "constant-time" mean the comparison is fast?',
      options: [
        'No: it means the work does not depend on the secret, and it visits every byte',
        'Yes: it stops at the first byte that differs, so it finishes sooner than a normal comparison does',
        'Yes: it skips the length check, which is the slowest step of the two functions in this lesson',
        'No: it means the function is deliberately slower than any other comparison that is available',
      ],
      answer: 0,
      why: `A constant-time comparison does the same ${n(compare.allWrong.constant)} comparisons for a guess that is entirely wrong as for one that is entirely right, while the early-exit function does ${n(compare.allWrong.early)} for the wrong one. It is about the work not depending on the secret, not about speed.`,
    },
    {
      q: 'You compare a secret token with `a === b` and a colleague suggests an HMAC-based comparison. What does comparing HMACs of both values add?',
      options: [
        'The two digests have equal length, so the length of the secret is not leaked',
        'The digests are short, so the comparison finishes before an observer would have time to measure it',
        'The comparison becomes a table lookup, which an observer cannot see through the cache at all',
        'The digest hides the secret from the server that holds it, whatever the server does with it next',
      ],
      answer: 0,
      why: 'Digests of both values have the same fixed length whatever the inputs, so there is no length mismatch to observe, and the comparison of digests can still be done with a constant-time function. It is no substitute for a vetted library.',
    },
    {
      q: 'A trace test on one pair of secrets shows identical traces for a program. What can you conclude?',
      options: [
        'Nothing firm: another pair might differ, as the zero-byte pair does for the broken compare',
        'The program is constant-time for every secret, because the test ran on two of them and they matched',
        'The program is safe from every hardware leak, because its traces came out identical on this pair',
        'The program leaks, because identical traces mean the observer saw nothing new in the second run',
      ],
      answer: 0,
      why: `One pair that matches is weak evidence: the broken compare shows no leak on the far pair and is caught by the zero-byte pair, which is the same program under a different pair.`,
    },
  ],
};

export default lesson;
