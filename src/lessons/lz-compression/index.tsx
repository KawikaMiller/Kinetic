import type { LessonModule } from '../../core/types';
import { MAX_DISTANCE, distanceCode, encodeFixedBlock } from './deflate';
import { decodeAsBlock, parseLz77, type Token } from './lz77';
import { kraftSum } from '../../core/huffman';
import { LENGTH_PRESETS, RFC_LENGTHS, assignCodes, compress, kraftOutOf256, orderZeroBits } from './model';
import { Stage } from './Stage';

const OPTS = { window: 32, minMatch: 3 };
const ABRA = 'abracadabra abracadabra';
const ABRA_TOKENS = parseLz77(ABRA, OPTS);
const label = (t: Token) => (t.kind === 'literal' ? (t.char === ' ' ? '␣' : t.char) : `(${t.distance}, ${t.length})`);
const A10 = compress('aaaaaaaaaa', OPTS);
const A10_TOKENS = A10.tokens;
const A10_BLOCK_WRONG = decodeAsBlock(A10_TOKENS);
const AB50 = compress('ab'.repeat(50), OPTS);
const RFC = assignCodes(RFC_LENGTHS)!;
const OVER = LENGTH_PRESETS.find((p) => p.id === 'over')!.lengths;
const FAR_DISTANCE = 30000;
const FAR_MATCH = encodeFixedBlock([{ kind: 'match', distance: FAR_DISTANCE, length: 3, pos: FAR_DISTANCE }]).items[1].bits.length;
const FAR_EXTRA_BITS = distanceCode(FAR_DISTANCE).extraBits;
const THREE_LITERALS = encodeFixedBlock(Array.from('abc', (char, pos): Token => ({ kind: 'literal', char, pos, best: 0 }))).items.slice(1, 4).reduce((s, i) => s + i.bits.length, 0);
const RANDOM_OVERHEAD = 10;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'LZ77 replaces a repeat with a pointer back to text already seen, Huffman gives common symbols short codes, and DEFLATE (zip, gzip, PNG) is the two together.',
    what: `Dictionary compression keeps a sliding window of recent text. When the next characters appeared in the window, the encoder writes a (distance, length) pair instead of the characters, and the decoder copies them back one character at a time, which is why a match can be longer than its distance. DEFLATE then writes the literals and pairs with a Huffman code. Its codes are canonical: the sender ships only the code lengths and both sides build the same codes by one rule. This lesson writes a real fixed-Huffman DEFLATE block that a real inflate decodes.`,
    analogy: 'Say "see paragraph 2" instead of repeating paragraph 2. The reader needs the earlier text in front of them, and "see the line you are writing" works too: a pointer one character back means "repeat the last character".',
    useCases: [
      'gzip and zip files, and the compression of PNG images and many web responses, which are built on DEFLATE',
      'Fast general-purpose compressors such as Snappy and LZ4, which are LZ77-style matchers (from memory)',
      'Understanding why repetitive data (logs, JSON, source code) compresses well and random or already compressed data does not',
      'Reading a compressed stream or a format spec, where "length codes", "distance codes" and "canonical Huffman" are the vocabulary',
    ],
    why: 'Compression is everywhere between your code and the network. Knowing the two ideas separately tells you what a compressor can and cannot do: it removes repeats and skew, it cannot beat the information in random data, and it can make a short input larger.',
    watch: 'Grey cells are literals and violet cells are back-references with a violet arc to where they copy from. The blue band is the window, the yellow cells are the token being decided, and cells far behind are dimmed. In Decode the yellow cell is the character just written, blue the one read, violet one read from the copy\'s own output, dim cells are not written yet and red cells never get written by the wrong decoder. In Canonical codes the Kraft bar is red above 1, green at exactly 1 and orange below. In the bit view\'s byte grid yellow is the byte being filled and blue the bytes already written; grey is a literal code, violet a length or distance code, amber extra bits and blue the header and end of block.',
  },
  tryThis: [
    `In LZ77 tokens press play, or step to the end: ${ABRA} becomes ${ABRA_TOKENS.map(label).join(' ')}, ${ABRA_TOKENS.length} tokens for ${ABRA.length} characters.`,
    `In Decode press aaaaaaaaaa and step to the end: the tokens are ${A10_TOKENS.map(label).join(' ')} and the result is ten a. Switch Copy to As a block and it ends wrong, with ${A10_BLOCK_WRONG.length} of 10 characters.`,
    `In Canonical codes the RFC lengths give F = ${RFC[5]}, A = ${RFC[0]} and H = ${RFC[7]}. Press oversubscribed: the Kraft sum reads ${kraftOutOf256(OVER)}/256 and no code is assigned.`,
    `In A real DEFLATE block press aaaaaaaaaa: the block is ${A10.block.totalBits} bits (${A10.block.bytes.length} bytes), and where the browser supports it the check line says its own inflate returned the same text.`,
    `In Where each idea works press the ab x 50 example: our DEFLATE block is ${AB50.block.totalBits} bits, well under the order-0 bound of ${orderZeroBits('ab'.repeat(50)).toFixed(1)}.`,
  ],
  keyIdeas: [
    'LZ77 replaces a repeat with a (distance, length) pointer to text already seen; the decoder copies one character at a time, so a match may overlap its own output.',
    'Huffman removes skew in single-character frequencies and LZ77 removes repeats; DEFLATE uses both, so repetitive text can land far below its order-0 bound.',
    'Canonical codes need just the code lengths: shorter codes first, equal lengths counting up in symbol order, and a Kraft sum above 1 means no prefix code exists.',
    "In this lesson's encoder, text with no repeats comes out larger than it went in, because the block adds a header and an end code and a literal costs 8 bits or more.",
  ],
  quiz: [
    {
      q: 'You compress 40 random lowercase letters with this lesson\'s fixed-Huffman block, and the output is larger than the input. Why?',
      options: [
        'Nothing repeats, so every letter goes out as a literal at 8 bits, and the block adds a header and an end code',
        'The window was too small: with a bigger window every random text shrinks below its original size',
        'Fixed Huffman codes always add one extra bit to each literal, whatever the text contains',
        'Random letters have low entropy, so the Huffman stage inflates them before LZ77 shrinks them again',
      ],
      answer: 0,
      why: `Without repeats there is nothing to point back to. Each letter costs 8 bits, so 40 letters cost 320 bits plus the ${RANDOM_OVERHEAD} bits of header and end-of-block code. A bigger window cannot create repeats that are not there, and a compressor cannot shrink random data unless it finds structure in it.`,
    },
    {
      q: `In fixed-Huffman DEFLATE, a 3-character match ${FAR_DISTANCE.toLocaleString('en-US')} characters back costs ${FAR_MATCH} bits and the same three ASCII letters as literals cost ${THREE_LITERALS}. What does that show?`,
      options: [
        'A match is not automatically a saving: its length code, distance code and extra bits can cost as much as the literals',
        'Matches are always cheaper than literals, so the figure is a rounding error in the code table',
        'The longest match is always the best choice, so the parser should have looked for a 4-character one',
        'Distances beyond 255 are not allowed in DEFLATE, so this match could not be written at all',
      ],
      answer: 0,
      why: `The match costs a ${FAR_MATCH}-bit sequence of length code, distance code and ${FAR_EXTRA_BITS} distance extra bits, against ${THREE_LITERALS} bits for the literals, so it adds ${FAR_MATCH - THREE_LITERALS}. The format allows distances up to ${MAX_DISTANCE.toLocaleString('en-US')}, and real compressors weigh the coded cost, not just the match length.`,
    },
    {
      q: 'A decoder reads the tokens a, then (1, 9). One implementation copies the match as a single slice of the output so far. What does it produce?',
      options: [
        'Only two characters: the slice stops at the end of the output, so the overlap is never copied',
        'Ten a, since a slice and a character-by-character copy always give the same result for a match',
        'Nine a, because the first character of the match is dropped when it is copied as a block',
        'An error, because a distance of 1 is not valid when only one character has been written so far',
      ],
      answer: 0,
      why: 'The pair (1, 9) means "repeat the last character nine times", reading characters that the copy itself has just written. A one-character copy loop does that correctly. A slice sees just the single a that exists when the copy starts, so the overlapping part is lost.',
    },
    {
      q: `Which set of code lengths cannot be the lengths of any prefix code, and why?`,
      options: [
        `1, 2, 2, 3: the Kraft sum is ${kraftSum([1, 2, 2, 3])}, above 1, so the codes would have to share prefixes`,
        `2, 2, 2, 2: the Kraft sum is ${kraftSum([2, 2, 2, 2])}, so this set fills the code space exactly`,
        `1, 2, 3, 3: the Kraft sum is ${kraftSum([1, 2, 3, 3])}, so this set is complete and valid`,
        `2, 2, 3, 4: the Kraft sum is ${kraftSum([2, 2, 3, 4])}, below 1, which is valid but leaves some of the code space unused`,
      ],
      answer: 0,
      why: 'Each code of length L uses a 2^-L share of the space of bit strings, and a prefix code cannot use more than the whole of it. A sum above 1 means the lengths promise more than exists. A sum of exactly 1 is complete and below 1 is valid but wasteful.',
    },
  ],
};

export default lesson;
