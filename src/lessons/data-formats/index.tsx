import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'JSON, CSV, YAML and XML are different ways to write the same data as text. Each one can hold some shapes and not others, and each has a classic way of quietly corrupting what you put in.',
    what: 'JSON is objects, lists, strings, numbers, true/false and null: the default for APIs. CSV is rows of text split by commas, with quotes around fields that contain commas, quotes or line breaks (RFC 4180); it has no nesting and no types. YAML is JSON-like data written with indentation, popular for config, and it guesses types for unquoted values. XML wraps every value in tags and adds attributes and namespaces. Parsing turns text into data; validating checks that the data has the shape you expect.',
    analogy: 'They are like the same shopping list written as a table, a note, a form and a letter: all readable, but the table has no room for "and for the party: cake, candles", and one of them might read "no" as "false".',
    useCases: [
      'APIs send and receive JSON; your code parses it on every request',
      'Exports and imports: CSV for spreadsheets, finance and bulk data',
      'Config files: YAML in CI pipelines, Docker Compose and Kubernetes',
      'Older enterprise and document formats (SOAP, SVG, Office files) are XML',
    ],
    why: 'The first data a junior parses is one of these, and the bugs are subtle: an id that changes its last digit, a name with a comma that shifts every column, a country code that turns into false. Knowing each format\'s limits tells you when to quote, when to send numbers as strings and when to reach for a real parser.',
    watch: 'On the first view, the JSON editor is the source of truth; below it, a green note means it parses and passes the schema, a red list shows schema errors, and a parse error shows the offending line highlighted in red. The CSV, YAML and XML panes are generated from it: the line holding a field you just changed is highlighted in yellow in every pane, and a value that JSON.parse corrupted (an id past 2^53) is shown in red. In CSV, the header\'s violet "lossy" note and the violet column names mark where nesting and lists were flattened. The stats compare each format\'s size in bytes. On the Pitfalls view, each card shows the bug on the left with the broken result in red, and the fix on the right in green.',
  },
  tryThis: [
    'Change "London" to "Paris" in the JSON and watch the same field light up in CSV, YAML and XML.',
    'Load "id past 2^53": the id is wrong in every format, because JSON.parse already lost the digit.',
    'Load "age: \\"thirty\\"": it parses fine, and only the schema check catches it.',
    'Open Pitfalls → YAML: the Norway problem turns country: NO into false.',
    'Open Pitfalls → CSV and compare split(",") with a real CSV parser on "Smith, Jane".',
  ],
  keyIdeas: [
    'CSV is not "split on commas": quoted fields can hold commas, quotes and line breaks.',
    'JSON numbers become JavaScript floats: send ids past 2^53 as strings.',
    'YAML guesses types for unquoted values (NO → false, 1.10 → 1.1): quote text.',
    'Parsing proves the text is well-formed; validating proves the data has the right shape.',
  ],
  quiz: [
    {
      q: 'What\'s wrong with reading CSV using line.split(",")?',
      options: ['Nothing, CSV is just commas', 'It breaks on quoted fields that contain commas or line breaks', 'It\'s too slow', 'It drops the header'],
      answer: 1,
      why: '"Smith, Jane" is one field, protected by quotes. split(",") cuts it in two and shifts every column after it.',
    },
    {
      q: 'An API returns {"id": 9007199254740993}. What does JSON.parse give you in JavaScript?',
      options: ['9007199254740993', '9007199254740992', 'An error', 'A BigInt'],
      answer: 1,
      why: 'JSON numbers become 64-bit floats, exact only up to 2^53 − 1. The nearest float is …992. Send big ids as strings.',
    },
    {
      q: 'In a YAML 1.1 config, what is country: NO?',
      options: ['The string "NO"', 'The boolean false', 'null', 'A syntax error'],
      answer: 1,
      why: 'YAML 1.1 treats yes/no/on/off as booleans in lowercase, Capitalised or UPPER case (NO, No, no). Write country: "NO".',
    },
    {
      q: 'The JSON parsed without errors. Is the data valid?',
      options: ['Yes, parsing checks everything', 'Not necessarily: it may still have the wrong types or missing fields', 'Only if it\'s under 1 MB', 'Only if it has no nulls'],
      answer: 1,
      why: '{"age": "thirty"} is perfectly valid JSON. A schema check (types, required fields) is a separate step.',
    },
  ],
};

export default lesson;
