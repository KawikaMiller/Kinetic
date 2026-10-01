import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A relational database stores data in tables of rows and columns, and SQL describes the result you want: which rows, which columns, and how tables connect.',
    what: 'Each table holds one kind of thing (users, orders) and every row has a unique id. Tables link through foreign keys: an order stores the user_id of the user who placed it. A SQL query filters rows (WHERE), picks columns (SELECT), combines tables on those keys (JOIN), and summarises (GROUP BY), and the database figures out how to do it.',
    analogy: 'A spreadsheet with several tabs, where some columns hold the row number of a row on another tab. A JOIN follows those references and lines the matching rows up side by side.',
    useCases: [
      'Almost every web app\'s data: accounts, orders, posts, permissions',
      'Reporting and analytics: "orders per customer this month"',
      'Debugging production: querying what actually happened to a record',
      'Postgres, MySQL, SQLite and SQL Server all speak it',
    ],
    why: 'Relational databases hold the data behind most software, and SQL is the one language nearly every engineer ends up using. Knowing how joins and filters work, and the order a query really runs in, prevents classic bugs like duplicated rows from a join or users silently vanishing from a report.',
    watch: 'The SQL at the top lights up the clause that is running, and the chips below show the real execution order. Yellow rows are being read, green rows are kept or matched, dimmed rows are filtered out. Green lines connect joined rows by user_id. The result table on the right builds live; NULL shows in violet.',
  },
  tryThis: [
    'Run WHERE and watch the SQL highlight jump around: FROM runs first, SELECT near the end.',
    'Compare JOIN with LEFT JOIN. Where do Linus and Margaret go?',
    'Count how many times Ada appears in the JOIN result. Why is it 3?',
    'Watch GROUP BY colour the rows into buckets, then collapse each bucket into one row.',
  ],
  keyIdeas: [
    'Tables hold rows; a foreign key (orders.user_id) points at another table\'s id.',
    'SQL runs FROM → JOIN → WHERE → GROUP BY → SELECT → ORDER BY, not in the order you write it.',
    'An inner JOIN drops rows with no match; LEFT JOIN keeps every left row and fills in NULL.',
    'A JOIN can multiply rows: one user with three orders becomes three rows.',
  ],
  quiz: [
    {
      q: 'Which clause does the database logically run first?',
      options: ['SELECT', 'FROM', 'WHERE', 'LIMIT'],
      answer: 1,
      why: 'FROM (and its JOINs) builds the set of rows first; WHERE filters it, SELECT picks columns, LIMIT trims at the end. SELECT is written first but runs late.',
    },
    {
      q: 'A user has no orders. What happens to them in users LEFT JOIN orders?',
      options: [
        'They appear once, with NULL in the order columns',
        "They're dropped, since they have nothing to join",
        'The query fails because a join found no match',
        'They appear once for every order in the table',
      ],
      answer: 0,
      why: 'LEFT JOIN keeps every row from the left table; missing matches are filled with NULL. Dropping unmatched rows is what an INNER JOIN does.',
    },
    {
      q: 'Why does Ada appear three times after joining users to orders?',
      options: [
        'She has three orders, and each match is a row',
        'The users table holds three copies of her row',
        'The database duplicates rows to fill the result',
        'A JOIN always repeats each row three times',
      ],
      answer: 0,
      why: 'A join produces one row per matching pair, and Ada matches three orders. That multiplication is why aggregate reports sometimes double-count.',
    },
  ],
};

export default lesson;
