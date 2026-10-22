import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A large quantum computer would make factoring and elliptic-curve discrete logarithms easy through Shor\'s algorithm, so public-key cryptography is being replaced with schemes built on other problems, and data that has to stay secret for long enough is already exposed to recording.',
    what: `The page treats the threat in four pieces. Mosca's inequality turns three numbers you choose (years the data has to stay secret, years to migrate, years until a hypothetical machine) into a verdict, with no date predicted. Shor's method is emulated classically on numbers up to 999: the order of a base is found by a slow loop, and the quantum computer's part would be finding that order fast. A toy lattice scheme over modulus ${F.q} shows how noise makes decryption work and fail, and a hybrid scene feeds a real P-256 secret and a toy secret into a real key derivation. ML-KEM is named with its sizes, not built.`,
    analogy: 'Replacing the locks on a building while someone photographs the doors: a lock that takes years to swap leaves everything photographed in the meantime exposed, even if the picks are not built yet.',
    useCases: [
      'Inventorying where a system uses RSA, Diffie-Hellman or elliptic-curve keys, which is the first step of a migration',
      'Deciding how long recorded data has to stay secret, such as medical or legal records, against a migration timeline',
      'Reading about hybrid key exchange in TLS, where a classical and a post-quantum secret are combined',
      'Planning crypto-agility, so that an algorithm can be swapped without redesigning the protocol',
    ],
    why: 'A migration takes years, so the question is not just whether a large quantum computer exists but whether the data being sent today needs to outlive the migration. It builds on `elliptic-curves`, `rsa` and `tls-handshake`, and it is the lesson that owns the post-quantum side of those: `tls-handshake` does not show it.',
    watch: 'In the first scene a green bar is not at risk and a red bar is at risk, and the blue tick is z. In the second scene green marks a base that works and red a base that fails, with the order r in blue. In the lattice-scheme scene a green card is a correct bit and a red card a failed one, and the noise ceiling is blue. In the two-bases scene the good basis and its result are green, the bad basis and its result red, and the target is yellow. In the hybrid scene the classical secret is blue, the toy secret violet and the combined key yellow.',
  },
  tryThis: [
    `Open Who needs to worry now (defaults x = 10, y = 5, z = 12): it reads at risk with slack -${F.moscaSlack}. Drag x down to 5 and y down to 2: not at risk, slack 5.`,
    `Open What Shor changes with N = 15 and a = 7: the order is ${F.shorOrder}, found in ${F.shorOrder} steps, and the factors are ${F.shorFactors}. Press the N = 15, a = 14 chip: the page says ${F.shorBadReason} and the base fails.`,
    `Open A toy lattice scheme: with the defaults every bit decrypts and ${F.defaultFailures} of 1,000 seeded encryptions fail. Press the failing preset (n = 4, m = 16, B = 8, seed ${F.failingSeed}): ${F.failingCount} of 1,000 fail, and the page says the noise passed ${F.noiseLimit}.`,
    `Open Two bases with the target at (10, 7): the good basis lands at ${F.goodPoint}, ${F.goodDistance} away. Switch to the bad basis: it lands at ${F.badPoint}, ${F.badDistance} away.`,
  ],
  keyIdeas: [
    `A large quantum computer threatens RSA and elliptic-curve public-key schemes through Shor's algorithm. Here the quantum part is just described: the order is found by a loop that takes r steps (4 for N = 15, a = 7).`,
    `Mosca's inequality marks data at risk when x + y exceeds z, and the boundary x + y = z is not at risk. The page predicts no date, because z is your own input.`,
    `In the toy lattice scheme a bit decodes right while the accumulated noise stays within ${F.noiseLimit} of modulus ${F.q}. The failing preset fails on ${F.failingCount} of 1,000 seeded encryptions at seed ${F.failingSeed}, so noise is a parameter to budget.`,
    `A hybrid key derivation takes a classical and a post-quantum secret together, so the output is meant to stay unpredictable if either assumption holds. The cost is size: a ${F.hybridShare}-byte client share against ${F.classicalShare} bytes.`,
  ],
  quiz: [
    {
      q: 'A large quantum computer is built. Which statement is right?',
      options: [
        'It threatens RSA and elliptic-curve schemes through Shor\'s algorithm, while symmetric ciphers see a smaller speedup',
        'It breaks AES-256 as easily as RSA-2048, because a quantum computer speeds up each kind of cipher in the same way too',
        'It reads encrypted data without needing any key, because encryption is only a puzzle with no secret behind it',
        'It only affects data sent after the machine exists, so traffic recorded today stays safe from it indefinitely',
      ],
      answer: 0,
      why: 'Shor\'s algorithm attacks the structure behind RSA and elliptic-curve keys, while symmetric ciphers are affected by a smaller, generic speedup. Recorded data is exposed too, which is the point of the first scene. The symmetric claim is from memory and chipped in the first scene (the Mosca timeline).',
    },
    {
      q: 'With x = 10, y = 5 and z = 12, is the data at risk?',
      options: [
        'No, because z = 12 is larger than the 10 years the data has to stay secret',
        'Yes: 15 years of exposure exceeds the 12 years until the machine exists',
        'No, because the time taken to migrate does not count toward the exposure',
        'Yes, but only if z were under 5 years, which it is not in this case',
      ],
      answer: 1,
      why: `Exposure is x + y = ${F.moscaExposure} years, which is more than z = 12, so the data is at risk with slack -${F.moscaSlack}. Comparing z with x alone ignores the years it takes to migrate.`,
    },
    {
      q: 'Why is "harvest now, decrypt later" a concern before any such machine exists?',
      options: [
        'Quantum computers can already decrypt live traffic, so recording it first is only a convenience',
        'Attackers need to record traffic only after the machine exists, so nothing today is exposed',
        'Classical computers can read recorded traffic later, once enough years have passed to try each key',
        'Traffic recorded today can be read later, if its secret has to stay secret for long enough',
      ],
      answer: 3,
      why: 'Recording is cheap and ciphertext does not expire. If the secret has to outlast the arrival of the machine, today\'s recording is the exposure, which is what x + y > z expresses.',
    },
    {
      q: 'In the toy lattice scheme, what makes decryption fail?',
      options: [
        'The accumulated noise grows past about a quarter of the modulus, so the bit decodes wrongly',
        'The public key has too few rows to add up, so the sum for the bit cannot be formed at all',
        'The secret is larger than the modulus, so the remainder can no longer be reduced',
        'The ciphertext is reduced to two bits, so the decoder cannot tell a zero from a one any more',
      ],
      answer: 0,
      why: `A bit decodes right while the centred noise has absolute value up to ${F.noiseLimit}, a quarter of ${F.q} rounded down. Past that the remainder lands nearer the wrong target, which the page counts as ${F.failingCount} failures of 1,000 on the failing preset.`,
    },
    {
      q: 'Why combine a classical and a post-quantum secret in one key?',
      options: [
        'The two together are twice as fast as either one alone, since both run in parallel on each message',
        'The classical half already proves who the server is to the client, so the other half can be skipped',
        'One secret alone cannot be fed to a key derivation function, because such a function needs exactly two inputs to work',
        'The key stays unpredictable if either assumption holds, which covers the transition (common practice)',
      ],
      answer: 3,
      why: 'Both secrets go into one key derivation, so an attacker would have to break both underlying problems. Speed, authentication and the number of inputs are not the reason; the cost is size, a larger client share.',
    },
  ],
};

export default lesson;
