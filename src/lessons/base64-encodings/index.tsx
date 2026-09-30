import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Base64 and percent-encoding turn arbitrary bytes into "safe" text so they survive JSON, URLs, email and headers. They are encodings, not encryption: anyone can reverse them.',
    what: 'Base64 takes bytes three at a time (24 bits), splits them into four 6-bit groups, and maps each group (0-63) to a letter, digit, + or /. Leftover bytes are padded with zero bits and marked with =. The result is a third larger than the input. base64url swaps + and / for - and _ and drops the padding so it fits in URLs; JWTs use it. Percent-encoding is for URLs: characters outside a small safe set are replaced by their UTF-8 bytes written as %XX, so a space becomes %20 (or + in HTML forms).',
    analogy: 'Spelling a word out in the phonetic alphabet so it survives a noisy radio: "Alpha Bravo" is longer than "AB" and anyone can decode it. It isn\'t a secret, it\'s just safe to transmit.',
    useCases: [
      'JWTs, data: URLs and email attachments: all base64 or base64url',
      'Basic auth headers: "Authorization: Basic dXNlcjpwYXNz" is base64, not protection',
      'Query strings and form posts: encodeURIComponent and URLSearchParams',
      'Putting binary (images, keys, hashes) inside JSON, which only carries text',
    ],
    why: 'You will decode a JWT, debug a mangled query parameter, and review code that "hides" a secret in base64. Knowing exactly what these encodings do stops you from building double-encoded URLs, and from treating base64 as security.',
    watch: 'Output shows the base64 string, with padding = in dim. Each block is 3 input bytes: the top strip groups its 24 bits into blue 8-bit bytes (labelled with the character and hex), the bottom strip regroups the same bits into violet 6-bit groups with their alphabet index and letter. Dim bits are zero padding. Click a block to light its letters in yellow in the 64-cell alphabet; violet cells are letters used elsewhere in the output. In the URL / percent lane, yellow tiles are characters that had to be escaped, with the %XX bytes they became.',
  },
  tryThis: [
    'Try "Man (3 bytes)", "Ma (2 bytes)" and "M (1 byte)": watch the zero bits and = padding appear.',
    'Pick "JWT header" and switch the alphabet to base64url: that\'s the familiar eyJ… prefix.',
    'Press "Is this encrypted?": the text comes straight back, no key needed.',
    'In the URL / percent lane, try "a b&c=d" in both modes: space becomes %20 in a URL part but + in a form.',
    'Encode "café" in the percent lane: é becomes two escapes, %C3%A9, one per UTF-8 byte.',
  ],
  keyIdeas: [
    'Base64: 3 bytes → 24 bits → four 6-bit groups → four characters. Output is about 4/3 of the input.',
    'Padding: 1 leftover byte gives "==", 2 give "="; base64url drops them and uses - and _ instead of + and /.',
    'Encoding is not encryption: base64 hides nothing. Anyone can decode it.',
    'Percent-encoding writes a character\'s UTF-8 bytes as %XX; forms encode space as +.',
  ],
  quiz: [
    {
      q: 'An API key is stored base64-encoded in a config file. Is it protected?',
      options: ['Yes: it can\'t be read without the key', 'No: base64 is an encoding anyone can reverse', 'Only if it uses base64url', 'Only if it has padding'],
      answer: 1,
      why: 'Base64 is reversible by design: atob("…") gives the original instantly. Protect secrets with encryption or a secret manager, not an encoding.',
    },
    {
      q: 'Why does base64 output grow by about a third?',
      options: ['It adds a checksum', 'Every 3 bytes (24 bits) become 4 characters of 6 useful bits each', 'It compresses badly', 'It adds a header'],
      answer: 1,
      why: 'Each output character carries 6 bits, but takes a whole byte to store: 4 characters for every 3 bytes of input.',
    },
    {
      q: 'Base64 of a 2-byte input ends with…',
      options: ['"=="', 'a single "="', 'no padding', '"%3D"'],
      answer: 1,
      why: '16 data bits fill two 6-bit groups and part of a third (padded with 2 zero bits); the missing fourth group is marked with one "=".',
    },
    {
      q: 'encodeURIComponent("a b") is…',
      options: ['a+b', 'a%20b', 'a b', 'YSBi'],
      answer: 1,
      why: 'In URL components a space is %20. The + form comes from HTML form encoding (URLSearchParams); YSBi is its base64.',
    },
  ],
};

export default lesson;
