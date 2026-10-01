import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Injection happens when data is pasted into something that gets interpreted, like SQL, HTML or a shell command, so the data can change what the code does. The fix is to keep data separate from code.',
    what: 'When a program builds a query or a page by gluing text together, the text you add is read with the same rules as the code around it. A name with an apostrophe ends a SQL string early; a comment with angle brackets becomes HTML tags. Parameterised queries, setting text instead of HTML, argument lists instead of shell strings, and encoding values for their context all keep data as data, whatever it contains.',
    analogy: 'Reading a form letter aloud that says "Dear ___": if someone writes "Bob. The meeting is cancelled" in the blank, you read out an announcement nobody meant to make. A form with a separate box for the name can\'t be misread.',
    useCases: [
      'Database queries in every backend (use placeholders, never string concatenation)',
      'Rendering user content on web pages (textContent, or a template engine that encodes)',
      'Running programs from code (pass an argument array, not one shell string)',
      'Building URLs and writing logs (encode values; escape line breaks)',
    ],
    why: 'It\'s one of the oldest and most common security bugs, and it starts as an everyday bug: a customer called O\'Brien can\'t log in. Juniors write these queries daily, so knowing the one fix (keep data separate) matters more than memorising attack strings.',
    watch: 'Your text is blue with a light blue background (so even a space is visible). Characters that stopped being data and were read as SQL or as a tag turn red, and the query\'s structure chips turn red where it changed. The parameter is a green chip sent beside the query, and the rows the database returned are yellow. On the web page scene, red marks what the browser took as markup and green what it shows exactly as typed.',
  },
  tryThis: [
    'Search for O\'Brien: the pasted query breaks, the parameterised one finds her.',
    'Try the curly O’Brien: a typographic apostrophe isn\'t a quote to SQL, so nothing breaks.',
    'On the web page, try "a<b and b>c": the browser reads "and b" as attributes of a <b> tag.',
    'In "Everywhere else", click each sample and watch a different place break each time.',
  ],
  keyIdeas: [
    'Injection = data read as code because it was pasted into code.',
    'The fix is structural: parameters, textContent, argument arrays, encoding for the context.',
    'Blocking "dangerous characters" breaks real data (O\'Brien) and misses cases; don\'t rely on it.',
    'Things that can\'t be parameters, like column names, get an allow-list.',
  ],
  quiz: [
    {
      q: "A signup form breaks for a customer named O'Brien because the code builds SQL with string concatenation. What's the right fix?",
      options: [
        'Send the name separately with a parameterised query',
        'Reject any name that contains an apostrophe',
        'Strip apostrophes out before saving the name',
        'Wrap the name in double quotes instead of single',
      ],
      answer: 0,
      why: "Rejecting or stripping changes real people's names and only hides one symptom, and switching quotes just moves the problem. With a parameter the name can never change the query's structure, whatever it contains.",
    },
    {
      q: 'Why does "I <3 it" display correctly even when pasted into innerHTML?',
      options: [
        'In HTML, "<" before a digit can\'t start a tag',
        'The browser escapes pasted text automatically',
        'The heart is a built-in HTML entity',
        'innerHTML ignores every angle bracket',
      ],
      answer: 0,
      why: 'Markup needs a letter, "/", "!" or "?" after "<", so "<3" is just text. It survives by luck of the tokenizer\'s rules, not because anything escaped it; the next comment might not, which is why the fix is to set text or encode, not to hope.',
    },
    {
      q: 'You need to let users sort results by a column they choose. How do you keep that safe?',
      options: [
        'Check it against a fixed list of allowed column names',
        'Put the column name in a query parameter like any value',
        'Escape it the same way you escape string values',
        "It's safe, because it's only a column name",
      ],
      answer: 0,
      why: "Placeholders stand for values, not identifiers, so a column name can't be a parameter. An allow-list makes sure only names you chose ever reach the query.",
    },
  ],
};

export default lesson;
