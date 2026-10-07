import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Add a few carefully chosen extra bits and the receiver can tell when bits flipped on the way, and sometimes which ones, so it can fix them.',
    what: 'A parity bit makes the count of 1s even, so any odd number of flips shows up, while an even number slips through. Hamming(7,4) adds three parity bits, each covering a different overlapping group, so a single flipped bit fails a unique set of checks: read as a binary number (the syndrome) that set names the bad position, and the decoder flips it back. Two flips fool it into "fixing" a third bit, unless an extra overall parity bit (SECDED) spots that an even number flipped. A CRC treats the message as a polynomial and appends the remainder of dividing it by a fixed generator; the receiver divides again and expects zero. It detects far more error patterns than parity, but corrects none.',
    analogy: 'Parity is counting the passengers on a bus: you notice one is missing, but not who, and two swapped seats look fine. Hamming is a seating chart where every row and column is counted separately, so one empty seat sits where a short row meets a short column.',
    useCases: [
      'Ethernet frames end with a CRC-32 frame check sequence; ZIP and PNG files carry CRC-32 too',
      'ECC RAM uses SECDED codes to fix single flipped bits and report double ones',
      'RAID 5 stores XOR parity across disks so one failed disk can be rebuilt',
      'QR codes and CDs use Reed-Solomon codes, a stronger relative, to survive damage',
    ],
    why: 'Bits really do flip: cosmic rays in memory, noise on cables, scratched discs. Error detection is why corrupted downloads get caught instead of silently installed, and knowing exactly what a check can and can\'t catch stops you treating "checksum passed" as "data is correct".',
    watch: 'Data bits are blue and solid when 1, outlined when 0. The parity bit, and the Hamming parity groups, take their own colours: p1 violet, p2 amber, p4 sky, with each group drawn as a tinted band showing the received bits it covers, and the overall SECDED parity bit grey. A bit flipped in transit turns red, a failing check reads "fail" in red and a passing one "pass" in grey. In the decoded row a correctly repaired bit is green and a miscorrected one, a healthy bit "fixed" by mistake, is orange. In CRC the generator window is ringed in yellow under the row being divided, the generator 10011 sits under it, and the XOR result shows below; the remainder is violet when it is the CRC or zero, red when a receiver gets a non-zero remainder.',
  },
  tryThis: [
    'In Parity, flip one received bit, then a second: the check fails, then passes again with two wrong bits.',
    'In Hamming, flip any one received bit: the failing bands read off its position as the syndrome.',
    'Now flip a second bit: the decoder repairs the wrong position, shown in orange.',
    'Turn on SECDED with those two flips: it reports "can\'t fix" instead of guessing.',
    'In CRC, step through the division, then switch to Receiver and flip bits 1, 4 and 5 together: the remainder is 0000 anyway.',
  ],
  keyIdeas: [
    'Parity catches any odd number of flipped bits and misses every even number.',
    'Hamming codes place parity bits at positions 1, 2, 4; the failing checks spell out the flipped position.',
    'Two flips make plain Hamming miscorrect; one more overall parity bit (SECDED) turns that into a reported, uncorrectable error.',
    'A CRC is the remainder of polynomial division mod 2. It detects most errors and corrects none, and a pass never proves the data is intact.',
  ],
  quiz: [
    {
      q: 'A 9-bit word with even parity arrives and its parity check passes. What can you conclude?',
      options: [
        'An even number of bits flipped, possibly zero',
        'No bits flipped, so the data is guaranteed intact',
        'Exactly one bit flipped and parity corrected it',
        'The parity bit itself must have been flipped',
      ],
      answer: 0,
      why: 'Each flip changes the count of 1s by one, so two (or four) flips bring it back to even. A pass rules out an odd number of flips, not all flips, and parity never corrects anything.',
    },
    {
      q: 'Hamming(7,4) receives a word where checks p1 and p4 fail and p2 passes. Which position does it flip?',
      options: ['Position 5', 'Position 3', 'Position 6', 'Position 4'],
      answer: 0,
      why: 'The syndrome p4 p2 p1 is 101 = 5, and position 5 is the only one covered by p1 and p4 but not p2. A flipped position 4 would fail p4 alone.',
    },
    {
      q: 'Two bits flip in a plain Hamming(7,4) codeword. What does the decoder do?',
      options: [
        'Flips a third bit and returns the wrong data',
        'Detects both errors and corrects each of them',
        'Sees a syndrome of 0 and reports no error',
        'Asks the sender to retransmit the whole word',
      ],
      answer: 0,
      why: 'Two flips always give a non-zero syndrome, but it names a third position that was fine. The decoder trusts it, so three bits end up wrong. Hamming(7,4) can only correct one error.',
    },
    {
      q: 'What does the extra overall parity bit add in SECDED?',
      options: [
        'It tells one flip from two, so doubles are reported',
        'It lets the decoder correct two flipped bits at once',
        'It doubles the data bits the code can carry per word',
        'It replaces p1, p2 and p4 with one simpler check bit',
      ],
      answer: 0,
      why: 'With one flip the overall parity is odd; with two it is even again while the syndrome is non-zero. That combination means "two errors": detected, but still not correctable.',
    },
    {
      q: 'A CRC receiver gets remainder 0000. Is the frame guaranteed intact?',
      options: [
        'No: patterns that are multiples of the generator pass',
        'Yes: any bit flip always leaves a non-zero remainder',
        'Yes, as long as the CRC bits themselves arrived intact',
        'No: a remainder of 0000 means that bits were flipped',
      ],
      answer: 0,
      why: 'Flips add an error polynomial; if it divides evenly by the generator, the remainder stays 0. Every single flip is caught, but not every pattern, and 0000 is what a clean frame gives too.',
    },
  ],
};

export default lesson;
