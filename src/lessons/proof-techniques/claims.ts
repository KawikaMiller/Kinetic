import type { Candidate, Claim, LineRole, ProofLine } from './model';

const yes = (text: string, reason: string): Candidate => ({ text, ok: true, reason });
const no = (text: string, reason: string): Candidate => ({ text, ok: false, reason });
const line = (role: LineRole, ...candidates: Candidate[]): ProofLine => ({ role, candidates });

const TRUE_CLAIM =
  'The claim is true, so there is no counterexample to find: a search would never turn one up. Counterexamples refute false claims.';
const FALSE_CLAIM =
  'This claim is false (the slider below finds where), so no correct proof of it exists: every route would get stuck. A false "for every n" claim is refuted by one counterexample.';

export const CLAIMS: readonly Claim[] = [
  {
    id: 'odd-sum',
    label: 'Odd + odd',
    statement: 'If m and n are odd integers, then m + n is even.',
    p: 'm and n are odd',
    q: 'm + n is even',
    routes: {
      direct: {
        kind: 'script',
        lines: [
          line(
            'step',
            yes('Let m and n be odd integers.', 'assumption: a direct proof starts from the hypothesis p'),
            no('Let m + n be even.', "assumes what we're proving: m + n even is the conclusion q"),
            no('Let m = 3 and n = 5.', 'one example is not every pair of odd numbers: a proof has to cover all of them'),
          ),
          line(
            'step',
            yes('Then m = 2a + 1 and n = 2b + 1 for some integers a, b.', 'definition of odd'),
            no('Then m = 2a + 1 and n = 2a + 1 for some integer a.', 'one letter for both forces m = n; two different odd numbers need their own a and b'),
            no('Then m = 2a and n = 2b for some integers a, b.', "that's the definition of even, not odd"),
          ),
          line(
            'step',
            yes('So m + n = 2a + 2b + 2 = 2(a + b + 1).', 'algebra'),
            no('So m + n = 2a + 2b + 1.', 'arithmetic slip: the two +1s add up to 2, not 1'),
            no('So m + n is even, because 3 + 5 = 8.', "an example again: it shows one case, not the general a and b"),
          ),
          line(
            'conclude',
            yes('a + b + 1 is an integer, so m + n is even.', 'definition of even: 2 times an integer'),
            no('So m + n is a multiple of 4.', "doesn't follow: 2(a + b + 1) is a multiple of 4 only when a + b + 1 is even, and 1 + 1 = 2 isn't"),
            no('So m + n is odd.', 'contradicts the line above: 2 times an integer is even'),
          ),
        ],
      },
      contrapositive: {
        kind: 'stall',
        prefix: ['Suppose m + n is odd.'],
        why: "Then you'd have to show m or n is even, which is the same parity algebra run backwards. It can be done, but it gains nothing over the direct proof, so this builder only scripts Direct for this claim.",
      },
      contradiction: {
        kind: 'stall',
        prefix: ['Suppose m and n are odd, and m + n is odd.'],
        why: 'Writing m = 2a + 1 and n = 2b + 1 gives m + n = 2(a + b + 1), which clashes with "odd". That works, but it is just the direct proof inside a wrapper, so this builder scripts it as Direct.',
      },
      counterexample: { kind: 'stall', prefix: [], why: TRUE_CLAIM },
    },
  },
  {
    id: 'even-square',
    label: 'n² even ⇒ n even',
    statement: 'For every integer n: if n² is even, then n is even.',
    p: 'n² is even',
    q: 'n is even',
    routes: {
      direct: {
        kind: 'stall',
        prefix: ['Suppose n² is even.', 'Then n² = 2k for some integer k.'],
        why: 'From n² = 2k there is no direct way to n without a lemma such as "a prime that divides n·n divides n" (Euclid’s lemma), and writing "so n = 2j" straight away would assume the claim itself. Without that lemma the direct route stalls here; the contrapositive needs none, so try Contrapositive.',
      },
      contrapositive: {
        kind: 'script',
        lines: [
          line(
            'step',
            yes('Suppose n is odd (that is, not even).', 'assumption: the contrapositive starts from ¬q'),
            no('Suppose n² is odd.', "that's ¬p: the contrapositive starts from ¬q (n is not even) and has to reach ¬p"),
            no('Suppose n is even.', "that's q, the conclusion: assuming it proves nothing"),
          ),
          line(
            'step',
            yes('Then n = 2k + 1 for some integer k.', 'definition of odd'),
            no('Then n² = 2k + 1 for some integer k.', "that's where we are trying to get, not something we know yet"),
            no('Then n = 2k for some integer k.', "that's the definition of even, not odd"),
          ),
          line(
            'step',
            yes('So n² = 4k² + 4k + 1 = 2(2k² + 2k) + 1.', 'algebra'),
            no('So n² = 4k² + 1.', 'algebra slip: (2k + 1)² = 4k² + 4k + 1; the middle term is missing'),
            no('So n² = 2k² + 1.', "algebra slip: (2k + 1)² isn't 2k² + 1 (k = 1: 9, not 3)"),
          ),
          line(
            'step',
            yes('2k² + 2k is an integer, so n² is odd.', 'definition of odd'),
            no('So n² is even.', '2 times an integer, plus 1, is odd, not even'),
            no('So n is odd, as we assumed.', 'circular: that only repeats the assumption, it says nothing about n²'),
          ),
          line(
            'conclude',
            yes('So ¬q → ¬p holds, which is equivalent to p → q: if n² is even, n is even.', 'contrapositive equivalence'),
            no('So q → p: if n is even, then n² is even.', "that's the converse: true, as it happens, but it is neither what we proved nor what was claimed"),
            no('So n² is odd for every integer n.', 'only odd n were assumed: 4² = 16 is even'),
          ),
        ],
      },
      contradiction: {
        kind: 'stall',
        prefix: ['Suppose n² is even and n is odd.'],
        why: 'From n odd you get n² odd, which clashes with n² even. That works, and it is the contrapositive proof wrapped in a contradiction, so this builder scripts it as Contrapositive.',
      },
      counterexample: { kind: 'stall', prefix: [], why: TRUE_CLAIM },
    },
  },
  {
    id: 'sqrt2',
    label: '√2 is irrational',
    statement: '√2 is irrational: it is not a/b for any integers a and b.',
    p: '√2 is irrational',
    routes: {
      direct: {
        kind: 'stall',
        prefix: [],
        why: '"Irrational" only means "not a ratio of integers", so there is no positive fact to start from and build on. Assume the opposite instead: Contradiction.',
      },
      contrapositive: {
        kind: 'stall',
        prefix: [],
        why: 'There is no "if" part to swap: the claim is a plain statement about √2, not an implication p → q. Contradiction is the usual tool for "is not" claims.',
      },
      contradiction: {
        kind: 'script',
        lines: [
          line(
            'assume',
            yes('Suppose √2 is rational: √2 = a/b for integers a, b with b ≠ 0, in lowest terms.', 'assumption, the negation of the claim; any fraction can be put in lowest terms by dividing out the gcd'),
            no('Suppose √2 is irrational.', "assumes what we're proving: a contradiction proof assumes the opposite"),
            no('Suppose √2 = a/b for some integers a, b.', 'close, but without "in lowest terms" the clash at the end disappears: a and b both even would contradict nothing (and b must not be 0)'),
          ),
          line(
            'step',
            yes('Then 2 = a²/b², so a² = 2b².', 'algebra: square both sides, then multiply by b²'),
            no('Then 2 = a/b², so a = 2b².', 'squaring slip: (a/b)² is a²/b²'),
            no('Then a = 2b.', "doesn't follow: a/b is √2, not 2"),
          ),
          line(
            'step',
            yes('So a² is even, and therefore a is even.', 'a² = 2b² is even; then "n² even ⇒ n even", the previous claim'),
            no('So a² is even, and therefore a = 2.', "doesn't follow: a² even makes a even, not a = 2"),
            no('So b² is even, and therefore b is even.', "doesn't follow yet: a² = 2b² says a² is even; it says nothing about b² so far"),
          ),
          line(
            'step',
            yes('Write a = 2c. Then 4c² = 2b², so b² = 2c².', 'substitution and algebra'),
            no('Write a = 2c. Then 4c² = 2b², so b² = 4c².', 'algebra slip: dividing 4c² = 2b² by 2 gives b² = 2c²'),
            no('Write a = 2c + 1.', 'that makes a odd, but the line above showed a is even'),
          ),
          line(
            'step',
            yes('So b² is even, and therefore b is even.', 'the same lemma, "n² even ⇒ n even"'),
            no('So b is odd.', "doesn't follow: b² = 2c² is even, so b is even"),
            no('So b² = c².', 'algebra slip: b² = 2c²'),
          ),
          line(
            'clash',
            yes('a and b are both even, so a/b was not in lowest terms: a contradiction.', 'contradiction with the assumption'),
            no('a and b are both even, so √2 = 2.', "doesn't follow: dividing a and b by 2 leaves the ratio unchanged"),
            no('So √2 is rational after all.', 'backwards: every step came from assuming √2 rational and ended in a clash, so that assumption is what has to go'),
          ),
          line(
            'conclude',
            yes('So the assumption is false: √2 is irrational.', 'proof by contradiction: ¬p → ⊥, so p'),
            no('So a and b are both even numbers.', "that's an intermediate fact, not the conclusion about √2"),
            no('So √2 is not a number.', "√2 is a real number; what broke is the assumption that it's a ratio of integers"),
          ),
        ],
      },
      counterexample: { kind: 'stall', prefix: [], why: TRUE_CLAIM },
    },
  },
  {
    id: 'euler',
    label: 'n² + n + 41 always prime?',
    statement: 'For every natural number n, n² + n + 41 is prime.',
    p: 'n² + n + 41 is prime for every n',
    routes: {
      direct: { kind: 'stall', prefix: [], why: FALSE_CLAIM },
      contrapositive: { kind: 'stall', prefix: [], why: FALSE_CLAIM },
      contradiction: { kind: 'stall', prefix: [], why: FALSE_CLAIM },
      counterexample: {
        kind: 'script',
        lines: [
          line(
            'step',
            yes('To refute "for every n, P(n)", one n where P(n) fails is enough.', '¬∀n P(n) ≡ ∃n ¬P(n)'),
            no('To refute it, show it fails for most n.', 'one failure is enough; showing it fails for most n is not what refutes a "for every" claim'),
            no('n = 0 to 39 all give primes, so the claim is true.', 'examples never prove a "for every n" claim: 40 passing cases and it still fails'),
          ),
          line(
            'step',
            yes('Take n = 40: 40² + 40 + 41 = 1681.', 'arithmetic: 1600 + 40 + 41'),
            no('Take n = 39: 39² + 39 + 41 = 1601.', '1601 is prime, so n = 39 passes (check it on the slider)'),
            no('Take n = 10: 10² + 10 + 41 = 151.', '151 is prime, so n = 10 passes (check it on the slider)'),
          ),
          line(
            'clash',
            yes('1681 = 41 × 41, so it is not prime.', 'factoring: 40² + 40 + 41 = 40·41 + 41 = 41·41'),
            no('1681 is odd, so it is not prime.', 'odd does not mean composite: 1601 is odd and prime'),
            no('1681 ends in 1, so it is not prime.', 'the last digit says nothing here: 41 ends in 1 and is prime'),
          ),
          line(
            'conclude',
            yes('So the claim is false: n = 40 is a counterexample.', '∃n ¬P(n), so ¬∀n P(n)'),
            no('So the claim fails only at n = 40.', 'we showed one failure, not that it is the only one: n = 41 gives 1763 = 41 × 43'),
            no('So the claim holds for every n except 40.', 'we checked one value, not all the others, and a "for every n" claim with an exception is false anyway'),
          ),
        ],
      },
    },
  },
];
