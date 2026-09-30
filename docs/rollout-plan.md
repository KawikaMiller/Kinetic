# Kinetic second pass: rollout plan

Owner decisions this plan is built on (final): an exhaustive platform, from a 4-year CS degree up to principal-level job knowledge; build tier by tier, with a tier starting only when the previous one is finished and verified; adopt all 7 new tracks (`hw`, `lang`, `math`, `craft`, `web`, `ml`, `lead`).

Input: `docs/curriculum-backlog.md` (406 proposals). Its tiers and ids are treated as proposals and corrected below.

**Headline numbers**

| | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Total |
|---|---:|---:|---:|---:|---:|
| Backlog proposed | 43 | 166 | 155 | 42 | 406 |
| **Validated new lessons** | **48** | **158** | **154** | **41** | **401** |
| Existing lessons | 14 | 16 | 12 | 9 | 51 |
| Tier total when done | 62 | 174 | 166 | 50 | 452 |
| Build batches (~5 each) | 10 | ~32 | ~31 | ~8 | ~81 |

Eight backlog topics are gone: 4 dropped as already covered by an existing lesson, and 4 merged into another topic. Three topics that weren't in the backlog were added to Tier 1 by coordinator decision: `regex-basics`, `data-formats` and `debugger-tools`.

---

## 0. How to use this doc

- **Section 1** is the Tier 1 build spec. Hand a builder their batch's topic entries plus **AC-0** (the common acceptance criteria).
- **Section 2** is shared-code work. It must land before any Tier 1 batch starts.
- **Section 3** is Tiers 2-4, detailed enough to start Tier 2 kickoff the day Tier 1 closes.
- **Section 4** is the tracker and the tier definition of done. The coordinator is the only one who edits the tracker. Batches report status back; they don't write to this file.
- **Hard gate:** nothing in Section 2 starts until the in-flight `src/` refactor (scene kit, `sim.ts`, `useSimulation.ts`) has landed and is committed.

---

## 1. Tier 1 · Foundations

The bar for Tier 1 is: **what an intern or junior is expected to know or run into in their first weeks on the job, plus first-year degree material that everything later builds on.** It's not "everything a junior might eventually touch".

### 1.1 Validation of the 43 backlog Tier 1 topics

| id | Verdict | Reason |
|---|---|---|
| `binary-hex` | keep | Hex dumps, colours, permissions and addresses all show up on day one. |
| `twos-complement` | keep | Overflow and signedness bugs start with the first integer type. |
| `floating-point` | keep | `0.1 + 0.2` and money-in-floats are rites of passage for juniors. |
| `char-encoding` | keep | Mojibake and `length` bugs hit anyone who handles text. |
| `logic-gates` | keep | First-year material and the ramp to the Tier 2 hardware chain. Its focus is kept distinct from `propositional-logic` (see its spec). |
| `fetch-decode-execute` | keep | The machine model underneath every language. |
| `memory-hierarchy` | keep | "Latency numbers every programmer should know" is day-one vocabulary. |
| `endianness` | **→ Tier 2** | Only matters once you write binary protocols or file formats, which is mid-level work. It sits next to `bit-manipulation`. |
| `base64-encodings` | keep | JWTs, data URIs and URL escaping come up daily, and "encoding isn't encryption" is a day-one lesson. |
| `command-line` | keep | Every engineer lives in a terminal from the first day. |
| `stack-vs-heap` | keep | Partial overlap with `recursion` (call-stack frames) and `processes-threads` (per-thread stacks), but the heap, lifetimes and dangling pointers are new material. |
| `value-vs-reference` | keep | Aliasing bugs are among the most common junior mistakes. |
| `closures-scope` | keep | Callbacks, hooks and the loop-variable bug. |
| `oop-fundamentals` | keep | The vocabulary of most production codebases. |
| `propositional-logic` | keep | Refocused on implication, contrapositive and condition rewriting in code, so it doesn't repeat `logic-gates`. |
| `sets-functions` | keep | Partial overlap with `sql-basics` joins. The spec keeps the join link to a label and teaches functions and relations. |
| `logs-exponentials` | keep | Partial overlap with `big-o`. The spec covers powers of two, halvings and orders of magnitude, not a second growth-curve race. |
| `graph-representations` | keep | Separate from `graph-search`: this one is about representation, not traversal. |
| `tree-traversals` | keep | Partial overlap with the in-order strip in `trees-bst`. It adds all four orders plus the stack and queue mechanics. |
| `two-pointers` | keep | A top new-grad interview pattern. |
| `sliding-window` | keep | A top new-grad interview pattern. |
| `prefix-sums` | keep | Comes up constantly in interviews and analytics code. |
| `osi-tcpip-layers` | keep | Separate from `web-request`: that lesson is a sequence over time, this one is encapsulation. |
| `dhcp` | **→ Tier 2** | Belongs with `ethernet-arp` and `subnetting-cidr` in the Tier 2 "how a machine joins a network" story. A nice-to-have at Tier 1. |
| `er-data-modeling` | keep | Designing tables from entities is first-course database material that juniors are asked to do. |
| `injection-attacks` | keep | The most important default a junior can learn: parameterise queries. |
| `security-principles` | keep | The defender's mental model that comes before any specific attack. |
| `ci-pipelines` | keep | Juniors read red pipelines from their first PR. |
| `merge-vs-rebase` | **drop, covered** | `git-internals` already has Merge (fast-forward and merge commit), Rebase with new hashes and faded originals, and the reflog, in both its tryThis and its quiz. |
| `branching-workflows` | keep | Separate from `git-internals`: team strategy over time, not mechanics. |
| `cloud-compute-primitives` | **→ Tier 2, merged into `serverless-cold-starts`** | The VM-versus-container half is already in `containers`. The part that's new is serverless and the spectrum of what you manage, which is a mid-level deployment decision. |
| `debugging-method` | keep (**absorbs `git-bisect`**) | Bisecting components and bisecting history are the same skill, so they're one lesson. |
| `test-pyramid` | keep | Juniors need to know which kind of test to write. |
| `agile-kanban` | keep | Every junior joins a team that runs Scrum or Kanban, and WIP limits explain real pain. |
| `time-and-timezones` | keep | DST and naive timestamps cause a steady stream of production bugs. |
| `static-analysis-linters` | keep, scoped | The backlog visual needs ASTs and data-flow analysis, which is Tier 2 material. The Tier 1 version is about which tool catches which kind of bug. |
| `reading-codebases` | keep | The first skill a new hire needs. |
| `requirements-user-stories` | keep | Knowing what "done" means comes before anything else. |
| `dom-events` | keep | Capture, bubble and delegation are day-one frontend. |
| `css-layout` | keep | The base frontend skill. |
| `accessibility` | keep | A legal and quality baseline. |
| `browser-storage` | keep | Cookies versus localStorage is a day-one decision. |
| `responsive-design` | keep | Separate from `css-layout`: that lesson is layout mechanics, this one is breakpoints, viewport units and `srcset`. |

Result: 39 kept, 2 moved out, 1 merged out, 1 dropped.

### 1.2 Moved into Tier 1 from Tier 2

| id | From | Reason |
|---|---|---|
| `error-handling-models` | T2 `lang` | Juniors write try/catch in week one, and a swallowed error is the bug they ship most. |
| `functional-programming` | T2 `lang` | map, filter and reduce are day-one code in every modern codebase, and the lesson builds on `closures-scope`. |
| `code-review` | T2 `craft` | Juniors are reviewed on their first PR and start reviewing soon after. |
| `secrets-management` | T2 `sec` | Committing an API key is the classic junior security incident. Scoped to env vars, `.gitignore` and rotating a leaked key. Vaults and automated rotation stay in the Tier 2 follow-ups. |
| `cors-same-origin` | T2 `sec` | "Blocked by CORS policy" is the most-asked junior web question. |
| `dependency-management` | T2 `craft` | Juniors hit `npm install` and lockfile conflicts in week one. Scoped to semver ranges, lockfiles and transitive dependencies. |

Nothing else in Tiers 2-4 met the day-one bar. I looked at and rejected: `dns-resolution` (the chain is already in `web-request`, and records and TTLs are mid-level), `rest-api-design`, `test-doubles`, `async-await-coroutines` (it depends on the Tier 2 `event-loop`), `bit-manipulation`, `modular-arithmetic`, `probability-basics` and `technical-writing`.

### 1.2b Added to Tier 1 (coordinator decision)

| id | Track | Reason |
|---|---|---|
| `regex-basics` | `lang` | Juniors write and read regexes for search, validation and log parsing from week one. Tier 3 `regex-engines` only covers the internals. |
| `data-formats` | `data` | JSON, CSV and YAML are the first data any junior parses, and their pitfalls (big ids, quoting, the Norway problem) cause real bugs. |
| `debugger-tools` | `craft` | Using a real debugger (breakpoints, stepping, watches, the call stack) is the practical half of `debugging-method`. |

### 1.3 Tier 1 final list: 48 topics

| Track | n | Topics |
|---|---:|---|
| `hw` | 8 | binary-hex, twos-complement, floating-point, char-encoding, base64-encodings, logic-gates, fetch-decode-execute, memory-hierarchy |
| `os` | 2 | command-line, stack-vs-heap |
| `lang` | 6 | value-vs-reference, closures-scope, oop-fundamentals, functional-programming, error-handling-models, regex-basics |
| `math` | 3 | propositional-logic, sets-functions, logs-exponentials |
| `dsa` | 5 | two-pointers, sliding-window, prefix-sums, tree-traversals, graph-representations |
| `net` | 1 | osi-tcpip-layers |
| `data` | 2 | er-data-modeling, data-formats |
| `sec` | 4 | injection-attacks, security-principles, secrets-management, cors-same-origin |
| `ops` | 2 | ci-pipelines, branching-workflows |
| `craft` | 10 | debugging-method, debugger-tools, test-pyramid, agile-kanban, time-and-timezones, static-analysis-linters, reading-codebases, requirements-user-stories, code-review, dependency-management |
| `web` | 5 | dom-events, css-layout, responsive-design, accessibility, browser-storage |
| `ml`, `lead` | 0 | No Foundations material. Their first lessons arrive in Tier 2. |

### 1.4 AC-0: acceptance criteria that apply to every lesson

A lesson is done when all of these hold. Each topic entry below adds its own criteria on top.

1. **Structure.** `src/lessons/<id>/index.tsx` default-exports a `LessonModule`. Files follow the convention: `Stage.tsx` for React only, `frames.tsx` for frame builders with JSX captions, `model.ts` or `sim.ts` for pure logic, `draw.ts` for canvas. The Stage is built from `<StageFrame>`. No JSX in `.ts` files.
2. **Summary.** Every `LessonSummary` field is filled. `useCases` has 3-4 entries. `why` is aimed at an intern or junior. **`watch` names every colour and shape the visual actually renders, and nothing it doesn't.** The reviewer checks it against a screenshot, line by line.
3. **Learning content.**
   - `tryThis` has 3-5 prompts. Each names a control or preset that really exists.
   - `keyIdeas` has 3-4 one-liners.
   - `quiz` has 3-5 questions, each with a `why`. At least one question targets the topic's **main misconception** (given per topic below).
4. **Colour semantics.** Only tokens are used: `--hi` for current or active, `--ok` for correct or done, `--bad` for error or broken, `--info` for data and requests, `--violet` for pointers, references and secondary items, `--dim` for inactive. There are no local hex tables. Canvas code uses `TOKENS` and `alpha()`. Every CSS class carries the lesson prefix.
5. **Honesty.** Anything scripted, simulated or simplified says so **on screen**, in the stage or a caption, not only in the summary. Each topic lists what has to be disclosed.
6. **Captions.** No stale captions. A frame only inherits the previous `say` while that caption is still true.
7. **Reuse.** The lesson uses the kit pieces listed for it. If one doesn't fit, the lesson keeps a local version and the batch report files a Phase 2 request (what, why, proposed signature). **Batches never edit shared code.**
8. **Correctness.** The topic's correctness checks exist as unit tests next to the pure logic (`<id>/model.test.ts`, see P3) and pass.
9. **Verification**, per CLAUDE.md, run in the batch's worktree:
   - `npm run build`
   - `npm run lint`
   - `npm run smoke -- --label=<batch> <ids>`
   - `npm run captions -- <ids>`, with every flagged run either fixed or justified in the report
   - `npm run check-tokens -- --strict`, with zero findings in the lesson's folder
   - `npm test`
   - Screenshots eyeballed at desktop width and at ≤900px, with no horizontal overflow.
10. **Committed** on the batch branch with a report that lists: ids, Phase 2 requests, known deviations, and screenshot paths.

### 1.5 Tier 1 topic specs

Kit names refer to `docs/shared-api.md`. Names marked **(P)** are built in Section 2 before building starts.

---

#### Batch T1-B1 · Bits & bytes (`hw`)

**`binary-hex` · Binary, Hex & Number Bases**
Track `hw` · *"Everything is bits wearing a costume"*
**Spec.** A 16-bit register drawn as toggle switches with place values (1, 2, 4 … 32768) above each bit. Nibble brackets group every 4 bits, and each bracket shows its hex digit. Live readouts show decimal, hex (`0x`), octal and binary. "Count up" animates carries rippling left. There's an 8/16-bit width toggle. Preset chips link bases to where you meet them: `#FF8800` colour (three bytes), `chmod 755` (octal groups of 3 bits), `0x7FFF` and `1 KiB = 1024`. A type-in field accepts any base and lights the matching bits.
**Kit.** `BitStrip` (P), `Segmented`, `TextField`, `AnimatedValue`, `Box`/`SectionTitle`, `.chip`.
**AC.**
- Watch: bits are `--hi` when 1 and `--dim` when 0; the carry ripple is `--info`; nibble brackets are `--violet`.
- Misconception: "hex is a different kind of number". It's the same value written in a different base.
- Correctness: conversions round-trip for all values 0…65535 (a test compares against `Number.toString(base)` and `parseInt`); octal presets match `chmod` semantics.

**`twos-complement` · Two's Complement & Integer Overflow**
Track `hw` · *"Why 127 + 1 = -128"*
**Spec.**
- An 8-bit odometer wheel of 256 positions. The same bits are labelled on the outer ring as unsigned (0…255) and on the inner ring as signed (−128…127).
- +1 and −1 buttons turn the wheel. Crossing 127→−128 flashes the signed overflow, and crossing 255→0 flashes the unsigned wraparound.
- "Negate" steps through invert-the-bits then add-one, using the bit strip.
- An "add two numbers" mode shows the carry out of the top bit and flags when the result is wrong for signed or unsigned.
- A real-world strip covers Gangnam Style breaking YouTube's 32-bit view counter, and the year-2038 problem, shown as a 32-bit width toggle that only updates the readouts.
**Kit.** `BitStrip` (P), `Segmented`, `Button`, `AnimatedValue`, SVG with `useArrowMarker`.
**AC.**
- Watch: the current position is `--hi`; the signed ring is `--info`; the unsigned ring is `--violet`; the overflow flash is `--bad`.
- Misconception: "overflow throws an error". In most languages it silently wraps; JavaScript numbers are floats, so the lesson says which languages wrap.
- Correctness: `wrap8(x) = ((x << 24) >> 24)`; negating −128 gives −128, and there's a test for it; the add-mode overflow flag equals (the signs of the inputs match and the sign of the result differs).
- Honesty: the 32-bit mode only changes the readouts, and the screen says so.

**`floating-point` · Floating Point (IEEE 754)**
Track `hw` · *"0.1 + 0.2 != 0.3, and here's exactly why"*
**Spec.**
- A float32 laid out as sign (1 bit), exponent (8 bits) and mantissa (23 bits), each editable by clicking bits. The value formula `(−1)^s × 1.m × 2^(e−127)` updates live.
- Below, a number line on a log scale shows the representable neighbours of the current value, and the gaps visibly widen as the magnitude grows.
- Typing `0.1` snaps it to its nearest representable neighbour and shows the stored value to 20 digits.
- A float64 panel shows `0.1 + 0.2 = 0.30000000000000004` and the fixes: an epsilon comparison, and integers in cents.
- Special values have chips: ±0, ±Infinity, NaN (`NaN !== NaN`) and subnormals.
**Kit.** `BitStrip` (P) with group tones, `core/scale.ts` (P) for the log axis, `TextField`, `Toggle`, `.data-table`.
**AC.**
- Watch: sign bits are `--bad`, exponent bits `--info`, mantissa bits `--violet`, the current value `--hi` and its neighbours `--dim`.
- Misconception: "floats are imprecise at random". They're exact binary fractions, and decimal fractions like 0.1 can't be represented exactly.
- Correctness: bits come from `DataView.setFloat32/getUint32` (no hand-rolled encoding); the neighbour values are `nextafter` computed through the bit pattern ±1; every special value is covered by a test.
- Honesty: the editable fields are float32 while JavaScript uses float64, and the screen says so.

**`char-encoding` · Character Encoding: ASCII, Unicode & UTF-8**
Track `hw` · *"Why your emoji became Ã©"*
**Spec.**
- Type any string. Each grapheme expands into its code points (`U+00E9`), then into UTF-8 bytes, with the prefix bits (`110xxxxx 10xxxxxx`) highlighted and the payload bits coloured back to the code point.
- A counts row compares graphemes (from `Intl.Segmenter`), code points, UTF-16 code units (JavaScript's `.length`) and UTF-8 bytes.
- Preset chips: `café`, the combining form `café` (NFC vs NFD, which looks identical but has a different length), `👍🏽`, `🇯🇵` and `日本`.
- "Decode as Windows-1252" produces live mojibake. "Decode as UTF-8" fixes it.
**Kit.** `BitStrip` (P) in byte mode, `crypto.ts` `enc`, `TextField`, `Segmented`, `.data-table`, `.chip`.
**AC.**
- Watch: prefix bits are `--dim`, payload bits `--info`, the selected character `--hi`, and mojibake glyphs `--bad`.
- Misconception: "`.length` is the number of characters".
- Correctness: bytes come from `TextEncoder`; mojibake comes from `TextDecoder('windows-1252')`; tests pin `'é'` = C3 A9 → "Ã©", the lengths of `👍🏽` (1 grapheme, 2 code points, 4 UTF-16 units, 8 UTF-8 bytes), and NFC vs NFD lengths.

**`base64-encodings` · Base64, URL & Percent Encoding**
Track `hw` · *"Binary data dressed as text"*
**Spec.**
- Type text. It becomes UTF-8 bytes (a row of 8-bit groups), then regroups into 6-bit groups, then maps onto the 64-character alphabet table, where the used cells light.
- Inputs that aren't a multiple of 3 bytes show the zero padding bits and the `=` padding.
- A toggle switches between standard and base64url (`+/` → `-_`, no padding), linked to a real JWT header.
- A second lane does percent-encoding: reserved characters become `%XX` from their UTF-8 bytes, with space shown as `%20` versus `+` in form encoding.
- A banner button, "Is this encrypted?", decodes the string instantly to make the point that anyone can reverse it.
**Kit.** `BitStrip` (P), `crypto.ts` (`b64url`, `enc`), `TextField`, `Toggle`, `Segmented`, `.cell`.
**AC.**
- Watch: 8-bit groups are `--info`, 6-bit groups `--violet`, the active alphabet cell `--hi`, and padding `--dim`.
- Misconception: "base64 is encryption or obfuscation".
- Correctness: the output equals `btoa(String.fromCharCode(...utf8Bytes))`, and the base64url variant equals `crypto.ts b64url`; tests cover lengths 0, 1, 2 and 3 mod 3; percent-encoding equals `encodeURIComponent`, and form mode equals `URLSearchParams`.

---

#### Batch T1-B2 · Logic & the machine (`hw`, `math`)

**`logic-gates` · Boolean Algebra & Logic Gates**
Track `hw` · *"How transistors learn to think"*
**Spec.**
- A fixed-slot circuit board: 2-3 inputs feed up to 4 gate slots, and each slot's gate type (AND, OR, NOT, NAND, NOR, XOR) is picked from a menu. There's deliberately no free-form drag and drop, to keep the scope sane.
- Toggling an input animates signal flow along the wires; high wires glow.
- A truth table beside the circuit fills in from all input combinations and highlights the current row.
- Presets: a half adder (XOR plus AND, previewing Tier 2 `adders-alu`), "build NOT/AND/OR from NAND only" (NAND is universal), and a De Morgan rewrite where `NOT(A AND B)` morphs into `(NOT A) OR (NOT B)` and the truth tables stay identical.
**Kit.** `TruthTable` (P), SVG with `.scene-edge` wires, `Segmented`, `Toggle`, `TravelDot` for signal flow.
**AC.**
- Watch: high signals are `--hi`, low signals `--dim`, the current truth-table row `--info`, and a mismatched row after a rewrite `--bad`.
- Misconception: "De Morgan means just negate each part". The operator flips too.
- Correctness: the evaluator in `model.ts` is tested against every truth table; the NAND-only constructions are tested equal to the original gates; the half adder's outputs are tested as sum and carry.

**`propositional-logic` · Propositional Logic & Truth Tables**
Track `math` · *"If p then q, and why 'if' lies to you"*
**Spec.**
- A formula builder that takes chips for `p`, `q`, `r`, ¬, ∧, ∨, →, ↔ and brackets. It generates the formula's truth table live, and has a second formula slot.
- An equivalence checker overlays the two tables and marks mismatched rows.
- Presets:
  - Implication versus its converse and contrapositive: the contrapositive is equivalent and the converse isn't.
  - Vacuous truth: when the premise is false, the implication is true.
  - A refactoring check: is `if (!(a && b))` the same as `if (!a || !b)`?
  - Short-circuit order: `user && user.name` never evaluates the right side when the left is false.
- A code pane shows the formula as a JavaScript condition. The focus here is reasoning about conditions in code; circuits belong to `logic-gates`.
**Kit.** `TruthTable` (P), `CodePanel`, `Segmented`, `.chip`, `Tray`.
**AC.**
- Watch: T is `--ok`, F is `--dim`, mismatched rows are `--bad`, and the row being evaluated is `--hi`.
- Misconception: "p → q means q → p".
- Correctness: a formula parser and evaluator are tested on all presets; the equivalence check tests every row; the short-circuit demo shows the right side as not evaluated, which is verified by an evaluation-trace test.

**`sets-functions` · Sets, Relations & Functions**
Track `math` · *"The vocabulary under every type and table"*
**Spec.** Two panes.
- **Sets:** two or three draggable, editable sets of chips in a Venn diagram. Pick union, intersection, difference or symmetric difference to shade the region and list the members. A small label names the SQL equivalent (INNER JOIN keys, `UNION`, `EXCEPT`) and links to `sql-basics`, without re-teaching joins.
- **Functions:** a domain and codomain drawn as columns of dots. The learner draws arrows by clicking, and a badge classifies the mapping live: not a function, function, injective, surjective, bijective.
  - Presets: user→id (a bijection); hash of a string into 8 buckets (not injective: pigeonhole, which is why collisions are inevitable); person→birthday.
  - A "cardinality" readout shows |A| and |B| and states when an injection is impossible.
**Kit.** SVG with `useArrowMarker`, `Segmented`, `.chip`, `hash32` from `core/hash` for the bucket preset.
**AC.**
- Watch: the selected region is `--hi`, set A is `--info`, set B is `--violet`, and a violating arrow (two arrows from one input, or a collision) is `--bad`.
- Misconception: "a function can't map two inputs to the same output". It can; that's being non-injective.
- Correctness: the set operations and the classifier are unit-tested, including the empty set and a function that isn't total.

**`logs-exponentials` · Logarithms, Exponentials & Orders of Magnitude**
Track `math` · *"Thinking in powers of two"*
**Spec.** Three linked tools.
1. **Doubling:** a slider for the number of doublings (0-40). A stack of squares shows 2^k, with a readout, a comparison to real quantities (1K, 1M, 1B, the IPv4 address space) and the 2^10 ≈ 10^3 rule.
2. **Halvings:** enter N and animate halving to 1. The count of halvings is log₂N, linked to `binary-search` and tree height.
3. **Bits needed:** N distinct values need ⌈log₂N⌉ bits (for example, 50 states need 6 bits).

A linear-versus-log axis toggle on one chart shows why a log scale turns exponentials into straight lines. There's no complexity-class race; that's `big-o`'s job.
**Kit.** `core/scale.ts` (P), `Segmented`, `TextField`, `AnimatedValue`, `Bar`.
**AC.**
- Watch: the current power is `--hi`, the real-world reference ticks are `--info`, and the halving steps are `--violet`.
- Misconception: "log n grows a little slower than n". In fact log₂ of a billion is about 30.
- Correctness: `⌈log₂N⌉` is tested at the powers-of-two boundaries (1, 2, 3, 4, 1023, 1024, 1025); the reference quantities are exact (2^32 = 4,294,967,296).

**`fetch-decode-execute` · How a CPU Runs an Instruction**
Track `hw` · *"Fetch, decode, execute, repeat"*
**Spec.**
- A toy CPU with a PC, IR, two registers (R0, R1), a FLAGS zero bit, an ALU and 16 memory cells holding both the program and the data.
- A step player runs the three phases of each instruction, highlighting the active data path:
  - Fetch: PC → address bus → memory → IR.
  - Decode: an opcode field lights up.
  - Execute: registers and the ALU, then memory write-back.
- The instruction set is `LOAD`, `STORE`, `ADD`, `SUB`, `JZ`, `JMP` and `HALT`.
- Presets: add two numbers; count down from 3 in a loop (shows jumps rewriting the PC); and self-modifying code as a curiosity (instructions are just data).
- Memory cells are editable, and changing one replays the program.
**Kit.** `usePlayer`/`Transport` via `StageFrame`, `createRecorder`, `CodePanel` (assembly listing, `nowStyle="bar"`), SVG with `SceneNode`, `useArrowMarker`, `AnimatedValue`.
**AC.**
- Watch: the active data path is `--hi`, the current instruction `--info`, a value just written `--ok`, and idle units `--dim`.
- Misconception: "the CPU understands my language". It only runs machine instructions.
- Correctness: the interpreter in `model.ts` is tested on every preset (the final register and memory state, and the step count); HALT stops.
- Honesty: the screen says "Toy instruction set, invented for this lesson; real CPUs have hundreds of instructions and pipeline them (Tier 2)."

---

#### Batch T1-B3 · Memory & the runtime model (`hw`, `os`, `lang`)

This batch pilots the **memory kit (P)**. Build `value-vs-reference` first and report any friction with the API before the other three lessons use it.

**`memory-hierarchy` · The Memory Hierarchy & Latency Numbers**
Track `hw` · *"Registers are seconds, disk is years"*
**Spec.**
- A vertical latency ladder on a log scale: register, L1, L2, L3, RAM, NVMe SSD, HDD seek, same-datacentre round trip, cross-continent round trip.
- A "human time" toggle rescales everything so that 1 ns = 1 s. L1 becomes about a second, RAM about 1.5 minutes, an SSD read about a day, and a cross-continent round trip about 5 years.
- A packet travels each rung at a proportional speed. On the log axis a race can be shown; in human time the slow rungs visibly take forever.
- A capacity column shows the inverse trend: small and fast versus big and slow.
- A "why caches exist" demo sets a hit-rate slider (e.g. 95%) and shows the effective access time falling.
**Kit.** `core/scale.ts` (P), `TravelDot`, `Toggle`, `Bar`, `format.ts` (`duration`, `bytes`), `.data-table`.
**AC.**
- Watch: each rung is coloured with `categorical(i)`; the moving packet is `--hi`; capacity bars are `--violet`.
- Misconception: "RAM is fast". It's about 100× slower than L1.
- Correctness: the values sit in documented ranges (L1 ~1 ns, L2 ~3-5 ns, L3 ~10-40 ns, DRAM ~80-120 ns, NVMe random read ~20-100 µs, HDD seek ~2-10 ms, datacentre round trip ~0.5 ms, cross-continent ~100-150 ms). The effective-time formula `hit·t_fast + (1−hit)·t_slow` is tested.
- Honesty: the screen says "Approximate orders of magnitude; vary by hardware."

**`stack-vs-heap` · Stack vs Heap Memory**
Track `os` · *"Where your variables actually live"*
**Spec.**
- A step player walks through a short program. The stack column pushes and pops frames holding locals and primitives. Heap blocks appear in a scattered heap area, and reference arrows point from stack slots to them.
- **Managed** mode (JavaScript/Java-like): an object stays alive while it's reachable. Leaving a function drops its frame, and an unreachable heap block fades with a "collectable" tag, which previews the Tier 2 `garbage-collection` lesson.
- **Manual** mode (C-like):
  - `malloc`/`free`.
  - Returning a pointer to a local leaves a **dangling** arrow into a dead frame.
  - `free` then use is a use-after-free.
  - A forgotten `free` is a leak counter.
- A "stack overflow" preset recurses until the stack column hits its limit and crashes.
**Kit.** Memory kit (P) (`VarSlot`, `HeapObject`, `RefArrow`), `CodePanel`, `createRecorder`, `Segmented`, `ScenePicker`.
**AC.**
- Watch: the current frame is `--hi`, live heap blocks are `--info`, references are `--violet`, dangling and freed blocks are `--bad`, and collectable blocks are `--dim`.
- Misconception: "objects live on the stack of the function that created them".
- Correctness: each preset's frame and heap trace is tested (a leak count, a dangling flag set exactly when the frame pops).
- Honesty: the screen says "Simplified: real runtimes may keep small values in registers, and escape analysis can put objects on the stack."

**`value-vs-reference` · Value vs Reference Semantics**
Track `lang` · *"Copy or alias?"*
**Spec.**
- JavaScript snippets step line by line. Variables are name tags. Primitives are copied into their own box. Objects and arrays live in heap boxes, and assignment adds another arrow to the same box.
- A mutation line lights every name that "sees" the change.
- Presets:
  - `let b = a` for a number versus for an object.
  - Passing an object to a function that mutates it versus one that reassigns it (pass-by-sharing).
  - A shallow copy with `{...obj}` whose nested array is still shared, versus a deep copy with `structuredClone`.
  - `const` preventing rebinding but not mutation.
  - `===` on two structurally equal objects returns `false`.
- A language note chip says Python and Java behave the same way for objects.
**Kit.** Memory kit (P), `CodePanel`, `createRecorder`, `ScenePicker`, `.chip`.
**AC.**
- Watch: the line being executed is `--hi`, heap objects `--info`, references `--violet`, and names that see a mutation flash `--ok`.
- Misconception: "`const` makes an object immutable" and "a function parameter is a copy".
- Correctness: every preset's final values are asserted in tests against **real JavaScript run in the test itself** (the snippet is executed in Vitest and its outputs compared to the model's claimed outputs).

**`closures-scope` · Scope, Closures & Environments**
Track `lang` · *"Functions that remember"*
**Spec.**
- Nested environment boxes (global → function → block) with parent arrows. Name lookup walks outward, highlighting each box it checks.
- Presets:
  1. A `makeCounter()` factory: the returned function keeps its environment box alive after the outer call returns, and two counters get two separate boxes.
  2. The classic `for (var i…) setTimeout` prints 3, 3, 3 because one shared box exists; switching to `let` creates a box per iteration and prints 0, 1, 2.
  3. Shadowing: an inner `x` hides the outer one.
  4. A stale closure in a React-like handler that captures an old value.
- Environment boxes that are no longer referenced fade out.
**Kit.** Memory kit (P) (`HeapObject` as the environment box, `RefArrow`), `CodePanel`, `createRecorder`, `ScenePicker`.
**AC.**
- Watch: the box being searched is `--hi`, captured environments are `--violet`, the function object is `--info`, and released environments are `--dim`.
- Misconception: "a closure copies the variable's value when it's created". It captures the binding.
- Correctness: the `var` versus `let` outputs, the counter outputs and the shadowing results are asserted against real JavaScript executed in tests.

**`oop-fundamentals` · Objects, Inheritance & Polymorphism**
Track `lang` · *"One call, many behaviours"*
**Spec.**
- A class hierarchy (`Shape` → `Circle`, `Rect` → `Square`) drawn as boxes with their methods.
- Calling `shape.area()` on a chosen instance animates dispatch: the lookup starts at the instance's class and walks up the chain until it finds an implementation. An override lights up; an inherited method shows the walk.
- An encapsulation panel shows a private field blocking outside access, while a method maintains an invariant.
- **Inheritance vs composition** toggle: add `render()` with a side effect to the base class. Under inheritance every subclass changes (the fragile base class problem). Under composition (`Shape` has a `Renderer`) only the objects that opt in change.
- "The Square is-a Rect" preset: `setWidth` breaks the square, which is a gentle introduction to Liskov substitution without naming SOLID.
**Kit.** Memory kit (P) (`RefArrow` for the prototype and class chain), `SceneNode`, `CodePanel`, `Toggle`, `ScenePicker`.
**AC.**
- Watch: the class being searched is `--hi`, the implementation found is `--ok`, affected subclasses are `--bad` when a base change ripples, and composed parts are `--violet`.
- Misconception: "polymorphism means a lot of if/else on type".
- Correctness: dispatch resolution is tested against real JavaScript class behaviour in Vitest; the Square/Rect preset is tested to show the broken invariant.

---

#### Batch T1-B4 · Code flow (`lang`, `craft`)

**`functional-programming` · Pure Functions, Immutability & Higher-Order Functions**
Track `lang` · *"Data in, data out, no surprises"*
**Spec.**
- A conveyor belt carries item cards (e.g. orders) through stations the learner reorders and configures: `map` (transform), `filter` (a gate), and `reduce` (an accumulator bin with a running value).
- A readout shows the equivalent chained code, and a for-loop version sits beside it for comparison.
- **Purity** panel: two functions, one reading a global discount and one taking it as a parameter. Changing the global changes one output with no input change.
- **Mutation** mode: two consumers share one array. Consumer A calls `.sort()`, which works in place, and consumer B's view reorders unexpectedly. `.toSorted()` or `[...xs].sort()` fixes it.
- A filter-before-map swap shows the same result with fewer calls, with a call counter per station.
**Kit.** `Flyer` (items between stations), `CodePanel`, `Segmented`, `Toggle`, `Tray`, `AnimatedValue`.
**AC.**
- Watch: the item being processed is `--hi`, kept items `--ok`, filtered items `--dim`, the accumulator `--violet`, and an unexpected mutation `--bad`.
- Misconception: "`sort` returns a new array".
- Correctness: pipeline outputs match real `Array.prototype` calls in tests; the in-place behaviour of `sort` and `reverse` versus `toSorted` is asserted; the call counts are exact.

**`error-handling-models` · Error Handling: Exceptions vs Result Types**
Track `lang` · *"How failure travels"*
**Spec.**
- A call stack `main → handleRequest → chargeCard → callBank`. Inject a failure at any level.
- **Exceptions** mode: the throw animates unwinding frame by frame. Frames without a `try` are skipped, `finally` blocks run on the way out, and the nearest `catch` handles it.
- Presets:
  - An empty `catch {}` that swallows the error. The request "succeeds" with the wrong result, and a red ghost shows what was lost.
  - Catch-and-rethrow with a `cause`.
  - An unhandled exception that reaches `main` and crashes.
- **Result** mode: each level returns `Ok` or `Err` explicitly, and the learner sees the `if (err) return err` at every level (explicit, but verbose).
- A side panel says when to use which: expected failures such as validation versus bugs, and "fail loudly, handle at the boundary".
**Kit.** `CallStackPanel` (P) (frames, with the unwinding animated by tone), `CodePanel`, `createRecorder`, `Segmented`, `ScenePicker`, `.log-row`.
**AC.**
- Watch: the throwing frame is `--bad`, skipped frames `--dim`, `finally` blocks `--violet`, the handling frame `--ok`, and a swallowed error `--bad` ghost.
- Misconception: "catching everything makes code safer".
- Correctness: the unwind order and `finally` order are asserted against real JavaScript try/catch/finally executed in tests.

**`static-analysis-linters` · Linters, Formatters & Static Analysis**
Track `craft` · *"Catching bugs before running"*
**Spec.**
- One code sample with six planted problems: messy indentation, an unused variable, `==` with coercion, a floating promise, `user.name` where `user` may be null, and a logic off-by-one.
- Four tool layers stack like sieves: **formatter**, **linter**, **type checker**, **tests**. Each layer can be switched on. Each one flags the problems it can catch, and whatever's left falls through to "production".
- A matrix shows problem × tool. The formatter only changes whitespace (a diff view proves the meaning is unchanged). The type checker catches the possible null. Only tests catch the off-by-one.
- A "rule matches a code pattern" peek shows one lint rule matching `==`, with a note that ASTs come in Tier 2.
- Toggling "disable rule inline" shows the trade-off.
**Kit.** `CodePanel` (`stateOf`, `trailing` for flags), `Toggle`, `.data-table`, `Tray` for escaped bugs.
**AC.**
- Watch: a flagged line is `--hi`, a bug caught by the active tool is `--ok`, a bug that escaped to production is `--bad`, and layers that are off are `--dim`.
- Misconception: "if the linter passes, the code is correct".
- Correctness: the catch matrix matches real tool behaviour (Prettier doesn't flag, ESLint `eqeqeq` and `no-unused-vars` do, a TypeScript strict null check catches the null, a floating promise needs `@typescript-eslint/no-floating-promises`), documented in the model with the rule names.

**`debugging-method` · Systematic Debugging** (absorbs `git-bisect`)
Track `craft` · *"Hypothesize, bisect, verify, never guess twice"*
**Spec.** Two scenes.
1. **Pipeline:** eight components (`parse → validate → normalize → price → discount → tax → round → format`). One hidden component corrupts the value. The learner places probes that reveal the value at a point. A counter compares the probes used against the optimal ⌈log₂8⌉ = 3. Random guessing is allowed and scored.
2. **History (git bisect):** a strip of 16 commits, where the first is good and the last is bad. The learner marks the midpoint good or bad, the range halves, and it finds the first bad commit in 4 steps. The equivalent `git bisect` commands scroll alongside.

A scientific-method rail (reproduce → isolate → hypothesize → test → fix → add a regression test) lights up as the learner progresses. A "change two things at once" trap preset shows why that loses information.
**Kit.** `ArrayStrip` (P) for the commit strip, `SceneNode` for the components, `Button`, `AnimatedValue`, `Box`, `.log-row`.
**AC.**
- Watch: the suspect range is `--hi`, probes that were cleared `--ok`, the fault found `--bad`, and ruled-out components `--dim`.
- Misconception: "debugging means reading the code until you spot it".
- Correctness: the optimal probe count is ⌈log₂N⌉, tested for N = 8 and 16 and for non-power-of-two N; the bisect finds the true first bad commit for every fault position (exhaustive test).

---

#### Batch T1-B5 · Algorithm patterns (`dsa`)

This batch pilots **`ArrayStrip` (P)** and **`TreeSvg` (P)**.

**`two-pointers` · Two Pointers**
Track `dsa` · *"Squeeze the array from both ends"*
**Spec.**
- A sorted array with L and R pointer markers. Pair-sum mode enters a target: if the sum is too big, R moves left; if it's too small, L moves right. Each move greys out the whole row or column of pairs it rules out.
- A mini pair matrix beside it greys out in step, which makes the elimination proof visible.
- A counter compares the checks made against the brute-force n(n−1)/2.
- Second preset: an in-place palindrome check. Third preset: remove duplicates from a sorted array, using fast and slow pointers moving in the same direction.
- Editable array and target, and a "no solution" case.
**Kit.** `ArrayStrip` (P) with pointer markers, `usePlayer`/`StageFrame`, `createRecorder`, `TextField`, `ScenePicker`, `AnimatedValue`.
**AC.**
- Watch: L is `--info`, R is `--violet`, the pair being checked `--hi`, the pair found `--ok`, and eliminated pairs `--dim`.
- Misconception: "it works on unsorted arrays". A preset shows it failing.
- Correctness: results match brute force on the presets and on 500 seeded random arrays (`mulberry32`); the step count is at most n−1.

**`sliding-window` · Sliding Window**
Track `dsa` · *"Grow, shrink, never restart"*
**Spec.**
- An elastic window bracket over a character or number strip. It grows right and snaps left when a constraint breaks. A live count map (character → count) shows what's inside, and a "best so far" marker is kept.
- Presets:
  1. Longest substring without repeating characters.
  2. Fixed-k maximum sum: the window slides and one item leaves as one enters.
  3. Shortest subarray with sum ≥ target.
- A counter shows that each index enters and leaves at most once (at most 2n operations), compared with brute force.
**Kit.** `ArrayStrip` (P) with a range bracket, `createRecorder`, `StageFrame`, `ScenePicker`, `TextField`, `.data-table` for the count map.
**AC.**
- Watch: the window is `--hi`, the item entering `--ok`, the item leaving `--bad`, and the best-so-far window `--violet`.
- Misconception: "shrinking the window means restarting from the next index".
- Correctness: every preset's result matches brute force on seeded random inputs; the operation count is at most 2n.

**`prefix-sums` · Prefix Sums & Difference Arrays**
Track `dsa` · *"Precompute once, answer ranges in O(1)"*
**Spec.**
- Array bars with a cumulative (prefix) staircase above them.
- Drag a range [l, r]: its sum appears as `prefix[r+1] − prefix[l]`, drawn as the difference between two staircase heights. The off-by-one is visible because `prefix` has n+1 entries starting at 0.
- A query-cost comparison: after a one-off O(n) build, 1,000 queries cost O(1) each, versus O(n) each.
- **Difference array** mode: "add +5 to [2, 6]" writes +5 at index 2 and −5 at index 7. The prefix sum of the difference array rebuilds the updated array, and several range updates are applied in one pass.
**Kit.** `ArrayStrip` (P), SVG bars, `Segmented`, `Bar`, `AnimatedValue`, `format.ts`.
**AC.**
- Watch: the selected range is `--hi`, the two prefix heights used are `--info` and `--violet`, and the difference markers are `--ok` (+) and `--bad` (−).
- Misconception: "prefix[r] − prefix[l] is the range sum". Off by one.
- Correctness: every range on the preset arrays is tested against brute force; difference-array updates are tested against naïve updates on seeded random inputs.

**`tree-traversals` · Tree Traversals (Pre/In/Post/Level-Order)**
Track `dsa` · *"Four ways to walk the same tree"*
**Spec.**
- A cursor walks a binary tree in the chosen order and emits values onto an output tape.
- The side panel shows the call stack for the three depth-first orders (frames push and pop, linked to `recursion`) or the queue for level order (linked to `stack-queue`).
- An **expression tree** preset `(3 + 4) × 2`: pre-order gives Polish notation, in-order gives infix (brackets needed), and post-order gives RPN, which a mini stack evaluator then computes.
- A BST preset: in-order produces sorted output, linked to `trees-bst`.
- Use-case chips: pre-order copies or serialises a tree, post-order deletes or frees one and computes folder sizes, level order is for a UI tree by depth.
- The tree can be edited by clicking add or remove on leaves.
**Kit.** `TreeSvg` (P), `CallStackPanel` (P) for the depth-first stack, `createRecorder`, `StageFrame`, `Segmented`, `Tray` (output tape), `ScenePicker`.
**AC.**
- Watch: the current node is `--hi`, emitted nodes `--ok`, the stack or queue contents `--violet`, and nodes not yet visited `--dim`.
- Misconception: "in-order always gives sorted output". Only in a BST.
- Correctness: all four orders are tested against reference implementations on the presets and on random trees; the RPN evaluation equals 14.

**`graph-representations` · Graph Fundamentals & Representations**
Track `dsa` · *"Same graph, two memory layouts"*
**Spec.**
- A small graph editor with up to 10 nodes: click to add a node, drag from node to node to add an edge, with a directed/undirected toggle and optional weights.
- An adjacency matrix and an adjacency list fill in live. Counters show memory used (V² cells versus V+E entries) and the cost of "is there an edge u→v?" versus "list the neighbours of u".
- Property badges update live: degree (in and out for directed), connected components (colour-coded), has a cycle, is a DAG, is a tree, is bipartite (two-colouring shown).
- Presets: a social network (sparse), a road grid, a course-prerequisite DAG (previews Tier 2 `topological-sort`), and a complete graph (dense, where the matrix wins).
**Kit.** SVG with `useArrowMarker`, `.data-table` (matrix), `Toggle`, `ScenePicker`, `.chip`, `AnimatedValue`. The graph editor stays local to this lesson (the first use). Extracting it is a Tier 2 prerequisite (see 3.1).
**AC.**
- Watch: the selected node or edge is `--hi`, the matching matrix cell and list entry `--info`, components are `categorical(i)`, and a cycle's edges `--bad`.
- Misconception: "an adjacency matrix is always better because lookup is O(1)".
- Correctness: cycle detection is tested separately for directed (three-colour DFS) and undirected (parent-aware) graphs; component, bipartite, DAG and tree checks are tested on the presets and on seeded random graphs.

---

#### Batch T1-B6 · Web platform (`web`)

This batch pilots **`ResizablePane` (P)**. Most visuals here should use the **real browser** (real DOM, real CSS, real events) inside a contained sandbox, so correctness comes by construction.

**`dom-events` · The DOM & Event Propagation**
Track `web` · *"Capture down, bubble up"*
**Spec.**
- A real nested DOM (`div.card > section > button > span`) with a mirror SVG tree beside it.
- Each element has listener badges that can be switched between capture and bubble.
- Clicking the real span dispatches a real event. Recorded `eventPhase` data drives the animation: travelling down (capture) to the target, then back up (bubble), with each listener lighting as it fires and a numbered log.
- Toggles: `stopPropagation` on any listener cuts the path; `preventDefault` on a link or form shows that it stops the default action, not propagation; `once`.
- A **delegation** preset: one listener on a `ul` handles clicks on 100 dynamically added `li` elements through `event.target.closest`.
**Kit.** SVG tree via `TreeSvg` (P), `Toggle`, `.log-row`, `ScenePicker`, `Box`.
**AC.**
- Watch: the capture path is `--info`, the target `--hi`, the bubble path `--violet`, a listener firing `--ok`, and a path cut by stopPropagation `--bad`.
- Misconception: "stopPropagation stops the default action" (or the reverse).
- Correctness: the animation replays the phases actually recorded from real listeners, not a script; a test in the browser smoke checks the fired order for the default preset.

**`css-layout` · The Box Model, Flexbox & Grid**
Track `web` · *"Everything is a box. Where it goes is the hard part"*
**Spec.** Three tabs over a live sandbox of real elements.
1. **Box model:** sliders for margin, border, padding and width. An overlay draws the margin, border, padding and content rings with measured sizes from `getBoundingClientRect` and computed style. A `box-sizing` toggle shows the total width change. A margin-collapse preset puts two stacked paragraphs together and shows 20 + 30 = 30.
2. **Flexbox:** direction, justify, align, wrap, gap, and per-item grow and shrink. An overlay shows how the free space is split out to items.
3. **Grid:** `grid-template-columns` presets (`repeat(3, 1fr)`, `200px 1fr`, `repeat(auto-fill, minmax(120px, 1fr))`), gap, and item spans, with numbered grid-line overlays.

The generated CSS shows live in a code panel. The container width can be dragged.
**Kit.** `ResizablePane` (P), `Segmented`, `Toggle`, sliders via `ControlGroup`, `CodePanel` (generated CSS), `ScenePicker` (tabs).
**AC.**
- Watch: margin is `--orange`, border `--hi`, padding `--ok`, content `--info`, free space `--violet`, and grid lines `--dim`.
- Misconception: "width includes padding" (only under `border-box`).
- Correctness: every number shown is measured from the real DOM, and nothing is computed by hand; a test covers the margin-collapse preset's measurement.

**`responsive-design` · Responsive Design & Media Queries**
Track `web` · *"One layout, every screen"*
**Spec.**
- A drag handle on a `ResizablePane` sets the "device" width from 320 to 1440 px, with preset chips for phone, tablet and desktop.
- A sample page (nav, hero, cards, sidebar) reflows at mobile-first breakpoints. The active rule block lights up in the CSS panel, and a ruler shows the breakpoints.
- A viewport-units panel shows how `vw`, `%`, `rem` and `clamp()` type sizes change with width.
- A **`srcset`** panel: pick a device pixel ratio of 1×, 2× or 3×. The chosen candidate from `img-400w, 800w, 1600w` with `sizes` lights up, along with the bytes it saves.
- A mobile "tap target size" overlay flags targets under 44 px.
**Kit.** `ResizablePane` (P), `CodePanel`, `Segmented`, `ScenePicker`, `format.ts` `bytes`, `.chip`.
**AC.**
- Watch: the active breakpoint is `--hi`, rule blocks not in effect `--dim`, the chosen image candidate `--ok`, and tap targets that are too small `--bad`.
- Misconception: "responsive means separate mobile and desktop sites".
- Correctness: `srcset` selection uses the spec's density algorithm (the smallest candidate ≥ slot width × DPR), tested on the preset matrix.
- Honesty: the stage says "This demo uses **container queries** to stand in for the viewport; on a real page these are `@media` rules." It also says "browsers may pick differently when caching or on slow networks."

**`accessibility` · Accessibility & the Accessibility Tree**
Track `web` · *"If a screen reader can't use it, it's broken"*
**Spec.**
- A mock sign-up form beside its **accessibility tree** (role, name and state per node) and a **simulated screen reader** that reads Tab order aloud as caption text.
- Fix-it toggles, each of which updates the tree and the reading:
  - A `div` "button" becomes a `<button>`: it gains a role, focusability and Enter/Space activation.
  - Add `alt` to an image.
  - Associate a `<label>` with its input.
  - Add a heading structure.
  - Fix the focus order, which a positive `tabindex` had broken.
  - An `aria-live` region for the error message.
- A **contrast checker** has foreground and background pickers, shows the WCAG ratio and AA/AAA pass or fail for normal and large text, and links to the colour-blindness filters (protanopia, deuteranopia, tritanopia via SVG `feColorMatrix`), which show that "red means error" alone fails.
**Kit.** `TreeSvg` (P) for the accessibility tree, `Toggle`, `Segmented`, `.data-table`, `.log-row`, `Box`.
**AC.**
- Watch: the focused element is `--hi`, a node with no role or name is `--bad`, a fixed node `--ok`, and non-interactive nodes `--dim`.
- Misconception: "ARIA fixes accessibility". The first rule of ARIA is to use native HTML.
- Correctness: the contrast ratio is exact per WCAG 2.x relative luminance, tested (`#777` on `#fff` = 4.48, which fails AA); the thresholds are 4.5 and 3 for AA and 7 and 4.5 for AAA.
- Honesty: the screen says "Simplified tree computed from our model, not the browser's real accessibility tree; the screen reader is simulated."

**`browser-storage` · Cookies, localStorage & IndexedDB**
Track `web` · *"Where the browser keeps things"*
**Spec.**
- A browser "cabinet" with drawers: cookies, localStorage, sessionStorage and IndexedDB. Each drawer shows its capacity (approximate), whether it persists, whether it's sync or async, what it can store, and whether JavaScript can read it.
- The learner saves a value into each drawer, then:
  - **Sends a request.** A `Packet` travels to the server with a `Cookie:` header attached, while the other drawers stay home. Its bytes add up on every request.
  - **Opens a new tab.** sessionStorage is empty and the others persist.
  - **Runs a simulated XSS script.** It reads localStorage and non-HttpOnly cookies, but not HttpOnly ones.
- Cookie flag toggles: `HttpOnly`, `Secure`, `SameSite` (Strict, Lax, None) and `Domain`/`Path`, each changing when the cookie is sent. A cross-site request preset shows the SameSite effect.
**Kit.** Scene kit (`SceneNode`, `Packet`), `Toggle`, `Segmented`, `.data-table`, `format.ts` `bytes`.
**AC.**
- Watch: request packets are `--info`, the cookie header `--hi`, data the attacker script can read `--bad`, protected data `--ok`, and a cookie not sent `--dim`.
- Misconception: "localStorage is a safe place for auth tokens".
- Correctness: the SameSite send matrix matches the spec (Lax is sent on top-level GET navigations and not on cross-site POSTs or subresources), tested; the capacities are labelled approximate (cookies ~4 KB each; localStorage ~5 MB per origin, varies).
- Honesty: the stage says "Simulated browser; your real storage is untouched."

---

#### Batch T1-B7 · Security & data design (`sec`, `data`)

**`injection-attacks` · Injection: Keep Data Out of Code**
Track `sec` · *"When data becomes code"*
**Re-scoped (defensive and conceptual).** The first spec used concrete attack payloads, which is the
wrong way to teach a junior and tripped a safety check. Teach the habit, not the exploit: no attack
strings, payloads, exfiltration or step-by-step exploitation anywhere in the lesson.
**Spec.**
- **SQL scene:** a query built by string concatenation vs a parameterised query, fed ordinary inputs
  (the surname O'Brien breaks the concatenated query with a syntax error; a trailing space changes a
  match). Show the text the database receives, with data coloured differently from code; in the
  parameterised version data travels separately and can't change the query's structure.
- **HTML scene:** a comment rendered by concatenating into markup vs set as text, fed "I <3 it",
  "use <b>bold</b>" and "5 > 3 & 2 < 4": concatenation mis-renders (bold appears, "<3" vanishes),
  encoding shows exactly what was typed.
- **Principle panel:** the same pattern anywhere data is pasted into something interpreted (SQL, HTML,
  shell commands, URLs, logs). The fix is to keep data separate (parameters, argument arrays, APIs) or
  encode for the context, plus allow-lists for identifiers such as ORDER BY columns. The risk is
  explained in plain words ("someone could deliberately craft input that changes what it does").
**Kit.** `CodePanel` (renderLine), `TextField`, `ScenePicker`, `ChipButton` (benign example inputs).
**AC.**
- Watch: data characters are `--info`, text that ended up treated as code `--bad`, parameters `--ok`.
- Misconception: "escaping or validating input by hand is enough".
- Correctness: O'Brien breaks the concatenated query but not the parameterised one; a parameterised
  query keeps the same token structure for any input (property test over random strings); the HTML
  encoder matches a real DOMParser/textContent round-trip.
- Honesty: "Simulated database and renderer; nothing is executed."

**`security-principles` · Security Principles: CIA, Defense in Depth & Least Privilege**
Track `sec` · *"How to think like a defender"*
**Spec.**
- A system drawn as concentric defensive layers: network (firewall), identity (MFA), authorisation (least privilege), application (input validation), data (encryption at rest), plus detection (logging and alerting) around them all.
- Attacker scenarios, each a token that travels inward:
  - A phished password: stopped at MFA.
  - SQL injection: stopped by validation and parameterisation.
  - A stolen laptop: stopped by disk encryption.
  - An over-privileged service account compromised: the blast radius shows.
- Layers can be switched off to see the breach get through. Each breach is labelled with the CIA property it violates (confidentiality, integrity, availability), and a DDoS scenario shows availability.
- **Least privilege** panel: a service's permission set as a grid. Trimming it to what's needed shrinks the red blast-radius area when it's compromised.
**Kit.** SVG layers with `SceneNode` and `TravelDot`, `Toggle`, `ScenePicker`, `.chip` (CIA tags), `Bar`.
**AC.**
- Watch: the attacker token is `--bad`, an active layer `--info`, the layer that stops the attack `--ok`, disabled layers `--dim`, and the blast radius a `--bad` tint.
- Misconception: "a strong perimeter is enough".
- Correctness: each scenario's stopping layer is fixed and asserted in a test for every combination of switched-off layers (the first enabled layer in the scenario's defeat list).
- Honesty: the stage says "Scripted scenarios."

**`secrets-management` · Config & Secrets: Keeping Keys Out of Git** (moved from T2, scoped)
Track `sec` · *"The key you committed is already public"*
**Spec.**
- A timeline: a developer hard-codes `STRIPE_KEY=sk_live_…`, commits and pushes to a public repo. A scanner bot finds it seconds later (scripted, labelled "real bots scan GitHub pushes within minutes") and misuse starts.
- Rewind and try the fixes, one at a time:
  1. **Delete the line in a new commit.** The key is still in history (the commit graph shows it).
  2. **Add it to `.gitignore` afterwards.** It's already tracked, so nothing changes.
  3. **Rotate the key.** This is the only real fix once a key has leaked, and misuse stops.
  4. **Prevention:** `.env` in `.gitignore` from the start, config read from environment variables at runtime, a secret manager injecting the value at deploy, and a pre-commit secret scanner that blocks the push.
- A "config vs code" panel sorts values into code, config and secrets.
**Kit.** `CommitGraph` (P), `CodePanel`, `ScenePicker`, `SceneNode`/`Packet`, `.log-row`.
**AC.**
- Watch: the secret is `--bad`, a safe reference (`process.env.X`) `--ok`, commits `--info`, the bot `--bad`, and the rotated (dead) key `--dim`.
- Misconception: "deleting the file or line removes the leak".
- Correctness: the history panel shows the secret reachable after the delete commit (commit-graph reachability, tested); the `.gitignore` behaviour is accurate (it doesn't untrack files).
- Honesty: the screen says "scripted timeline."

**`cors-same-origin` · Same-Origin Policy & CORS** (moved from T2)
Track `sec` · *"The browser is the one saying no"*
**Spec.**
- **Origin checker:** two URLs are split into scheme, host and port, and the result says same or cross origin, with presets for `http` vs `https`, `:3000` vs `:5173`, and `api.` vs `www.`.
- **Request scene:** browser (`app.example.com`) → server (`api.example.com`).
  1. **Simple GET, no CORS headers.** The request reaches the server and the server runs it, then the browser hides the response from JavaScript. The "blocked" console line appears in red.
  2. **Server adds `Access-Control-Allow-Origin`.** JavaScript can read the response.
  3. **POST with JSON or a custom header.** A **preflight** `OPTIONS` goes first, and the actual request only follows if the preflight is allowed.
  4. **Credentials.** `*` isn't allowed with cookies, so the exact origin plus `Allow-Credentials` is needed.
- Side notes: a "curl doesn't care" toggle shows CORS is a browser rule, not server security, and CORS doesn't protect you from CSRF (that's Tier 2).
- A header panel shows the real request and response headers.
**Kit.** Scene kit (`SceneNode`, `Packet` with `arrive="stay"`), `TextField`, `Toggle`, `Segmented`, `CodePanel` (headers), `.log-row`.
**AC.**
- Watch: requests are `--info`, the preflight `--violet`, an allowed response `--ok`, a response the browser blocked `--bad`, and a request that reached the server anyway gets a `--hi` flash on the server.
- Misconception: "CORS stops the request reaching my server" and "CORS protects my API".
- Correctness: the simple-request classification follows the Fetch spec (methods GET, HEAD and POST; the three safelisted content types; no custom headers), tested; the credentials-with-`*` rule is tested.

**`er-data-modeling` · Entity-Relationship Data Modeling**
Track `data` · *"Drawing the domain before the tables"*
**Spec.**
- A canvas of entity cards (User, Order, Product, Address, Tag). The learner connects pairs and sets the cardinality on each end (1 or many; optional or required), drawn as crow's-foot notation.
- Generated tables update live:
  - **1:N** puts the foreign key on the N side, and the "why" shows it.
  - **1:1** puts a unique foreign key on one side.
  - **M:N** generates a join table (`order_items`) with a composite key and room for relationship attributes (quantity, price at the time).
- "Put the FK on the wrong side" is allowed and shows the problem: a repeating group, or a list stuffed into a column.
- Presets: a shop, a blog with tags, and a school (student, course, enrolment).
- Links: `sql-basics` for joins, and Tier 2 `normalization`.
**Kit.** SVG cards with `SceneNode`, custom crow's-foot paths using `.scene-edge`, `.data-table` (generated tables), `Segmented`, `ScenePicker`.
**AC.**
- Watch: the selected entity is `--hi`, primary keys `--hi` with a key glyph, foreign keys `--violet`, join tables `--info`, and a modelling error `--bad`.
- Misconception: "M:N can be stored with a foreign key on one side".
- Correctness: the table generator is tested for each cardinality pair, and self-relations (employee→manager) are handled.

---

#### Batch T1-B8 · Shipping code (`ops`, `craft`)

This batch pilots **`CommitGraph` (P)**.

**`ci-pipelines` · Continuous Integration Pipelines**
Track `ops` · *"Every push gets built, tested and judged"*
**Spec.**
- A pipeline drawn as a DAG: `install → lint | typecheck | build → unit tests (sharded) | integration → e2e → package artifact → deploy (main only)`. A push animates jobs running, with durations filling bars.
- A wall-clock bar at the bottom shows the **critical path**.
- Toggles:
  - **Dependency cache**: install drops from 90 s to 8 s.
  - **Test shards** 1, 2 or 4: parallel lanes.
  - **Fail fast.**
  - **Only on main** for deploy.
- A "break a test" button turns its job red, blocks everything downstream (deploy never runs) and shows the log line.
- An artifacts strip shows the build output being passed to later stages rather than rebuilt.
- A YAML panel shows the matching config, with the current job's block highlighted.
**Kit.** SVG DAG with `SceneNode` and `useArrowMarker`, `Bar`, `Toggle`, `Segmented`, `CodePanel` (YAML), `format.ts` `duration`.
**AC.**
- Watch: a running job is `--hi`, passed `--ok`, failed `--bad`, skipped or blocked `--dim`, a cache hit `--info`, and the critical path `--violet` outline.
- Misconception: "the pipeline's time is the sum of all its jobs".
- Correctness: the wall-clock time equals the longest path through the DAG under the chosen toggles (tested against a brute-force longest path); failure propagation blocks exactly the descendants.

**`branching-workflows` · Branching Strategies: Trunk-Based vs GitFlow**
Track `ops` · *"Branch lifetime decides merge pain"*
**Spec.**
- Two commit graphs side by side, simulated over a 10-day week driven by a step player.
- **Long-lived feature branches (GitFlow-style):** `develop`, `release` and feature branches drift apart. Conflict markers pile up in proportion to divergence (lines touched by others since the branch point), and the integration day is a red pile-up.
- **Trunk-based:** small branches merged daily behind feature flags, where conflicts are small and frequent.
- Controls: team size, branch lifetime, and a flags on/off toggle (unfinished work merges dark).
- A readout shows total conflicts, time from commit to production, and "is CI meaningful?" (how often main is integrated). A PR box shows how the review size shrinks.
**Kit.** `CommitGraph` (P), `usePlayer`/`StageFrame`, `createRecorder`, `Segmented`, `Toggle`, `AnimatedValue`, `mulberry32`.
**AC.**
- Watch: branch lanes use `categorical(i)`, conflicts are `--bad`, merges into main `--ok`, flagged-off code `--dim`, and the current day `--hi`.
- Misconception: "trunk-based means everyone commits unreviewed code to main".
- Correctness: the conflict model is documented and deterministic (seeded) and tested for monotonicity (longer branches never produce fewer conflicts).
- Honesty: the stage says "Simplified model: conflicts estimated from overlapping edits."

**`code-review` · Effective Code Review** (moved from T2)
Track `craft` · *"Review the change, not the person"*
**Spec.**
- **Review it yourself:** a PR diff (~40 lines) with planted issues of different severity: an off-by-one in pagination (a bug), an unhandled null (a bug), a missing test for a new branch, a secret in a log line (security), a confusing name (a nit), and style that a linter should catch. The learner clicks lines and tags each comment as **blocking**, **suggestion** or **nit**, then "Submit review" compares against the key and scores missed bugs versus noise.
- **Comment rewrite** panel: a harsh comment ("this is wrong") is turned into a useful one (what, why, a suggestion), picked from options.
- **PR size** panel: a slider for lines changed shows review time rising and defects found per line falling, which is why small PRs get better reviews.
- An author checklist: a description that explains why, a self-review, tests, and screenshots.
**Kit.** `CodePanel` (`stateOf` and `trailing` for tags), `Segmented`, `ScenePicker`, `Tray`, `Bar`.
**AC.**
- Watch: the selected line is `--hi`, blocking comments `--bad`, suggestions `--info`, nits `--dim`, and correctly found issues `--ok`.
- Misconception: "review is for catching style issues" (that's what linters are for).
- Correctness: the planted bugs are real, and there's a unit test proving the off-by-one; the PR-size curve is labelled "illustrative, based on published review studies" with no invented precise numbers.

**`dependency-management` · Semantic Versioning, Lockfiles & Dependency Hell** (moved from T2, scoped)
Track `craft` · *"Works on my machine, broken in CI"*
**Spec.**
- **Semver range tester:** type a range (`^1.4.2`, `~1.4.2`, `1.x`, `>=1.2 <2`, `^0.3.1`) against a published version list, where the versions that satisfy it light up and the highest match is picked. `MAJOR.MINOR.PATCH` is annotated as breaking, feature and fix.
- **Lockfile** scenario: two installs months apart without a lockfile. A new `1.5.0` with a regression gets picked, so it works on the developer's machine and is broken in CI. With a lockfile, both installs are identical. `npm ci` versus `npm install` is explained.
- **Transitive dependency tree:** your app → A → C@^2 and B → C@^1 produces two copies of C (npm nests them). A security fix in C shows how many paths need a bump.
**Kit.** `TreeSvg` (P) for the dependency tree, `TextField`, `.chip` (versions), `ScenePicker`, `CodePanel` (`package.json` and `package-lock.json`).
**AC.**
- Watch: matching versions are `--ok`, the selected version `--hi`, excluded versions `--dim`, the regressed version `--bad`, and duplicate copies `--violet`.
- Misconception: "`^` means any newer version".
- Correctness: a small semver matcher is tested against the npm `semver` semantics case table, including the 0.x caret rules (`^0.3.1` := `>=0.3.1 <0.4.0`, `^0.0.3` := `=0.0.3`) and pre-release exclusion.

**`test-pyramid` · Unit, Integration & E2E: The Test Pyramid**
Track `craft` · *"Many fast tests at the base, few slow ones on top"*
**Spec.**
- Three sliders set the test counts per layer, and a shape preview morphs between a pyramid, a diamond and an **ice-cream cone**.
- "Run the suite" fires test dots through a runner. Each layer has its own duration and flake probability, and unit tests are fast and deterministic.
- Readouts:
  - Total suite time.
  - P(suite green when nothing is broken), which falls as E2E tests pile up.
  - Which planted bugs each layer catches: a logic bug (unit), a wiring bug (integration), a real browser bug (E2E).
- A "what should this test be?" quiz strip drags scenarios into layers.
**Kit.** `useSimulation`, canvas kit (`draw.ts`) or scene `TravelDot`s, `Bar`, `Segmented`, `AnimatedValue`, `format.ts` (`duration`, `pct`).
**AC.**
- Watch: unit tests are `--ok`, integration `--info`, E2E `--violet`, flaky failures `--hi`, real failures `--bad`, and time bars `--dim` tracks.
- Misconception: "E2E tests are the most valuable, so write mostly those".
- Correctness: P(green) = Π(1 − pᵢ) is tested and the time model is tested; the simulated run converges to the analytic P(green) over many seeded runs, within tolerance.
- Honesty: the stage says "Illustrative timings and flake rates."

---

#### Batch T1-B9 · Everyday tools (`os`, `lang`, `data`, `craft`)

This batch covers the tools a junior uses daily, and it pilots `TextArea` (P) and `CallStackPanel` (P). The regex presets reuse `command-line`'s sample `access.log`: each lesson keeps its own copy of the fixture, and a batch may not share lesson files.

**`command-line` · The Shell, Pipes & File Permissions**
Track `os` · *"Small tools, glued with pipes"*
**Spec.** Two tabs.
1. **Pipes:** a fixed sample `access.log`. The learner builds a pipeline from command blocks (`cat`, `grep 500`, `cut -d' ' -f1`, `sort`, `uniq -c`, `sort -rn`, `head -3`). Lines stream through `stdout` pipes block by block, `stderr` takes a separate red lane to the terminal, and each block shows its exit code.
   - Operators: `&&` versus `;` versus `||` chaining with a failing command.
   - Redirection: `>`, `>>`, `2>&1`.
   - `$VAR` environment expansion.
2. **Permissions:** an rwx grid for user, group and other. It maps live to octal (`chmod 754`), symbolic (`u+x`) and the `ls -l` string (`-rwxr-xr--`). An "as user X" check shows who can read, write or execute. Presets: 644, 755, 600 (SSH key) and 777 (why not).
**Kit.** `SceneNode` (command blocks), `TravelDot`/`Flyer` (lines through pipes), `BitStrip` (P) for the 9 permission bits, `Toggle`, `CodePanel` (terminal), `ScenePicker`.
**AC.**
- Watch: stdout is `--info`, stderr `--bad`, a zero exit code `--ok`, a non-zero one `--bad`, set permission bits `--hi`, and unset bits `--dim`.
- Misconception: "`2>&1 > file` and `> file 2>&1` do the same thing".
- Correctness: every command block is a pure implementation over the fixed sample, and the pipeline output is tested against the expected output; chmod mapping is tested exhaustively for all 512 values.
- Honesty: the stage says "Simulated shell over a sample file."

**`regex-basics` · Regular Expressions for Everyday Use** (added by coordinator decision)
Track `lang` · *"Find, match and extract without a loop"*
**Spec.**
- A live regex tester with a pattern field, flag toggles (`g`, `i`, `m`, `s`) and a multi-line test text. Every match is highlighted in the text, and each capture group gets its own colour.
- A **groups table** lists every match with its index and its numbered and named groups (`(?<year>\d{4})`).
- A **token explainer** beside the pattern breaks it into chips with plain-English meanings: `^` start of line, `\d{3}` exactly three digits, `[A-Z]+` one or more capitals, `(…)` group, `|` or, `?` optional, `.` any character. Hovering a chip highlights what it matched.
- Presets, each with a "try this" prompt:
  - Pull the status code and path out of access-log lines. This links to `command-line`, since it's the same log file.
  - An ISO date with named groups, used in a replace preview (`$<day>/$<month>/$<year>`).
  - Greedy versus lazy: `<.+>` against `<b>bold</b>` grabs everything, while `<.+?>` stops at the first `>`.
  - Anchors and the `m` flag.
  - Escaping: `.` versus `\.` in `file.txt`.
  - A "valid email" regex that's too strict, rejecting `a+tag@x.io`. The lesson is to validate loosely and confirm by sending.
- A "when not to use regex" card: parsing HTML or JSON (use a parser; see `data-formats`), and nested structures. It notes that some patterns can be catastrophically slow, and links to Tier 3 `redos`.
- A replace mode shows the before and after text with `replaceAll`.
**Kit.** `TextField` (pattern), `TextArea` (P) (test text), `Toggle` (flags), `.chip` (tokens), `.data-table` (groups), `ScenePicker` (presets), `categorical()` for group colours.
**AC.**
- Watch: whole matches are `--hi`, capture groups use `categorical(i)` (matching their column in the groups table), the hovered token and its matched text are `--info`, and an invalid pattern is a `--bad` field with the engine's error message.
- Misconception: "`.*` means 'the rest of this bit'". It's greedy and runs as far as it can.
- Correctness: every highlight and group comes from the real JavaScript `RegExp` (`matchAll`, `d` flag indices), never a hand-rolled engine. The token explainer's tokenizer is unit-tested on every preset pattern and on an unsupported construct, which it must label "not explained" rather than mislabel. Replace previews equal `String.prototype.replaceAll`. An invalid pattern never throws out of the Stage.
- Honesty: the stage says "Explanations cover common syntax; flavours differ (JavaScript shown; PCRE, Python and POSIX vary)."

**`data-formats` · Data Formats: JSON, CSV, YAML & Friends** (added by coordinator decision)
Track `data` · *"Same data, different ways to lie to you"*
**Spec.**
- One record set (three users with names, ids, tags, a nested address, a date and a price) shown as **JSON**, **CSV**, **YAML** and **XML** panes side by side. Editing the JSON (the source of truth) updates the others live.
- Where a format can't hold the shape, the gap shows: CSV has no nesting or lists, so it flattens to `address.city` and `tags` joined with `;`, marked as a lossy conversion.
- A size row compares bytes per format.
- **Pitfall cards.** Each one demonstrates a real bug with a before and after:
  - **CSV:** a comma inside a field breaks the columns until it's quoted (RFC 4180). A line break inside a quoted field. Excel reads `00123` as `123` and a gene name as a date.
  - **JSON:** no comments and no trailing commas (the parse error shows). An id of `9007199254740993` silently becomes `…992`, because JSON numbers become float64 in JavaScript; the fix is ids as strings. Dates are just strings, so agree on ISO 8601 with a zone (links to `time-and-timezones`). `undefined` fields vanish on stringify.
  - **YAML:** indentation is structure. The "Norway problem": `country: NO` reads as `false` in YAML 1.1 parsers, and quoting fixes it. `version: 1.10` becomes the number `1.1`.
  - **XML:** attributes versus elements, and why namespaces exist, kept brief.
- A "which format when" strip: JSON for APIs, CSV for spreadsheets and bulk export, YAML for human-edited config, and binary formats (Protocol Buffers) for fast service-to-service calls, linking to Tier 2 `grpc-protobuf`.
- A parse-then-validate step: a schema check flags `age: "thirty"`.
**Kit.** `CodePanel` (the four panes, with the offending line in state `now`), `TextArea` (P) (JSON editor), `Segmented`, `ScenePicker` (pitfalls), `format.ts` `bytes`, `.data-table` (the CSV grid view), `.chip`.
**AC.**
- Watch: the edited field and its counterparts in every pane are `--hi`, a parse error or corrupted value is `--bad`, the fixed version is `--ok`, lossy-conversion markers are `--violet`, and unchanged text is the default ink.
- Misconception: "CSV is simple, just split on commas", and "JSON numbers are safe for any id".
- Correctness:
  - JSON uses the real `JSON.parse` and `JSON.stringify`.
  - The CSV parser and writer in `model.ts` are unit-tested against RFC 4180 cases (embedded commas, quotes, CRLF and newlines inside quoted fields), and round-trip every preset.
  - The large-id case is asserted in a test (`JSON.parse('{"id":9007199254740993}').id === 9007199254740992`).
  - The YAML and XML panes come from small subset emitters, unit-tested for the preset shapes. The YAML 1.1 boolean and float pitfalls are fixed facts, cited in the model comment (YAML 1.1 bool type: y, yes, no, on, off…), because we don't ship a YAML parser.
- Honesty: the stage says "YAML and XML are generated by a small built-in emitter; the YAML pitfalls describe YAML 1.1 parsers (e.g. PyYAML), and YAML 1.2 fixed some of them."

**`time-and-timezones` · Time Zones, UTC & Date Bugs**
Track `craft` · *"Falsehoods programmers believe about time"*
**Spec.**
- A 48-hour timeline strip around a DST transition, with three rows: UTC, America/New_York and Europe/London.
- Presets:
  - **Spring forward:** 2026-03-08 in New York. 02:00-02:59 doesn't exist, and a job scheduled daily at 02:30 local is skipped.
  - **Fall back:** 2026-11-01. 01:00-01:59 happens twice, and the job runs twice.
  - **The EU/US gap weeks:** 2026-03-08 to 2026-03-29, when the NY–London offset is 4 h instead of 5 h, so a recurring meeting "moves".
- A meeting scheduler: pick a time in one zone and see it in the others. Storing a naive local time is compared with storing UTC plus an IANA zone.
- "Falsehoods" cards, each flippable with a counterexample:
  - A day has 24 hours.
  - An offset is the same thing as a zone.
  - `new Date('2026-03-08')` is local midnight (in JavaScript, a date-only ISO string parses as UTC).
**Kit.** `Segmented`, `ScenePicker`, `TextField`, `.data-table`, SVG timeline, `format.ts` `pad2`/`clock`.
**AC.**
- Watch: UTC is `--info`, local times `--violet`, a non-existent hour `--bad`, a repeated hour `--hi`, and a correct stored value `--ok`.
- Misconception: "store local time and convert later".
- Correctness: every conversion uses `Intl.DateTimeFormat` with `timeZone`, never hard-coded offsets; tests pin the 2026 transitions (US: Mar 8 and Nov 1; EU: Mar 29 and Oct 25) and the date-only parsing behaviour.

**`debugger-tools` · Using a Debugger: Breakpoints, Stepping & Watches** (added by coordinator decision)
Track `craft` · *"Stop guessing with console.log"*
**Spec.**
- A DevTools-style debugger around a short buggy program: `checkout(cart)` calls `subtotal(items)` in a loop and then `applyDiscount(total, code)`, and the total comes out wrong.
- Panels:
  - **Source**, with a clickable breakpoint gutter.
  - **Call stack**, with the frames listed and the selected frame highlighted.
  - **Scope**: local, closure and global variables for the selected frame.
  - **Watch**, where the learner adds expressions such as `items.length` or `total * 0.9`.
  - **Console**, which evaluates against the paused frame.
- Controls: Resume, Step over, Step into, Step out, and Restart. Each one moves the current-line marker, and the call stack pushes or pops a frame accordingly.
- A **conditional breakpoint** (`i === 3`) skips the first three iterations.
- A **logpoint** prints without pausing, and a before/after view shows that it replaces a `console.log` edit-and-reload cycle.
- Clicking a lower frame in the call stack shows *its* variables. This is how you find where a bad value came from.
- A guided mission: find the bug (the discount applied twice, or an off-by-one in the loop) using at most N steps. A step counter compares the learner's route with "step into everything".
- The closing card maps each control to its real shortcut in Chrome DevTools and VS Code (F8/F10/F11/Shift+F11 in DevTools; F5/F10/F11/Shift+F11 in VS Code), and says that `debugger;` statements and Node's `--inspect` open the same tools.
**Kit.** `CodePanel` (gutter breakpoints via `stateOf`, `nowStyle="bar"`, `trailing` for inline values), `CallStackPanel` (P), memory kit `VarSlot` (P) for scope and watch rows, `createRecorder` (the execution trace is precomputed), `TextField` (watch and console input), `Button`, `.log-row` (console).
**AC.**
- Watch: the paused line is `--hi`, breakpoints are `--bad` dots (the DevTools convention; the lesson says so), a conditional breakpoint is an `--orange` dot, a logpoint is a `--violet` dot, the selected stack frame is `--info`, a value that just changed flashes `--ok`, and lines that haven't run are `--dim`.
- Misconception: "Step over skips running the function". It runs the whole call and just doesn't pause inside it.
- Correctness:
  - The trace (line, frame stack and variable values per step) is generated by a small interpreter for the lesson's fixed program in `model.ts`. A Vitest test runs the **real JavaScript** program and asserts that its final values and loop iterations match the trace.
  - Step over, into and out are unit-tested: step out lands on the line after the call site; step over at a call never visits the callee's lines as paused lines.
  - A conditional breakpoint pauses exactly on the iterations where the condition holds.
  - The watch and console evaluator supports only the safe expression subset it documents, and anything else returns "not supported here" rather than running `eval`.
- Honesty: the stage says "Simulated debugger over a fixed program; the controls and panels mirror Chrome DevTools and VS Code."

---

#### Batch T1-B10 · How networks & teams work (`net`, `craft`)

This is a mixed batch, with no shared-code affinity between the lessons. That's fine: the files are disjoint.

**`osi-tcpip-layers` · The OSI & TCP/IP Layer Model**
Track `net` · *"Envelopes inside envelopes"*
**Spec.**
- A message `GET /` goes down the sender's stack and gets wrapped in turn: HTTP, then a TCP header (ports, sequence number), then an IP header (source and destination IP, TTL), then an Ethernet frame (MACs, FCS). Each header is shown as a nested envelope with real field names and sizes.
- At the router, the Ethernet frame is stripped and rewritten with new MACs, while IP stays and its TTL drops by 1. NAT is noted as the exception that rewrites IP, linking to `ip-ports`. On the receiver, the layers unwrap going up.
- A toggle maps the 7 OSI layers onto the 4 TCP/IP layers.
- A **"which layer is broken?"** mode gives symptom cards (DNS fails, connection refused, 404, cable unplugged, TLS certificate error) that the learner drops onto a layer.
- The byte overhead of the headers is shown against the payload.
**Kit.** Scene kit (`SceneNode`, `Packet` with `variant="outline"` for the nested envelopes), `Toggle`, `ScenePicker`, `.data-table` (headers), `format.ts` `bytes`.
**AC.**
- Watch: each layer has a consistent `categorical(i)` hue across the envelope, the stack and the table; the layer being added or removed is `--hi`; a field the router rewrites flashes `--hi`.
- Misconception: "routers read your HTTP" and "OSI is how the internet is actually built" (TCP/IP is).
- Correctness: the header sizes are the real minimums (Ethernet 14 + 4 FCS, IPv4 20, TCP 20); the TTL decrements per hop; the symptom-to-layer answer key is reviewed.

**`reading-codebases` · Navigating an Unfamiliar Codebase**
Track `craft` · *"Finding your way in a million lines"*
**Spec.**
- A small fictional repo (about 12 files: routes, controllers, services, repositories, tests, config) shown as a tree plus a file viewer.
- Task cards pose questions, for example "Where is the 10% discount applied?", "Why does /checkout return 402?" and "Who last changed the tax rule, and why?"
- The learner solves them with four tools: **search** (grep, with result counts), **go to definition**, **find references**, and **blame/log** (commit messages).
- Breadcrumbs record the path taken (route → controller → service → repository → database), and the solution replay shows the efficient path.
- Tips: start from an entry point or a failing test, and read the tests as documentation.
**Kit.** `CodePanel`, `ScenePicker` (tasks), `TextField` (search), `Tray` (breadcrumbs), `.data-table`.
**AC.**
- Watch: the current file and line are `--hi`, search hits `--info`, the breadcrumb path `--violet`, and the answer found `--ok`.
- Misconception: "read the code top to bottom".
- Correctness: every task can be solved with the tools provided, and the model's search results match the fictional files (a test runs each task's reference path).
- Honesty: the screen says "Fictional repo."

**`requirements-user-stories` · Requirements, User Stories & Acceptance Criteria**
Track `craft` · *"Knowing what 'done' means"*
**Spec.**
- A vague request arrives: "Users should be able to reset their password." An **ambiguity meter** starts high, and a scatter of open questions orbits the request.
- The learner picks clarifying questions from a deck (How long is the link valid? What if the email doesn't exist? Rate limits? What about SSO users? Which devices?). Each good question converts an ambiguity into:
  - an **acceptance criterion** in Given/When/Then form, or
  - an explicit **out of scope** line.
- Irrelevant questions (e.g. "which font?") don't lower the meter.
- The finished story (As a / I want / so that) plus its criteria turns into a **test checklist**, one test per criterion.
- A final "definition of done" strip covers code, tests, review, docs and deploy.
- A "what happens if we skip this" replay shows rework after the demo.
**Kit.** `ScenePicker`, `Tray` (criteria, out of scope), `Bar` (ambiguity meter), `.chip`, `CodePanel` (Gherkin), `AnimatedValue`.
**AC.**
- Watch: open ambiguities are `--bad`, the question just asked `--hi`, criteria `--ok`, out-of-scope items `--dim`, and generated tests `--info`.
- Misconception: "requirements are the product manager's job, not mine".
- Correctness: the meter reaches its floor only when every material ambiguity is resolved (the model is tested).
- Honesty: the stage says "Scripted scenario."

**`agile-kanban` · Agile, Scrum & Kanban: How Work Flows**
Track `craft` · *"Stop starting, start finishing"*
**Spec.**
- A kanban board (Backlog → In progress → Review → Done) whose cards flow under a live simulation with an arrival rate and per-stage work.
- A **WIP limit** slider (1 to unlimited): high WIP fills the board and cycle time balloons.
- A **cumulative flow diagram** grows live. The band thickness is WIP and the horizontal distance is cycle time.
- A readout checks **Little's law**, cycle time ≈ WIP ÷ throughput, as measured values side by side.
- A Scrum toggle overlays two-week sprint boundaries, planning and a review "batch" of Done cards.
- A blocked-card event (waiting on another team) shows the queue forming behind it.
**Kit.** `useSimulation`, canvas kit (`draw.ts`, `drawSpark`), `createSampler`, `Bar`, `Segmented`, `Toggle`, `PauseButton`, `format.ts`.
**AC.**
- Watch: CFD bands are `categorical(i)` per column, the card being worked is `--hi`, blocked cards `--bad`, done cards `--ok`, and the WIP limit line `--violet`.
- Misconception: "starting more work in parallel finishes more work".
- Correctness: in steady state, measured average WIP ÷ throughput is within 10% of the measured average cycle time over a seeded long run (tested).
- Honesty: the stage says "Simulated team; rates are illustrative."

---

### 1.6 Build batches and concurrency

| Batch | Theme | Lessons | Pilots (P) component |
|---|---|---|---|
| T1-B1 | Bits & bytes | binary-hex, twos-complement, floating-point, char-encoding, base64-encodings | `BitStrip` |
| T1-B2 | Logic & the machine | logic-gates, propositional-logic, sets-functions, logs-exponentials, fetch-decode-execute | `TruthTable`, `core/scale` |
| T1-B3 | Memory & runtime model | memory-hierarchy, stack-vs-heap, value-vs-reference, closures-scope, oop-fundamentals | memory kit |
| T1-B4 | Code flow | functional-programming, error-handling-models, static-analysis-linters, debugging-method | `CallStackPanel` (with B9) |
| T1-B5 | Algorithm patterns | two-pointers, sliding-window, prefix-sums, tree-traversals, graph-representations | `ArrayStrip`, `TreeSvg` |
| T1-B6 | Web platform | dom-events, css-layout, responsive-design, accessibility, browser-storage | `ResizablePane` |
| T1-B7 | Security & data design | injection-attacks, cors-same-origin, security-principles, secrets-management, er-data-modeling | none |
| T1-B8 | Shipping code | ci-pipelines, branching-workflows, code-review, dependency-management, test-pyramid | `CommitGraph` |
| T1-B9 | Everyday tools | command-line, regex-basics, data-formats, time-and-timezones, debugger-tools | `TextArea`, `CallStackPanel` |
| T1-B10 | How networks & teams work | osi-tcpip-layers, reading-codebases, requirements-user-stories, agile-kanban | none |

**File ownership.** Each batch touches only `src/lessons/<its ids>/`. **No batch edits** `src/core/*`, `src/components/*`, `src/styles/*`, `curriculum.ts` (all 48 topics are registered in P0), `docs/shared-api.md` or this file. Phase 2 requests and status go into the batch report to the coordinator.

**Isolation.** Each batch runs in its own **git worktree and branch** (`t1/b<n>`). `npm run build` type-checks the whole project, and a half-written lesson in a shared tree breaks everyone else's build. Each worktree runs its dev server on its own port.

This needs one small shared change in P3. The scripts already honour `KINETIC_URL`, but `vite.config.ts` pins port 5317, so make the Vite port configurable with `KINETIC_PORT` (default 5317). Each worktree then runs `KINETIC_PORT=53xx npm run dev` and `KINETIC_URL=http://127.0.0.1:53xx npm run smoke …`.

**Concurrency: 3 agents in waves 1 and 2, and 4 in wave 3 (whose batches are smaller).** The limit isn't agent capacity. It's (a) the coordinator eyeballing about 15-18 lessons of screenshots per wave, and (b) finding problems with the new shared APIs early.

| Wave | Batches | Why this order |
|---|---|---|
| 1 | T1-B1, T1-B3, T1-B5 | They pilot `BitStrip`, the memory kit, `ArrayStrip` and `TreeSvg`. API friction gets fixed in P-follow-up before later waves depend on it. |
| 2 | T1-B2, T1-B6, T1-B8 | `TruthTable`, `core/scale`, `ResizablePane`, `CommitGraph`, plus reuse of the wave-1-proven `TreeSvg` and `BitStrip`. `tree-traversals` in wave 1 has already exercised `CallStackPanel`. |
| 3 | T1-B4, T1-B7, T1-B9, T1-B10 (18 lessons) | These use only proven kit, plus `TextArea` (first use: regex-basics and data-formats, both in B9). |

Between waves the coordinator merges the batch branches, runs the full `npm run smoke` and `npm run captions`, and triages Phase 2 requests. Accepted ones are built by a single shared-code agent before the next wave starts.

---

## 2. Prerequisite shared-code work (before any Tier 1 batch)

**Gate:** the in-flight `src/` refactor has landed. After that, P0-P3 run as **3 agents in parallel with disjoint files**:
- Agent 1: P0.
- Agent 2: P1 new components.
- Agent 3: P2 extractions, then P3 tooling.

Every item updates `docs/shared-api.md` with its usage and the pattern it replaces.

### P0 · Tracks, topics and home page UX
Files: `src/core/types.ts`, `src/core/curriculum.ts`, `src/pages/Home.tsx`, `src/styles/global.css`, `src/core/palette.ts`.

1. **`TrackId`** gains `'hw' | 'lang' | 'math' | 'craft' | 'web' | 'ml' | 'lead'`. **`Track`** gains `family: TrackFamily`, where `TrackFamily = 'computing' | 'systems' | 'delivery' | 'product'`.
2. **`TRACKS`** gets 7 entries. Suggested values; the P0 agent checks each colour for contrast and for distinctness from the 7 existing tracks:

   | id | name | short | glyph | family |
   |---|---|---|---|---|
   | `hw` | Computer Architecture & Data Representation | Hardware | `01` | computing |
   | `math` | Math for CS | Math | `∑` | computing |
   | `lang` | Languages, Compilers & Theory | Languages | `λ` | computing |
   | `craft` | Software Craft & Practice | Craft | `✎` | delivery |
   | `web` | Web, Graphics & UX | Web & UX | `◧` | product |
   | `ml` | ML & AI Systems | ML & AI | `∿` | product |
   | `lead` | Technical Leadership | Leadership | `⚑` | product |

   The existing tracks map to families like this: `dsa` → computing; `os`, `net`, `data`, `arch` → systems; `ops`, `sec` → delivery.

   **Colours:** with 14 tracks, colour alone can't tell them apart, so the glyph and short name carry identity and colour is secondary. Define all 14 as tokens `--trk-<id>` in `global.css` and in `palette.ts` together (the kit rule), and point `TRACKS[*].color` at `var(--trk-<id>)`. The existing 7 hex values move into tokens unchanged, so nothing changes visually.
3. **`TOPICS`**: add the 48 Tier 1 entries from §1.3 to the Tier 1 block, grouped by track, with the titles and taglines from §1.5. **Don't register Tiers 2-4 yet.** Each tier's topics are added at that tier's kickoff, after its validation pass, so ids and tiers that are still proposals don't ship as "planned" cards, and the home page doesn't show 350 grey cards.
4. **Track filter UX (7 → 14 chips).** Recommendation:
   - **Desktop (>900px):** one sticky bar with "All" plus the four **family groups**, each a labelled cluster of its chips (Computing: DS&A, Hardware, Math, Languages · Systems: OS, Network, Data, Systems · Delivery: DevOps, Security, Craft · Product & people: Web & UX, ML & AI, Leadership). Each chip shows a count of built/total topics for the tiers on screen. Chips with 0 topics stay visible but dimmed, so the roadmap stays honest; don't hide them.
   - **≤900px:** the bar stops being sticky, because two or three wrapped rows of sticky chips eat a phone viewport. It becomes a single row that scrolls **horizontally inside its own container** (not the page), with the family labels as dividers.
   - **Selecting a family label** filters to the whole family.
   - The current filter lives in the URL (`?track=hw` or `?family=computing`), so links and back navigation keep it.
   - I rejected a dropdown: it hides the roadmap, which is the point of the page.
5. **Planned-card density.** Once T1 is registered, the Foundations section shows 62 cards (48 planned). Render the planned cards after the built ones, and add a per-tier "Show N planned" disclosure that's collapsed by default when a tier has more than 12 planned cards. This matters much more from Tier 2 onwards.
6. **Verify:** build, lint, full smoke, and eyeball the home page at desktop and phone widths in every filter state.

### P1 · New shared components (clearly needed ≥2× in Tier 1)
The reuse rule is applied strictly: each component below has at least two Tier 1 users. APIs are minimal and grow when a real second need appears.

| Component | Location | Tier 1 users | Minimal API |
|---|---|---|---|
| `BitStrip` | `components/BitStrip.tsx` | binary-hex, twos-complement, floating-point, char-encoding, base64-encodings, command-line (6) | `bits: (0\|1)[]`, `onToggle?(i)`, `groups?: {from, to, tone, label?}[]` (nibbles, sign/exp/mantissa, 6-bit regroup, UTF-8 prefix), `placeValues?`, `highlight?: number[]`, `size?` |
| `TruthTable` | `components/TruthTable.tsx` | logic-gates, propositional-logic | `vars: string[]`, `columns: {label, fn(row) → boolean}[]`, `currentRow?`, `mismatchRows?` |
| Memory kit | `components/memory/` (`VarSlot`, `HeapObject`, `RefArrow`) | stack-vs-heap, value-vs-reference, closures-scope, oop-fundamentals (4) | SVG primitives: `VarSlot {at, name, value?, tone}`, `HeapObject {at, w, h, title, fields, tone, variant: 'live'\|'collectable'\|'freed'}`, `RefArrow {from, to, tone, dangling?}` built on `useArrowMarker` |
| `ArrayStrip` | `components/ArrayStrip.tsx` | two-pointers, sliding-window, prefix-sums, debugging-method (commits) (4) plus existing binary-search | `values`, `cellState(i) → 'idle'\|'active'\|'done'\|'dim'\|'bad'`, `pointers?: {i, label, tone}[]`, `range?: {from, to, tone}`, `showIndex?`. This is the deferred `SlotStrip`, now with its pilots. **Migrate `binary-search` onto it, pixel-identical.** |
| `ResizablePane` | `components/ResizablePane.tsx` | css-layout, responsive-design | `min`, `max`, `value`, `onChange`, `children`; a drag handle plus a width readout; keyboard arrows for accessibility |
| `core/scale.ts` | `src/core/scale.ts` | floating-point, logs-exponentials, memory-hierarchy (3) | `linearScale(d0, d1, r0, r1)`, `logScale(d0, d1, r0, r1, base = 10)` returning `{map, invert, ticks(n)}`. Pure, no JSX. |
| `TextArea` | `components/ui.tsx`, next to `TextField` | regex-basics (test text), data-formats (JSON editor) | Same look and props as `TextField` (`label`, `value`, `onChange`, `sanitize?`), plus `rows` and `mono` (default true); no Enter handling |

### P2 · Extractions (second use arrives in Tier 1)
All three are migrated **pixel-identically** in the same change, verified with `smoke --frames` and `diff`.

| Component | Extracted from | New Tier 1 users |
|---|---|---|
| `TreeSvg` | `trees-bst` (and `heaps` if its tree fits the API; if not, the report says why) | tree-traversals, dom-events, accessibility, dependency-management |
| `CommitGraph` | `git-internals` Stage (lanes, commit circles, merge rings, HEAD and branch tags, faded unreachable commits) | branching-workflows, secrets-management |
| `CallStackPanel` | `recursion` (its frame stack beside the code) | error-handling-models, debugger-tools, tree-traversals (the depth-first stack panel). API: `frames: {name, detail?, tone?}[]` (top first), `selected?`, `onSelect?(i)`; push and pop animated with `enterFromLeft`. |

### P3 · Tooling
1. **Unit tests: add Vitest** (dev dependency) with `npm test`, and colocated `*.test.ts` files next to the pure `model.ts`/`sim.ts`. Every Tier 1 correctness check depends on it, and several are "compare against real JavaScript", which only a test runner can do honestly. It's cheap, and the project currently has no way to enforce correctness.
2. **Configurable dev port**: `vite.config.ts` reads `KINETIC_PORT`, defaulting to 5317. The scripts already accept `KINETIC_URL`. This lets parallel worktrees run side by side.
3. Update `CLAUDE.md` "Verify before calling anything done" to add `npm test`.

**P-follow-up (a standing slot between waves):** a single shared-code agent applies accepted Phase 2 requests, with the full smoke run, before the next wave starts.

---

## 3. Tiers 2-4 rollout

Every tier starts with a **kickoff**, done before any building:
1. A validation pass on that tier, the same exercise as §1.1: confirm the moves below, check the existing-lesson overlaps flagged below against the real lesson code, and write full specs to `docs/tier-<n>-spec.md`.
2. Register the tier's `TOPICS` (a P0-style change).
3. Build that tier's prerequisite shared components.
4. Plan the batches.

### Changes to Tiers 2-4 already decided in this pass

| Change | Topic | Reason |
|---|---|---|
| T1 → T2 | `endianness` | Binary protocol work is mid-level; it sits next to `bit-manipulation`. |
| T1 → T2 | `dhcp` | Completes the Tier 2 "how a machine joins a network" chain with `ethernet-arp` and `subnetting-cidr`. |
| T1 → T2, merged | `cloud-compute-primitives` → **`serverless-cold-starts`** | The VM-versus-container half is already in `containers`; the merged lesson becomes "Serverless & the Compute Spectrum". |
| T2 → T1 | error-handling-models, functional-programming, code-review, secrets-management, cors-same-origin, dependency-management | See §1.2. Tier 2 keeps the deeper follow-ups inside other lessons: vault and rotation automation in `iam-least-privilege`, and dependency resolution in `supply-chain-security` (T3). |
| drop, covered | `nat` | `ip-ports` already teaches the NAT table and private versus public addresses. NAT traversal stays in T3 (`nat-traversal-webrtc`). |
| drop, covered | `password-hashing` | The `hashing-encryption` Passwords lane already covers rainbow tables, salts and bcrypt/Argon2. |
| merge | `git-bisect` → T1 `debugging-method` | Same skill. |
| merge | `divide-and-conquer` → **`master-theorem`** ("Divide & Conquer and the Master Theorem") | Merge sort and quicksort already show divide and conquer in `sorting`. What's new is the recurrence analysis. |
| drop, covered | `namespaces-cgroups` (T3) | The `containers` Isolation panel explains both. Any remaining depth goes into `sandboxing-isolation` (T3). |
| merge | `two-generals` → **`exactly-once-myth`** (T3) | Two Generals is the impossibility result that explains exactly-once. It's one lesson. |
| T4 → T3 | `leases-fencing` | T3 `job-scheduling` (distributed cron) depends on it, so leaving it in T4 breaks the prerequisite order. |

### 3.1 Tier 2 · Practitioner

**Validated count: 158**, in **~32 batches**. With 4 concurrent agents that's ~8 waves, plus a prerequisite wave.

| Track | hw | os | lang | math | dsa | net | arch | data | sec | ops | craft | web | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| n | 9 | 13 | 14 | 15 | 18 | 14 | 11 | 8 | 11 | 9 | 11 | 15 | 7 | 3 |

**Tier 2 prerequisite shared work (kickoff):**
- **`GraphCanvas`**: extract the node-link editor and renderer from T1 `graph-representations`. Users: topological-sort, union-find, minimum-spanning-trees, dfa-nfa (as state diagrams), deadlocks (resource graph), cpu-scheduling (none), dependency graphs.
- **`Timeline`/Gantt lanes**: cpu-scheduling, async-await-coroutines, interrupts-context-switch, http-versions (multiplexing).
- **`Plot2D`**: scatter, line and contour on canvas. Users: linear-logistic-regression, gradient-descent, supervised-learning, clustering-kmeans, classification-metrics (ROC), vectors-similarity, matrices-transformations.
- **`core/bigint-math`**: `modPow`, `gcd`, `egcd` and a primality check on BigInt, for the modular-arithmetic → gcd-euclid → primes-factoring → rsa → diffie-hellman chain.
- Byte and hex-dump mode for `BitStrip`, if bit-manipulation and error-detection-correction need it.

**Order within Tier 2.** Waves follow the prerequisite chains, so no lesson links forward to one that doesn't exist yet.
1. **Chain roots:**
   - math: modular-arithmetic, gcd-euclid, primes-factoring, probability-basics, combinatorics, expected-value
   - hw: bit-manipulation, endianness, adders-alu, sequential-logic
   - net: subnetting-cidr, dhcp, ethernet-arp, dns-resolution
   - lang: dfa-nfa, lexing-tokens
   - os: syscalls-kernel-mode, interrupts-context-switch, virtual-memory-paging
   - dsa: tries, union-find, topological-sort
   - craft: test-doubles, coupling-cohesion
2. **Second links:**
   - crypto: symmetric-ciphers → macs-hmac → diffie-hellman → rsa → digital-signatures-pki
   - compilers: grammars-parsing → parsing-ast → type-systems → generics-polymorphism, null-option-adts
   - ML math: vectors-similarity, matrices-transformations → gradient-descent → linear-logistic-regression
   - web: browser-rendering-pipeline → critical-rendering-path
   - OS concurrency: deadlocks, semaphores-condition-variables
3. **Dependents:**
   - cert-lifecycle, webhooks, cors → xss and csrf-cookies
   - supervised-learning → classification-metrics, decision-trees-ensembles, clustering-kmeans, embeddings
   - core-web-vitals, rendering-strategies, virtual-dom-reconciliation → frontend-state-management
   - kubernetes-basics → health-checks, deployment-strategies → feature-flags
   - garbage-collection → memory-leaks
4. **Integrators:**
   - arch: idempotency-keys, timeouts-deadlines, pagination, caching-patterns, poison-messages-dlq, distributed-id-generation
   - data: normalization, orm-n-plus-one, optimistic-pessimistic-locking
   - ops: resource-exhaustion
   - os: profiling-flame-graphs
   - lead: the three lead topics, placed last so they can reference the technical lessons

**Known risks, Tier 2**
- **Scale.** 158 lessons is 3.3× Tier 1. Throughput is gated on review quality, not agent count. Keep 3-4 agents per wave and rotate a second reviewer (Sentry) for eyeballing.
- **Overlaps with existing lessons that must be confirmed at kickoff** (each one is either narrowed or dropped):
  - caching-patterns vs `lru-cache`
  - diffie-hellman and digital-signatures-pki vs `tls-handshake`
  - symmetric-ciphers and rsa vs `hashing-encryption`
  - virtualization-hypervisors vs `containers`
  - interrupts-context-switch vs `processes-threads`
  - amortized-analysis vs `arrays-linked-lists`
  - deadlocks and semaphores vs `race-conditions`
  - async-await-coroutines vs `event-loop`
  - structured-logging vs `observability`
  - http-caching vs `cdn-edge`
- **Crypto honesty.** Use toy parameters that are labelled as toys. Use `crypto.subtle` for anything presented as real. Never imply a toy RSA key is secure.
- **ML correctness.** Plotted fits must come from a real closed form or a real gradient step, with unit tests. No hand-drawn curves.
- **Theory-heavy topics** (p-vs-np, proof-techniques, induction-invariants) risk turning into slideshows. Each spec must name what the learner *manipulates*.

### 3.2 Tier 3 · Architect

**Validated count: 154**, in **~31 batches**. With 4 concurrent agents that's ~8 waves.

| Track | hw | os | lang | math | dsa | net | arch | data | sec | ops | craft | web | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| n | 4 | 9 | 12 | 15 | 19 | 8 | 16 | 21 | 12 | 10 | 5 | 5 | 11 | 7 |

**Order within Tier 3**
1. Statistics and queueing first, because ops and arch lean on them: distributions, percentiles-statistics, queueing-theory, hypothesis-testing-ab. Also back-of-envelope.
2. Time and consistency: physical-clocks-skew → logical-clocks → consistency-models → quorums. Then exactly-once-myth (with two-generals merged in) and leases-fencing → job-scheduling.
3. Storage internals: write-ahead-log → change-data-capture; query-planning → join-algorithms; mvcc; buffer-pool; columnar-storage → warehouse-lake-lakehouse → etl-orchestration.
4. The ML chain: neural-networks-backprop → attention-transformers → tokenization-bpe → rag-pipelines → llm-agents-tool-use.
5. Everything else by track affinity.
6. The lead topics come last, but **design-docs-rfcs is built early as the pilot for a non-technical visual grammar** (decision simulators and document builders), which Tier 4 depends on.

**Known risks, Tier 3**
- **53 "nice"-priority topics.** The owner wants exhaustive, so they're all in scope. Build core → important → nice inside each wave so the tier is useful early, but the tier isn't done until all 154 ship.
- **Hard-to-animate theory:** chomsky-hierarchy and the pumping lemma, halting-problem, lambda-calculus. Each needs a manipulable toy, such as a Turing machine the learner programs, or a diagonalisation table the learner fills in.
- **Graphics topics** (gpu-rendering-pipeline, ray-tracing, 3d-transforms-projection) should use a canvas-2D software rasteriser rather than WebGL, to avoid a new dependency and keep smoke deterministic. Watch performance.
- **Distributed algorithms** (quorums, mvcc, logical-clocks, consistency-models) need simulation tests that check invariants, not only screenshots.
- **Overlaps to confirm:** graceful-degradation vs `circuit-breakers`/`backpressure`, mvcc vs `isolation-levels`, merkle-trees vs `git-internals`, logical-clocks vs `crdts`, tail-latency vs `load-balancing`/`observability`, alerting-design vs `slos-error-budgets`, backups-disaster-recovery vs `multi-region`.
- **Likely prerequisite shared work:** a distributed-sim harness (nodes, message delay and loss, a seeded clock), since quorums, clocks, gossip and Raft-like lessons repeat it. Also a `Plot2D` upgrade for distributions and histograms.

### 3.3 Tier 4 · Strategist

**Validated count: 41**, in **~8 batches**. With 3 concurrent agents that's 3 waves.

| Track | hw | os | lang | math | dsa | arch | data | sec | ops | craft | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| n | 1 | 2 | 2 | 2 | 6 | 8 | 1 | 5 | 2 | 2 | 3 | 7 |

**Order within Tier 4**
1. Distributed theory: failure-detectors → gossip-protocols, then paxos, byzantine-faults, flp-impossibility, distributed-snapshots, hybrid-logical-clocks → distributed-sql-truetime, and metastable-failures.
2. Concurrency: memory-ordering-atomics → lock-free-cas.
3. Algorithms and theory: np-reductions → sat-solvers; approximation-algorithms → local-search-annealing.
4. Crypto: elliptic-curves → post-quantum-crypto, e2ee-forward-secrecy, secret-sharing, zero-knowledge-proofs.
5. ML serving: llm-serving → fine-tuning-quantization, feature-stores-skew.
6. Lead (7): strangler-fig-migrations, build-vs-buy, conways-law, reversible-decisions, technical-strategy, influence-without-authority, hiring-interviewing.

**Known risks, Tier 4**
- **Lead topics are the least "animatable".** They reuse the grammar piloted by T3 design-docs-rfcs (scenario and decision simulators with consequences). Without that pilot, don't start them.
- **Proof-shaped topics** (flp-impossibility, np-reductions, zero-knowledge-proofs) need an interactive toy, not a narrated proof: for example a Where's-Waldo ZK game, or a reduction the learner performs.
- **Advanced crypto** carries a high risk of being subtly wrong. It needs a domain review per lesson before it's marked done.
- **memory-ordering-atomics** can't show real reorderings in JavaScript. The visual has to be a simulated weak-memory model, and the screen has to say so.

---

## 4. Status tracker and definition of done

### 4.1 Tracker
Status is one of: `not started` · `in progress` · `in review` · `done` · `blocked (reason)`. Only the coordinator edits this table.

| Tier | Item | Lessons | Wave | Owner | Status | Notes |
|---|---|---|---|---|---|---|
| — | Gate: in-flight `src/` refactor landed | — | — | refactor agent | done | b5da8c9, QA fixes 74903c4 |
| 1 | P0 tracks, topics, home UX | — | pre | prep-a | done | merged 93a591d |
| 1 | P1 new shared components | — | pre | prep-b | done | merged a09519c |
| 1 | P2 extractions (`TreeSvg`, `CommitGraph`, `CallStackPanel`) | — | pre | extract | done | merged 728be2f |
| 1 | P3 tooling (Vitest, port) | — | pre | prep-a | done | merged 93a591d |
| 1 | T1-B1 Bits & bytes | 5 | 1 | t1/b1 | done | merged 5e2fa34 |
| 1 | T1-B3 Memory & runtime | 5 | 1 | t1/b3 | done | merged e239bdf |
| 1 | T1-B5 Algorithm patterns | 5 | 1 | t1/b5 | done | merged 6271769 |
| 1 | P-follow-up after wave 1 | — | 1→2 | kit owner | done | ChipButton, ConsolePanel, parseIntegers, latency/humanDuration, memory layout + ports + link arrows, ArrayStrip range tint, BitStrip exponent labels, CallStackPanel tone, TreeSvg nodeOpacity, narrow-screen scene labels |
| 1 | T1-B2 Logic & the machine | 5 | 2 | t1/b2 | done | merged ac06981 |
| 1 | T1-B6 Web platform | 5 | 2 | t1/b6 | done | merged e21ffaf |
| 1 | T1-B8 Shipping code | 5 | 2 | t1/b8 | done | merged 5c40ed9 |
| 1 | P-follow-up after wave 2 | — | 2→3 | kit owner | done | ligatures off app-wide, superscript glyphs loaded + power(), core/useMeasure, chunkGroups align right, CodePanel renderLine/onLineClick, CommitGraph columns/depthColumns/lane labels/messageFit, ResizablePane scaleToFit, WideRegion, useScenePicker setScene, TruthTable var case + red mismatch values; ColorField declined (one user) |
| 1 | T1-B4 Code flow | 4 | 3 | | not started | |
| 1 | T1-B7 Security & data | 5 | 3 | | not started | |
| 1 | T1-B9 Everyday tools | 5 | 3 | | not started | |
| 1 | T1-B10 Networks & teams | 4 | 3 | | not started | |
| 1 | Re-verify the 14 existing T1 lessons against the tier DoD | 14 | 3 | | not started | |
| 1 | **Tier 1 sign-off** | 62 | — | | not started | |
| 2 | Kickoff: validation, spec, TOPICS, prerequisite components | — | pre | | not started | |
| 2 | Batches T2-B1 … T2-B32 | 158 | 1-8 | | not started | Batches listed at kickoff |
| 2 | **Tier 2 sign-off** | 174 | — | | not started | |
| 3 | Kickoff | — | pre | | not started | |
| 3 | Batches T3-B1 … T3-B31 | 154 | 1-8 | | not started | |
| 3 | **Tier 3 sign-off** | 166 | — | | not started | |
| 4 | Kickoff | — | pre | | not started | |
| 4 | Batches T4-B1 … T4-B8 | 41 | 1-3 | | not started | |
| 4 | **Tier 4 sign-off** | 50 | — | | not started | |

### 4.2 Definition of done for a tier
A tier is done, and the next tier's kickoff may start, only when **all** of these hold on the merged main branch:

1. **Every lesson in the tier exists and is registered.** That means both the new and the existing lessons, all showing as playable on the home page.
2. **Green on the whole repo:**
   - `npm run build`
   - `npm run lint`
   - `npm test`
   - full `npm run smoke` (every lesson, not only this tier's)
   - `npm run captions`, with every flagged run fixed or justified in the sign-off note
   - `npm run check-tokens -- --strict`, with zero findings
3. **Eyeballed.** Someone other than the builder has looked at every lesson's screenshots at desktop and at ≤900px. **`watch` has been checked against the render**, and the honesty notes are visible on screen.
4. **Correctness checks passed.** Every topic-specific check in the tier spec exists as a test and passes. Domain-sensitive lessons (crypto, time, security, ML maths, distributed algorithms) have had a second-reviewer read of the model.
5. **Existing lessons in the tier re-verified.** They pass the same DoD. Fix or ticket anything that falls short; tickets must be closed before sign-off.
6. **Shared code settled.** No open Phase 2 request that the tier's lessons depend on. `docs/shared-api.md` is current. No known third copy of a shared pattern.
7. **Committed and merged.** All batch branches are merged, worktrees removed, and the tracker is updated with the sign-off date.

---

## 5. Settled decisions and open questions

**Open questions that block this plan: none.**

**Settled (coordinator, consistent with the owner's goal):**
1. **Vitest is added** as a dev dependency (P3), and correctness checks are enforced as tests.
2. **"Tier 1 finished and verified" includes re-checking the 14 existing Tier 1 lessons** against the tier DoD, not only the 48 new ones.
3. **Tiers 2-4 topics are registered at each tier's kickoff**, after that tier's validation pass, not now.
4. **`regex-basics`, `data-formats` and `debugger-tools` are in Tier 1** (T1-B9).
5. **Throughput is gated on review quality, not the calendar.** This plan states batch counts only: Tier 1 has 10, Tier 2 ~32, Tier 3 ~31 and Tier 4 ~8.
