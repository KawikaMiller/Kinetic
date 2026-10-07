import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A rolling hash updates a window\'s fingerprint in O(1) as it slides along text, so Rabin-Karp compares hashes instead of strings, and checks characters only when two hashes agree.',
    what: 'Treat each window as a number in base B, reduced mod M. Sliding one place subtracts the leaving character\'s term, multiplies by B and adds the new character, a fixed amount of work whatever the pattern\'s length. When a window\'s hash equals the pattern\'s, Rabin-Karp verifies character by character, because different strings can share a hash.',
    analogy: 'Checking a long receipt total as items scroll past: add the new item, subtract the one that dropped off the top, and only re-add the list by hand when the total looks like the one you want.',
    useCases: [
      'Searching for many patterns of one length at once, such as plagiarism or duplicate-code detection',
      'Deduplicating backups (restic, borg) that cut files into chunks where a rolling hash hits a target value',
      'rsync, which slides a rolling checksum to find blocks the other side already has',
      'Comparing substrings in O(1) after O(n) prefix hashing, a common interview technique',
    ],
    why: 'It is the cleanest example of trading a little probability for a lot of speed, and the bug it invites, trusting a hash match without checking, is a real one. It builds on `hash-table`, `modular-arithmetic` and the window idea from `sliding-window`.',
    watch: 'Text cells carry their index above; spaces show as ␣. The box over the text is the window: yellow while sliding, blue while a hash hit is checked, green for a real match and orange for a spurious hit. The red cell is the character leaving and the green cell the one entering; the blue cell is the character being verified, matching the blue cell in the pattern. Faded cells have been passed. In the hash panel, red is the leaving term and green the incoming character; the window hash shows blue when it equals the pattern\'s hash and yellow otherwise. Found chips are green for matches and orange for spurious hits. Chunking: chunks found again alternate violet and grey, new chunks are blue, lost chunks are red and struck through, and the inserted X is yellow.',
  },
  tryThis: [
    'Play Small modulus at M = 13: three windows hash like “abra” without being “abra”, and the character check rejects each one.',
    'Switch the same preset to 101, then 2³¹ − 1: on this text the spurious hits drop from 3 to 2 to 0.',
    'Pick Overlaps: “ana” starts at 1 and again at 3 in “banana”, overlapping, and both are found.',
    'Type a capital letter or a digit into Text and press Apply: it is refused, not quietly lowercased.',
    'In Chunking, drag Insert X at: cuts before the X never move, and the chunks well away from it are found again unchanged.',
  ],
  keyIdeas: [
    'A polynomial hash slides in O(1): subtract the leaving term, multiply by the base, add the entering character.',
    'Equal hashes do not mean equal strings: verify every hit, or accept a known false-positive rate.',
    'Bigger moduli make spurious hits rarer, about 1 in M when hashes spread evenly; a random base makes that a guarantee.',
    'Rabin-Karp expects O(n + m) work; its worst case, with a hit at nearly every window to verify, is O(nm).',
  ],
  quiz: [
    {
      q: 'A window\'s hash equals the pattern\'s hash. What must Rabin-Karp do next?',
      options: [
        'Compare the characters, because different strings can share a hash',
        'Report a match: equal hashes mean the window equals the pattern',
        'Rehash the window with a second base to settle it for certain',
        'Skip ahead by the pattern length, since matches cannot overlap',
      ],
      answer: 0,
      why: 'A hash squeezes countless strings into M values, so collisions must exist; the Small modulus preset shows three at mod 13. A second hash makes a collision less likely but cannot rule one out, and matches can overlap, like “ana” twice in “banana”.',
    },
    {
      q: 'Why does sliding the window cost O(1) instead of O(m)?',
      options: [
        'Each update removes one character\'s term and adds one, whatever m is',
        'The hash only depends on the first and last characters of the window',
        'The modulus keeps numbers small, so hashing m characters is quick',
        'Windows that share characters are cached and looked up in a table',
      ],
      answer: 0,
      why: 'Subtract out × B^(m−1), multiply by B, add the new character: a fixed amount of arithmetic. The hash still depends on every character in the window; the first-and-last option mixes up the update with the hash itself.',
    },
    {
      q: 'With M = 13 and hash values spread evenly, how often does a non-matching window collide with the pattern?',
      options: ['About 1 in 13', 'Never, M is prime', 'About 1 in 2', 'About 1 in 169'],
      answer: 0,
      why: 'There are only 13 possible hash values, so an evenly spread non-matching window lands on the pattern\'s about 1 time in 13. A prime modulus helps spread the values but cannot remove collisions with only 13 buckets, which is why real code uses moduli around 2⁶¹.',
    },
    {
      q: 'A backup tool cuts files wherever a rolling hash hits 0 mod 64. You insert one byte near the start. What happens?',
      options: [
        'Chunks near the edit change; later cuts move with the content',
        'Every later chunk changes, since all offsets shift by one byte',
        'Nothing changes, because the rolling hash ignores single bytes',
        'The whole file is re-chunked at new, random boundaries',
      ],
      answer: 0,
      why: 'A cut depends only on the bytes in its window, so cuts more than a window past the edit see the same bytes and reappear one byte later. Every later chunk changing is what happens with fixed-size blocks, which is exactly what content-defined chunking avoids.',
    },
  ],
};

export default lesson;
