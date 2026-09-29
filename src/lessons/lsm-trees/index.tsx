import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An LSM tree makes writes fast by never updating data in place: it buffers writes in memory, flushes them as sorted immutable files, and merges those files in the background.',
    what: 'Every write is appended to a write-ahead log (for crash safety) and inserted into an in-memory sorted table, the memtable. When the memtable fills, it is flushed to disk as a sorted, immutable SSTable. Deletes are just writes of a tombstone marker. Because the same key can now live in several files, reads check the newest data first, and per-file bloom filters let them skip files that can\'t contain the key. Compaction periodically merges files, keeping only the newest version of each key and discarding tombstones.',
    analogy: 'An accountant who jots every transaction in a notebook, and each evening copies the day\'s page into a neatly sorted ledger. Every so often the old ledgers get merged into one clean book with the crossed-out entries gone.',
    useCases: [
      'Cassandra, ScyllaDB, HBase and Bigtable',
      'RocksDB and LevelDB, embedded under many other databases (e.g. CockroachDB\'s Pebble is an LSM)',
      'Time-series, logging and metrics stores that ingest huge write volumes',
      'Choosing between B-tree and LSM storage engines for a workload',
    ],
    why: 'Storage-engine choice decides how a database behaves under load. Staff-level engineers are expected to reason about the three amplification costs (write, read and space), explain why a write-heavy system uses an LSM, and diagnose symptoms like compaction stalls, tombstone-heavy reads and disk usage spikes.',
    watch: 'The top-left box is the memtable in RAM; next to it is the write-ahead log on disk. Below are the SSTable files: L0 (newest first, may overlap) and L1 (one sorted, non-overlapping run). Yellow marks the active step or key, red ✝ entries are tombstones, violet borders show files being compacted, and dropped entries are listed struck through in red. The little bar under each file is its bloom filter: on a read the two checked bits light green, or red if one is 0, which means the file is skipped (blue).',
  },
  tryThis: [
    'PUT keys until the memtable fills and flushes. Keep going until L0 hits 3 files and compaction kicks in.',
    'Overwrite a key a few times, then GET it: the newest version wins, and older copies wait for compaction to drop them.',
    'DELETE a key and GET it: the tombstone answers "deleted" even though older values still sit below.',
    'GET a missing key: watch bloom filters skip files, and spot the occasional false positive.',
  ],
  keyIdeas: [
    'Writes are appends: WAL + memtable, then sequential flushes. Nothing is updated in place.',
    'Deletes are tombstones; overwritten and deleted data is only removed by compaction.',
    'Reads search newest → oldest and use bloom filters to skip files that can\'t hold the key.',
    'The trade-off is amplification: great write throughput, paid for with rewrites (write amp), extra checks (read amp) and dead data (space amp).',
  ],
  quiz: [
    {
      q: 'What happens on disk when you DELETE a key in an LSM tree?',
      options: ['The key is erased from its SSTable', 'A tombstone is written; the old data is removed later by compaction', 'The whole SSTable is rewritten immediately', 'Nothing until the next restart'],
      answer: 1,
      why: 'SSTables are immutable. A tombstone shadows older versions until compaction merges and discards them.',
    },
    {
      q: 'A bloom filter for an SSTable says "maybe". What does that mean?',
      options: ['The key is definitely in the file', 'The key is definitely not in the file', 'The key might be there, so the file must be read to know', 'The file is corrupted'],
      answer: 2,
      why: 'Bloom filters have no false negatives but do have false positives. "No" lets you skip; "maybe" means go and look.',
    },
    {
      q: 'Why do LSM trees handle heavy write loads better than B-trees?',
      options: ['They store less data', 'They turn random in-place updates into sequential appends and batch flushes', 'They never write to disk', 'They skip durability'],
      answer: 1,
      why: 'Sequential writes are far cheaper than random page updates. The cost moves to compaction and reads.',
    },
  ],
};

export default lesson;
