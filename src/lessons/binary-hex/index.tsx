import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Computers store every number as bits. Binary, hex, octal and decimal are just different ways of writing the same value down.',
    what: 'Each bit is a switch worth double the one to its right: 1, 2, 4, 8 and so on. A value is the sum of the switches that are on. Hex groups bits in fours, so each hex digit (0-9, A-F) is exactly one nibble and two hex digits are one byte. Octal groups bits in threes. None of them changes the number itself; they change how it is spelled.',
    analogy: 'A price can be written "£1.50", "150p" or "one pound fifty". Same money, different notation. 0xFF, 255 and 11111111 are the same number the same way.',
    useCases: [
      'CSS colours like #FF8800: three bytes, one each for red, green and blue', // allow-color: a hex-number example in the text
      'Unix permissions like chmod 755: one octal digit per read/write/execute triple',
      'Memory addresses, hashes and byte dumps in a debugger, always shown in hex',
      'Limits you will hit: 0x7FFF, 255 per byte, 1 KiB = 1024 = 2¹⁰',
    ],
    why: 'You will read hex every week: colours, error codes, addresses, file bytes, IDs. Knowing that a hex digit is four bits lets you read a byte dump, spot a permissions mistake, or understand why a limit is 255 or 65,535 instead of a round number.',
    watch: 'Each square is one bit of the register: yellow when it is 1, dim when it is 0, with its place value (1, 2, 4 …) above it. Violet brackets group the bits into nibbles, and each bracket shows its hex digit. Pressing +1 rings each bit in blue as the carry ripples left. The readouts show the same value in decimal, hex, octal and binary. The 24-bit register adds a colour swatch made from its three bytes; the chmod preset adds a 9-bit rwx strip.',
  },
  tryThis: [
    'Flip the leftmost bit of the 8-bit register and watch the value jump by 128.',
    'Press "All ones", then "+1 (count up)": every carry ripples left and the register wraps to 0.',
    'Type 0xFF, then 255, then 0b11111111 into "Type a number": the bits never change.',
    'Pick the #FF8800 preset and flip bits in the middle byte to change the green channel.', // allow-color: names the preset
    'Pick "chmod 755" and read the owner/group/others digits straight off the brackets.',
  ],
  keyIdeas: [
    'Each bit is worth twice the bit to its right; a value is the sum of the bits that are on.',
    'One hex digit = 4 bits (a nibble); two hex digits = one byte. One octal digit = 3 bits.',
    'Bases are notation, not different kinds of number: 0xFF, 255 and 0b11111111 are equal.',
    'n bits hold 2ⁿ values, from 0 to 2ⁿ − 1: 255 for a byte, 65,535 for 16 bits.',
  ],
  quiz: [
    {
      q: 'Is 0xFF a different number from 255?',
      options: [
        "No: it's the same value written in base 16",
        'Yes: hex numbers are their own separate type',
        'Only on 8-bit machines, where it means −1',
        'Yes: 0xFF is a negative number in code',
      ],
      answer: 0,
      why: 'F is 15, so 0xFF = 15 × 16 + 15 = 255. The base is just how the number is written down, not a different type or sign.',
    },
    {
      q: 'Why does each hex digit line up with exactly four bits?',
      options: [
        '16 = 2⁴, so four bits make exactly 16 patterns',
        'Hex was designed for the early 4-bit CPUs',
        "It doesn't: hex digits vary in bit width",
        'Because every byte is split into four parts',
      ],
      answer: 0,
      why: 'Four bits give 2⁴ = 16 patterns, one per hex digit 0-F. That is why hex is the handy shorthand for binary. A byte is two hex digits, not four parts.',
    },
    {
      q: 'What does chmod 755 give the "group"?',
      options: ['rwx', 'r-x', 'rw-', 'r--'],
      answer: 1,
      why: 'The middle digit is 5 = 101 in binary: read on, write off, execute on.',
    },
    {
      q: 'An 8-bit register holds 255. You add 1. What does it hold?',
      options: ['It holds 256', 'It holds 0', 'It stays at 255', 'It holds −1'],
      answer: 1,
      why: "Every bit is 1, so the carry falls off the left end and all eight bits become 0. The register has no ninth bit, so 256 can't fit.",
    },
  ],
};

export default lesson;
