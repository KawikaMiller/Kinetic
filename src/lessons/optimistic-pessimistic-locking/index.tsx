import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When two users read a row, change it and save it back, the second save can silently overwrite the first (a lost update). Pessimistic locking prevents that by making the second reader wait; optimistic locking lets everyone work and rejects a save whose version is stale.',
    what: 'A lost update is a read-modify-write across two transactions (at READ COMMITTED, the level this lesson simulates): both read stock 10, one saves 9, the other saves 9, and one sale vanishes. Pessimistic: `SELECT … FOR UPDATE` locks the row until COMMIT, so the second reader waits and then sees 9; a long hold (someone at lunch) turns waits into lock timeouts. Optimistic: keep a version column and `UPDATE … WHERE id = 7 AND version = 3`; 0 rows affected means someone else got there first, so re-read and retry. Over HTTP the same idea is an ETag with `If-Match`: a stale tag gets 412, and a server that insists on the header answers 428 when it is missing. For a plain counter, `SET stock = stock - 1` avoids the read-modify-write altogether.',
    analogy: 'A shared document. Pessimistic is checking it out: nobody else can open it until you check it back in. Optimistic is everyone editing a copy, and the save button refusing "this file changed since you opened it" when yours is out of date.',
    useCases: [
      'Stock counts, seat bookings and account balances edited by many users at once',
      'An edit form where a version or updated_at column rejects a stale save (Rails\'s lock_version and JPA\'s @Version do this built in; Django\'s built-in row locking is the pessimistic select_for_update)',
      'REST APIs using ETag and If-Match so a client cannot overwrite a newer resource blindly',
      'Job queues that claim rows with SELECT … FOR UPDATE SKIP LOCKED, so each worker takes a different row instead of waiting',
    ],
    why: 'Lost updates are quiet: no error, no log line, just a number that is off by one, and they only appear under concurrent load that tests rarely produce. Knowing the three fixes (lock, version check, atomic statement) and what each costs is what lets you pick one in a design review. It builds on `transactions-acid`, `race-conditions` (this is a check-then-act race in a database) and `rest-api-design`.',
    watch: 'Ana\'s lane and timeline bars are blue, Ben\'s violet. In each lane the SQL line that just ran is yellow, and a save that found a conflict also says "0 rows: conflict" in orange. The row is in the middle: a yellow padlock names whoever holds the row lock, and a red dashed ghost row shows what the stock should have been when an update was lost. In the timeline a dashed bar is a wait for the lock, and the outline on a save says how it ended: green committed, orange a conflict that was detected (no data lost, a retry follows), red a lost update, and a lock-wait timeout also red. The yellow line is the clock. Over HTTP the messages are blue (Ana) and violet (Ben), a 200 that applied is green, 412 and 428 are orange, and a stale write that was applied anyway is red. In Contention the sky line is optimistic, the pink line pessimistic, and the yellow line the chosen number of editors.',
  },
  tryThis: [
    'With No locking and the Both read first chip, look at the row: what is the stock, and what does the red ghost row say it should be?',
    'Switch Strategy to Pessimistic and click the Ben reads while Ana edits chip: where does Ben\'s wait show up, and what does he read after it?',
    'Still Pessimistic, set Ana to Goes to lunch mid-edit, and click the Both read first chip: what does Ben get at a 5-tick timeout, and at 12?',
    'Switch to Optimistic and click the Both read first chip: which save is refused, and what do the SQL lines show on his retry?',
    'In Over HTTP, turn Ben to Sends no If-Match while the server does not require one, then require it: how do the answers change?',
  ],
  keyIdeas: [
    'At READ COMMITTED a transaction by itself does not stop a lost update: two read-modify-writes can both commit cleanly. Stricter levels can abort one (see isolation-levels).',
    'Pessimistic: lock at read (`FOR UPDATE`), hold to commit. Safe, but waiters queue and a stalled holder blocks everyone.',
    'Optimistic: check the version at write (`WHERE version = :seen`). No waiting, but 0 rows means re-read and retry.',
    'Over HTTP that is ETag plus If-Match: 412 when stale, 428 when required and missing. A plain counter can use `stock = stock - 1`.',
  ],
  quiz: [
    {
      q: 'Ana and Ben each run their read, edit and save in a separate transaction at READ COMMITTED. Both read stock 10. Why can a sale still be lost?',
      options: [
        'Both commit cleanly, and the second write silently replaces the first',
        'The database rolls back the later transaction to protect the first one',
        'Transactions run one at a time, so Ben must have read 9 after all',
        'Only one transaction may write the row at once, so Ben waits first',
      ],
      answer: 0,
      why: 'Neither statement fails: each UPDATE sets stock to a value computed from a stale read, and nothing checks that the row still matches what was read. Atomicity and durability are intact; the lost update comes from the read-modify-write gap. That is why a lock, a version check or an atomic UPDATE is needed on top of the transaction.',
    },
    {
      q: 'Ben\'s SELECT … FOR UPDATE blocks because Ana holds the row lock. When Ana commits, what does Ben\'s read return?',
      options: [
        'The row as Ana committed it, stock 9, so he saves 8',
        'The stale 10 that was in the table when his read began',
        'An error telling him the row changed while he was waiting',
        'Stock 9 as well, but his later save is silently refused',
      ],
      answer: 0,
      why: 'At READ COMMITTED the waiting reader gets the latest committed row once the lock is free, so his edit starts from 9 and his save gives 8. The stale 10 is exactly what the lock prevents. He gets an error only if the wait exceeds the lock timeout.',
    },
    {
      q: 'UPDATE products SET stock = 8, version = 4 WHERE id = 7 AND version = 3 reports 0 rows affected. What happened?',
      options: [
        'Someone changed the row after the read, so re-read and retry',
        'The row was locked, so the update waits until the lock clears',
        'The database lost the write and the stock is now unknown',
        'Product 7 does not exist anymore, so nothing was updated',
      ],
      answer: 0,
      why: 'The version moved on from 3, so the WHERE clause matched nothing and the stale write was refused: a conflict detected, with no data overwritten. The application re-reads and tries again, or shows the user a conflict. A lock wait would block, not return 0 rows.',
    },
    {
      q: 'A client sends PUT with If-Match: "v3", but the resource is now at "v4". Which answer is the precise one?',
      options: [
        '412 Precondition Failed: the If-Match condition is false',
        '428 Precondition Required: the header was missing from the PUT',
        '409 Conflict: the two copies cannot be merged automatically',
        '304 Not Modified: the client already has the current version',
      ],
      answer: 0,
      why: '412 is defined for a request whose precondition header evaluates to false. 428 (RFC 6585) is for a server that requires a precondition and got none, which is the tempting mix-up. 409 is a general state clash, and 304 belongs to conditional GETs.',
    },
    {
      q: 'Which situation favours optimistic locking over pessimistic?',
      options: [
        'Conflicts are rare, so retries are cheap and no lock is held',
        'Many users edit one hot row at the same moment, all day long',
        'A user may keep a form open for hours between read and save',
        'Every save must succeed on the first try, with no retry logic',
      ],
      answer: 0,
      why: 'Optimistic locking pays only when a conflict happens (redo the work), so it wins when they are rare, and it never blocks anyone. On a hot row the retries pile up, and a form left open means a stale save every time. Pessimistic locking guarantees the first try works but holds up everyone behind it.',
    },
  ],
};

export default lesson;
