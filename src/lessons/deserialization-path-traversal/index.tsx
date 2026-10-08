import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When input chooses a file path or a class to build, it chooses what your server touches. Resolve the finished path and check it stays under the allowed folder (or look files up by ID), and read untrusted data with a data-only format that you validate against a schema.',
    what: 'A download handler that glues a file name onto a folder lets a name with ".." pieces climb out of that folder, even by accident; the fix is to normalise the finished path and require it to stay under the root, with a trailing separator so a sibling like uploads-old does not pass. Better, let the input pick an ID and keep the paths in your own table. A deserialiser for a type-naming format reads a class name from the input and runs that class\'s setup code before your code sees the object. A data-only format such as JSON, validated against a schema, can only ever produce plain data, and signing what your own server writes (see `macs-hmac`) rejects blobs someone else edited.',
    analogy: 'A coat-check where you hand over a ticket number is safe; one where you write the shelf address yourself lets you walk into the back room. Likewise a form that says "build whichever machine this label names" is a way to start any machine in the building.',
    useCases: [
      'File download and upload endpoints, archive extraction and static file servers',
      'Reading saved sessions, caches, job payloads and messages from queues',
      'Choosing a serialization format for data that crosses a trust boundary',
      'Reviewing code that builds a path or a class name from a request parameter',
    ],
    why: 'Both bugs start as convenience: "just join the name onto the folder" and "just load the saved object". They are among the most common ways a server ends up reading or running something it never meant to, and each has a short, boring fix. Knowing the fix by heart is what keeps them out of reviews.',
    watch: 'Scene 1: a fictional file tree. The segment the walk is on is yellow, folders and files it visited are purple, and a climb (..) draws its edge in purple. The uploads folder has a thick green outline; a finished path inside it turns green and one outside it turns red; everything untouched is grey. The handler code shows the active line, and the log prints the answer. Scene 2: the blob is blue, a defence that is switched on is purple, a check that refused the blob is green, and the constructor box turns red when the input chose a class the reader never meant to build.',
  },
  tryThis: [
    'In scene 1 (Join the name) pick the fourth name, ../logo.png (someone typing a relative path by accident), and press Play: the finished path lands one folder above uploads and the file is served.',
    'With that same name, switch Handler to "Resolve, then check the root": the same walk ends in a 403. Then try "notes..txt": two dots inside a name are harmless.',
    'Switch Handler to "Look up by ID" and choose f-1: the name never touches the file system; the id picks a row.',
    'In scene 2 the edited blob names another type: with both toggles off, the constructor box turns red. Turn on the allow-list, then try signed blobs instead.',
    'In scene 2 pick "Edited with an extra field": the type-naming reader keeps it, while the data-only reader refuses it.',
  ],
  keyIdeas: [
    'Never trust a name to stay in its folder: resolve the finished path, then require it to be under the root (with a trailing separator).',
    'Stripping "../" once is not a defence, because removing a pattern can leave a new one behind.',
    'Prefer IDs: the request picks a row, and the row holds the path.',
    'Deserialising a type-naming format lets the input pick which constructor runs; use a data-only format, validate it, and sign what you write.',
  ],
  quiz: [
    {
      q: 'A teammate proposes removing every "../" from the file name before joining it to the uploads folder. Why is that not enough?',
      options: [
        'Running the filter a second time would make it safe, and one pass does not',
        'Removing a pattern once can leave a new one behind: check the result',
        'The join function ignores any ".." that is left in the name',
        'Filters only work on Windows-style paths, not on slash paths',
      ],
      answer: 1,
      why: 'Text filters fight the input one pattern at a time, and removing a piece can join its neighbours into a new one. The reliable fix works on the result: normalise the path, then require it to be under the allowed folder. join does not ignore "..", it applies it.',
    },
    {
      q: 'The check is `full.startsWith("/srv/shop/uploads")`, with no trailing separator. Which path wrongly passes it?',
      options: [
        '/srv/shop/config/settings.yml',
        '/srv/shop/uploads/2026/march.csv',
        '/srv/shop/uploads-old/legacy.txt',
        '/srv/shop/keys/signing.key',
      ],
      answer: 2,
      why: 'A sibling folder whose name starts with the same letters passes a bare prefix check. Adding the separator ("/srv/shop/uploads/") makes the check mean "inside this folder". The uploads file is correctly inside, and the other two do not start with the prefix at all.',
    },
    {
      q: 'What makes deserialising a type-naming format different from just parsing JSON?',
      options: [
        'It is slower, so large inputs can make the server time out',
        'A deserialiser always needs the original program\'s source to read the data',
        'The input picks which class to build, and its setup code runs first',
        'Parsing JSON also builds whatever class the text happens to name',
      ],
      answer: 2,
      why: 'JSON parsing yields plain data and nothing else. A type-naming format makes the loader look the class up and run its constructor before your code gets a chance to check anything, so the input chose which code runs. Speed and source access are beside the point.',
    },
    {
      q: 'Which setup best protects a service that reads saved carts back from users?',
      options: [
        'A type-naming format with a long, random-looking class name',
        'A type-naming format that logs every class it builds',
        'Any format, as long as the service runs behind a firewall',
        'A schema-checked data-only format with server-signed blobs',
      ],
      answer: 3,
      why: 'A schema over plain data can only accept the shapes you listed, and a signature rejects anything your server did not write. A hard-to-guess name is not a check, logging reports after the constructor ran, and a firewall does nothing about what the service itself loads.',
    },
  ],
};

export default lesson;
