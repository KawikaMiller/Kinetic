import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'AES only ever encrypts one 16-byte block; the mode decides how blocks are chained, and the wrong mode leaks your data\'s shape or lets it be edited in transit. Use AES-GCM with a fresh nonce.',
    what: 'A block cipher turns 16 bytes into 16 scrambled bytes under a key. A mode of operation stretches that to whole messages. ECB encrypts every block alone, so equal blocks stay equal and patterns show through. CBC mixes each block with the previous ciphertext and needs a fresh, unpredictable IV. CTR turns AES into a keystream that is XORed onto the data, so its nonce must never repeat. None of those three detects tampering; authenticated modes like GCM add a tag and refuse anything that was changed.',
    analogy: 'ECB is a code book: the same word always becomes the same code word, so a reader learns which words repeat. A good mode is a code book that changes after every word.',
    useCases: [
      'TLS 1.3 traffic: almost always AES-GCM or ChaCha20-Poly1305 (`tls-handshake`)',
      'Encrypting a database field or a file at rest with an authenticated mode',
      'Code review: spotting ECB, a constant IV or an unauthenticated mode in a pull request',
      'Choosing what goes in the nonce so it never repeats under one key',
    ],
    why: 'Libraries still let you pick ECB or a fixed IV, and both have shipped in real products. Knowing that encryption hides content but not patterns, and doesn\'t stop tampering on its own, is what keeps you on AEAD modes and fresh nonces. It builds on `hashing-encryption`, which shows AES encrypting and decrypting, and `bit-manipulation` for XOR.',
    watch: 'Picture: the plaintext picture is sky blue (background) and amber (figure); each ciphertext picture shows every byte as a shade of violet, brighter for higher values. Hovering or picking a block outlines every block with the same ciphertext in red; a block that is unique gets a yellow outline. The top stats count repeated blocks per mode, red when there are any. Chaining: plaintext bytes are tinted blue and ciphertext bytes violet; the picked byte has a yellow ring, and flipped plaintext bytes, changed ciphertext bytes and the diagram\'s lit boxes are yellow. In the diagram, plaintext boxes have blue edges, ciphertext boxes violet, counter blocks (ctr, ctr+1, …) dashed grey, and ⊕ marks an XOR. IV reuse: the messages are blue text, ciphertexts violet, and red rings mark leaks: identical blocks, or 00 bytes where the messages match. Tamper: the message is blue with the flipped position ringed yellow; characters that changed on decrypt are red and their card has a red edge; GCM\'s refusal is green, and so is the advice chip.',
  },
  tryThis: [
    'In Picture, compare the four ciphertexts: only ECB keeps the robot\'s outline. Hover the background to light every identical block.',
    'In Chaining, click a byte in block 1 and flip a bit: CBC changes all four blocks, CTR changes one byte.',
    'Switch Chaining to ECB and look at blocks 1 and 2: equal plaintext, equal ciphertext.',
    'In IV reuse, pick CTR with the nonce reused: C1 ⊕ C2 is 00 wherever the two messages match.',
    'In Tamper, flip a bit of the amount: CTR turns 100 into 101 silently, CBC garbles a block and flips exactly that bit in the next one, GCM refuses.',
  ],
  keyIdeas: [
    'ECB encrypts equal blocks to equal ciphertext, so patterns survive: never use it.',
    'CBC needs a fresh, unpredictable IV; CTR and GCM need a nonce that never repeats under one key.',
    'Encryption alone doesn\'t stop tampering: CBC and CTR decrypt edited ciphertext without complaint.',
    'Use authenticated encryption (AES-GCM or ChaCha20-Poly1305) from a vetted library, with a fresh nonce.',
  ],
  quiz: [
    {
      q: 'A picture encrypted with AES in ECB mode still shows its outline. Why?',
      options: [
        'Equal 16-byte blocks give equal ciphertext',
        'The key was too short to hide the image',
        'AES only encrypts the colours, not the shape',
        'The file header wasn\'t encrypted at all',
      ],
      answer: 0,
      why: 'ECB has no chaining and no IV: each block is encrypted on its own, so every flat area produces the same ciphertext block over and over. A longer key changes nothing about that; the mode is the problem.',
    },
    {
      q: 'An attacker flips one bit of AES-CTR ciphertext. What does the receiver get?',
      options: [
        'The same plaintext bit flipped, silently',
        'A decryption error, so the edit is caught',
        'A completely garbled message from there on',
        'The original message, since CTR self-repairs',
      ],
      answer: 0,
      why: 'CTR XORs a keystream onto the data, so a flipped ciphertext bit flips exactly that plaintext bit, with no error. Only an authenticated mode like GCM, or a separate MAC, catches the edit.',
    },
    {
      q: 'You encrypt two messages with AES-CTR under the same key and the same nonce. What leaks?',
      options: [
        'The XOR of the two plaintexts',
        'The AES key, byte by byte',
        'Nothing, as long as the key is secret',
        'Only the lengths of the two messages',
      ],
      answer: 0,
      why: 'Both messages were XORed with the same keystream, so XORing the ciphertexts cancels it out and leaves P1 ⊕ P2: 00 wherever they match, and enough structure to recover text. The key itself stays safe, which is why it\'s tempting to think nothing leaked.',
    },
    {
      q: 'Which choice is right for encrypting records in a new service?',
      options: [
        'AES-GCM with a fresh nonce per record',
        'AES-ECB, since every record is short',
        'AES-CBC with one fixed IV for all records',
        'AES-CTR with the record id as the key',
      ],
      answer: 0,
      why: 'GCM encrypts and authenticates, so tampering is refused. ECB leaks patterns whatever the length, a fixed IV makes equal records encrypt equally, and keys must be random secrets, never ids.',
    },
  ],
};

export default lesson;
