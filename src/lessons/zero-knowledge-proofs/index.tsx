import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A zero-knowledge proof lets a prover convince a verifier that it knows a secret while, for an honest verifier, the transcript could have been made without the secret, and a prover who cheats is caught with a probability that grows with the rounds, provided the challenges are unpredictable.',
    what: `An interactive proof has three properties: an honest prover convinces the verifier (completeness), a prover without the secret rarely does (soundness), and the transcript could have been simulated without the secret (zero knowledge). The page plays the Ali Baba cave as verifier and as cheater, runs a working Schnorr proof of a discrete logarithm in a toy group (modulus ${F.p}, 5 bits), lists all ${F.triples} real and ${F.simulated} simulated transcripts to show they are the same set, and replaces the challenge with a hash so the proof is one message. SNARKs are named, not run.`,
    analogy: 'A magician who comes out of whichever side you shout, from a cave whose inner door opens for one word: ten correct exits convince you if you picked the sides without a pattern.',
    useCases: [
      'Proving you know a password or key without sending it, as in some authentication protocols',
      'Signature schemes built from interactive proofs of knowledge, turned non-interactive by hashing',
      'Privacy-preserving credentials and anonymous payments that prove a statement about hidden data',
      'Verifiable computation, where a short proof convinces a verifier that a long computation was done right',
    ],
    why: 'Zero knowledge is often described as magic, and the three properties say exactly what it does and does not give. It builds on `modular-arithmetic`, `hashing-encryption` and `probability-basics`, and it leaves signatures to `digital-signatures-pki`.',
    watch: 'In the cave the called side is yellow, the prover and its hidden secret are violet, a passed round is green and a caught prover or a struck-out meter is red. In the proof scenes the secret x is violet and never sent, the committed t is blue, the challenge c is yellow, and accepted and rejected checks are green and red. Real transcripts are sky blue and simulated ones amber, never green or red.',
  },
  tryThis: [
    `Open The cave (you are the verifier, the default seed 7): press Random five times and the meter reads ${F.confidence5}; press Accept or Reject and the page reveals whether the prover knew the secret.`,
    `Type seed 3 in the seed field (that prover cheats), choose Always left and press Call the next round ten times: the cheater passes 10 of 10, the meter reads ${F.confidence10} but is struck out, and pressing Accept is wrong.`,
    `Switch the role to You are the cheater and enter five rounds: you are almost certainly caught, and surviving them would have had probability 2^-5 = ${F.survive5}, about ${F.survive5Percent}%.`,
    `Open A working proof (group A, x = 7, r = 5, c = 3): s = ${F.s3} and both sides equal ${F.both3}. Press the chip for the same t with c = 4: accepted again, with s = ${F.s4}.`,
    `Open Zero knowledge, by exhaustion and press Rewind with c = 4 and c' = 3: the extractor gives x = ${F.extracted}. The page lists ${F.triples} real and ${F.simulated} simulated triples, and they are the same set.`,
  ],
  keyIdeas: [
    `After 5 rounds with unpredictable calls the meter reads ${F.confidence5}, but a cheater who can follow a pattern passed 10 of 10 and the meter, ${F.confidence10}, meant nothing: the meter is about the challenges, not the prover. A run of six or more identical or alternating calls is flagged, and for fair random calls that flag is a false alarm 2^-(n-2) of the time.`,
    `In the toy Schnorr group a prover who cannot compute discrete logarithms and does not know x passes a round with probability 1/${F.q}, the chance of guessing the challenge (this toy group is small enough to search, so the page proves nothing about real sizes), and a verifier that asks c = 0 each time gives no protection.`,
    `Two answers to one commitment reveal the secret (x = ${F.extracted} here), which is why the random r needs to be fresh each time; the simulator makes ${F.simulated} triples without x, the same set as the ${F.triples} real ones.`,
    `A hash can stand in for the verifier: c = ${F.challengeFs} here, from the statement and t. The groups are toys (5 and 11 bits), searched in up to ${F.q} or 1,019 tries, so they prove nothing about any real system.`,
  ],
  quiz: [
    {
      q: 'The verifier in the cave always calls "left". The prover who does not know the passphrase always enters the left path. After ten rounds, what does the 99.9% meter mean?',
      options: [
        'The prover almost certainly knows the secret, because ten rounds in a row is a very long run of passes',
        'Nothing: the meter assumes unpredictable challenges, and these were predictable, so a cheater passed',
        'The prover passed by luck, and the true chance of that is one in a thousand',
        'The meter is wrong because ten rounds is too few to say anything about the prover',
      ],
      answer: 1,
      why: 'The meter 1 - 2^-n holds when the calls cannot be predicted. A cheater that enters the side you call passes each round, so a pattern turns ten passes into no evidence.',
    },
    {
      q: 'What does "zero knowledge" claim about the transcript?',
      options: [
        'The verifier learns the secret only if it asks twice, since two answers to one commitment reveal it',
        'The transcript is encrypted with the secret, so only the prover can read it back',
        'A simulator without the secret could have produced transcripts with the same distribution',
        'The transcript is never needed to check the proof, since the verifier trusts the prover',
      ],
      answer: 2,
      why: 'If a simulator can make transcripts that look the same without the secret, then a transcript cannot contain information about it. The page shows this by listing the real and the simulated triples and finding the same set.',
    },
    {
      q: 'What is the chance that a prover without x, who cannot compute discrete logarithms, passes one Schnorr round in group A, where q = 11?',
      options: [
        'One in two, the same as guessing a side in the cave',
        'One in 23, the number of elements in the field',
        'Zero, because the verifier\'s equation cannot be satisfied without x',
        'One in 11, the chance of guessing the verifier\'s challenge',
      ],
      answer: 3,
      why: 'The cheat fixes a guessed challenge, then builds t so the equation holds for that challenge alone. It passes exactly when the verifier asks it, with probability 1/q, for a prover who cannot take discrete logarithms; in this 11-element toy group a search can, which is why the toy proves nothing about real sizes.',
    },
    {
      q: 'Why does the extractor need two answers to one commitment?',
      options: [
        'The second answer proves that the first one was honest, so the pair has to be checked together',
        'The commitment alone contains the secret, and the answers only confirm it for the verifier',
        'The verifier needs both to compute the public key y from the proof',
        'Two answers differ by (c - c\') x, so x is their difference over the difference in challenges',
      ],
      answer: 3,
      why: `With s = r + c x, subtracting two answers cancels r and leaves (c - c') x, so x = (s - s') / (c - c') mod ${F.q}: here ${F.extracted}. A fresh r each session is what keeps this from happening.`,
    },
    {
      q: 'What does the page\'s search over every s in 0..10 show?',
      options: [
        'A 5-bit toy group is as hard to search as a 256-bit group, as long as the challenge is random',
        'A toy\'s discrete logarithm is trivial, so a toy proves nothing about real parameters',
        'The verifier can recover x the same way, so the protocol leaks the secret',
        'The group order should be even, so that a search over all of its elements would take noticeably longer',
      ],
      answer: 1,
      why: 'With q = 11 the search ends within 11 tries. A group of order near 2^256 needs about the square root of that by the best generic method, so the toy says nothing about real sizes.',
    },
  ],
};

export default lesson;
