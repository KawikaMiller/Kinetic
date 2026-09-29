import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A CRDT (conflict-free replicated data type) is a data structure that replicas can edit independently, even offline, and always merge into the same result without coordination.',
    what: 'Normally, two replicas that change the same data while disconnected leave you with a conflict to resolve. A CRDT designs the data and its merge function so conflicts can\'t happen: the merge is commutative, associative and idempotent, so replicas that have seen the same updates reach the same state in any order, even with duplicate messages. A G-Counter gives each replica its own slot and merges by taking the maximum per slot. An OR-Set tags every add uniquely, so a remove only cancels the adds it actually saw. An LWW-Register keeps the write with the highest timestamp.',
    analogy: 'Several people keep tally marks on their own copy of a sheet, each in their own column. To combine sheets you take the larger tally in each column, so nobody\'s marks are ever double-counted or lost.',
    useCases: [
      'Collaborative editors and local-first apps (Figma-style multiplayer, Automerge, Yjs)',
      'Offline-capable mobile apps that sync later',
      'Multi-region databases with active-active writes (Riak, Redis Enterprise CRDTs, Azure Cosmos DB)',
      'Distributed counters, presence and shopping carts',
    ],
    why: 'Once writes are accepted in several places at once, whether regions, devices or offline clients, you have to decide what happens when they collide. Staff-level engineers need to know when CRDTs give you availability without coordination, what they cost (metadata growth, tombstones), and when semantics like "last writer wins" silently throw data away.',
    watch: 'Three replicas sit side by side, each with its own copy of the data. A green "online" pill means connected; a red dashed border means partitioned. Blue pills flying across the top are full-state messages; each one is merged when it lands. For the G-Counter, the small A/B/C cells are each replica\'s slot (violet outline = its own slot). OR-Set items show their unique violet tags. Switch Merge to Naive overwrite to watch the same edits diverge or lose updates.',
  },
  tryThis: [
    'G-Counter: take B offline, press +1 three times on A and twice on B, then Reconnect & sync. Total: 5.',
    'Same thing with Naive overwrite. How many increments survive?',
    'OR-Set: take B offline, remove 🍎 on B while A adds 🍎 again, then sync. Add wins.',
    'After any sync, hit "Replay sync, new order": the CRDT lands on the same answer every time.',
  ],
  keyIdeas: [
    'CRDT merges are commutative, associative and idempotent, so order and duplicates don\'t matter.',
    'G-Counter: one slot per replica, merge = max per slot, value = sum.',
    'OR-Set: unique tags per add; removes cancel only the tags they saw, so concurrent add wins.',
    'LWW converges, but it converges by discarding the losing write: convergence is not the same as keeping everyone\'s intent.',
  ],
  quiz: [
    {
      q: 'Why does a G-Counter merge with max per replica slot instead of adding the counts?',
      options: ['Max is faster', 'Adding would double-count when the same state is merged twice', 'Counters can only go down', 'To save memory'],
      answer: 1,
      why: 'Merges must be idempotent: receiving the same state twice must not change the result. Max is; addition isn\'t.',
    },
    {
      q: 'In an OR-Set, replica A adds "x" while replica B concurrently removes "x". After merging…',
      options: ['"x" is gone', '"x" is present, because the remove didn\'t see A\'s new tag', 'The merge fails', 'It depends on message order'],
      answer: 1,
      why: 'A remove only tombstones the tags it observed. A\'s concurrent add has a fresh tag, so it survives: add-wins.',
    },
    {
      q: 'What does a last-writer-wins register guarantee?',
      options: ['No write is ever lost', 'All replicas converge to the same value', 'Writes are applied in real-time order', 'Transactions across keys'],
      answer: 1,
      why: 'LWW converges deterministically, but concurrent writes with lower timestamps are silently dropped.',
    },
  ],
};

export default lesson;
