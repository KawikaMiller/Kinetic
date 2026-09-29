import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Hashing turns data into a fixed-size fingerprint you can't reverse. Encryption scrambles data so that only someone with the right key can turn it back.",
    what: "A hash function like SHA-256 maps any input to a fixed 256-bit digest: the same input always gives the same digest, and a tiny change gives a completely different one. Encryption is reversible by design. Symmetric encryption (AES) uses one shared key to lock and unlock. Asymmetric encryption (RSA, elliptic curves) uses a key pair: the public key locks, only the private key unlocks, and signatures work the other way round.",
    analogy: "A hash is a fingerprint: it identifies you, but nobody can rebuild you from it. Symmetric encryption is a safe with one key you both copy. Asymmetric is a padlock you hand out freely while keeping the only key yourself.",
    useCases: [
      "Storing passwords (salted slow hashes like Argon2 or bcrypt)",
      "Checking downloads, Git commits and caches by digest",
      "HTTPS: asymmetric to agree on a key, then fast symmetric AES for the traffic",
      "Signing software releases, JWTs and API webhooks",
    ],
    why: "Mixing these up causes real breaches: passwords stored encrypted (so reversible) or hashed with a fast unsalted hash, card numbers \"hashed\" that then can't be charged. Every engineer touches this on day one of any login, API or storage feature.",
    watch: "Five lanes along the bottom. In ① each 8×32 grid is a 256-bit digest: blue squares are 1-bits and red ones differ from input A. In ② the users table turns red when it's cracked; violet text is a salt and blue is a hash. In ③ and ④ yellow is the shared secret key, blue the public key, violet the private key, and the message card goes green when it's readable. ⑤ is a quiz of real scenarios.",
  },
  tryThis: [
    "In ① Hashing, type in box B one letter at a time and watch about half the bits flip on every keystroke.",
    "Hit \"Hash a whole paragraph\": 170 characters in, still exactly 256 bits out.",
    "Play ② Passwords and watch the rainbow table crack both users, until salts arrive.",
    "In ⑤ Which one?, get all six right, then explain the credit card one out loud.",
  ],
  keyIdeas: [
    "Hashing is one-way and fixed-size: good for checking, useless for getting data back.",
    "Passwords get a unique salt plus a deliberately slow hash (Argon2id, bcrypt), never plain SHA-256.",
    "Symmetric = one shared key, fast. Asymmetric = public/private pair, slow, no shared secret needed.",
    "Signatures run the other way: sign with the private key, verify with the public key.",
  ],
  quiz: [
    {
      q: 'Why add a unique salt to each password before hashing?',
      options: ['It makes the hash reversible', 'Identical passwords get different hashes, so precomputed tables fail', 'It encrypts the password', 'It makes hashing faster'],
      answer: 1,
      why: 'Salts defeat rainbow tables and stop one cracked hash revealing every user with the same password.',
    },
    {
      q: 'You must charge a stored credit card again next month. You should…',
      options: ['Hash it with SHA-256', 'Hash it with bcrypt', 'Encrypt it and protect the key', 'Store it in plaintext'],
      answer: 2,
      why: 'You need the original number back, so it has to be reversible: encryption, not hashing.',
    },
    {
      q: 'Alice wants to send Bob a secret but they have never shared a key. She uses…',
      options: ["Bob's public key", "Bob's private key", "Her own private key", "A SHA-256 hash"],
      answer: 0,
      why: "Anyone can lock with Bob's public key; only Bob's private key can unlock it.",
    },
  ],
};

export default lesson;
