import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An LSM tree makes writes fast by not updating files in place: it buffers writes in memory, flushes them as sorted immutable files, and merges those files in the background.',
    what: 'Each write is appended to a write-ahead log (for crash safety) and inserted into an in-memory sorted table, the memtable. When the memtable fills, it is flushed to disk as a sorted, immutable SSTable. Deletes are just writes of a tombstone marker. Because the same key can now live in several files, reads check the newest data first, and per-file bloom filters let them skip files that can\'t contain the key. Compaction periodically merges files, keeping the newest version of each key and dropping the rest. In this two-level model a merge into L1 also discards tombstones, because L1 is the bottom level and nothing older is left to hide; a real engine keeps a tombstone until it reaches the bottom level or no older version remains.',
    analogy: 'An accountant who jots each transaction in a notebook, and each evening copies the day\'s page into a neatly sorted ledger. Now and then the old ledgers get merged into one clean book with the crossed-out entries gone.',
    useCases: [
      'Cassandra, ScyllaDB, HBase and Bigtable',
      'RocksDB and LevelDB, embedded under many other databases (e.g. CockroachDB\'s Pebble is an LSM)',
      'Time-series, logging and metrics stores that ingest huge write volumes',
      'Choosing between B-tree and LSM storage engines for a workload',
    ],
    why: 'Storage-engine choice decides how a database behaves under load. Staff-level engineers are expected to reason about the three amplification costs (write, read and space), explain why a write-heavy system uses an LSM, and diagnose symptoms like compaction stalls, tombstone-heavy reads and disk usage spikes.',
    watch: 'The top-left box is the memtable in RAM; next to it is the write-ahead log on disk. Below are the SSTable files: L0 (newest first, may overlap) and L1 (one sorted, non-overlapping run). Yellow marks the active step or key, red ✝ entries are tombstones, violet borders show files being compacted, and dropped entries are listed struck through in red. The little bar under each file is its bloom filter: set bits are grey, and on a read the two checked bits light green, or red if one is 0. A file whose filter says no is skipped (blue border), a file read and found to hold the key is green, a read file that lacks it is a red false positive, and L1 files outside the key range are dimmed.',
  },
  tryThis: [
    'PUT random keys until the memtable fills and flushes (it holds 4). Keep going until L0 reaches 3 files and compaction kicks in.',
    'Press Overwrite a key, then GET last written key: the newest version wins, and the older copies wait for compaction to drop them (Space amp rises above 1× while they wait).',
    'DELETE a key, then press GET deleted key: the tombstone answers "deleted" even though older values may still sit below it.',
    'Press GET missing key a few times: watch bloom filters skip files, and spot a false positive (a red file that was read for nothing).',
  ],
  keyIdeas: [
    'Writes are appends: WAL + memtable, then sequential flushes. An SSTable on disk is immutable: a change goes into a new file.',
    'Deletes are tombstones; overwritten and deleted data is removed by compaction. This model drops a tombstone at the bottom level, L1.',
    'Reads search newest → oldest and use bloom filters to skip files that can\'t hold the key.',
    'The trade-off is amplification: great write throughput, paid for with rewrites (write amp), extra checks (read amp) and dead data (space amp).',
  ],
  quiz: [
    {
      q: 'What happens on disk when you DELETE a key in an LSM tree?',
      options: [
        'The key is erased in place from the SSTable that holds it',
        'A tombstone is written, and compaction removes the old data later',
        'The whole SSTable holding the key is rewritten immediately, without the key',
        'Nothing is written until the next restart',
      ],
      answer: 1,
      why: 'SSTables are immutable. A tombstone shadows older versions until compaction merges and discards them.',
    },
    {
      q: 'A bloom filter for an SSTable says "maybe". What does that mean?',
      options: [
        'The key is definitely in this file, so the read can stop here',
        'The key is definitely absent, so the file can be skipped safely',
        'The key may be present, so the file has to be read to find out',
        'The filter is stale and has to be rebuilt before the next read',
      ],
      answer: 2,
      why: 'Bloom filters have no false negatives but do have false positives. "No" lets you skip; "maybe" means go and look.',
    },
    {
      q: 'Why do LSM trees handle heavy write loads better than B-trees?',
      options: [
        'They keep less data on disk, so each write moves fewer bytes',
        'They turn random in-place updates into sequential appends and batch flushes',
        'They hold writes in memory until compaction, so nothing touches disk',
        'They skip the write-ahead log, which removes the durability cost',
      ],
      answer: 1,
      why: 'Sequential writes are far cheaper than random page updates. The cost moves to compaction and reads.',
    },
    {
      q: 'A job overwrites the same 100 keys again and again. Which cost grows until compaction runs?',
      options: [
        'Space amplification, because old versions pile up on disk',
        'Read-your-writes failures, because the newest version is hidden',
        'Write-ahead log size, because the log is never truncated',
        'Bloom filter error, because filters fill up with the keys',
      ],
      answer: 0,
      why: 'Each overwrite adds a newer copy and leaves the older ones in place, so the same live keys occupy more and more entries until a merge drops the old copies.',
    },
    {
      q: 'In this lesson\'s two-level model, why can compaction into L1 drop a tombstone?',
      options: [
        'Tombstones expire after a fixed time, as cache entries do',
        'The bloom filter already proves the key is gone from every file',
        'Reads skip tombstones once the delete has been flushed to disk',
        'L1 is the bottom level, so no older version lies below to hide',
      ],
      answer: 3,
      why: 'A tombstone exists to hide older versions in lower files. With nothing below L1, the merge has already removed them, so the marker has no job left. A real engine with more levels keeps it longer.',
    },
  ],
};

export default lesson;
