import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Text is stored as numbers. Unicode gives every character a number (a code point), and UTF-8 turns each one into 1 to 4 bytes. Decode the bytes with the wrong encoding and you get garbage like "Ã©".',
    what: 'ASCII covers 128 characters in one byte each. Unicode extends that to over a million code points, written U+00E9 and so on. UTF-8 encodes them with a variable length: ASCII stays one byte, é needs two, 日 three, most emoji four. The first bits of each byte say how long the sequence is (110xxxxx means "two bytes"), continuation bytes start with 10, and the remaining payload bits spell out the code point. What people see as one character can be several code points: 👍🏽 is a thumb plus a skin-tone modifier.',
    analogy: 'A code point is an item\'s catalogue number; UTF-8 is how the number gets packed into boxes of a fixed size. A decoder that assumes every box is a whole item unpacks a two-box item as two wrong items.',
    useCases: [
      'Files, HTTP bodies and databases: all text on the wire is bytes plus an encoding',
      'Mojibake bugs: "cafÃ©" means UTF-8 bytes were read as Windows-1252 or Latin-1',
      'String length limits: .length counts UTF-16 units, not characters, and not bytes',
      'Comparing user input: é can be one code point or e + a combining accent',
    ],
    why: 'Almost every text bug you meet as a junior is an encoding bug: garbled names, broken emoji, a database column that rejects "short" strings, two equal-looking usernames that don\'t match. Knowing bytes vs code points vs characters lets you find which layer got it wrong.',
    watch: 'Each card is one character as you see it (a grapheme), with its code points and its UTF-8 bytes in hex; the yellow card is selected. For the selected character, the blue bits are the code point\'s binary payload, bracketed by the byte each run lands in. Below them, each byte shows its structure bits in dim (0, 10, 110, 1110, 11110) and its payload bits in blue. The last panel decodes the same bytes: as UTF-8 the text is intact; as Windows-1252 every byte of a multi-byte character becomes its own glyph, shown in red.',
  },
  tryThis: [
    'Pick "café" and switch "Decode the bytes as" to Windows-1252: é turns into Ã©.',
    'Pick 👍🏽: one character you see, two code points, a .length of 4 and 8 bytes.',
    'Compare "café" and "café (combining)": they look the same, but the counts differ.',
    'Type plain ASCII like Hi!: every character is exactly one byte.',
  ],
  keyIdeas: [
    'Characters are code points (numbers); UTF-8 is one way to store them as bytes.',
    'UTF-8 is 1 byte for ASCII, up to 4 for other characters; the leading bits say how many.',
    'JavaScript\'s .length counts UTF-16 code units, which is not characters and not bytes.',
    'Mojibake means the bytes were fine but decoded with the wrong encoding.',
  ],
  quiz: [
    {
      q: 'What does "👍🏽".length return in JavaScript?',
      options: ['1', '2', '4', '8'],
      answer: 2,
      why: 'It is two code points (thumb + skin tone), each outside the Basic Multilingual Plane, so each takes two UTF-16 units: 4. It is one character on screen and 8 bytes in UTF-8.',
    },
    {
      q: 'A customer\'s name shows up as "RenÃ©e". What most likely happened?',
      options: ['The database corrupted the data', 'UTF-8 bytes were decoded as Windows-1252 / Latin-1', 'The font is missing', 'The name was hashed'],
      answer: 1,
      why: 'é is C3 A9 in UTF-8. Read one byte per character in Windows-1252, C3 is Ã and A9 is ©.',
    },
    {
      q: 'How many UTF-8 bytes does the character 日 take?',
      options: ['1', '2', '3', '4'],
      answer: 2,
      why: '日 is U+65E5, above U+07FF and below U+FFFF, so UTF-8 uses three bytes: 1110xxxx 10xxxxxx 10xxxxxx.',
    },
    {
      q: 'Two usernames look identical but "a === b" is false. What should you check first?',
      options: ['Trailing spaces only', 'Unicode normalisation: one may use a combining accent', 'The font', 'Nothing: JavaScript is wrong'],
      answer: 1,
      why: 'é can be U+00E9 or e + U+0301. Normalise both (e.g. to NFC) before comparing.',
    },
  ],
};

export default lesson;
