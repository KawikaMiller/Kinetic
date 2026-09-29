import type { Tier, Topic, Track, TrackId } from './types';

export const TIERS: Tier[] = [
  { n: 1, name: 'Foundations', role: 'Intern · Junior', color: 'var(--t1)',
    blurb: 'The vocabulary every engineer is assumed to have on day one.' },
  { n: 2, name: 'Practitioner', role: 'Mid-level', color: 'var(--t2)',
    blurb: 'The tools you reach for when building features that have to hold up.' },
  { n: 3, name: 'Architect', role: 'Senior', color: 'var(--t3)',
    blurb: 'Designing systems that scale, fail gracefully and survive other people.' },
  { n: 4, name: 'Strategist', role: 'Staff · Principal', color: 'var(--t4)',
    blurb: 'Distributed-systems theory and trade-offs that shape whole organisations.' },
];

export const TRACKS: Record<TrackId, Track> = {
  dsa: { id: 'dsa', name: 'Data Structures & Algorithms', short: 'DS&A', color: '#a78bfa', glyph: '⟨⟩' },
  net: { id: 'net', name: 'Networking', short: 'Network', color: '#4cc9f0', glyph: '⇄' },
  arch: { id: 'arch', name: 'Systems & Architecture', short: 'Systems', color: '#f7b538', glyph: '▦' },
  data: { id: 'data', name: 'Databases & Storage', short: 'Data', color: '#3ddc97', glyph: '◫' },
  os: { id: 'os', name: 'OS & Concurrency', short: 'OS', color: '#ff8c5a', glyph: '⚙' },
  sec: { id: 'sec', name: 'Security', short: 'Security', color: '#ff5d8f', glyph: '⚿' },
  ops: { id: 'ops', name: 'DevOps & Cloud', short: 'DevOps', color: '#8fb8ff', glyph: '☁' },
};

/**
 * The full roadmap. A topic becomes playable as soon as a matching
 * src/lessons/<id>/index.tsx exists; everything else shows as "planned".
 */
export const TOPICS: Topic[] = [
  // ── Tier 1 · Foundations ───────────────────────────────────────────
  { id: 'big-o', tier: 1, track: 'dsa', title: 'Big-O Notation', tagline: 'Why some code falls off a cliff as data grows', minutes: 6 },
  { id: 'binary-search', tier: 1, track: 'dsa', title: 'Binary Search', tagline: 'Halve the problem on every single check', minutes: 5 },
  { id: 'stack-queue', tier: 1, track: 'dsa', title: 'Stacks & Queues', tagline: 'Last in, first out vs. first in, first out', minutes: 5 },
  { id: 'sorting', tier: 1, track: 'dsa', title: 'Sorting Algorithms', tagline: 'Bubble, insertion, merge & quick, head to head', minutes: 8 },
  { id: 'arrays-linked-lists', tier: 1, track: 'dsa', title: 'Arrays vs Linked Lists', tagline: 'Contiguous memory vs. a chain of pointers' },
  { id: 'recursion', tier: 1, track: 'dsa', title: 'Recursion & the Call Stack', tagline: 'Functions that call themselves, frame by frame' },
  { id: 'web-request', tier: 1, track: 'net', title: 'What Happens When You Hit Enter', tagline: 'DNS, TCP, TLS and HTTP, one hop at a time', minutes: 7 },
  { id: 'ip-ports', tier: 1, track: 'net', title: 'IP Addresses & Ports', tagline: 'Street addresses and apartment numbers for machines' },
  { id: 'http-basics', tier: 1, track: 'net', title: 'HTTP Methods & Status Codes', tagline: 'The verbs and replies of the web' },
  { id: 'client-server', tier: 1, track: 'arch', title: 'Client–Server & APIs', tagline: 'Who asks, who answers, and the contract between them' },
  { id: 'sql-basics', tier: 1, track: 'data', title: 'Tables, Rows & Joins', tagline: 'How relational data fits together' },
  { id: 'processes-threads', tier: 1, track: 'os', title: 'Processes vs Threads', tagline: 'Separate houses vs. roommates sharing a kitchen' },
  { id: 'hashing-encryption', tier: 1, track: 'sec', title: 'Hashing vs Encryption', tagline: 'One-way fingerprints vs. locked boxes' },
  { id: 'git-internals', tier: 1, track: 'ops', title: 'How Git Stores History', tagline: 'Commits, trees and blobs under the hood' },

  // ── Tier 2 · Practitioner ──────────────────────────────────────────
  { id: 'hash-table', tier: 2, track: 'dsa', title: 'Hash Tables', tagline: 'O(1) lookups, collisions and resizing', minutes: 7 },
  { id: 'graph-search', tier: 2, track: 'dsa', title: 'BFS, DFS & Dijkstra', tagline: 'Three ways to explore a maze', minutes: 8 },
  { id: 'trees-bst', tier: 2, track: 'dsa', title: 'Binary Search Trees', tagline: 'Sorted data you can insert into cheaply' },
  { id: 'heaps', tier: 2, track: 'dsa', title: 'Heaps & Priority Queues', tagline: 'Always know the smallest thing, instantly' },
  { id: 'dynamic-programming', tier: 2, track: 'dsa', title: 'Dynamic Programming', tagline: 'Stop solving the same subproblem twice' },
  { id: 'lru-cache', tier: 2, track: 'arch', title: 'Caching & LRU Eviction', tagline: 'Keep the hot stuff close, evict the stale', minutes: 6 },
  { id: 'rate-limiting', tier: 2, track: 'arch', title: 'Rate Limiting', tagline: 'Token buckets and sliding windows' },
  { id: 'message-queues', tier: 2, track: 'arch', title: 'Message Queues', tagline: 'Decouple producers from consumers' },
  { id: 'tcp-udp', tier: 2, track: 'net', title: 'TCP vs UDP', tagline: 'Reliable delivery vs. fire-and-forget' },
  { id: 'tls-handshake', tier: 2, track: 'net', title: 'The TLS Handshake', tagline: 'Agreeing on a secret in public' },
  { id: 'db-indexes', tier: 2, track: 'data', title: 'Indexes & B-Trees', tagline: 'Why the right index turns minutes into milliseconds' },
  { id: 'transactions-acid', tier: 2, track: 'data', title: 'Transactions & ACID', tagline: 'All or nothing, even when things crash' },
  { id: 'race-conditions', tier: 2, track: 'os', title: 'Race Conditions & Locks', tagline: 'When two threads touch the same thing' },
  { id: 'event-loop', tier: 2, track: 'os', title: 'The Event Loop', tagline: 'How one thread juggles thousands of tasks' },
  { id: 'auth-sessions-jwt', tier: 2, track: 'sec', title: 'Sessions vs JWTs', tagline: 'Two ways to remember who you are' },
  { id: 'containers', tier: 2, track: 'ops', title: 'Containers', tagline: 'Shipping the whole environment, not just the code' },

  // ── Tier 3 · Architect ─────────────────────────────────────────────
  { id: 'load-balancing', tier: 3, track: 'arch', title: 'Load Balancing', tagline: 'Round robin, least connections and friends under fire', minutes: 7 },
  { id: 'consistent-hashing', tier: 3, track: 'arch', title: 'Consistent Hashing', tagline: 'Add a server without reshuffling everything', minutes: 7 },
  { id: 'cap-theorem', tier: 3, track: 'arch', title: 'CAP & PACELC', tagline: 'What you give up when the network splits' },
  { id: 'circuit-breakers', tier: 3, track: 'arch', title: 'Circuit Breakers & Retries', tagline: 'Stop a failure from becoming an outage' },
  { id: 'monolith-microservices', tier: 3, track: 'arch', title: 'Monoliths vs Microservices', tagline: 'Where to draw the boundaries' },
  { id: 'event-sourcing', tier: 3, track: 'arch', title: 'Event Sourcing & CQRS', tagline: 'Store what happened, derive what is' },
  { id: 'replication', tier: 3, track: 'data', title: 'Replication', tagline: 'Leaders, followers and replication lag' },
  { id: 'sharding', tier: 3, track: 'data', title: 'Sharding', tagline: 'Splitting one database into many' },
  { id: 'isolation-levels', tier: 3, track: 'data', title: 'Isolation Levels', tagline: 'Dirty reads, phantoms and write skew' },
  { id: 'cdn-edge', tier: 3, track: 'net', title: 'CDNs & the Edge', tagline: 'Moving bytes closer to people' },
  { id: 'observability', tier: 3, track: 'ops', title: 'Observability', tagline: 'Logs, metrics and traces that actually help' },
  { id: 'oauth-flows', tier: 3, track: 'sec', title: 'OAuth 2 & OIDC Flows', tagline: 'Delegated access without sharing passwords' },

  // ── Tier 4 · Strategist ────────────────────────────────────────────
  { id: 'raft', tier: 4, track: 'arch', title: 'Consensus with Raft', tagline: 'Getting servers to agree when some are dying', minutes: 9 },
  { id: 'distributed-transactions', tier: 4, track: 'arch', title: 'Sagas & Two-Phase Commit', tagline: 'Transactions that span services' },
  { id: 'backpressure', tier: 4, track: 'arch', title: 'Backpressure & Load Shedding', tagline: 'Saying no so the system survives' },
  { id: 'multi-region', tier: 4, track: 'arch', title: 'Multi-Region Design', tagline: 'Active-active, failover and the speed of light' },
  { id: 'lsm-trees', tier: 4, track: 'data', title: 'LSM Trees', tagline: 'How write-heavy databases stay fast' },
  { id: 'crdts', tier: 4, track: 'data', title: 'CRDTs', tagline: 'Data that merges itself without conflicts' },
  { id: 'probabilistic-structures', tier: 4, track: 'dsa', title: 'Bloom Filters & HyperLogLog', tagline: 'Trading certainty for massive savings' },
  { id: 'slos-error-budgets', tier: 4, track: 'ops', title: 'SLOs & Error Budgets', tagline: 'Deciding how reliable is reliable enough' },
  { id: 'zero-trust', tier: 4, track: 'sec', title: 'Zero Trust Networks', tagline: 'Never trust the network, verify every request' },
];

export const tierOf = (topic: Topic) => TIERS[topic.tier - 1];
export const trackOf = (topic: Topic) => TRACKS[topic.track];
export const findTopic = (id: string) => TOPICS.find((t) => t.id === id);
