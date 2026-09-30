import type { Family, Tier, Topic, Track, TrackId } from './types';

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

/** Filter groups on the home page, in display order. */
export const FAMILIES: Family[] = [
  { id: 'computing', name: 'Computing' },
  { id: 'systems', name: 'Systems' },
  { id: 'delivery', name: 'Delivery' },
  { id: 'product', name: 'Product & people' },
];

// Declared in family order: Object.values(TRACKS) is the display order.
export const TRACKS: Record<TrackId, Track> = {
  dsa: { id: 'dsa', family: 'computing', name: 'Data Structures & Algorithms', short: 'DS&A', color: 'var(--trk-dsa)', glyph: '⟨⟩' },
  hw: { id: 'hw', family: 'computing', name: 'Computer Architecture & Data Representation', short: 'Hardware', color: 'var(--trk-hw)', glyph: '01' },
  math: { id: 'math', family: 'computing', name: 'Math for CS', short: 'Math', color: 'var(--trk-math)', glyph: '∑' },
  lang: { id: 'lang', family: 'computing', name: 'Languages, Compilers & Theory', short: 'Languages', color: 'var(--trk-lang)', glyph: 'λ' },
  os: { id: 'os', family: 'systems', name: 'OS & Concurrency', short: 'OS', color: 'var(--trk-os)', glyph: '⚙' },
  net: { id: 'net', family: 'systems', name: 'Networking', short: 'Network', color: 'var(--trk-net)', glyph: '⇄' },
  data: { id: 'data', family: 'systems', name: 'Databases & Storage', short: 'Data', color: 'var(--trk-data)', glyph: '◫' },
  arch: { id: 'arch', family: 'systems', name: 'Systems & Architecture', short: 'Systems', color: 'var(--trk-arch)', glyph: '▦' },
  ops: { id: 'ops', family: 'delivery', name: 'DevOps & Cloud', short: 'DevOps', color: 'var(--trk-ops)', glyph: '☁' },
  sec: { id: 'sec', family: 'delivery', name: 'Security', short: 'Security', color: 'var(--trk-sec)', glyph: '⚿' },
  craft: { id: 'craft', family: 'delivery', name: 'Software Craft & Practice', short: 'Craft', color: 'var(--trk-craft)', glyph: '✎' },
  web: { id: 'web', family: 'product', name: 'Web, Graphics & UX', short: 'Web & UX', color: 'var(--trk-web)', glyph: '◧' },
  ml: { id: 'ml', family: 'product', name: 'ML & AI Systems', short: 'ML & AI', color: 'var(--trk-ml)', glyph: '∿' },
  lead: { id: 'lead', family: 'product', name: 'Technical Leadership', short: 'Leadership', color: 'var(--trk-lead)', glyph: '⚑' },
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

  // Tier 1 second pass (docs/rollout-plan.md §1.3): planned until each lesson is built.
  { id: 'two-pointers', tier: 1, track: 'dsa', title: 'Two Pointers', tagline: 'Squeeze the array from both ends' },
  { id: 'sliding-window', tier: 1, track: 'dsa', title: 'Sliding Window', tagline: 'Grow, shrink, never restart' },
  { id: 'prefix-sums', tier: 1, track: 'dsa', title: 'Prefix Sums & Difference Arrays', tagline: 'Precompute once, answer ranges in O(1)' },
  { id: 'tree-traversals', tier: 1, track: 'dsa', title: 'Tree Traversals (Pre/In/Post/Level-Order)', tagline: 'Four ways to walk the same tree' },
  { id: 'graph-representations', tier: 1, track: 'dsa', title: 'Graph Fundamentals & Representations', tagline: 'Same graph, two memory layouts' },

  { id: 'binary-hex', tier: 1, track: 'hw', title: 'Binary, Hex & Number Bases', tagline: 'Everything is bits wearing a costume' },
  { id: 'twos-complement', tier: 1, track: 'hw', title: "Two's Complement & Integer Overflow", tagline: 'Why 127 + 1 = -128' },
  { id: 'floating-point', tier: 1, track: 'hw', title: 'Floating Point (IEEE 754)', tagline: "0.1 + 0.2 != 0.3, and here's exactly why" },
  { id: 'char-encoding', tier: 1, track: 'hw', title: 'Character Encoding: ASCII, Unicode & UTF-8', tagline: 'Why your emoji became Ã©' },
  { id: 'base64-encodings', tier: 1, track: 'hw', title: 'Base64, URL & Percent Encoding', tagline: 'Binary data dressed as text' },
  { id: 'logic-gates', tier: 1, track: 'hw', title: 'Boolean Algebra & Logic Gates', tagline: 'How transistors learn to think' },
  { id: 'fetch-decode-execute', tier: 1, track: 'hw', title: 'How a CPU Runs an Instruction', tagline: 'Fetch, decode, execute, repeat' },
  { id: 'memory-hierarchy', tier: 1, track: 'hw', title: 'The Memory Hierarchy & Latency Numbers', tagline: 'Registers are seconds, disk is years' },

  { id: 'propositional-logic', tier: 1, track: 'math', title: 'Propositional Logic & Truth Tables', tagline: "If p then q, and why 'if' lies to you" },
  { id: 'sets-functions', tier: 1, track: 'math', title: 'Sets, Relations & Functions', tagline: 'The vocabulary under every type and table' },
  { id: 'logs-exponentials', tier: 1, track: 'math', title: 'Logarithms, Exponentials & Orders of Magnitude', tagline: 'Thinking in powers of two' },

  { id: 'value-vs-reference', tier: 1, track: 'lang', title: 'Value vs Reference Semantics', tagline: 'Copy or alias?' },
  { id: 'closures-scope', tier: 1, track: 'lang', title: 'Scope, Closures & Environments', tagline: 'Functions that remember' },
  { id: 'oop-fundamentals', tier: 1, track: 'lang', title: 'Objects, Inheritance & Polymorphism', tagline: 'One call, many behaviours' },
  { id: 'functional-programming', tier: 1, track: 'lang', title: 'Pure Functions, Immutability & Higher-Order Functions', tagline: 'Data in, data out, no surprises' },
  { id: 'error-handling-models', tier: 1, track: 'lang', title: 'Error Handling: Exceptions vs Result Types', tagline: 'How failure travels' },
  { id: 'regex-basics', tier: 1, track: 'lang', title: 'Regular Expressions for Everyday Use', tagline: 'Find, match and extract without a loop' },

  { id: 'command-line', tier: 1, track: 'os', title: 'The Shell, Pipes & File Permissions', tagline: 'Small tools, glued with pipes' },
  { id: 'stack-vs-heap', tier: 1, track: 'os', title: 'Stack vs Heap Memory', tagline: 'Where your variables actually live' },

  { id: 'osi-tcpip-layers', tier: 1, track: 'net', title: 'The OSI & TCP/IP Layer Model', tagline: 'Envelopes inside envelopes' },

  { id: 'er-data-modeling', tier: 1, track: 'data', title: 'Entity-Relationship Data Modeling', tagline: 'Drawing the domain before the tables' },
  { id: 'data-formats', tier: 1, track: 'data', title: 'Data Formats: JSON, CSV, YAML & Friends', tagline: 'Same data, different ways to lie to you' },

  { id: 'ci-pipelines', tier: 1, track: 'ops', title: 'Continuous Integration Pipelines', tagline: 'Every push gets built, tested and judged' },
  { id: 'branching-workflows', tier: 1, track: 'ops', title: 'Branching Strategies: Trunk-Based vs GitFlow', tagline: 'Branch lifetime decides merge pain' },

  { id: 'injection-attacks', tier: 1, track: 'sec', title: 'Injection Attacks (SQL & Command Injection)', tagline: 'When data becomes code' },
  { id: 'security-principles', tier: 1, track: 'sec', title: 'Security Principles: CIA, Defense in Depth & Least Privilege', tagline: 'How to think like a defender' },
  { id: 'secrets-management', tier: 1, track: 'sec', title: 'Config & Secrets: Keeping Keys Out of Git', tagline: 'The key you committed is already public' },
  { id: 'cors-same-origin', tier: 1, track: 'sec', title: 'Same-Origin Policy & CORS', tagline: 'The browser is the one saying no' },

  { id: 'debugging-method', tier: 1, track: 'craft', title: 'Systematic Debugging', tagline: 'Hypothesize, bisect, verify, never guess twice' },
  { id: 'debugger-tools', tier: 1, track: 'craft', title: 'Using a Debugger: Breakpoints, Stepping & Watches', tagline: 'Stop guessing with console.log' },
  { id: 'test-pyramid', tier: 1, track: 'craft', title: 'Unit, Integration & E2E: The Test Pyramid', tagline: 'Many fast tests at the base, few slow ones on top' },
  { id: 'static-analysis-linters', tier: 1, track: 'craft', title: 'Linters, Formatters & Static Analysis', tagline: 'Catching bugs before running' },
  { id: 'code-review', tier: 1, track: 'craft', title: 'Effective Code Review', tagline: 'Review the change, not the person' },
  { id: 'dependency-management', tier: 1, track: 'craft', title: 'Semantic Versioning, Lockfiles & Dependency Hell', tagline: 'Works on my machine, broken in CI' },
  { id: 'time-and-timezones', tier: 1, track: 'craft', title: 'Time Zones, UTC & Date Bugs', tagline: 'Falsehoods programmers believe about time' },
  { id: 'reading-codebases', tier: 1, track: 'craft', title: 'Navigating an Unfamiliar Codebase', tagline: 'Finding your way in a million lines' },
  { id: 'requirements-user-stories', tier: 1, track: 'craft', title: 'Requirements, User Stories & Acceptance Criteria', tagline: "Knowing what 'done' means" },
  { id: 'agile-kanban', tier: 1, track: 'craft', title: 'Agile, Scrum & Kanban: How Work Flows', tagline: 'Stop starting, start finishing' },

  { id: 'dom-events', tier: 1, track: 'web', title: 'The DOM & Event Propagation', tagline: 'Capture down, bubble up' },
  { id: 'css-layout', tier: 1, track: 'web', title: 'The Box Model, Flexbox & Grid', tagline: 'Everything is a box. Where it goes is the hard part' },
  { id: 'responsive-design', tier: 1, track: 'web', title: 'Responsive Design & Media Queries', tagline: 'One layout, every screen' },
  { id: 'accessibility', tier: 1, track: 'web', title: 'Accessibility & the Accessibility Tree', tagline: "If a screen reader can't use it, it's broken" },
  { id: 'browser-storage', tier: 1, track: 'web', title: 'Cookies, localStorage & IndexedDB', tagline: 'Where the browser keeps things' },

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
