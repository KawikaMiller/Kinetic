import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A MAC is a checksum only someone with the secret key can make, so the receiver can tell the message wasn\'t changed on the way. A plain hash can\'t do that: anyone can recompute it.',
    what: 'The sender computes a tag from the message and a shared secret key (HMAC-SHA-256 is the usual choice) and sends both. The receiver recomputes the tag over what arrived and compares. Anyone who edits the message without the key can\'t produce a matching tag, so the edit is caught. A bare hash of the message has no key, so an editor just recomputes it. Compare tags in constant time, and keep the key long and random.',
    analogy: 'A wax seal from a ring only you and your friend own. Anyone can melt and re-stamp an ordinary blob of wax; nobody else can press your ring into it.',
    useCases: [
      'Webhook signatures: the sender signs the body with a shared secret, and the receiver checks it before trusting the event',
      'Signed cookies and session tokens the server checks on the way back in',
      'HS256 JWTs: the signature part is HMAC-SHA-256 over header.payload (`auth-sessions-jwt`)',
      'Inside TLS and authenticated encryption, where every record carries a tag (`symmetric-ciphers`)',
    ],
    why: 'Any time you accept data from somewhere you don\'t control (a webhook, a cookie, a token), the question is "did this come from who I think, unchanged?". Using a plain hash, comparing with ===, or picking a guessable key are classic, real bugs. It builds on `hashing-encryption`.',
    watch: 'The scene: the blue pill is the order and the violet pill is its tag; the order pill turns yellow once the editor in the channel has changed it. The node handling the step is lit, and the receiver turns green when it accepts an honest order or catches an edit, and red when it accepts a forged one. Below, the order is blue text with the edited number marked in yellow, and the way the tag rides is violet text. The tag that arrived is a violet byte grid; the receiver\'s own tag is green where it matches and red where it doesn\'t. Captions call a caught edit green and a passed-but-forged order red, with the word "forged". The comparison panel is two code listings and their byte counts.',
  },
  tryThis: [
    'Play it with the channel editing the amount: the receiver\'s tag differs in almost every byte, so it\'s rejected.',
    'Switch Tag to "Plain SHA-256" and play again: the edited order passes. That\'s why a MAC needs a key.',
    'Edit the order yourself and watch the tag change completely; then type broken JSON and see it refused.',
    'Look at "Comparing tags": the tempting compare stopped early, the constant-time one read all 32 bytes.',
    'Press "New key": same order, a completely different tag.',
  ],
  keyIdeas: [
    'A MAC tag needs the secret key to make, so only key holders can produce a valid one.',
    'A plain hash of the message proves nothing about who sent it: anyone can recompute it.',
    'Use HMAC (not hash(key ‖ message)), with a long random key, from a library.',
    'Compare tags in constant time, never with an early-exit ===.',
  ],
  quiz: [
    {
      q: 'A webhook arrives with a header holding SHA-256 of its body. What does that prove?',
      options: [
        'Nothing about who sent it',
        'It came from the real sender',
        'Nobody edited it in transit',
        'The body is encrypted end to end',
      ],
      answer: 0,
      why: 'Anyone can compute SHA-256 of any body, so someone in the middle can edit it and recompute the header. "Nobody edited it" is the tempting answer, but it only holds for accidental corruption. A keyed HMAC is what proves the sender held the secret.',
    },
    {
      q: 'Why is HMAC built as a nested construction instead of hash(key ‖ message)?',
      options: [
        'Some hashes let others extend a tagged message',
        'The simple form is too slow for real messages',
        'hash(key ‖ message) leaks the key in the tag',
        'The nested form makes the tag shorter',
      ],
      answer: 0,
      why: "With hashes like SHA-256 and SHA-512, knowing hash(key ‖ m) lets someone compute a valid tag for m, followed by padding and extra data, without the key (length extension). HMAC's inner and outer hashing rules that out; SHA-3 and SHA-512/256 aren't open to it either. The tag length is the same and the speed about the same.",
    },
    {
      q: 'Why compare a received tag with a constant-time function instead of ===?',
      options: [
        'An early exit can reveal how many bytes matched',
        'The === operator gives wrong answers for bytes',
        'Constant-time comparison is faster for long tags',
        'It lets the receiver skip recomputing the tag',
      ],
      answer: 0,
      why: 'An early-exit compare returns sooner when the first bytes differ, so timing can leak how close a guessed tag is. === gives the right answer; it\'s the timing that leaks. A constant-time compare reads every byte whatever happens.',
    },
  ],
};

export default lesson;
