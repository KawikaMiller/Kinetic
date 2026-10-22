import type { LessonModule } from '../../core/types';
import { FACTS as F, n } from './facts';
import { Stage } from './Stage';

const sites = F.bucketSites.map((s) => `b${s}`).join(' and ');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A fuzzer feeds a program thousands of mutated inputs and watches for a crash; keeping the inputs that reach new branches is what lets it climb through checks that random bytes almost never pass.',
    what: `Fuzzing runs a target on generated inputs and records what happens. A blind fuzzer draws fresh random bytes each time; a coverage-guided one keeps any input that reaches a branch edge not seen before and mutates the kept inputs. On this lesson's invented record format, guided covers ${F.guidedEdges} of ${F.total} edges in ${n(F.executions)} executions and blind covers ${F.blindEdges}. A crash is then shrunk to the few bytes that matter and filed under the branch that threw, and a bug nothing checks for stays invisible.`,
    analogy: 'It is a safe-cracker who listens for each click: feedback on every correct digit turns a search over all four digits at once into four small searches.',
    useCases: [
      'Finding crashes and over-reads in parsers for file formats and network messages before an attacker or a user does',
      'Running a fuzzer in continuous integration against a function that takes untrusted bytes',
      'Turning a crash report into a small, deduplicated test case a developer can act on',
      'Pairing a fuzzer with sanitizers or property checks so that silent bugs become failures it can see',
    ],
    why: 'Parsers meet bytes their authors never imagined, and the bugs that matter are the ones that pass every example you thought to write. Knowing why guidance works, what an oracle is and what a crash count does not tell you lets you read a fuzzing report without over- or under-trusting it.',
    watch: 'In the control-flow graph a covered branch and its arrow are green (--ok), the branches the newest discovery reached are yellow (--hi), a branch where a crash happened is red (--bad) and branches never reached are grey (--dim). In the plot the green line is the guided fuzzer and the red line the blind one, the red being the costly side of the comparison. In the corpus tree the entry you picked is yellow, its ancestors and the arrows to them violet (--violet) and the other entries grey. In the byte views the magic bytes are amber, the length byte pink and the payload sky blue; while minimising, the chunk being tried is blue (--info) and the rest of the crashing input red. The over-reads count is orange (--orange).',
  },
  tryThis: [
    `Blind vs guided, on the defaults (seed ${F.seed}, ${n(F.executions)} executions, byte-by-byte magic check): guided covers ${F.guidedEdges} of ${F.total} edges, gets the magic bytes accepted at execution ${n(F.guidedMagicAt)} and first crashes at execution ${n(F.guidedFirstCrash)}; blind covers ${F.blindEdges}. Switch the magic check to one 4-byte comparison: guided covers ${F.guidedSingleEdges} of ${F.totalSingle}.`,
    `The corpus, on the defaults: it holds ${F.corpusSize} entries. Click entry #${F.lastEntryId}: it came from entry #${F.lastEntryParent} and was kept for reaching ${F.lastEntryEdges.join(' and ')}.`,
    `A crash, on the defaults: ${n(F.crashes)} crashing inputs fall into ${F.bucketCount} buckets (${sites}). Press play: the largest input of ${`b${F.bucketSites[0]}`} shrinks from ${F.largestLength} bytes to ${F.minimisedLength} in ${F.minimiseTries} tries.`,
    `No oracle, no bug, on the defaults: the reader checks bounds, ${n(F.oracleOnCrashes)} executions crash and the typed input crashes (${F.probeOn}). Switch the check off: ${F.oracleOffCrashes} crashes, yet ${n(F.oracleOffOverReads)} executions still read past the end, and the typed input becomes ${F.probeOff} with ${F.probeOffOverReads} reads past the end.`,
  ],
  keyIdeas: [
    `Feedback is what separates guided from random: in this model guided covers ${F.guidedEdges} of ${F.total} edges and blind ${F.blindEdges}, and with a single 4-byte comparison guided covers ${F.guidedSingleEdges} of ${F.totalSingle}, because partial progress through the magic bytes is invisible.`,
    `Coverage is a signal, not a goal: a kept input is one that reached an edge nothing before it did, and this run's corpus of ${F.corpusSize} inputs found a crash at execution ${n(F.guidedFirstCrash)}.`,
    `A crash is the start of triage: ${n(F.crashes)} crashing inputs fall into ${F.bucketCount} buckets, and the largest input of ${`b${F.bucketSites[0]}`} shrinks from ${F.largestLength} bytes to ${F.minimisedLength}.`,
    `A fuzzer reports what something checks for: in this model, with the bounds check off this run finds ${F.oracleOffCrashes} crashes while ${n(F.oracleOffOverReads)} executions still read past the end.`,
  ],
  quiz: [
    {
      q: 'What does a coverage-guided fuzzer do that a blind one does not?',
      options: [
        'It builds each input from a grammar of the file format so that the target accepts it',
        'It runs the target on faster hardware so it can try far more inputs in the same time',
        'It keeps inputs that reach a new branch edge and mutates those to go further',
        'It reads the source code and works out which values would reach each unvisited branch',
      ],
      answer: 2,
      why: `Both fuzzers run the same toy target on the same seed. Guided kept ${F.corpusSize} inputs and covered ${F.guidedEdges} of ${F.total} edges; blind drew fresh bytes each time and covered ${F.blindEdges}. The feedback, not the randomness, is the difference.`,
    },
    {
      q: 'A fuzzer ran twenty thousand executions and found no crash. What does that show?',
      options: [
        'The target did not crash on those inputs under this oracle; a bug can remain in places the inputs never reached',
        'The target is free of bugs, because random inputs would have exposed one if it existed',
        'The corpus was too small, so the fuzzer needs a larger starting input to find anything',
        'The program is memory safe, because an over-read would have raised an error by itself',
      ],
      answer: 0,
      why: `In this model the run with the single 4-byte comparison covers ${F.guidedSingleEdges} of ${F.totalSingle} edges and finds no crash although the bug is there. With the bounds check off, ${n(F.oracleOffOverReads)} executions read past the end and ${F.oracleOffCrashes} are reported.`,
    },
    {
      q: 'Every line of the parser is covered by the corpus. Why is the parser not necessarily well fuzzed?',
      options: [
        'Line coverage counts only the lines before the first branch, so later lines are skipped entirely',
        'A covered line has been proved correct for all inputs, so more fuzzing adds nothing to the proof',
        'Coverage is measured on the blind fuzzer alone, so the guided corpus is not part of the figure',
        'A covered line may never have seen the value that breaks it, like an oversized length byte',
      ],
      answer: 3,
      why: `Covering the loop's edge shows that a read happened, nothing more; the crash needs a length byte that promises more bytes than the input holds. Here the magic bytes were accepted at execution ${n(F.guidedMagicAt)} and the first crash came at execution ${n(F.guidedFirstCrash)}.`,
    },
    {
      q: 'Why does the minimiser keep dropping bytes only while the input crashes at the same site?',
      options: [
        'A crash at another site proves the first one was a false alarm that the fuzzer should discard',
        'A smaller input that crashes elsewhere would be a different bug, so the report would stop describing the original',
        'The target accepts only inputs of a fixed length, so shorter ones are rejected before the parser',
        'The minimiser has no way to run the target, so it reuses the crash that was saved earlier',
      ],
      answer: 1,
      why: `Dropping bytes can move a crash from one branch to another, and the buckets are keyed by that branch (${sites} here). The result of ${F.minimisedLength} bytes is 1-minimal: removing any one byte stops the crash at ${`b${F.bucketSites[0]}`}.`,
    },
  ],
};

export default lesson;
