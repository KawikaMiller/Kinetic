import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A regular expression is a tiny language for describing a shape of text: "three digits", "a word, then @". It lets you find, validate and pull pieces out of text without writing a loop.',
    what: 'A regex is a pattern made of literal characters and special pieces: \\d is a digit, [A-Z] one capital, . any character, + "one or more", ? "optional", ^ and $ the start and end. Parentheses make capture groups that remember what they matched, so you can extract a date\'s year or reorder it in a replacement. Flags change the rules: g finds every match, i ignores case, m makes ^ and $ work per line, s lets . cross line breaks. Repeats are greedy by default: they grab as much as they can.',
    analogy: 'A regex is a stencil you slide along the text: wherever the text fits the stencil\'s shape, that\'s a match. Capture groups are the holes in the stencil whose contents you keep.',
    useCases: [
      'Searching logs and code: grep, your editor\'s find, "every 500 in the access log"',
      'Extracting fields: dates, ids, status codes, the path out of a URL',
      'Search and replace: reformatting dates, renaming variables across a file',
      'Quick input checks, like "looks like a postcode", before the real validation',
    ],
    why: 'You will read and write regexes from your first week: in search boxes, log queries, linters and validation code. Knowing what each piece means, that repeats are greedy, and when a regex is the wrong tool saves hours of trial and error and a few production incidents.',
    watch: 'The top box lists the pattern piece by piece as chips with their meanings; a capture group\'s chips are outlined in that group\'s colour, and a chip the explainer doesn\'t cover is dashed and says "not explained". In the test text, each whole match has a yellow background and each capture group is tinted in its own colour (blue, violet, green, amber…), the same colour as its column in the groups table. Hovering or focusing a chip outlines in blue exactly what that piece matched, with a thin blue caret for zero-width pieces like ^; zero-width matches show as a thin yellow caret. An invalid or too-slow pattern shows a red message and a red pattern field. In Replace mode, the result below shows the replaced text in green.',
  },
  tryThis: [
    'Load "Greedy <.+>", then "Lazy <.+?>": one ? turns one giant match into four.',
    'Load "Anchors ^ $" and turn on the m flag: no matches become two.',
    'Load "Escaping . vs \\.", then change the pattern to file\\.txt.',
    'Load "ISO date → d/m/y" and change the replacement to $<month>-$<day>.',
    'Hover the \\d{3} chip in "Access log" to see only the status codes light up.',
  ],
  keyIdeas: [
    'Special pieces (\\d, [A-Z], ., +, ?, ^, $) describe shapes; everything else is literal.',
    '* and + are greedy: they take as much as they can. Add ? to make them lazy.',
    'Parentheses capture: named groups (?<year>…) can be reused as $<year> in a replacement.',
    'Regexes can\'t parse nested formats like HTML or JSON; use a parser for those.',
  ],
  quiz: [
    {
      q: 'On the text <b>hi</b>, what does <.*> match?',
      options: ['<b>', '<b>hi</b>, the whole thing', 'hi', 'Nothing'],
      answer: 1,
      why: '.* is greedy: it runs to the end, then gives back characters only until a > can match, so it stops at the LAST >. Use <.*?> to stop at the first.',
    },
    {
      q: 'Why does file.txt match the text "file-txt"?',
      options: ['Regexes ignore punctuation', 'An unescaped . means any character', 'The - is optional', 'It doesn\'t'],
      answer: 1,
      why: '. matches any character (except a line break). Escape it as \\. to mean a literal dot.',
    },
    {
      q: '^error matches nothing in a multi-line log, even though line 3 starts with "error". What\'s the fix?',
      options: ['Add the g flag', 'Add the m flag', 'Use $error', 'Remove the ^'],
      answer: 1,
      why: 'Without m, ^ means the start of the whole text. With m, it matches at the start of every line.',
    },
    {
      q: 'What\'s the right way to pull every link out of an HTML page?',
      options: ['A careful regex', 'An HTML parser (e.g. DOMParser)', 'split("<a")', 'A regex with the s flag'],
      answer: 1,
      why: 'HTML nests, has quoting rules and optional parts a regex can\'t track reliably. A parser understands the structure.',
    },
  ],
};

export default lesson;
