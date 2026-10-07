import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Adding binary numbers takes nothing but logic gates: XOR makes each sum bit, AND and OR work out the carries, and chaining adders makes an ALU.',
    what: 'A half adder adds two bits: the sum is A XOR B and the carry is A AND B. A full adder also takes a carry-in, so you can chain them: four full adders make a 4-bit ripple-carry adder, each passing its carry to the next. That chain is slow, because a carry may have to travel through every stage. Carry lookahead computes each carry directly from per-bit generate (A AND B) and propagate (A XOR B) signals, so no carry waits for another. An ALU wraps the adder with a few other operations and a multiplexer that picks the result, and reports flags: Z (zero), N (negative), C (carry out: unsigned wraparound) and V (signed overflow).',
    analogy: 'Adding 999 + 1 by hand: each column turns into a 0 and passes a 1 to the left, one column at a time. A ripple adder does exactly that. Lookahead is glancing at the whole number first and seeing that every 9 will flip.',
    useCases: [
      'Every CPU instruction that adds, subtracts, compares or computes an address goes through an adder',
      'Branch conditions like "jump if less than" read the N, Z, C and V flags',
      'Overflow checks in languages with fixed-width integers (C, Rust, Java) come down to the V flag',
      'Faster carry schemes (lookahead, carry-select) are why 64-bit adds still take one clock cycle',
    ],
    why: 'It closes the gap between "gates" and "a computer that does arithmetic". It also explains things you meet in code: why signed and unsigned overflow are different bugs, why x - y can be done with addition, and why integer comparisons are really subtractions that only look at flags.',
    watch: 'Wires and bits that are 1 glow yellow; 0 is dim. In "Half & full adder" the truth table\'s current row is blue, and clicking a row sets the inputs. In "4-bit adder" each box is one full adder, most significant on the left; a carry arriving this tick is a thick blue arrow, a settled carry is yellow (1) or dim (0), and a dashed grey arrow with "?" has not settled yet. The box whose sum just settled is outlined in blue. In lookahead mode every carry rises from the lookahead unit underneath. The C flag turns orange when the unsigned result wrapped, and V turns red on signed overflow. In "Mini ALU" the selected unit, the mux and the path to the result are violet, and ~B (what SUB feeds the adder) is drawn in violet too.',
  },
  tryThis: [
    'In "Half & full adder", set A = B = 1: sum 0, carry 1. Then switch to the full adder and add Cin = 1 as well.',
    'In "4-bit adder", play 0111 + 0001: V turns red but C stays 0. Then try 1111 + 0001.',
    'Compare 1111 + 0001 with 0011 + 0011: count the ticks before every carry has settled.',
    'Turn on Lookahead: every pair settles in the same number of ticks.',
    'In "Mini ALU", pick SUB with A = 3 and B = 5: watch ~B go into the adder and C mean "a borrow happened".',
  ],
  keyIdeas: [
    'Half adder: sum = A XOR B, carry = A AND B. A full adder adds a carry-in, and chaining full adders adds whole numbers.',
    'A ripple adder is slow in the worst case because a carry may have to travel through every stage; lookahead computes all carries at once from G and P.',
    'C (carry out) means the unsigned result wrapped; V means the signed result is wrong. 0111 + 0001 sets only V, 1111 + 0001 only C.',
    'Subtraction reuses the adder: A − B = A + ~B + 1, in two\'s complement.',
  ],
  quiz: [
    {
      q: 'A 4-bit adder computes 0111 + 0001. Which flags are set?',
      options: ['V only: signed 7 + 1 overflows', 'C only: the sum carried out', 'Both C and V: the sum overflowed', 'Neither: 1000 fits in 4 bits'],
      answer: 0,
      why: 'Unsigned, 7 + 1 = 8 fits in 4 bits, so there is no carry out (C = 0). Signed, 0111 is +7 and 1000 is −8, so the signed result is wrong (V = 1). Carry and overflow are different flags.',
    },
    {
      q: 'Why does 1111 + 0001 set C but not V?',
      options: [
        'Unsigned it wraps to 0; signed −1 + 1 = 0 fits',
        'C and V are the same flag under two names',
        'V only checks the lowest bit of the result',
        'The carry out is discarded before V is computed',
      ],
      answer: 0,
      why: 'As unsigned, 15 + 1 = 16 doesn\'t fit, so it wraps to 0 and C = 1. As signed, 1111 is −1 and −1 + 1 = 0 is exactly right, so V = 0. They are separate flags answering separate questions.',
    },
    {
      q: 'How does the mini ALU compute A − B?',
      options: [
        'It adds ~B with carry-in 1: A + ~B + 1',
        'It feeds B through the adder backwards',
        'It adds B, then flips every result bit',
        'It needs a separate subtractor circuit',
      ],
      answer: 0,
      why: 'In two\'s complement, −B is ~B + 1. Inverting B and setting the carry-in to 1 makes the same adder subtract, so no separate subtractor is needed.',
    },
    {
      q: 'In a ripple-carry adder, why does 1111 + 0001 take longer to settle than 0011 + 0011?',
      options: [
        'Its carry must pass through three propagate stages',
        'Adding larger numbers needs more gates switched on',
        'The ALU has to check for overflow first',
        'The carry-in starts at 1 instead of 0 here',
      ],
      answer: 0,
      why: 'In 1111 + 0001 the three upper stages have P = 1, so each can only pass the carry on after it arrives. In 0011 + 0011 no stage propagates: every carry is decided straight from its own bits. The size of the numbers is not what matters.',
    },
    {
      q: 'What does carry lookahead change?',
      options: [
        'All carries come straight from G, P and C₀',
        'It skips carries that are zero to save time',
        'It adds two extra bits so it never overflows',
        'It removes the need for propagate signals',
      ],
      answer: 0,
      why: 'Expanding Cᵢ₊₁ = Gᵢ + PᵢCᵢ gives each carry as a sum of products of G, P and C₀, so no carry waits for the one before it. It still uses P everywhere, and it changes speed, not overflow.',
    },
  ],
};

export default lesson;
