import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A number wider than one byte has to be split across several addresses. Endianness is which end goes first: the most significant byte (big-endian) or the least (little-endian).',
    what: 'Memory is a row of bytes, each with its own address. To store the 32-bit value 0x12345678 you need four of them. Big-endian puts the most significant byte at the lowest address (12 34 56 78), the way the number is written. Little-endian puts the least significant byte first (78 56 34 12). The value is the same either way and the bits inside each byte never move; only the order of the bytes differs. Trouble starts when bytes written in one order are read back assuming the other: then 0x12345678 comes back as 0x78563412.',
    analogy: 'Writing a date as 2026-10-06 or as 06-10-2026: the same day, two conventions. Read one with the other convention in your head and you get the wrong date, even though nothing on the page changed.',
    useCases: [
      'Parsing binary files: PNG, ZIP and WAV each declare which byte order their fields use',
      'Network protocols, which send multi-byte fields big-endian ("network byte order")',
      'Reading typed-array buffers and WebAssembly memory with DataView',
      'Text encodings like UTF-16, where a byte order mark (FE FF or FF FE) says which order follows',
    ],
    why: 'Whenever bytes leave one program and enter another (a file, a socket, a GPU buffer), both sides have to agree on byte order. Getting it wrong gives no error, just garbage numbers, so knowing to check the order is what turns an hour of confusion into a one-line fix.',
    watch: 'Each byte is a coloured box, and the colour follows that byte wherever it goes, so you can see the order flip. In Store, pressing "Store" flies the bytes one by one from the register into the memory row; the address being written is outlined in yellow with its label in yellow, and memory cells not written yet are dashed and empty. The bit strip below shows the register\'s bits (yellow for 1, dim for 0) grouped by byte. In "Read it wrong" the reader\'s register is outlined red, and its value is red, when it reads back something different from what was written. In "Network order" the port\'s two bytes keep their colours from host memory to the wire, and the TCP header tints its fields blue (source port), violet (destination port) and orange (sequence number), and rings the destination-port bytes in yellow.',
  },
  tryThis: [
    'Press "Store at 0x1000" in big-endian, then flip to little-endian and store again: the colours land in reverse.',
    'Pick "Your machine" to see what this computer really does, probed live.',
    'In "Read it wrong", set the writer and reader to the same order: the value comes back intact.',
    'Type 0x11222211 in "Read it wrong": it survives the wrong order. Why is that luck, not safety?',
    'In "Network order", flip the host order and watch htons switch between a swap and a no-op.',
  ],
  keyIdeas: [
    'Endianness is the order of a value\'s bytes in memory: big-endian stores the most significant byte first, little-endian the least.',
    'It never changes the value, and the bits inside a byte never move. Software can\'t even observe bit order within a byte.',
    'Bugs come from reading bytes with a different order than they were written with, and they fail silently.',
    'Networks use big-endian (network byte order); most x86 and ARM machines are little-endian, so code converts at the boundary (htons, DataView flags).',
  ],
  quiz: [
    {
      q: 'On a little-endian machine, how is 0x12345678 laid out from the lowest address up?',
      options: [
        '78 56 34 12: the same bytes, reversed',
        '87 65 43 21: every hex digit reversed',
        '1E 6A 2C 48: all 32 bits reversed',
        '12 34 56 78: memory order never changes',
      ],
      answer: 0,
      why: 'Little-endian reverses the order of whole bytes, not digits or bits: 0x78 is still 0x78. 87 65 43 21 would need the nibbles inside each byte swapped, which never happens.',
    },
    {
      q: 'Does storing a number little-endian change its value?',
      options: [
        'No: the same bytes are stored, in another order',
        'Yes: little-endian values come out slightly smaller',
        'Yes: it reverses the bits inside every byte',
        'No, because byte order only applies to text',
      ],
      answer: 0,
      why: 'Read back with the same order, you get exactly the value you stored. Bits inside a byte are never reversed. Byte order matters for any multi-byte value, numbers included, not just text.',
    },
    {
      q: 'Why does network code call htons(port) before putting a port in a packet header?',
      options: [
        'It swaps bytes to big-endian on little-endian hosts',
        'It compresses the port so it fits into two bytes',
        'It encrypts the port so other hosts can\'t read it',
        'It converts the port number from decimal to hex text',
      ],
      answer: 0,
      why: 'Headers use network byte order, which is big-endian. On a little-endian host htons swaps the two bytes; on a big-endian host it does nothing. A port already fits in 16 bits, so nothing is compressed.',
    },
    {
      q: 'Bytes written little-endian as 78 56 34 12 are read with DataView getUint32(0), which defaults to big-endian. What comes back?',
      options: ['0x78563412', '0x12345678', '0x87654321', '0x21436587'],
      answer: 0,
      why: 'A big-endian read takes the first byte as the most significant, so 78 56 34 12 reads as 0x78563412. You only get 0x12345678 back by passing true for littleEndian.',
    },
    {
      q: 'What does new Uint8Array(new Uint32Array([1]).buffer)[0] tell you?',
      options: [
        'Whether the host stores the low byte first',
        'How many bytes a Uint32Array element uses',
        'Whether the CPU is 32-bit or 64-bit',
        'If typed arrays are supported in the browser',
      ],
      answer: 0,
      why: 'It writes the number 1 and reads the byte at the lowest address. That byte is 1 on a little-endian host and 0 on a big-endian one. It says nothing about the CPU\'s word size.',
    },
  ],
};

export default lesson;
