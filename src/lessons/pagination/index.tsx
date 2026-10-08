import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Offset pagination (LIMIT 5 OFFSET 10) gets slower the deeper you go and repeats or skips rows when the data changes; cursor (keyset) pagination remembers the last row\'s sort key and asks for what comes after it, so it stays cheap and stable.',
    what: 'With OFFSET the database still walks every row it skips, so page 10,000 of 5 reads about 50,000 index entries to return 5. And because the offset counts positions, a row inserted at the top pushes rows you already saw onto the next page (duplicates), while a delete pulls an unseen row onto a page you already passed (a gap). A cursor stores the last row\'s key, `(created_at, id)`, and the next query is `WHERE (created_at, id) < (:ts, :id)`: an index seek, then 5 rows, whatever the depth or the writes. The id is the tie-breaker that makes the key unique.',
    analogy: 'Offset is "start reading at the 40th line of the page": if someone adds a line at the top, you read one line twice. A cursor is a bookmark on the line itself: lines added above don\'t move it.',
    useCases: [
      'Infinite-scroll feeds and timelines (social posts, activity logs, notifications)',
      'Public APIs that return `next_cursor` and `has_more` instead of page numbers',
      'Exporting or syncing a large table in batches without missing or repeating rows',
      'Admin tables that still need "jump to page 7" and totals, where offset is fine',
    ],
    why: 'Pagination bugs are quiet: a feed that shows a post twice, an export that misses rows, a deep page that times out the database. Picking offset or cursor on purpose, and always sorting by a unique key, avoids all three. It builds on `db-indexes` (why the seek is cheap), `sql-basics` and `rest-api-design` (the collection being paged).',
    watch: 'Each strip is the whole table, newest first, one row per box with its id and time. The rows of the page just loaded are yellow; rows returned on an earlier page are dimmed and dashed; a row returned again is red ("again"); a row the paging jumped over is orange ("skipped"); rows inserted while paging are blue ("new"). The cursor column\'s "no duplicates · none skipped" turns green while it is stable. In the caption, repeats are red, skips orange and a stable cursor green. In Tie-breaker the page each row landed on is a sky, amber or pink bar ("page 1/2/3"), and skipped rows are orange. In Cost at depth both bars are violet, the rows the database reads, drawn to scale; on the log-log plot offset is the red line, keyset the green one, and the yellow line marks the chosen page.',
  },
  tryThis: [
    'In Feed under writes, press Insert 2 new rows, then Next page: which rows does the offset strip show again?',
    'Press Reset, then Delete the newest row and Next page: which row does offset skip, and does the cursor?',
    'In Tie-breaker, switch Sort and cursor from created_at only to (created_at, id): where do #8 and #7 go?',
    'In Cost at depth, drag Depth to page 10,000: how many rows does each strategy read?',
  ],
  keyIdeas: [
    'OFFSET n walks and discards n rows: cost grows with depth.',
    'Offset counts positions, so inserts duplicate rows and deletes skip them; a cursor names a row, so it doesn\'t.',
    'Sort by a unique key, `(created_at, id)`, and put the same key in the cursor, or ties get skipped.',
    'Offset gives page numbers and totals; cursors give cheap, stable next/previous. Make cursors opaque.',
  ],
  quiz: [
    {
      q: 'A teammate says offset pagination is cheap here because each page is only 5 rows. What\'s wrong with that?',
      options: [
        'It still walks every skipped row: page 10,000 reads about 50,000',
        'Nothing: with LIMIT 5 the database only ever touches five index rows',
        'It\'s fine, since the expensive part is sending rows over the network',
        'Offset is only slow on tables that have no primary key at all',
      ],
      answer: 0,
      why: 'LIMIT bounds what is returned, not what is read: to find row 50,000 by position the database walks the index past all the earlier ones. Five rows on the wire is cheap; the walk is not. Keyset pagination seeks straight to the cursor instead.',
    },
    {
      q: 'Two new posts arrive at the top while a user reads page 1 of an offset feed. What do they see on page 2?',
      options: [
        'The last 2 posts of page 1 again, shown as duplicates',
        'The 2 new posts, inserted right at the top of page 2',
        'Exactly the rows they would have seen with no inserts',
        'An error, because the table changed after page 1 loaded',
      ],
      answer: 0,
      why: 'Every old row moved down two places, so OFFSET 5 now starts two rows earlier: the end of page 1 shows up again. The new posts sit above page 1 and aren\'t shown at all. A cursor avoids it by asking for rows after the last one seen.',
    },
    {
      q: 'Why does the cursor hold id as well as created_at?',
      options: [
        'Rows can share a timestamp, so without id some get skipped',
        'The id makes the cursor shorter, so the URL stays under its limit',
        'Databases can\'t compare timestamps inside a WHERE clause at all',
        'So the client can jump straight to any page number it likes',
      ],
      answer: 0,
      why: 'If page 1 ends on a row at 09:05 and two more rows share 09:05, "created_at < 09:05" skips them (and <= repeats some). Adding id makes the key unique, so "after this row" has exactly one meaning. It doesn\'t help with page numbers.',
    },
    {
      q: 'What can offset pagination do that cursor pagination can\'t easily?',
      options: [
        'Jump to page 50, and show "page 3 of 40" totals',
        'Stay stable when rows are inserted while paging',
        'Answer deep pages without walking skipped rows',
        'Keep the sort key hidden from clients completely',
      ],
      answer: 0,
      why: 'Offset addresses pages by position, so any page number works (at a cost) and totals come from a count. A cursor only knows "after this row", so it gives next and previous. Stability and cheap deep pages are the cursor\'s strengths.',
    },
    {
      q: 'Why send the cursor as an opaque base64url string rather than ?after_ts=…&after_id=…?',
      options: [
        'Clients pass it back unchanged, so you can change the key later',
        'Base64 encrypts it, so clients can never read the sort key',
        'Plain query parameters can\'t carry timestamps or numbers',
        'An opaque cursor lets the database skip the index seek',
      ],
      answer: 0,
      why: 'Opaque means a contract: clients don\'t build or edit it, so the server can add a field or change the sort later. Base64 is an encoding, not encryption: anyone can decode it, and the stage shows the decoded key. The seek happens either way.',
    },
  ],
};

export default lesson;
