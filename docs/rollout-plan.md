# Kinetic second pass: rollout plan

Owner decisions this plan is built on (final): an exhaustive platform, from a 4-year CS degree up to principal-level job knowledge; build tier by tier, with a tier starting only when the previous one is finished and verified; adopt all 7 new tracks (`hw`, `lang`, `math`, `craft`, `web`, `ml`, `lead`).

Input: `docs/curriculum-backlog.md` (406 proposals). Its tiers and ids are treated as proposals and corrected below.

**Headline numbers**

| | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Total |
|---|---:|---:|---:|---:|---:|
| Backlog proposed | 43 | 166 | 155 | 42 | 406 |
| **Validated new lessons** | **48** ✅ | **156** | **155** | **41** | **400** |
| Existing lessons | 14 | 16 | 12 | 9 | 51 |
| Tier total when done | 62 ✅ | 172 | 167 | 50 | 451 |
| Build batches (~5 each) | 10 | 32 + 2 retrofit | ~31 | ~8 | ~83 |

Nine backlog topics are gone: 4 dropped as already covered by an existing lesson, and 5 merged into another topic. Three topics that weren't in the backlog were added to Tier 1 by coordinator decision: `regex-basics`, `data-formats` and `debugger-tools`.

The Tier 2 kickoff (2026-10-01, §3.1) changed the Tier 2 and Tier 3 numbers:
- `comparison-sort-lower-bound` merged into `linear-time-sorting`;
- `wifi-shared-medium` moved up to Tier 3.

---

## 0. How to use this doc

- **Section 1** is the Tier 1 build spec. Hand a builder their batch's topic entries plus **AC-0** (the common acceptance criteria).
- **Section 2** is shared-code work. It must land before any Tier 1 batch starts.
- **Section 3** is Tiers 2-4. **§3.1 is now the Tier 2 build spec** (kickoff done): validation, final list, AC-0/T2, the kickoff kit, the tickets, the retrofit, the batches and waves, and every topic spec. Hand a Tier 2 builder their batch's entries from §3.1.8, plus AC-0 (§1.4) and AC-0/T2 (§3.1.3).
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
1. A validation pass on that tier, the same exercise as §1.1: confirm the moves below, check the existing-lesson overlaps flagged below against the real lesson code, and write full specs into that tier's section of this file (Tier 2 did this in §3.1, so plan, spec and tracker stay together).
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
| merge (T2 kickoff) | `comparison-sort-lower-bound` → **`linear-time-sorting`** | On its own it's one decision tree and one plot; it's the reason the linear sorts matter, so it becomes their first scene. |
| T2 → T3 (T2 kickoff) | `wifi-shared-medium` | Nice-priority radio detail that no Tier 2 or Tier 3 topic depends on; it sits with the T3 networking depth. |
| narrowed (T2 kickoff) | 38 Tier 2 topics | Each draws an explicit line against an existing lesson or a Tier 3 topic; see §3.1.1. The ten overlaps the first pass flagged are all resolved there. |

### 3.1 Tier 2 · Practitioner

Kickoff pass done 2026-10-01 (Atlas). This section is the Tier 2 build spec, to the same standard as §1. Hand a builder their batch's topic entries from §3.1.8, plus **AC-0** (§1.4) and **AC-0/T2** (§3.1.3). The first pass said to write this into `docs/tier-2-spec.md`; it lives here instead, so the plan, the spec and the tracker stay in one file.

**The Tier 2 bar.** What a mid-level engineer (roughly years 1-4) uses or is expected to reason about without help, plus the second-year degree core that Tier 3 builds on. A topic that would have met the Tier 1 bar stays here anyway: Tier 1 is signed off and pushed, and reopening it costs more than placing the topic early in the Tier 2 wave order.

**Headline numbers**

| | Count |
|---|---:|
| Backlog Tier 2 topics | 166 |
| Already moved to Tier 1 in the first pass | −6 |
| Dropped as covered (`nat`, `password-hashing`) | −2 |
| Merged (`git-bisect` → T1, `divide-and-conquer` → `master-theorem`, `comparison-sort-lower-bound` → `linear-time-sorting`) | −3 |
| Moved up to Tier 3 (`wifi-shared-medium`) | −1 |
| Moved in from Tier 1 (`endianness`, `dhcp`) | +2 |
| **Validated new Tier 2 lessons** | **156** |
| Existing Tier 2 lessons (to retrofit, §3.1.6) | 16 |
| **Tier 2 total when done** | **172** |
| Build batches | 32 new + 2 retrofit |
| Waves | 10, plus a kickoff kit round |

| Track | hw | os | lang | math | dsa | net | arch | data | sec | ops | craft | web | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| New lessons | 9 | 13 | 14 | 15 | 17 | 13 | 11 | 8 | 11 | 9 | 11 | 15 | 7 | 3 |

The first-pass estimate was 158; the two extra changes are one merge and one move to Tier 3 (below).

#### 3.1.1 Validation of the 166 backlog Tier 2 topics

"Narrowed" means the topic stays but its spec draws an explicit line against an existing lesson or a Tier 3 topic; the line is repeated as **Out of scope** in the topic's spec. Overlaps were checked against the real lesson code, not the lesson titles.

| id | Verdict | Reason |
|---|---|---|
| **hw** | | |
| `bit-manipulation` | keep | Masks, flags and shifts are daily mid-level code, and varints and ID layouts build on them. |
| `endianness` | keep (from T1) | Binary formats and protocols are mid-level work; it sits next to `bit-manipulation`. |
| `adders-alu` | keep | The degree bridge from `logic-gates` to the ALU, and where carries (and so overflow) come from. |
| `sequential-logic` | keep | State out of gates; closes the hardware chain Tier 1 started. |
| `cpu-pipelining` | keep, narrowed | Hazards, stalls and forwarding. Branch prediction stays in T3 `branch-prediction`. |
| `cpu-caches` | keep, narrowed | Lines, sets and locality. Coherence and false sharing stay in T3 `cache-coherence`. |
| `isa-assembly` | keep | Reading disassembly is perf and debugging work. It uses a documented subset of a real ISA, unlike T1's toy machine. |
| `calling-conventions` | keep | Stack traces, frames and the ABI; `memory-safety-bugs` builds on its frame layout. |
| `storage-devices` | keep | Explains why sequential I/O, B-trees, LSM trees and WALs look the way they do. |
| **os** | | |
| `virtual-memory-paging` | keep, narrowed | A single-level page table and page faults. The TLB and multi-level tables stay in T3 `page-tables-tlb`. |
| `cpu-scheduling` | keep | `processes-threads` only says threads are time-sliced; the algorithms and their metrics are new. |
| `syscalls-kernel-mode` | keep, narrowed | The trap and its cost. Blocking vs non-blocking vs async I/O stays in T3 `io-models`. |
| `interrupts-context-switch` | keep, narrowed | `processes-threads` says "the scheduler switches"; this shows the interrupt, the saved context and the cost. |
| `signals-graceful-shutdown` | keep | Deploys and autoscalers kill processes all day; nothing covers it. |
| `file-systems` | keep | Inodes, links, journaling and fsync. mmap and the page cache stay in T3. |
| `deadlocks` | keep, narrowed | `race-conditions` already shows the two-lock deadlock and the lock-order fix. This covers the four conditions, N-party cycles, detection, and the database killing a victim. |
| `semaphores-condition-variables` | keep, narrowed | `race-conditions` has mutexes only. This adds waiting and signalling, and the bounded buffer. |
| `amdahls-law` | keep | No overlap. |
| `profiling-flame-graphs` | keep | No overlap. |
| `virtualization-hypervisors` | keep, narrowed | `containers` already compares a VM with a container. This covers trap-and-emulate, hardware assist and type 1 vs type 2. |
| `file-descriptors` | keep, narrowed | `command-line` owns the redirection syntax. This owns the per-process FD table, fork/dup2, leaks and limits. |
| `boot-process` | keep | Nice-priority but cheap, and images, VMs and cold starts all refer back to it. |
| **lang** | | |
| `functional-programming` | → T1 | Built in Tier 1. |
| `error-handling-models` | → T1 | Built in Tier 1. |
| `type-systems` | keep, narrowed | Static vs dynamic and inference by unification on an AST. Generics and null get their own lessons. |
| `interpreters-compilers-jit` | keep, narrowed | The three strategies and warm-up. Bytecode VM internals stay in T3 `bytecode-vms`. |
| `lexing-tokens` | keep | The first stage of every compiler, linter and formatter. |
| `grammars-parsing` | keep | CFGs, derivations and ambiguity. Comes before `parsing-ast`. |
| `parsing-ast` | keep, narrowed | Recursive descent and precedence. LL vs LR stays in T3 `parsing-algorithms`. |
| `dfa-nfa` | keep | Lexers, protocol parsers and UI state machines are automata. Regex engine internals stay in T3. |
| `p-vs-np` | keep | Per the backlog tier note: recognising NP-hard problems early is a mid-level skill. |
| `linking-loading` | keep | Undefined symbols and shared libraries. |
| `garbage-collection` | keep, narrowed | Tracing GC (mark-sweep, generations). Reference counting and ownership stay in T3. |
| `memory-leaks` | keep | Leaks in managed runtimes are a classic slow-burn outage. |
| `generics-polymorphism` | keep | Daily in every typed language. |
| `async-await-coroutines` | keep, narrowed | `event-loop` already shows an await continuing as a microtask. This covers sequential vs parallel awaits, the combinators, unhandled rejections, and the coroutine as a state machine. |
| `iterators-generators` | keep | Lazy pipelines; distinct from `functional-programming`'s eager arrays. |
| `null-option-adts` | keep | Null crashes and sum types. |
| **math** | | |
| `predicate-logic` | keep | Quantifier order underlies specs, `EXISTS` and types. Nice-priority but small. |
| `proof-techniques` | keep | Must be manipulable: the learner picks each step (see spec). |
| `induction-invariants` | keep | Loop invariants are how you reason about loops. |
| `relations-orders` | keep, renamed | `sets-functions` dropped "Relations" from its title in Tier 1, so this lesson now owns relations. |
| `combinatorics` | keep | Search-space and test-case explosion. |
| `birthday-paradox` | keep | Collision odds for IDs and short hashes. |
| `modular-arithmetic` | keep | Root of the crypto chain. |
| `gcd-euclid` | keep | Modular inverses for RSA. |
| `primes-factoring` | keep | The asymmetry RSA rests on. |
| `probability-basics` | keep | Failure rates, redundancy, flaky tests. |
| `conditional-bayes` | keep | Base rates in alerting and detection. |
| `expected-value` | keep, narrowed | Mean and variance only. Distributions and percentiles stay in T3. |
| `vectors-similarity` | keep, narrowed | 2D vectors and cosine. ANN indexes stay in T3 `vector-search`. |
| `matrices-transformations` | keep, narrowed | 2D and homogeneous 3×3. 3D projection stays in T3. |
| `error-detection-correction` | keep | Parity, CRC and Hamming. |
| **dsa** | | |
| `cycle-detection` | keep | O(1)-space cycle finding; `arrays-linked-lists` has no cycles. |
| `amortized-analysis` | keep | `arrays-linked-lists` only mentions doubling in a hint, and `hash-table` resizes without ever accounting the cost. |
| `master-theorem` | keep, absorbs `divide-and-conquer` | Decided in the first pass. |
| `divide-and-conquer` | merge → `master-theorem` | Decided in the first pass. |
| `greedy-algorithms` | keep | `dynamic-programming` has no greedy counterexamples. |
| `huffman-coding` | keep | |
| `backtracking` | keep | |
| `linear-time-sorting` | keep, absorbs the lower bound | |
| `comparison-sort-lower-bound` | **merge → `linear-time-sorting`** | Alone it's one decision tree and one plot. It's the reason the linear sorts are interesting, so it becomes that lesson's first scene. |
| `quickselect` | keep | |
| `monotonic-stack` | keep | |
| `tries` | keep | |
| `union-find` | keep | |
| `topological-sort` | keep | |
| `minimum-spanning-trees` | keep | |
| `rolling-hash` | keep, narrowed | KMP stays in T3 `kmp`. |
| `edit-distance` | keep, narrowed | `dynamic-programming` already fills an LCS grid with traceback. This lesson does Levenshtein's three operations, replays the alignment as edits, and does a line diff. |
| `shuffle-reservoir` | keep | |
| `ring-buffers` | keep | `stack-queue` has no circular buffer. |
| **net** | | |
| `dns-resolution` | keep, narrowed | `web-request` already walks root → TLD → authoritative. This covers record types, resolver caching, TTLs and stale answers after a change. |
| `subnetting-cidr` | keep, narrowed | Generic CIDR maths. VPC design stays in T3 `cloud-networking-vpc`. |
| `nat` | drop, covered | Decided in the first pass (`ip-ports`). |
| `ethernet-arp` | keep | Chain: `dhcp` → `ethernet-arp`. |
| `dhcp` | keep (from T1) | |
| `wifi-shared-medium` | **→ T3** | Nice-priority radio detail. No Tier 2 or Tier 3 topic depends on it, and it belongs with the T3 networking depth (routing, BGP). |
| `http-versions` | keep, narrowed | Head-of-line blocking and multiplexing. The QUIC handshake and 0-RTT stay in T3 `quic`. |
| `realtime-transports` | keep | |
| `http-caching` | keep, narrowed | `cdn-edge` owns edges, TTLs and shields. This owns `Cache-Control`, validators (ETag, 304), private vs shared caches and `Vary`. |
| `grpc-protobuf` | keep, narrowed | Wire format and streaming. Compatibility rules stay in T3 `schema-evolution`, apart from one key idea. |
| `sockets-api` | keep | |
| `latency-bandwidth` | keep, narrowed | Bandwidth-delay product and windows. Congestion-control algorithms stay in T3. |
| `ipv6` | keep | |
| `firewalls-packet-filtering` | keep | Cloud security groups stay in T3. |
| `packet-capture-debugging` | keep | |
| **arch** | | |
| `rest-api-design` | keep, narrowed | `http-basics` owns methods and status codes, `client-server` owns the breaking change. This is resource modelling. Versioning stays in T3 `api-versioning`. |
| `graphql` | keep, narrowed | Owns query shape, resolvers and cost limits. The N+1 mechanics live in `orm-n-plus-one`, built in the same wave. |
| `pagination` | keep | |
| `idempotency-keys` | keep | `circuit-breakers` covers retry load, not duplicate side effects. |
| `webhooks` | keep | Signature checks build on `macs-hmac`. |
| `caching-patterns` | keep, narrowed | `lru-cache` owns eviction. This owns write strategies and invalidation. Stampede mitigation stays in T3 `cache-stampede`. |
| `reverse-proxy-gateway` | keep | `load-balancing` covers balancing only. |
| `layered-hexagonal` | keep | |
| `distributed-id-generation` | keep | |
| `timeouts-deadlines` | keep, narrowed | `circuit-breakers` shows one timeout freeing the caller. This covers layered timeouts and deadline propagation across hops. |
| `poison-messages-dlq` | keep, narrowed | `message-queues` already moves repeat failures to a DLQ. This covers why one message blocks an ordered partition, telling poison from transient failures, retry policy and redrive. |
| **data** | | |
| `relational-algebra` | keep | `sql-basics` is SQL; this is the algebra and its set semantics. Physical join algorithms stay in T3. |
| `normalization` | keep | Denormalization in depth stays in T3 `materialized-views-denormalization`. |
| `sql-aggregation-windows` | keep | `sql-basics` does one GROUP BY; window functions are new. |
| `nosql-data-models` | keep | |
| `connection-pooling` | keep | |
| `object-storage` | keep | |
| `optimistic-pessimistic-locking` | keep, narrowed | `transactions-acid` owns atomicity and T3 `isolation-levels` owns the anomalies. This owns application-level lost updates: version columns, `SELECT … FOR UPDATE`, `If-Match`. |
| `orm-n-plus-one` | keep | |
| **sec** | | |
| `password-hashing` | drop, covered | Decided in the first pass (`hashing-encryption`). |
| `cors-same-origin` | → T1 | Built in Tier 1. |
| `secrets-management` | → T1 | Built in Tier 1. Vaults and short-lived credentials move into `iam-least-privilege`. |
| `symmetric-ciphers` | keep, narrowed | `hashing-encryption` shows AES encrypting and decrypting. This covers block modes, IVs and authenticated encryption. |
| `macs-hmac` | keep | |
| `diffie-hellman` | keep, narrowed | `tls-handshake` says DH happens. This shows the arithmetic (toy numbers) and a real ECDH. |
| `rsa` | keep | Per the backlog tier note. Toy keys, labelled as toys. |
| `digital-signatures-pki` | keep, narrowed | `tls-handshake` shows one chain verifying. This owns sign/verify and every way chain validation fails. |
| `xss` | keep, **payload-free re-spec** | The backlog visual steals a cookie with a script. Re-scoped to contexts, sinks and defences. |
| `csrf-cookies` | keep, payload-free | `browser-storage` owns the SameSite send matrix; this owns forged requests and their defences. |
| `memory-safety-bugs` | keep, **payload-free re-spec** | No shellcode and no exploit steps. Overflow and use-after-free are shown as corrupted state, and the defences are toggles. |
| `mfa-passkeys` | keep | |
| `iam-least-privilege` | keep, expanded | Absorbs the vault and short-lived-credential follow-up from T1 `secrets-management`. |
| `deserialization-path-traversal` | keep, **payload-free re-spec**, renamed | Uses a fictional file tree and benign names. No system files and no gadget chains. |
| **ops** | | |
| `git-bisect` | merge → T1 | Built inside `debugging-method`. |
| `deployment-strategies` | keep | |
| `feature-flags` | keep | Experiment statistics stay in T3 `hypothesis-testing-ab`. |
| `serverless-cold-starts` | keep, absorbs `cloud-compute-primitives` | Decided in the first pass; renamed. |
| `infrastructure-as-code` | keep | GitOps stays in T3. |
| `kubernetes-basics` | keep | `containers` owns images and isolation. |
| `structured-logging` | keep, narrowed | `observability` owns metrics and traces. This owns log fields, levels and correlation IDs. |
| `health-checks` | keep, narrowed | `load-balancing` only shows a health check removing a dead server. This owns liveness vs readiness vs startup probes and restart storms. |
| `resource-exhaustion` | keep | The integrator; built last so it can point at `file-descriptors`, `connection-pooling` and `memory-leaks`. |
| `cert-lifecycle` | keep | |
| **craft** | | |
| `code-review` | → T1 | Built in Tier 1. |
| `dependency-management` | → T1 | Built in Tier 1. |
| `test-doubles` | keep | |
| `tdd` | keep | Property-based testing stays in T3. |
| `flaky-tests` | keep | |
| `solid-principles` | keep | The D is shown briefly and handed to `dependency-injection`. |
| `creational-structural-patterns` | keep | |
| `behavioral-patterns` | keep | |
| `coupling-cohesion` | keep | |
| `dependency-injection` | keep | |
| `refactoring-code-smells` | keep | Technical-debt strategy stays in T3. |
| `build-systems` | keep | |
| `architecture-diagrams-c4` | keep | Design docs stay in T3. |
| **web** | | |
| all 15 | keep | `rasterization` is narrowed to 2D triangles; the GPU pipeline stays in T3. |
| **ml** | | |
| all 7 | keep | `embeddings` is narrowed to brute-force nearest neighbours; ANN indexes stay in T3 `vector-search`. |
| **lead** | | |
| all 3 | keep | `computing-ethics` pilots the scenario grammar locally (see §3.1.9). |

**No moves down.** Nothing in the Tier 2 list clears the Tier 1 bar by enough to justify reopening a signed-off tier. The day-one candidates (`dns-resolution`, `rest-api-design`, `test-doubles`) were rejected for Tier 1 in the first pass, and still are.

**No moves up into Tier 2 from Tier 3.** Two Tier 3 topics overlap a Tier 2 visual and are fenced off instead: `cache-stampede` (fenced from `caching-patterns`) and `api-versioning` (from `rest-api-design`).

#### 3.1.2 Tier 2 final list: 156 topics

Titles and taglines are final; P0 registers them exactly as written (K-1). Minutes are left unset, as in Tier 1.

| id | Track | Title | Tagline | Batch |
|---|---|---|---|---|
| `bit-manipulation` | hw | Bitwise Operations & Bit Masks | AND, OR, XOR, shift: tiny ops, huge leverage | B1 |
| `endianness` | hw | Endianness & Byte Order | Which end of the number comes first? | B1 |
| `adders-alu` | hw | From Gates to Adders & the ALU | Addition is XOR with a memory for carries | B1 |
| `sequential-logic` | hw | Flip-Flops, Registers & Clocks | How circuits remember | B1 |
| `cpu-pipelining` | hw | Pipelining & Hazards | An assembly line for instructions | B10 |
| `cpu-caches` | hw | CPU Caches, Cache Lines & Locality | Access memory the way the hardware wants | B10 |
| `isa-assembly` | hw | Instruction Sets & Assembly | What your code turns into | B10 |
| `calling-conventions` | hw | Calling Conventions & Stack Frames | How a function call really works | B10 |
| `storage-devices` | hw | How Disks Work: HDD, SSD & NVMe | Random I/O is the expensive kind | B19 |
| `syscalls-kernel-mode` | os | System Calls & Kernel Mode | Crossing into the kernel | B4 |
| `interrupts-context-switch` | os | Interrupts & Context Switches | How the OS takes the CPU back | B4 |
| `cpu-scheduling` | os | CPU Scheduling Algorithms | Who runs next: FIFO, round robin, MLFQ | B4 |
| `virtual-memory-paging` | os | Virtual Memory & Paging | Every process thinks it owns RAM | B4 |
| `file-descriptors` | os | File Descriptors & Everything-Is-a-File | The integer behind every socket | B4 |
| `deadlocks` | os | Deadlocks: Conditions & Prevention | Four conditions, one frozen system | B16 |
| `semaphores-condition-variables` | os | Semaphores, Condition Variables & Monitors | Waiting without spinning | B16 |
| `amdahls-law` | os | Amdahl's & Gustafson's Laws | Why 64 cores isn't 64× faster | B16 |
| `profiling-flame-graphs` | os | Profiling & Flame Graphs | Measure before you optimise | B16 |
| `virtualization-hypervisors` | os | Virtualization & Hypervisors | Computers inside computers | B19 |
| `boot-process` | os | How a Computer Boots | From power button to login | B19 |
| `file-systems` | os | File Systems: Inodes & Journaling | How files survive a power cut | B19 |
| `signals-graceful-shutdown` | os | Signals & Graceful Shutdown | SIGTERM is a request, SIGKILL is not | B19 |
| `dfa-nfa` | lang | Finite Automata (DFA & NFA) | Machines with no memory but a lot of opinions | B5 |
| `lexing-tokens` | lang | Lexing: Source to Tokens | Chopping code into words | B5 |
| `grammars-parsing` | lang | Context-Free Grammars & Parse Trees | Why you can't parse HTML with regex | B5 |
| `parsing-ast` | lang | Parsing & Abstract Syntax Trees | Grammar in, tree out | B5 |
| `type-systems` | lang | Type Systems: Static, Dynamic & Inference | Catching bugs before they run | B5 |
| `p-vs-np` | lang | P, NP & NP-Completeness | Easy to check vs easy to solve | B15 |
| `interpreters-compilers-jit` | lang | Interpreters vs Compilers vs JIT | Three ways to run code | B18 |
| `linking-loading` | lang | Compiling, Linking & Loading | From .c to a running process | B18 |
| `garbage-collection` | lang | Garbage Collection: Mark-Sweep & Generations | Who frees the memory you forgot about | B18 |
| `memory-leaks` | lang | Memory Leaks in Managed Languages | Garbage collected doesn't mean leak-proof | B18 |
| `async-await-coroutines` | lang | Promises, async/await & Coroutines | Suspending without blocking | B18 |
| `generics-polymorphism` | lang | Generics & Parametric Polymorphism | One function, many types | B20 |
| `null-option-adts` | lang | Null, Option Types & Algebraic Data Types | The billion-dollar mistake, fixed | B20 |
| `iterators-generators` | lang | Iterators, Generators & Laziness | Values on demand | B20 |
| `error-detection-correction` | math | Error Detection & Correction: Parity, CRC & Hamming | Catch the flipped bit, then fix it | B1 |
| `modular-arithmetic` | math | Modular Arithmetic | Clock maths that runs the internet | B2 |
| `gcd-euclid` | math | GCD & the Euclidean Algorithm | The oldest algorithm still in production | B2 |
| `primes-factoring` | math | Primes, Sieves & Factoring | Easy to multiply, brutally hard to undo | B2 |
| `combinatorics` | math | Counting: Permutations & Combinations | How many ways? More than you think | B2 |
| `birthday-paradox` | math | Pigeonhole & the Birthday Paradox | 23 people, a 50% chance of a shared birthday | B2 |
| `relations-orders` | math | Relations, Equivalence Classes & Partial Orders | Ordering things that can't all be ordered | B3 |
| `probability-basics` | math | Probability Fundamentals | Sample spaces, events and the odds of failure | B7 |
| `conditional-bayes` | math | Conditional Probability & Bayes' Theorem | 99% accurate test, 50% chance you're fine | B7 |
| `expected-value` | math | Random Variables & Expected Value | What happens on average, and how far off it can be | B7 |
| `vectors-similarity` | math | Vectors, Dot Products & Cosine Similarity | How search engines measure "close enough" | B8 |
| `matrices-transformations` | math | Matrices as Transformations | A matrix is a function that bends space | B8 |
| `predicate-logic` | math | Predicates & Quantifiers | For all, there exists, and the order matters | B15 |
| `proof-techniques` | math | Proof Techniques | Direct, contrapositive, contradiction: pick your weapon | B15 |
| `induction-invariants` | math | Induction & Loop Invariants | Knock over the first domino, prove the rest fall | B15 |
| `topological-sort` | dsa | Topological Sort & DAGs | Build order for anything with dependencies | B3 |
| `union-find` | dsa | Union-Find (Disjoint Sets) | Who's connected, in nearly O(1) | B3 |
| `minimum-spanning-trees` | dsa | Minimum Spanning Trees (Kruskal & Prim) | Connect everything for the least cost | B3 |
| `cycle-detection` | dsa | Fast & Slow Pointers (Floyd's Cycle Detection) | The tortoise always catches the hare | B3 |
| `shuffle-reservoir` | dsa | Fisher-Yates Shuffle & Reservoir Sampling | Fair randomness in one pass | B7 |
| `greedy-algorithms` | dsa | Greedy Algorithms & When They Fail | Take the best now, and prove it's safe | B11 |
| `huffman-coding` | dsa | Huffman Coding | Short codes for common symbols | B11 |
| `backtracking` | dsa | Backtracking | Try, recurse, undo | B11 |
| `amortized-analysis` | dsa | Amortized Analysis & Dynamic Arrays | Why append is O(1) even when it isn't | B11 |
| `monotonic-stack` | dsa | Monotonic Stacks & Queues | Next greater element in one pass | B11 |
| `linear-time-sorting` | dsa | The Sorting Lower Bound & Linear-Time Sorts | Beating n log n by not comparing | B14 |
| `quickselect` | dsa | Quickselect & Order Statistics | Find the k-th without sorting everything | B14 |
| `rolling-hash` | dsa | Rolling Hash & Rabin-Karp | Slide a fingerprint, not the whole string | B14 |
| `edit-distance` | dsa | Edit Distance & Diffs | How many edits from kitten to sitting? | B14 |
| `tries` | dsa | Tries & Prefix Trees | Autocomplete's secret weapon | B14 |
| `master-theorem` | dsa | Divide & Conquer and the Master Theorem | Solve T(n) = aT(n/b) + f(n) by drawing a tree | B15 |
| `ring-buffers` | dsa | Ring Buffers | A queue that eats its tail | B16 |
| `subnetting-cidr` | net | Subnets & CIDR | What /24 actually means | B6 |
| `ipv6` | net | IPv6 | Addresses for everything | B6 |
| `ethernet-arp` | net | Ethernet, MAC Addresses & ARP | Who has 10.0.0.1? | B6 |
| `dhcp` | net | DHCP: Getting an Address | Discover, offer, request, acknowledge | B6 |
| `dns-resolution` | net | DNS Resolution, Records & TTLs | It's always DNS | B6 |
| `sockets-api` | net | Sockets: bind, listen, accept, connect | The API under every server | B17 |
| `latency-bandwidth` | net | Latency, Bandwidth & the Bandwidth-Delay Product | A fat pipe can still be slow | B17 |
| `firewalls-packet-filtering` | net | Firewalls & Packet Filtering | Rules at the gate | B17 |
| `packet-capture-debugging` | net | Network Debugging: tcpdump, Wireshark & traceroute | See what's actually on the wire | B17 |
| `http-versions` | net | HTTP/1.1 vs HTTP/2 vs HTTP/3 | From one lane to multiplexed streams | B24 |
| `http-caching` | net | HTTP Caching: Cache-Control & ETags | The fastest request is the one you never send | B24 |
| `realtime-transports` | net | Polling, Long-Polling, SSE & WebSockets | Four ways to make the server talk first | B24 |
| `grpc-protobuf` | net | gRPC & Protocol Buffers | Typed contracts, binary wire, HTTP/2 streams | B24 |
| `reverse-proxy-gateway` | arch | Reverse Proxies & API Gateways | One front door for many services | B17 |
| `layered-hexagonal` | arch | Layered & Hexagonal Architecture | Keep the business logic away from the plumbing | B22 |
| `graphql` | arch | GraphQL: Queries, Resolvers & Cost | Ask for exactly what you need, then pay for it | B24 |
| `rest-api-design` | arch | REST Resource Design | Nouns, verbs and status codes that mean something | B25 |
| `pagination` | arch | Offset vs Cursor Pagination | Page 10,000 shouldn't cost 10,000 pages | B25 |
| `idempotency-keys` | arch | Idempotency Keys & Safe Retries | Charge the card once, however many clicks | B25 |
| `webhooks` | arch | Webhooks & Event Delivery | Don't call us, we'll call you | B25 |
| `timeouts-deadlines` | arch | Timeouts & Deadline Propagation | How long is too long? | B26 |
| `poison-messages-dlq` | arch | Poison Messages, Retries & Dead-Letter Queues | One bad message, whole queue stuck | B26 |
| `caching-patterns` | arch | Caching Patterns & Invalidation | There are only two hard things | B26 |
| `distributed-id-generation` | arch | Unique ID Generation: UUIDs, Snowflake & ULIDs | Unique without coordination | B26 |
| `relational-algebra` | data | The Relational Model & Algebra | SQL is set maths | B23 |
| `normalization` | data | Normalization & Normal Forms | Store each fact once | B23 |
| `sql-aggregation-windows` | data | GROUP BY, Aggregates & Window Functions | Collapse rows, or peek at their neighbours | B23 |
| `nosql-data-models` | data | NoSQL Data Models: Document, Key-Value, Wide-Column & Graph | Shape the data like the queries | B23 |
| `orm-n-plus-one` | data | ORMs & the N+1 Query Problem | One query became a thousand | B23 |
| `optimistic-pessimistic-locking` | data | Optimistic vs Pessimistic Locking | Ask forgiveness or permission | B25 |
| `connection-pooling` | data | Connection Pooling | Opening a connection is the slow part | B26 |
| `object-storage` | data | Object Storage vs Block vs File | Flat keys, big buckets, different rules | B27 |
| `symmetric-ciphers` | sec | Symmetric Ciphers & Block Modes | Why ECB mode leaks the picture | B9 |
| `macs-hmac` | sec | MACs & HMAC | A checksum only the keyholder can make | B9 |
| `diffie-hellman` | sec | Diffie-Hellman Key Exchange | Agree on a secret while everyone's listening | B9 |
| `rsa` | sec | RSA & Public-Key Cryptography | A lock anyone can close but only you can open | B9 |
| `digital-signatures-pki` | sec | Digital Signatures & Certificate Chains | Proving who said it, and who vouches for them | B9 |
| `memory-safety-bugs` | sec | Memory Safety: Overflows & Use-After-Free | When a write lands somewhere it shouldn't | B10 |
| `xss` | sec | Cross-Site Scripting (XSS) & Content Security Policy | Your page, their script | B28 |
| `csrf-cookies` | sec | CSRF & SameSite Cookies | Your browser, their form | B28 |
| `mfa-passkeys` | sec | MFA, TOTP & Passkeys | Something you know, have, or are | B28 |
| `iam-least-privilege` | sec | Cloud IAM, Least Privilege & Short-Lived Credentials | Grant the minimum, for the shortest time | B28 |
| `deserialization-path-traversal` | sec | Path Traversal & Insecure Deserialization | When input picks the file, or the type | B28 |
| `serverless-cold-starts` | ops | Serverless & the Compute Spectrum | Pay per request, wait on the first one | B27 |
| `infrastructure-as-code` | ops | Infrastructure as Code: Plan & Apply | Declare the world you want; let the tool diff it | B27 |
| `kubernetes-basics` | ops | Kubernetes: Pods, Deployments & Services | Declare desired state; controllers make it so | B27 |
| `health-checks` | ops | Health Checks: Liveness vs Readiness | Alive isn't the same as ready | B27 |
| `deployment-strategies` | ops | Rolling, Blue-Green & Canary Deploys | Ship to 1% before you ship to everyone | B31 |
| `feature-flags` | ops | Feature Flags & Progressive Delivery | Deploy is not release | B31 |
| `structured-logging` | ops | Structured Logging & Correlation IDs | Logs are data, so make them queryable | B31 |
| `cert-lifecycle` | ops | Certificate Lifecycle & Expiry | The outage scheduled a year ago | B31 |
| `resource-exhaustion` | ops | Resource Exhaustion: Disk, FDs, Connections & Memory | The limits you forgot existed | B31 |
| `test-doubles` | craft | Mocks, Stubs, Fakes & Spies | Swap real dependencies for stand-ins you control | B21 |
| `tdd` | craft | Test-Driven Development | Red, green, refactor. Repeat | B21 |
| `flaky-tests` | craft | Flaky Tests & Determinism | A test that sometimes fails is a test nobody trusts | B21 |
| `refactoring-code-smells` | craft | Refactoring & Code Smells | Change the structure, never the behaviour | B21 |
| `build-systems` | craft | Build Systems & Incremental Builds | Rebuild only what changed | B21 |
| `creational-structural-patterns` | craft | Design Patterns: Factory, Builder, Adapter, Decorator | Named solutions for making and composing objects | B20 |
| `behavioral-patterns` | craft | Design Patterns: Strategy, Observer, Command, State | Patterns for how objects talk and behave | B20 |
| `coupling-cohesion` | craft | Coupling & Cohesion | Things that change together should live together | B22 |
| `solid-principles` | craft | SOLID Principles | Five rules for code that bends instead of breaks | B22 |
| `dependency-injection` | craft | Dependency Injection & Inversion of Control | Don't build your dependencies. Ask for them | B22 |
| `architecture-diagrams-c4` | craft | Architecture Diagrams & the C4 Model | Zoom levels for systems | B22 |
| `usability-laws` | web | Usability Laws: Fitts & Hick | Big, close, and few choices | B12 |
| `rasterization` | web | Rasterization & Pixels | Triangles become pixels | B13 |
| `bezier-interpolation` | web | Bézier Curves, Easing & Interpolation | The maths of smooth motion | B13 |
| `color-spaces` | web | Color Spaces, Gamma & Color Models | Why your gradient looks muddy | B13 |
| `game-loop` | web | The Game Loop & Fixed Timesteps | Update, render, repeat | B13 |
| `browser-rendering-pipeline` | web | How Browsers Render a Page | Parse, style, layout, paint, composite | B29 |
| `critical-rendering-path` | web | Critical Rendering Path & Resource Loading | What blocks the first pixel | B29 |
| `core-web-vitals` | web | Core Web Vitals: LCP, INP & CLS | Speed as users actually feel it | B29 |
| `bundlers-code-splitting` | web | Bundlers, Tree Shaking & Code Splitting | Shipping less JavaScript | B29 |
| `rendering-strategies` | web | CSR vs SSR vs SSG & Hydration | Where the HTML is made, and when | B29 |
| `virtual-dom-reconciliation` | web | Virtual DOM, Reconciliation & Keys | Describe the UI; let the framework diff it | B30 |
| `frontend-state-management` | web | Frontend State: Stores, Signals & Server State | Who owns this data? | B30 |
| `mobile-app-lifecycle` | web | Mobile App Lifecycle & Constraints | The OS can kill your app at any moment | B30 |
| `i18n-l10n` | web | Internationalization & Localization | Your app, in every language | B30 |
| `usability-testing` | web | User Research & Usability Testing | Watch users, not opinions | B30 |
| `gradient-descent` | ml | Gradient Descent | Roll downhill until you can't | B8 |
| `linear-logistic-regression` | ml | Linear & Logistic Regression | Fitting a line, then a probability | B8 |
| `supervised-learning` | ml | Supervised Learning: Fitting, Overfitting & Validation | Memorising isn't learning | B8 |
| `classification-metrics` | ml | Precision, Recall & ROC Curves | Accuracy is the wrong question | B7 |
| `decision-trees-ensembles` | ml | Decision Trees, Random Forests & Boosting | Twenty questions, learned | B12 |
| `clustering-kmeans` | ml | Unsupervised Learning & k-Means Clustering | Finding groups without labels | B12 |
| `embeddings` | ml | Embeddings | Meaning as a point in space | B12 |
| `software-licensing` | lead | Open Source Licensing: MIT, Apache & GPL | What you're allowed to ship | B32 |
| `computing-ethics` | lead | Ethics & Professional Responsibility | Just because you can | B32 |
| `technical-writing` | lead | Technical Writing & Communicating Trade-offs | Clear writing is clear thinking | B32 |

#### 3.1.3 AC-0/T2: what every Tier 2 lesson adds on top of AC-0

AC-0 (§1.4) still applies in full. These rules come straight from what went wrong in Tier 1 (`docs/qa-tier1-report.md`, `docs/qa-tier1-recheck.md`); each names the finding it prevents. Reviewers check them per lesson; K-2 automates the mechanical ones.

1. **Verdicts are computed from what's on screen, never from which preset was loaded.** A caption that judges a result ("sorted", "cycle found", "fits exactly", "safe") calls a pure function over the current state, and that function has a test. Editing a preset must never leave a preset-specific claim behind. *(M-1 tree-traversals, M-2 test-pyramid, Tier 1 minor 4 floating-point.)*
2. **Captions are true at every step, in every combination.** When a scene has two or more option dimensions with fewer than ~40 combinations in total, the frame-builder test walks the full cross product and asserts each final caption. A preset change, Reset or toggle clears or replaces every caption it makes untrue. Recorder scripts end with `close()`, never by overwriting the last step. *(M-3 error-handling-models, N-2 char-encoding, minors 10, 21, 33, 36.)*
3. **Every number on screen comes from the model.** No hand-typed result values in captions or stats. Illustrative inputs (latencies, rates, prices) are named constants and labelled "illustrative" on screen. Bars and charts are to scale, or say "not to scale". *(T-3 web-request, minor 59 hashing-encryption, minor 7 memory-hierarchy.)*
4. **A claim like "checked against X" or "matches real Y" is true for every input the learner can type**, not just the presets. If the model handles a subset, inputs outside it get "not modelled here" and are never counted as a success. *(M-4/N-1 injection-attacks, minor 20 command-line, minor 16 debugger-tools.)*
5. **Hostile input is defined behaviour.** Every learner-editable field states what happens for empty, whitespace, a 23-digit number, `-1`, `1e400`, emoji, markup and a comma-separated list with a gap: it is either accepted and modelled, or refused with a visible message while the previous valid state is kept. Never silently coerce (empty → 0). Parsing uses `core/parse` or a tested lesson parser. *(Tier 1 minor 29 two-pointers, 4 floating-point.)*
6. **Quiz.**
   - At least one question targets the topic's main misconception (given per topic).
   - Every option is within 0.75-1.35× the mean length of the others, and the correct option is strictly the longest in at most half a lesson's questions (K-2 enforces both).
   - No option points at another ("both of the above"). Distractors aren't all absolutes ("only", "never", "always") against one hedged answer. The correct option doesn't uniquely echo words from the question.
   - Every distractor is unambiguously wrong for the question as written, and the `why` says why the most tempting one is wrong.
   - Numeric answers and `why`s are recomputed in a test where they come from the lesson's model.
   *(T-1, N-8, the quiz review's 10 minors and 11 cosmetics.)*
7. **Colours follow CLAUDE.md's colour-meaning table.** A category never wears `--bad` or `--ok`, a second kind of failure takes `--orange`, and pink (`--pink`) and fuchsia never sit next to `--bad` as a lane colour. `watch` names every colour and shape the render shows, including legend chips, outlines and focus rings, and nothing it doesn't. *(T-9, minors 8, 30, 47, 56, C4, C7.)*
8. **Honesty is on screen, not in the summary.** Each spec's **Honesty** line is the minimum. Anything scripted, seeded, simulated, simplified, a toy parameter or not to scale says so in the stage or the caption at the moment it matters.
9. **Security lessons are payload-free** (the Tier 1 injection-attacks rule, now CLAUDE.md law via K-5). Teach the risk in plain words and the fix concretely. No working attack strings, exploit steps, exfiltration snippets, shellcode, gadget chains, phishing kits or bypass recipes, not even "harmless" ones. Benign inputs that happen to break naive code (O'Brien, `5 > 3 & 2 < 4`, a file name containing `..`) are fine and preferred. Fake credentials are built at runtime (`fakeSecret`), never as source literals, and K-3 scans for them.
10. **Phones and every frame.** The **Phone** line in each spec is binding. Smoke only shoots the default scene, so the builder runs `npm run smoke -- --mobile` and also looks at 390px and 768px screenshots of **every scene at its first, middle and last frame** (`smoke --frames`). No element leaves the stage, no scene text is under 8px, and a sideways scroller's swipe hint never covers teaching content (K-4). *(M-5 hashing-encryption, N-3 ci-pipelines, C12, C14.)*
11. **Keyboard and assistive tech.**
    - Every pointer interaction (drag, click-to-add, click-a-node) has a keyboard path.
    - Removing the focused thing moves focus somewhere sensible, never to `<body>`.
    - A visual with more than ~10 clickable items uses a roving tabindex (one tab stop, arrow keys inside), so the quiz stays within ~40 Tabs of the stage.
    - Live regions are mounted before they speak.
    - Dim chips use `--muted` text.
    *(Tier 1 minor 27, N-4, N-5, N-6.)*
12. **Domain review.** Lessons marked **[domain review]** in their spec (crypto, security, ML maths, time, distributed behaviour, kernel behaviour) get a second-reviewer read of the model and its tests before the batch is accepted, not only at tier sign-off (§4.2 item 4).
13. **Existing-lesson links.** A lesson may name another lesson only if it exists, or is in the same or an earlier wave. Name lessons by id in captions and summaries so a test can check the links (K-2).

#### 3.1.4 Shared-kit prerequisites (kickoff kit round)

Same rules as Tier 1's P1/P2: each piece has at least two Tier 2 users, the API is minimal and grows on a real second need, extractions are migrated pixel-identically (`smoke --frames` + `diff`), and every item updates `docs/shared-api.md` and the `#/dev/kit` showcase. **Batches never edit shared code**; misfits go into the batch report as Phase 2 requests, as before.

**P0-a (K-6 to K-12, K-20) blocks wave 1. P0-b (K-13 to K-19) blocks wave 2. K-21 is scheduled for the wave 3→4 kit round** (both are built in the same kickoff round; wave 1 may start as soon as P0-a has landed, because no wave 1 lesson uses a P0-b piece).

| # | Piece | Location | Tier 2 users | Minimal API | Gate |
|---|---|---|---|---|---|
| K-6 | **`GraphView`** + `core/graphLayout.ts` (extraction) | `components/GraphView.tsx` | topological-sort, union-find (forest view), minimum-spanning-trees, relations-orders (Hasse), cycle-detection, dfa-nfa, lexing-tokens, deadlocks, garbage-collection, memory-leaks, build-systems, bundlers-code-splitting, coupling-cohesion, test-doubles, dependency-injection, behavioral-patterns (state), mobile-app-lifecycle, sockets-api (states), software-licensing (19) | `nodes: {id, label, at?, shape?: 'circle'\|'box', accept?}[]`, `edges: {from, to, label?, weight?}[]`, `directed`, `layout: 'fixed'\|'layered'\|'circle'`, `nodeMark`/`edgeMark` (same shape as `TreeSvg`'s), `startNode?` (incoming start arrow), self-loops and curved parallel edges (a→b and b→a both visible), `onNodeClick`/`onEdgeClick` with a **roving tabindex**, optional `editable` (click to add a node, drag to add an edge, plus a keyboard "add node / connect" path). `layered` is pure in `core/graphLayout.ts`: longest-path layering plus barycentre ordering, tested for no edge pointing up in a DAG and stable output. Extracted from `graph-representations/GraphCanvas.tsx` (editing, weights, cycle marking) and `ci-pipelines` `Dag` (layered layout). Migrate both pixel-identically; graph-representations' 78-Tab path drops to one tab stop (L-7). | P0-a |
| K-7 | **`CellGrid`** | `components/CellGrid.tsx` | error-detection-correction (Hamming grid), primes-factoring (sieve), modular-arithmetic (multiplication table), birthday-paradox (calendar), conditional-bayes (1,000-person grid), cpu-caches (2D array + cache sets), cpu-pipelining (stage-by-cycle chart), shuffle-reservoir (position-frequency heatmap), virtual-memory-paging (frames), file-systems (blocks), storage-devices (flash pages), edit-distance (DP table), deployment-strategies (server grid), feature-flags (user crowd) (14) | `rows`, `cols`, `cell(r, c) → {tone?, fill?: 'solid'\|'tint'\|'outline'\|'none', text?, intensity?: 0..1}`, `rowLabels?`, `colLabels?`, `onCellClick?(r, c)` (roving tabindex), `cellTitle?`, `highlight?: {r, c, tone}[]`, `size: 'xs'\|'sm'\|'md'`, `gap?`. `intensity` tints toward the cell's tone for heatmaps. SVG for ≤ 400 cells; above that it draws the cells on canvas with the same API (the 1,000-dot grid), labels staying in SVG. Pure helpers `gridIndex`/`gridCoords` tested. `dynamic-programming`'s LCS table moves onto it in R1 if that's pixel-identical; otherwise it stays local and R1 says why. | P0-a |
| K-8 | **`ByteGrid`** (hex dump) | `components/ByteGrid.tsx` | endianness, grpc-protobuf (varint and tag bytes), symmetric-ciphers (16-byte blocks), macs-hmac (tags), packet-capture-debugging (frame bytes), file-systems (an inode's bytes) (6) | `bytes: Uint8Array \| number[]`, `perRow` (8 or 16), `offsetBase?` (address shown in the left column, so it doubles as "address → byte"), `fields?: {from, to, tone, label}[]` (header fields, varint groups, blocks), `toneOf?(i)`, `ascii?` column, `highlight?`, `onByteClick?`. `BitStrip` stays the bit-level view; a field can expand to a `BitStrip` in the lesson. | P0-a |
| K-9 | **`TreeSvg` forest mode** | `components/TreeSvg.tsx` | union-find, huffman-coding (merging forest), tries (n-ary, existing `tidy`), garbage-collection (optional) | `shape.roots?: Id[]` lays several trees side by side in one SVG, with the same marks, transitions and click handling. Single-root callers are untouched, verified pixel-identical on trees-bst, recursion, tree-traversals, dom-events, accessibility and dependency-management. The heaps index layout stays declined (`shared-api.md` "Not built"). | P0-a |
| K-10 | **`core/numberTheory.ts`** | `src/core/numberTheory.ts` | modular-arithmetic, gcd-euclid, primes-factoring, rsa, diffie-hellman, digital-signatures-pki (toy RSA view), rolling-hash (6) | On `bigint`: `mod` (always non-negative), `modPow`, `gcd`, `egcd` (returns the steps for the remainder table), `modInverse` (null when none), `isProbablePrime` (Miller-Rabin with the first 13 primes as bases, which is deterministic below 3,317,044,064,679,887,385,961,981 per Sorenson & Webster 2015; above that it's labelled "probable"), `sieve(n)` (returns crossing-out order for the animation), `trialFactor(n)` with a step counter, and `toyRsa(p, q, e)` returning `{n, phi, d}` or the reason it's invalid. Tests: against brute force for all n < 10⁴, RSA round-trips for every message < n on toy keys, Carmichael numbers caught. | P0-a |
| K-11 | **`core/stats.ts`** | `src/core/stats.ts` | combinatorics, birthday-paradox, probability-basics, expected-value, conditional-bayes, shuffle-reservoir, linear-time-sorting (log₂ n!), classification-metrics (8) | `choose(n, k)` and `factorial(n)` in `bigint`, `log2Factorial(n)`, `variance(xs)`, `stdDev`, `histogram(xs, {bins, min, max})`, `binomialPmf`, `collisionProbability(n, space)` (exact product form for n ≤ 10⁵, `1 − e^(−n(n−1)/2d)` above, and it says which), `runningMean`. `mean` and `percentile` stay in `core/sim.ts`; don't redeclare them. | P0-a |
| K-12 | **`Plot2D`** | `components/Plot2D.tsx` | birthday-paradox, probability-basics, expected-value (histogram), classification-metrics (ROC), vectors-similarity, matrices-transformations, gradient-descent (contours), linear-logistic-regression, supervised-learning, decision-trees-ensembles (regions), clustering-kmeans, embeddings, usability-laws (Fitts fit), amdahls-law, bezier-interpolation (easing), color-spaces (gamma), linear-time-sorting (log₂ n! vs n log n), latency-bandwidth (19) | SVG plot on `core/scale` axes: `x`/`y` domains (linear or log), tick labels, axis titles, grid. Layers as children: `<Points data tone? r? hollow? onDrag?>` (`hollow` draws held-out validation data; supervised-learning and decision-trees-ensembles both need it) (draggable points with a keyboard path: select, then arrow keys), `<Curve fn \| points tone dashed?>`, `<Segments>`, `<Bars>` (histograms), `<VLine>`/`<HLine>` with labels, `<Arrow from to>` (vectors), `<Polygon>` (a transformed shape). A `<Heat fn \| grid>` layer draws on a canvas underneath (contours, decision regions), using `TOKENS`. Coordinates are always data space; a `usePlot()` hook exposes the scales to custom layers. Tests: scale round-trips, the Heat sampler covers the domain, and a dragged point clamps to it. | P0-a |
| K-13 | **`GanttLanes`** (extraction) | `components/GanttLanes.tsx` | cpu-scheduling, interrupts-context-switch, async-await-coroutines, http-versions, critical-rendering-path, rendering-strategies, orm-n-plus-one, graphql, timeouts-deadlines, serverless-cold-starts, realtime-transports, core-web-vitals, signals-graceful-shutdown, profiling-flame-graphs (timeline strip) (14) | `lanes: {id, label}[]`, `bars: {id, lane, start, end, tone, label?, kind?: 'work'\|'wait'\|'blocked'}[]` (`wait` hatched, `blocked` dashed), `now?` (a cursor), `markers?: {at, label, tone}[]` (first paint, deadline), `domain`, `unit` label, `onBarClick?`. Uses `core/scale`. Extracted from the `ci-pipelines` Gantt, pixel-identically; `web-request`'s waterfall migrates too if it's pixel-identical, else it stays and the report says why. | P0-b |
| K-14 | **`SequenceDiagram`** | `components/SequenceDiagram.tsx` | dhcp, ethernet-arp, dns-resolution, diffie-hellman, packet-capture-debugging, http-caching, idempotency-keys, webhooks, mfa-passkeys, csrf-cookies, sockets-api, realtime-transports (12) | `actors: {id, label, tone?}[]` (lifelines), `messages: {id, from, to, label, tone?, lost?: boolean, note?}[]`, `step?` (messages after it are hidden, the current one is `--hi`), `onMessageClick?`. Broadcast is `to: '*'`; a lost message ends in a ✕ partway. Lifelines can be marked waiting (dashed). Phone: wrapped in `WideRegion` at the narrowest width where labels stay ≥ 8px, labels wrap to two lines first. Pure layout (`sequenceLayout`) tested. | P0-b |
| K-15 | **`MemoryMap`** | `components/memory/MemoryMap.tsx` | calling-conventions, memory-safety-bugs (the overflowing frame, the freed block), endianness (bytes at addresses), isa-assembly (memory boxes), virtual-memory-paging (a process's address space), linking-loading (a process image) (6) | An address-ordered column: `regions: {from, to, label, tone, variant?: 'live'\|'freed'\|'guard'}[]`, `cells?: {addr, value, tone?}[]` (word or byte granularity), `pointers?: {addr, label, tone}[]` (sp, fp, pc), `direction: 'down'\|'up'` (higher addresses at the top or bottom), `highlight?`. Lives beside the memory kit, so it can export ports for `RefArrow`. | P0-b |
| K-16 | **`core/automata.ts`** | `src/core/automata.ts` | dfa-nfa, lexing-tokens; later T3 regex-engines (2 + 1) | `Dfa`/`Nfa` types, `dfaStep`, `nfaStep` with ε-closure, `subsetConstruct(nfa)` (returns the subset table for the animation), `accepts`, and `longestMatch(dfa, input, from)` for maximal munch. Tested against hand-built machines and a brute-force regex comparison on short strings. | P0-b |
| K-17 | **`core/vec.ts`**, **`core/fit.ts`**, **`core/fixtures/datasets.ts`** | `src/core/` | vectors-similarity, matrices-transformations, gradient-descent, linear-logistic-regression, supervised-learning, classification-metrics, decision-trees-ensembles, clustering-kmeans, embeddings, usability-laws, rasterization, bezier-interpolation (12) | `vec.ts`: 2D/ND `dot`, `norm`, `cosine`, `add`, `scale`, `mat2`/`mat3` multiply, apply, `det`, `inverse`. `fit.ts`: `leastSquares(xs, ys, degree)` (normal equations with a condition check), `sigmoid`, `mse`, `logLoss`, `gradientStep`. `datasets.ts`: seeded generators (`blobs`, `moons`, `lineWithNoise`, `twoClassScores`), so every ML lesson draws from the same honest, reproducible data. Tests: least squares against a closed form, gradients against finite differences, determinism per seed. | P0-b |
| K-18 | **`ConfusionMatrix`** | `components/ConfusionMatrix.tsx` | conditional-bayes, classification-metrics, decision-trees-ensembles (3) | `tp, fp, fn, tn`, labels for the two classes, `highlight?: 'tp'\|'fp'\|'fn'\|'tn'`, derived precision, recall, accuracy and F1 (`core/stats.ts`), optional counts as a share. TP/TN take `--ok`, FP `--bad`, FN `--orange` (the second failure kind). | P0-b |
| K-19 | **`crypto.ts` additions** | `src/core/crypto.ts` | mfa-passkeys (HMAC-SHA-1), macs-hmac, webhooks, symmetric-ciphers, digital-signatures-pki (+ hashing-encryption) (5) | `hmac(key: BufferSource, data: BufferSource, { hash: 'SHA-1' \| 'SHA-256', out: 'hex' \| 'bytes' })`; `aesBlockEncrypt(key, block16)` (single-block AES via AES-CBC with a zero IV, taking the first 16 bytes; documented as the only way to get ECB from WebCrypto, used to show why ECB leaks); `ecdsaKeyPair`, `ecdsaSign`, `ecdsaVerify` extracted from hashing-encryption (second use). Tests: RFC 4231 HMAC-SHA-256 vectors, RFC 6238 TOTP vectors, FIPS-197 AES vector for the single block, ECDSA sign/verify round-trip with one flipped byte failing. | P0-b |
| K-20 | **`core/disjointSet.ts`** | `src/core/disjointSet.ts` | union-find, minimum-spanning-trees (2) | `createDisjointSet(n, { compress, byRank })` with `find`, `union` (returns whether it merged) and an optional trace of events (find path, re-parent, rank change), so union-find builds its frames from the trace and MST just uses it. Tests: against a naive component labelling on seeded union sequences, and tree height ≤ log₂ n with union by rank. | P0-a |
| K-21 | **`ColorField`** and **`core/contrast.ts`** (extraction) | `components/ui.tsx`, `src/core/contrast.ts` | accessibility (existing), color-spaces (2) | Both were declined in Tier 1 with one user; color-spaces is the second. Move accessibility's colour input and its WCAG relative-luminance/contrast code out unchanged, and migrate accessibility pixel-identically. | **wave 3→4 kit round** (color-spaces is in wave 4) |

**Considered and kept local (one Tier 2 user, or not similar enough):** a flame graph (`profiling-flame-graphs` only), a scenario/branching-story engine (`computing-ethics` only in Tier 2, so it's local; extract when T3 `design-docs-rfcs` arrives), a layer-stack diagram (`virtualization-hypervisors`, `syscalls-kernel-mode` and `serverless-cold-starts` draw different things), a state-machine wrapper (it's `GraphView` with `startNode` and `accept`), a request-pipeline strip (scene kit already covers it), and a pipe/bandwidth canvas (`latency-bandwidth` only). The spec authors also kept these local, each with one user:
- `sequential-logic`'s timing diagram
- `proof-techniques`' step picker
- `ring-buffers`' ring (semaphores draws its buffer flat)
- `pagination`'s vertical feed
- `embeddings`' PCA (T3 `svd-pca` is the second user)
- `mfa-passkeys`' base32 codec
- `diffie-hellman`'s ECDH helper
- `frontend-state-management`'s teaching signals

`garbage-collection` and `memory-leaks` both lay out object graphs with the memory kit: if the B18 builder finds the same layout code in both, that's a Phase 2 extraction in the wave 6 kit round, not a third copy.

**Testing convention set here:** SQL lessons (B23) check every query they show against real SQLite through `node:sqlite` (`DatabaseSync`, flag-free on the repo's Node 24). It's a stronger check than `sql-basics`' hand-written reference. The recheck's note that sql-basics "agrees with real `node:sqlite`" describes how the reviewer checked it, not a test in the repo. Lessons that run real React (B30) check render counts in the browser, because Vitest here has no DOM; adding jsdom or Testing Library is a kit-round decision.

**Kit round staffing.** As in Tier 1: three agents with disjoint files, then the coordinator merges and runs the full gates.
- **Agent A:** K-1, K-2, K-3, K-4, K-5.
- **Agent B:** K-6, K-9, K-13. This is the extraction agent, and it owns the pixel-identical migrations.
- **Agent C:** K-7, K-8, K-10, K-11, K-12, K-20, then K-14 to K-19.
- K-21 is built by the kit owner in the wave 3→4 kit round.

K-12 (`Plot2D`) and K-7 (`CellGrid`) are the biggest new surfaces. If agent C runs long, K-14 to K-19 move to a fourth agent after P0-a lands; wave 1 doesn't wait for them.

#### 3.1.5 Kickoff tickets

Every ticket below has an owner slot in the tracker (§4.1). **Prereq** tickets must land before the wave they block. **Alongside** tickets run during wave 1 in folders no wave 1 batch touches, and must be closed before Tier 2 sign-off.

**Prerequisites: tooling and docs (kit agent A)**

| # | Ticket | Done when | Gate |
|---|---|---|---|
| K-1 | **Register the 156 Tier 2 topics** in `curriculum.ts` (Tier 2 block, grouped by track, ids, titles and taglines exactly as in §3.1.2). The 16 existing entries are untouched. | The home page shows 172 Tier 2 cards (16 built, 156 planned) with the planned set collapsed behind "Show 156 planned". Every track chip's built/total count is right. `curriculum.test.ts` asserts that ids are unique, that every lesson folder is registered, and that every §3.1.2 id is registered. `wifi-shared-medium` and `comparison-sort-lower-bound` are not registered. The home page has been eyeballed at 1440, 768 and 390 in every filter state, and the full smoke passes. | P0-a |
| K-2 | **Lesson-content lint**, as a Vitest suite over every registered lesson module (`src/core/lessonContent.test.ts` or similar). It checks: <ul><li>the AC-0 counts: `useCases` 3-4, `tryThis` 3-5, `keyIdeas` 3-4, quiz 3-5, every question with a `why`;</li><li>`answer` in range and no duplicate options;</li><li>every option within 0.75-1.35× the mean length of the others;</li><li>the correct option strictly the longest in at most ⌊n/2⌋ of a lesson's questions, and in at most 30% tier-wide;</li><li>no option containing "of the above" / "of these";</li><li>every backticked id in summary, tips and key ideas that matches a `TOPICS` id is registered.</li></ul> Lessons that haven't been retrofitted yet are on an explicit allowlist: the R1/R2 lessons until their batch merges, and the existing Tier 3/4 lessons until their tier kickoffs. | The suite runs in `npm test`, and a planted bad fixture proves each rule fails. The allowlist is a named constant that shrinks as R1 and R2 merge, and it's empty for Tier 1 and new Tier 2 lessons. The 7 Tier 1 lessons in L-3 are fixed first or start on the allowlist with L-3 named. | P0-a |
| K-3 | **Secret-shape scan as a test.** Extract the scanner from `secrets-management` into `core/secretScan.ts` (second use) and run it over `src/**`, `docs/**` and `scripts/**`. Patterns: AWS key IDs, Stripe live/test keys, GitHub and Slack token prefixes, Google API keys, private-key PEM blocks, credentials in URLs. An `allow-secret-shape: <reason>` marker exempts a line. | Zero findings at HEAD, and secrets-management uses the core scanner pixel-identically. This matters for wave 3 (HMAC keys, TOTP secrets, toy RSA) and wave 9 (IAM). | before W3 |
| K-4 | **The swipe hint never covers content** (the rest of QA C14). `WideRegion`'s hint, and so `StageFrame minWidth`'s, renders in reserved space (a gutter strip under the region, or an edge badge) instead of overlaying the first rows. | static-analysis-linters at 390 shows the "loop skips the first order" row with the hint visible. Every current `WideRegion`/`minWidth` caller has been re-shot at 390, and screens ≥ 900px are pixel-identical (no hint there). Tier 2 adds dozens of `WideRegion`s (`SequenceDiagram` especially), so this can't wait. | P0-a |
| K-5 | **CLAUDE.md gains the payload-free rule.** "Security lessons teach the risk in plain words and the fix concretely; no working attack strings, payloads, exploit steps or exfiltration snippets, even harmless-looking ones; fake credentials are built at runtime." Add one line pointing builders at AC-0/T2. Today the rule lives only in this plan's §1.5 injection-attacks entry, so a builder reading CLAUDE.md never sees it. Tier 2 has seven security lessons. | CLAUDE.md updated; docs-only change. | P0-a |

**Prerequisites: shared kit (kit agents B and C):** K-6 to K-21, specified in §3.1.4. P0-a (K-6 to K-12 and K-20) blocks wave 1, P0-b (K-13 to K-19) blocks wave 2, and K-21 lands in the wave 3→4 kit round.

**Alongside wave 1: Tier 1 leftovers (kit agent A once K-1 to K-5 have landed; lesson-local, Tier 1 folders only)**

Status as of `bc0a4bc` (current `main`, pushed). I checked each one against the commits since the recheck (`1ef43eb..bc0a4bc`) and, where it was cheap, the code. "Open" means no commit touched it.

| # | Item | Source | Fix and done-when |
|---|---|---|---|
| L-1 | **tree-traversals: numeric BST nodes get letter labels, and the focus ring is violet** | recheck C9, C7 | In a numeric tree, an added child gets a number; ask for one or pick a value, but never a letter. `isSortedLabels` refuses mixed labels with an explicit "mixed labels can't be compared" verdict instead of string order. The focus ring uses the global accent, not `--violet` (the "on the call stack" colour). Tests: edited numeric BST → numeric labels; a mixed-label tree → the explicit verdict on all four orders. |
| L-2 | **sorting: the race's cost model favours Quick over Merge** | recheck N-9 "also" (the verdict caption was fixed in `cb9e5cc`; the weighting wasn't) | A swap counts as one write while Merge pays one per element copied. Count element writes consistently (a swap is 2), or rank by comparisons and show writes separately. Either way the stage names the cost model. Update the reference counter in `algorithms.test.ts` to match. |
| L-3 | **Quiz: the correct option is still the longest in 3 of 4 questions** in command-line, data-formats, debugger-tools, fetch-decode-execute, osi-tcpip-layers, stack-vs-heap and time-and-timezones | recheck N-8 (`dd742f3` fixed only the three "always longest" lessons) | Bring each to at most 2 of 4 without padding distractors into nonsense. Done when K-2 passes on these lessons with no allowlist entry. |
| L-4 | **Quiz cosmetics** (10 open; the 11th, oop-fundamentals Q3, was fixed in `dd742f3`) | recheck quiz cosmetics | <ul><li>propositional-logic Q2: the `why` says "the other two options" when there are three;</li><li>twos-complement Q2: two "Always…" distractors against one hedged answer;</li><li>reading-codebases Q2 and requirements-user-stories Q1: all-absolute distractors;</li><li>dependency-management Q4: "Nothing" is only exact because the tree has the newest 1.x, so say so;</li><li>http-basics Q1: the `why` on 403 should allow a 403 without credentials (RFC 9110);</li><li>http-basics Q2: "Both, always" flags itself;</li><li>git-internals Q1: a nod to packfile deltas;</li><li>debugger-tools Q2 and stack-vs-heap Q2: the answer echoes the question.</li></ul> I re-confirmed propositional-logic Q2, both http-basics items and debugger-tools Q2 at HEAD. |
| L-5 | **secrets-management: the commit graph is small in a big box at 1440** | recheck cosmetic (partially fixed) | Size the graph's box to its content, or let `CommitGraph` scale up within the box, without changing other `CommitGraph` callers. Add the "HEAD → main" tag to `watch`. Eyeball at 1440, 768 and 390. |
| L-6 | **"The 3 DS&A shared-kit requests"** | coordinator | ✅ **Closed, already shipped.** They came from the qa/dsa merge report: export the `Rnd` type from `core/random`, grouped superscript exponents in `core/format` (big-o's `tenTo`), and global amber/orange `.hl` chip classes. All three landed in the Tier 1 close-out kit round (commits `50100b3`, `4b8a8c2`, `23ddf87`). |
| L-7 | **graph-representations: 78 Tabs to reach the quiz** | recheck, minor 27 | Fixed by the K-6 migration (one tab stop for the graph). Verify with `npm run shot -- --press`. |

**Verified closed since the recheck** (so nobody reopens them):
- N-1 (`1537c64`), N-2 (`d39cd16`), N-3 (`682936a`), N-4 (`75b82a9`), N-5 (`2f7bd41`), N-6 (`fb9ebdd`), N-7 (`9bd014c`), N-10 (`4d1d99d`, then pushed).
- C1-C3, C5, C6, C8, C10 (`606bdfe`), C12 (`cd9e2b0`), C13, C15 and C16 (`53088f5`, `12c0c88`), and C14's wording (`64ea6b3`).
- C11: `d29e5b2` replaced the snippet with a description. Making it valid code would have made it a working payload, so this is the correct resolution, not a partial one.
- The partial minors 4 (`12c0c88`), 17 (`ab9d06e`), 47 (`8b34696`) and 57 (`1b98569`).
- test-pyramid's green unit layer (`9bd014c`), the big-o radiogroup name (`da232ae`) and the arrays-linked-lists arcs (`4494aa2`).

**Noted, out of Tier 2 scope:** the 21 existing Tier 3 and Tier 4 lessons have no tests and unbalanced quizzes, the same as the 14 older Tier 1 lessons before T-2. Each gets a retrofit ticket at its own tier's kickoff, and K-2 allowlists them until then.

#### 3.1.6 Retrofitting the 16 existing Tier 2 lessons (T2-R1, T2-R2)

DoD §4.2 item 5 applies, and these 16 are where Tier 1's T-2/T-3 findings will repeat. **None of the 16 has a test file**, logic sits in `.tsx` files (`heap.tsx`, `bst.tsx`, `dp.tsx`, `btree.tsx`, `race-conditions/sim.tsx`, `event-loop/sim.tsx`, auth-sessions-jwt's `Flow`/`Scale`/`Tamper`), and nine of them have no on-screen disclosure at all. They run as two batches in waves 1 and 2, so any false claim they turn up surfaces early, not at sign-off.

| Batch | Wave | Lessons |
|---|---|---|
| T2-R1 | 1 | hash-table, graph-search, trees-bst, heaps, dynamic-programming, lru-cache, rate-limiting, message-queues |
| T2-R2 | 2 | tcp-udp, tls-handshake **[domain review]**, db-indexes, transactions-acid, race-conditions, event-loop, auth-sessions-jwt **[domain review]**, containers |

**Done when, per lesson:**
1. **Tests assert every on-screen claim.**
   - hash-table: bucket = hash mod size, resize at the stated load factor, chain lengths.
   - graph-search: BFS step counts and Dijkstra costs against a reference, A* optimal with its heuristic.
   - trees-bst: operations against a reference set, and the height claims.
   - heaps: the heap property after every operation, and the index arithmetic.
   - dynamic-programming: fib and LCS values against brute force, and the call counts.
   - lru-cache: LRU and FIFO eviction against a reference, and hit-ratio direction under skew.
   - rate-limiting: each algorithm's accept/reject against a reference over seeded arrivals.
   - message-queues: redelivery without an ack, and the DLQ after max attempts.
   - tcp-udp: in-order delivery and retransmission.
   - tls-handshake: round trips per version, and the message order.
   - db-indexes: B+tree search, insert and split against a reference, with "about four levels for a billion rows" computed from the fan-out.
   - transactions-acid: rollback leaves no partial write.
   - race-conditions: lost-update counts across interleavings, a deadlock with opposite lock order and none with the same order.
   - event-loop: the output order equals real JavaScript (run the snippets in the test).
   - auth-sessions-jwt: a real HS256 verify, with tampering rejected.
   - containers: layer-cache hits and misses.
2. **Pure logic moves out of `.tsx`** into `model.ts`/`sim.ts`, and `frames.tsx` keeps only captions.
3. **On-screen disclosure** for whatever is scripted, simulated, illustrative or a toy (for example, tls-handshake's key exchange numbers and race-conditions' interleavings).
4. **`watch` checked against a screenshot line by line**, and the colour-meaning table applied.
5. **The quiz passes K-2** and has a misconception question; the R batch is removed from K-2's allowlist.
6. **Every scene at 390 and 768**, at its first, middle and last frame. Keyboard paths and the AC-0 counts, as in AC-0/T2 rules 10-11.
7. `dynamic-programming`'s LCS table moves onto `CellGrid` if that's pixel-identical; otherwise the R1 report says why it stays.
8. **No scope growth.** These lessons are now neighbours of new Tier 2 lessons, and each keeps its own side of the line drawn in §3.1.1: message-queues stays the DLQ destination, race-conditions keeps only the two-lock deadlock, event-loop keeps the queues, lru-cache keeps eviction, and tls-handshake keeps DH as a concept.
9. No shared-code edits. Misfits go into the report as Phase 2 requests.

#### 3.1.7 Batches, waves and concurrency

**Batches** (32 new and 2 retrofit; every batch touches only `src/lessons/<its ids>/`):

| Batch | Theme | Lessons | Pilots |
|---|---|---|---|
| T2-B1 | Bits & encoding | bit-manipulation, endianness, error-detection-correction, adders-alu, sequential-logic | `ByteGrid`, `CellGrid` |
| T2-B2 | Number theory & counting | modular-arithmetic, gcd-euclid, primes-factoring, combinatorics, birthday-paradox | `core/numberTheory`, `core/stats`, `CellGrid`, `Plot2D` |
| T2-B3 | Graph algorithms | topological-sort, union-find, minimum-spanning-trees, cycle-detection, relations-orders | `GraphView` + layered layout, `TreeSvg` forest |
| T2-B4 | Kernel & scheduling | syscalls-kernel-mode, interrupts-context-switch, cpu-scheduling, virtual-memory-paging, file-descriptors | `GanttLanes`, `MemoryMap` |
| T2-B5 | Automata, parsing & types | dfa-nfa, lexing-tokens, grammars-parsing, parsing-ast, type-systems | `core/automata`, `GraphView` state-diagram mode |
| T2-B6 | Joining a network | subnetting-cidr, ipv6, ethernet-arp, dhcp, dns-resolution | `SequenceDiagram` |
| T2-B7 | Probability & evaluation | probability-basics, conditional-bayes, expected-value, classification-metrics, shuffle-reservoir | `ConfusionMatrix`, `Plot2D` histograms and ROC |
| T2-B8 | Linear algebra & fitting | vectors-similarity, matrices-transformations, gradient-descent, linear-logistic-regression, supervised-learning | `core/vec`, `core/fit`, datasets, `Plot2D` heat layer |
| T2-B9 | Cryptography | symmetric-ciphers, macs-hmac, diffie-hellman, rsa, digital-signatures-pki | `crypto.ts` additions |
| T2-B10 | Inside the CPU | cpu-pipelining, cpu-caches, isa-assembly, calling-conventions, memory-safety-bugs | `MemoryMap` (second batch) |
| T2-B11 | Algorithm design | greedy-algorithms, huffman-coding, backtracking, amortized-analysis, monotonic-stack | |
| T2-B12 | Models from data | decision-trees-ensembles, clustering-kmeans, embeddings, usability-laws | |
| T2-B13 | Graphics & motion | rasterization, bezier-interpolation, color-spaces, game-loop | |
| T2-B14 | Sorting, selection & strings | linear-time-sorting, quickselect, rolling-hash, edit-distance, tries | |
| T2-B15 | Logic, proof & complexity | predicate-logic, proof-techniques, induction-invariants, master-theorem, p-vs-np | |
| T2-B16 | Concurrency & performance | deadlocks, semaphores-condition-variables, ring-buffers, amdahls-law, profiling-flame-graphs | |
| T2-B17 | Sockets & the edge | sockets-api, latency-bandwidth, firewalls-packet-filtering, packet-capture-debugging, reverse-proxy-gateway | |
| T2-B18 | Runtimes & memory | interpreters-compilers-jit, linking-loading, garbage-collection, memory-leaks, async-await-coroutines | |
| T2-B19 | Machines, disks & lifecycles | virtualization-hypervisors, boot-process, storage-devices, file-systems, signals-graceful-shutdown | |
| T2-B20 | Types & patterns | generics-polymorphism, null-option-adts, iterators-generators, creational-structural-patterns, behavioral-patterns | |
| T2-B21 | Testing & change | test-doubles, tdd, flaky-tests, refactoring-code-smells, build-systems | |
| T2-B22 | Structuring code | coupling-cohesion, solid-principles, dependency-injection, layered-hexagonal, architecture-diagrams-c4 | |
| T2-B23 | Data models & queries | relational-algebra, normalization, sql-aggregation-windows, nosql-data-models, orm-n-plus-one | |
| T2-B24 | HTTP & API protocols | http-versions, http-caching, realtime-transports, grpc-protobuf, graphql | |
| T2-B25 | API design | rest-api-design, pagination, idempotency-keys, optimistic-pessimistic-locking, webhooks | |
| T2-B26 | Reliable services | timeouts-deadlines, poison-messages-dlq, caching-patterns, distributed-id-generation, connection-pooling | |
| T2-B27 | Cloud building blocks | serverless-cold-starts, infrastructure-as-code, kubernetes-basics, health-checks, object-storage | |
| T2-B28 | App security | xss, csrf-cookies, mfa-passkeys, iam-least-privilege, deserialization-path-traversal | |
| T2-B29 | How browsers render | browser-rendering-pipeline, critical-rendering-path, core-web-vitals, bundlers-code-splitting, rendering-strategies | |
| T2-B30 | UI frameworks & product | virtual-dom-reconciliation, frontend-state-management, mobile-app-lifecycle, i18n-l10n, usability-testing | |
| T2-B31 | Shipping safely | deployment-strategies, feature-flags, structured-logging, cert-lifecycle, resource-exhaustion | |
| T2-B32 | Engineering responsibly | software-licensing, computing-ethics, technical-writing | |
| T2-R1 | Retrofit, part 1 | hash-table, graph-search, trees-bst, heaps, dynamic-programming, lru-cache, rate-limiting, message-queues | |
| T2-R2 | Retrofit, part 2 | tcp-udp, tls-handshake, db-indexes, transactions-acid, race-conditions, event-loop, auth-sessions-jwt, containers | |

**File ownership and isolation:** unchanged from Tier 1 (§1.6).
- Each batch runs in its own worktree and branch (`t2/b<n>`, `t2/r<n>`), with its own `KINETIC_PORT`.
- No batch edits `src/core/*`, `src/components/*`, `src/styles/*`, `curriculum.ts` (all 156 are registered in K-1), `docs/shared-api.md` or this file.
- Status and Phase 2 requests go into the batch report.

**Waves.** The rhythm is the same as Tier 1: **3-4 agents per wave, 14-19 lessons of screenshots per wave, then a kit round** (P-follow-up) in which one shared-code agent applies the accepted Phase 2 requests and runs the full gates before the next wave starts. With ten waves, the second reviewer (Sentry) rotates in on every wave from wave 3 on, and reads every **[domain review]** lesson in that wave.

| Wave | Batches | Agents | New lessons | Why here |
|---|---|---|---|---|
| kickoff | K-1 to K-19, then L-1 to L-7 alongside wave 1 | 3 kit | — | P0-a lands, then wave 1 starts. P0-b keeps landing during wave 1. |
| 1 | B1, B2, B3 + **R1** | 4 | 15 (+8 retrofit) | Pilots the heaviest new APIs (`GraphView`, `CellGrid`, `ByteGrid`, `TreeSvg` forest, `numberTheory`, `stats`, `Plot2D`) on lessons with exact, testable answers, so API friction shows early. R1 surfaces false claims in the old DS&A and arch lessons early. |
| 2 | B4, B5, B6 + **R2** | 4 | 15 (+8) | Pilots P0-b: `GanttLanes`, `MemoryMap`, `SequenceDiagram`, `automata`. Chain roots for os, lang and net. |
| 3 | B7, B8, B9 | 3 | 15 | Domain-heavy (probability, ML maths, crypto), so three agents and a full domain review. Builds on wave 1's number theory and stats. |
| 4 | B10, B11, B12, B13 | 4 | 18 | Reuses proven kit. `memory-safety-bugs` sits with `calling-conventions`; the ML and graphics batches build on wave 3's maths. |
| 5 | B14, B15, B16 | 3 | 15 | The theory batch (B15) needs careful review for "slideshow" risk. |
| 6 | B17, B18, B19 | 3 | 15 | Systems depth that builds on waves 2 and 5. |
| 7 | B20, B21, B22 | 3 | 15 | Craft and types. Low domain risk, but code-correctness tests run real JS. |
| 8 | B23, B24, B25 | 3 | 15 | `orm-n-plus-one` (B23) and `graphql` (B24) are built side by side, so their scope line is checked at the same review. |
| 9 | B26, B27, B28 | 3 | 15 | B28 needs a full payload-free security review. |
| 10 | B29, B30, B31, B32 | 4 | 18 | The integrators (`resource-exhaustion`, `cert-lifecycle`) and the lead topics, which reference the technical lessons. |

That's 156 new lessons in 10 waves, plus 16 retrofits in waves 1 and 2. **Why 3 agents in most waves rather than 4:** Tier 1's QA found 8 majors after review. Tier 2 is 3.25× the size, and half its waves carry domain-sensitive lessons. Review quality is the constraint, not agent count. If a wave's review comes back clean, the next low-risk wave (7 or 8) may take a fourth batch from the following wave. That's the coordinator's call, never the builders'.

**Between waves** (unchanged): merge the batch branches, run the full `npm run smoke`, `smoke -- --mobile`, `captions`, `check-tokens -- --strict` and `npm test`, triage Phase 2 requests, run the kit round, and update the tracker.

#### 3.1.8 Tier 2 topic specs

Kit names refer to `docs/shared-api.md` and, for **K-n** pieces, §3.1.4. Each batch's entries plus AC-0 (§1.4) and AC-0/T2 (§3.1.3) are the builder's whole brief. **[domain review]** marks lessons that need a second-reviewer read of the model before the batch is accepted.

##### Batch T2-B1 · Bits & encoding (`hw`, `math`)
Wave 1. Pilots **`ByteGrid` (K-8)** (endianness) and **`CellGrid` (K-7)** (the Hamming grid), and is the first heavy Tier 2 user of `BitStrip`. Every lesson here computes live on real integers, so the honesty lines are short, but the JavaScript 32-bit rules have to be stated wherever they bite.

**`bit-manipulation` · Bitwise Operations & Bit Masks**
Track `hw` · *"AND, OR, XOR, shift: tiny ops, huge leverage"* · Builds on: `binary-hex`, `twos-complement`
**Spec.**
- Two stacked 8-bit registers A and B (toggle bits, or type decimal/hex/binary) with an operator picker: `&`, `|`, `^`, `~A`, `A << n`, `A >> n`, `A >>> n`. The output register fills column by column, each output bit lighting as its column is evaluated, with the per-column rule shown ("1 & 0 → 0").
- A width toggle (8 / 32 bits). In 32-bit mode the readout shows what JavaScript actually returns: `1 << 31` is `-2147483648`, `-1 >>> 0` is `4294967295`, and `x << 32` equals `x` (the shift count is taken mod 32).
- **Flags scene:** a permissions byte (read, write, execute, admin…). Buttons set (`f | MASK`), clear (`f & ~MASK`), toggle (`f ^ MASK`) and test (`(f & MASK) !== 0`). The mask register is drawn and the learner picks which bit it holds.
- **Tricks scene,** stepped:
  - `x & (x - 1)` clears the lowest set bit; repeating it counts the set bits (Kernighan popcount, with a step counter).
  - `x & -x` isolates the lowest set bit.
  - `(x & (x - 1)) === 0` tests for a power of two, with `x = 0` as the trap.
  - The XOR swap, with a "what if a and b are the same variable?" step that zeroes it.
- Preset chips: Unix `chmod` bits, a feature-flag set, an RGB pack/unpack (`(r << 16) | (g << 8) | b`).

**Out of scope.** Number bases and two's complement themselves (`binary-hex`, `twos-complement`); SIMD bit tricks stay in T3 `simd-gpu-parallelism`.

**Kit.** `BitStrip` (operands, mask and result, with `ariaLabelOf` naming flag bits, `highlight` for the evaluating column), `core/bits` (`toBits`, `fromBits`, `fromBitsSigned`, `flipBit`), `Segmented` (operator, width), `TextField` + `core/parse`, `ChipButton` presets, `createRecorder` for the tricks, `useScenePicker`, `CodePanel` for the one-line expressions.

**AC.**
- **Watch:**
  - set bits are `--hi` and clear bits `--dim` (the bit-lesson rule);
  - the column being evaluated is ringed in `--info`;
  - the mask register is `--violet`;
  - a bit the operation changed gets an `--ok` tick;
  - the sign bit in 32-bit mode is labelled `--orange`, a category, not an error.
- **Misconception:** "`>>` and `>>>` are the same", and "bitwise ops in JS work on 64-bit numbers". They work on 32-bit signed integers, and `>>>` is the unsigned shift. A quiz question targets it.
- **Correctness:**
  - Every operator is checked against JavaScript's own operator for all 8-bit pairs (65,536), and on 10,000 seeded 32-bit pairs (`mulberry32`).
  - The `x << 32 === x` and `1 << 31 < 0` facts are asserted.
  - Kernighan's step count equals the popcount for 0…65535.
  - The power-of-two test is right for 0…2³¹ boundary values, including 0 (false) and `-2147483648` (the caption must say what JS returns, tested).
  - XOR swap of one variable with itself yields 0.
- **Hostile input:** non-integers, out-of-range values and `1e400` are refused with a message and the old value kept. In 8-bit mode a value above 255 is refused, not silently masked.
- **Honesty:** "8-bit mode is a teaching width; JavaScript always computes in 32 bits" shown while 8-bit mode is on.

**Phone.** Two 8-bit `BitStrip`s fit at 390 (`size="md"`). In 32-bit mode the strips wrap by byte groups (`chunkGroups(32, 8)`), so no `minWidth` is needed. Controls wrap.

**`endianness` · Endianness & Byte Order**
Track `hw` · *"Which end of the number comes first?"* · Builds on: `binary-hex`, `bit-manipulation`
**Spec.**
- A 32-bit register holding a value (default `0x12345678`), split into four bytes. "Store at address 0x1000" animates the bytes flying into a 4-cell memory row: big-endian puts `12 34 56 78` at increasing addresses, little-endian `78 56 34 12`.
- Each byte keeps its colour, so the reversal is visible.
- A toggle between big- and little-endian, and a width picker (16 / 32 / 64-bit, the last using `BigInt` `setBigUint64`).
- **"Read it wrong" scene:** bytes written little-endian are read back big-endian, showing the garbage value (`0x78563412`). This is the classic bug when parsing a binary file or a network header with the wrong order.
- **Network byte order scene:** a port number `443` (`0x01BB`) written into a TCP-header-style byte row in big-endian (network order), with `htons` explained as "swap on little-endian hosts, no-op on big-endian".
- Preset chips: the PNG signature and its big-endian chunk length, a UTF-16 BOM (`FE FF` vs `FF FE`), and "your machine" (reads `new Uint8Array(new Uint32Array([1]).buffer)[0]` and reports the host's real order).

**Out of scope.** Bit order within a byte (not observable to software here; one key idea says so); binary protocol design stays in `grpc-protobuf`.

**Kit.** `ByteGrid` (K-8; memory row with `offsetBase` as addresses, `fields` per value), `BitStrip` (the register), `Toggle`, `Segmented`, `TextField` (hex value, `core/parse` plus a tested hex parser), `ChipButton` presets, `Flyer` for the byte move.

**AC.**
- **Watch:** each byte has a categorical tone (`categorical(i)`, never `--bad`/`--ok`) that follows it from the register into memory. The current address is `--hi`, and a mis-read value is `--bad`.
- **Misconception:** "endianness reverses the bits", or "it changes the number". It changes the order the same bytes are stored in, and a value is only wrong when it's read with the other order. A quiz question targets it.
- **Correctness:**
  - Bytes come from `DataView.setUint16/32` and `setBigUint64` with both `littleEndian` flags (not hand-rolled).
  - The "read wrong" value equals `getUint32` with the opposite flag.
  - Round-trips are tested on 1,000 seeded values per width.
  - `0x01BB` big-endian is `01 BB`.
  - "Your machine" reports the result of the typed-array probe, never a hard-coded "little".
- **Honesty:** "Your machine is little-endian" is computed live. The stage also notes that most x86 and ARM systems run little-endian, as a fact, not as the probe result.

**Phone.** Register and memory row stack vertically ≤900 px. A 64-bit row is 8 bytes and fits at 390 with `ByteGrid perRow={8}`. No `minWidth`.

**`error-detection-correction` · Error Detection & Correction: Parity, CRC & Hamming**
Track `math` · *"Catch the flipped bit, then fix it"* · Builds on: `bit-manipulation`, `binary-hex`
**Spec.**
- **Parity scene:** an 8-bit word plus an even-parity bit. The learner clicks bits to flip them "in transit". One flip is detected; two flips cancel and pass undetected (the counter shows that).
- **Hamming(7,4) scene:** 4 data bits encode into 7 positions numbered 1-7. Parity bits sit at positions 1, 2 and 4, and data at 3, 5, 6 and 7.
  - p1 covers 1, 3, 5, 7; p2 covers 2, 3, 6, 7; p4 covers 4, 5, 6, 7. Each group is drawn as a coloured band over the grid.
  - Flip any bit. The failing checks light, and the **syndrome** (p4 p2 p1 read as a binary number) names the flipped position, which is corrected.
  - Flip two bits and the syndrome points at a third, wrong position, so it "corrects" the wrong bit. A toggle adds the overall parity bit (SECDED), which then reports "two errors, can't fix".
- **CRC scene:** polynomial long division mod 2, stepped XOR by XOR, with a short generator (CRC-4, `x⁴ + x + 1`, `10011`) on a short message. The remainder is appended, and the receiver's division gives remainder 0. Flipping a bit gives a non-zero remainder.
- A "real CRCs" panel computes CRC-8 (polynomial `0x07`) and CRC-32 (IEEE) on typed text.
- Where it's used: Ethernet FCS (CRC-32), ECC RAM (SECDED), QR codes and RAID (Reed-Solomon and parity, named only).

**Out of scope.** Reed-Solomon maths and checksum-vs-cryptographic-hash (`macs-hmac` owns tamper resistance); entropy and coding bounds stay in T3 `entropy-information`.

**Kit.** `CellGrid` (K-7; the 7-position Hamming grid with group bands as `highlight`), `BitStrip` (parity word, CRC rows with `groups` for the divisor window), `ByteGrid` (K-8; CRC output bytes), `createRecorder` (CRC division steps), `Toggle` (SECDED), `TextField`, `useScenePicker`. The long-division layout is local.

**AC.**
- **Watch:**
  - data bits are `--info`;
  - the three parity groups take categorical tones (`--violet`, `--amber`, `--sky`);
  - a flipped bit is `--bad`, a corrected bit `--ok`, a failing check `--bad`, a passing check `--dim`;
  - the CRC divisor window is `--hi`;
  - a miscorrected bit (two flips) is `--orange`, the second failure kind.
- **Misconception:** "a checksum that passes means the data is intact". Parity misses even numbers of flips, and plain Hamming(7,4) miscorrects double errors. A quiz question targets it.
- **Correctness:**
  - For all 16 data words and all 7 single-bit flips, the syndrome equals the flipped position and the decode recovers the data.
  - For all 21 double flips, plain (7,4) miscorrects, and SECDED flags "uncorrectable" (exhaustive).
  - Parity detects every odd-weight flip pattern and no even-weight one (exhaustive over 9 bits).
  - The CRC-4 remainder matches a reference bitwise implementation on all 8-bit messages.
  - CRC-8/SMBUS (`0x07`, init 0) of ASCII `"123456789"` is `0xF4`, and CRC-32/ISO-HDLC is `0xCBF43926` (standard check values).
  - The verdict captions ("corrected", "undetected", "miscorrected") are computed from the flip set, tested per combination (AC-0/T2 rule 1).
- **Honesty:** "You flip the bits by hand; real channels flip them at random". "CRC-4 is a teaching size; Ethernet uses CRC-32" shown in the CRC scene.

**Phone.** The Hamming grid (7 cells) and parity word fit at 390. The CRC long division is wrapped in `WideRegion` (≈ 520 px), keeping the bit text at ≥ 11 px. Group legend chips wrap.

**`adders-alu` · From Gates to Adders & the ALU**
Track `hw` · *"Addition is XOR with a memory for carries"* · Builds on: `logic-gates`, `twos-complement`
**Spec.**
- **Half adder:** inputs A and B wired to an XOR (sum) and an AND (carry), with a live `TruthTable`. Toggling inputs animates the signals, as in `logic-gates`.
- **Full adder:** adds a carry-in. Sum = A ⊕ B ⊕ Cin, Cout = AB + Cin·(A ⊕ B), built from two half adders and an OR.
- **4-bit ripple-carry adder:** four full adders in a row.
  - The learner sets A and B (bits or decimal 0-15), and the carry visibly ripples right to left, one stage per tick.
  - A delay counter in gate-delay units shows the worst case (`0111 + 0001`, or `1111 + 0001`) taking the longest.
  - The Cout of the top bit is the unsigned carry, and the V flag (carry into the MSB ⊕ carry out of it) is the signed overflow, linked to `twos-complement`.
- **Carry-lookahead toggle:** per-bit generate Gᵢ = AᵢBᵢ and propagate Pᵢ = Aᵢ ⊕ Bᵢ, and Cᵢ₊₁ = Gᵢ + PᵢCᵢ expanded so all carries appear after a fixed delay. The delay counter compares the two.
- **Mini ALU:** an op selector (ADD, SUB, AND, OR) feeding a mux.
  - SUB inverts B and sets carry-in to 1 (A + ~B + 1), so subtraction reuses the adder.
  - Output flags Z, N, C and V are shown.

**Out of scope.** Multipliers and floating-point units; the CPU around the ALU is `fetch-decode-execute` (T1) and pipelining is `cpu-pipelining`.

**Kit.** `TruthTable` (half and full adder), `BitStrip` (A, B, sum and carry rows, `highlight` for the rippling carry), `createRecorder` (ripple ticks), `Segmented` (ALU op), `Toggle` (ripple / lookahead), `Stat` (delays and flags), `useScenePicker`. Gate glyphs reuse the `logic-gates` drawing approach, kept local, because that lesson's gates are local (see report).

**AC.**
- **Watch:** high wires and set bits are `--hi`, low wires `--dim`, the carry travelling between stages `--info`, the selected ALU op `--violet`, and a set overflow flag `--bad`. The C flag (unsigned carry) is `--orange` when the result wrapped.
- **Misconception:** "the carry flag and overflow are the same thing". C is unsigned wraparound and V is signed overflow; `0111 + 0001` sets V but not C, and `1111 + 0001` sets C but not V. A quiz question targets it.
- **Correctness:**
  - The 4-bit adder equals `(a + b) & 15`, with carry `(a + b) > 15`, for all 256 pairs.
  - V equals (the signs of the inputs match and the sign of the result differs) for all pairs.
  - SUB equals `(a - b) & 15`, with flags matching a reference, for all pairs.
  - Lookahead carries equal ripple carries for all pairs.
  - The ripple delay counter equals 1 plus the longest carry-propagation chain, under the lesson's stated delay model (a named constant).
- **Honesty:** "Gate delays are in illustrative units: one tick per gate level" on screen.

**Phone.** The 4-stage adder diagram uses `StageFrame minWidth={640}`, or a `WideRegion` around the diagram only (≈ 640 px) with the truth table and flags reflowing below. The half-adder scene fits at 390.

**`sequential-logic` · Flip-Flops, Registers & Clocks**
Track `hw` · *"How circuits remember"* · Builds on: `logic-gates`, `adders-alu`
**Spec.**
- **SR latch:** two cross-coupled NOR gates. The learner pulses S and R and sees Q hold after the inputs return to 0. S = R = 1 is marked "invalid", and releasing both at once is labelled "unpredictable".
- **D latch vs D flip-flop:** a clock waveform scrolls along a timing diagram with lanes CLK, D and Q.
  - The learner toggles D at any moment.
  - The latch's Q follows D while CLK is high (transparent).
  - The flip-flop's Q changes only on the rising edge, capturing D at that instant.
  - A "glitch" preset wiggles D while CLK is high: the latch passes the glitch, the flip-flop doesn't.
- **Register and counter:** four D flip-flops share one clock to make a 4-bit register. Feeding an adder's output (+1) back in makes a counter that ticks once per clock edge. A "clock speed" slider shows that the next edge must wait for the adder's settle delay (from `adders-alu`), or the captured value is wrong.
- Step clock / run clock / pause controls.

**Out of scope.** Metastability physics and setup/hold timing analysis are named only (one honesty line). Full finite-state-machine design is left to `dfa-nfa` (states) and `cpu-pipelining` (pipeline registers).

**Kit.** `TruthTable` (SR latch, with an "invalid" row via `mismatchRows`), `BitStrip` (register bits), `createRecorder` (stepped clock), `Toggle`, `Slider` (clock period, with `format`), `PauseButton`, `useScenePicker`. The **timing diagram (CLK, D, Q waveforms) stays local**: its only other plausible Tier 2 user is `cpu-pipelining`, whose pipeline chart is a different visual (see report).

**AC.**
- **Watch:**
  - logic 1 is `--hi` and logic 0 `--dim` on wires and waveforms;
  - the rising clock edge that captures is marked `--info`;
  - the stored Q value is `--violet`;
  - the invalid SR state is `--bad`;
  - a value captured too early (clock faster than settle time) is `--bad` with its correct value shown `--ok`.
- **Misconception:** "a latch and a flip-flop are the same thing". The latch is level-sensitive and the flip-flop edge-triggered. A quiz question targets it, using the glitch preset.
- **Correctness:**
  - The latch, flip-flop and counter models are pure step functions over the sampled waveform, tested on scripted waveforms (glitch passed by the latch, blocked by the flip-flop).
  - The flip-flop output changes only at rising edges (an invariant tested over 1,000 seeded random D waveforms).
  - The counter counts 0…15 then wraps to 0.
  - With period < settle delay, the captured value differs from the correct sum, and the caption is derived from that comparison, not from the slider position.
- **Honesty:** "Idealised gates: real latches can go metastable when inputs change too close to the clock edge; that isn't modelled." "Delays are illustrative."

**Phone.** The timing diagram is wide, so wrap it in `WideRegion` (≈ 560 px, three lanes); the latch circuit and register strip fit at 390 and stack above it.

---

##### Batch T2-B2 · Number theory & counting (`math`)
Wave 1. Pilots **`core/numberTheory` (K-10)**, **`core/stats` (K-11)** and **`Plot2D` (K-12)** (birthday curve), and uses **`CellGrid` (K-7)** for the sieve and multiplication table. This batch is the root of the crypto chain (`rsa`, `diffie-hellman` in wave 3), so its numbers must be exactly right.

**`modular-arithmetic` · Modular Arithmetic**
Track `math` · *"Clock maths that runs the internet"* · Builds on: `binary-hex`, `hash-table`
**Spec.**
- A clock face with n positions (modulus slider 2-24, default 12). "+a" walks the hand a steps around the circle, wrapping past 0, and "×a" from 1 repeats the walk.
- The sum or product mod n is read off the face, beside the equation `17 mod 12 = 5`.
- **Multiplication table heatmap:** the n×n table of `(a × b) mod n`. Rows that contain a 1 (a has an inverse) are marked.
  - For prime n every non-zero row has an inverse.
  - For composite n (12) the rows of 2, 3, 4, 6, 8, 9 and 10 never reach 1, so a has an inverse only when gcd(a, n) = 1. That links to `gcd-euclid`.
- **Negative numbers panel:** JavaScript's `-7 % 3` is `-1`, while the mathematical `mod(-7, 3)` is `2`. A ring-buffer index `(i - 1) % n` goes wrong at i = 0, and `((i % n) + n) % n` fixes it.
- Where it shows up: `hash % buckets` (`hash-table`), ring-buffer indices, day-of-week arithmetic, and, as preview only, `modPow` in RSA and DH.

**Out of scope.** Fast exponentiation (T3 `modular-exponentiation`) and CRT (T3 `chinese-remainder`); `modPow` appears only as a named preview.

**Kit.** `core/numberTheory` (K-10: `mod`, `gcd`, `modInverse`), `CellGrid` (K-7; the table, `onCellClick` with roving tabindex, `rowLabels`/`colLabels`), `Slider` (modulus), `TextField` + `core/parse`, `createRecorder` for the walk, `useScenePicker`. The clock-face SVG is local.

**AC.**
- **Watch:**
  - the hand and the current position are `--hi`;
  - the steps walked are `--info`;
  - table cells take a heat tint by value (`intensity`, one tone, `--info`);
  - cells equal to 1 are `--ok`;
  - rows without an inverse are `--dim`;
  - the JS `%` result that differs from `mod` is `--orange`.
- **Misconception:** "`%` in code is the same as mod". It differs for negatives in JS, C and Java. A quiz question targets it, and another targets "every non-zero number has an inverse mod n" (only when coprime).
- **Correctness:**
  - `mod` is non-negative for all a in −1000…1000 and all n in 1…50.
  - A row has a 1 exactly when `gcd(a, n) === 1`, tested for n ≤ 50.
  - `modInverse(a, n) × a ≡ 1` when it exists, and it's null otherwise.
  - The fixed ring index never goes negative.
  - The "has an inverse" caption is computed from the table, not from "n is prime".
- **Hostile input:** n < 2 is refused, a is reduced mod n with the reduction shown, and huge values are refused above 10⁶.
- **Honesty:** "Nothing simulated: computed live".

**Phone.** The clock face fits at 390. The table is capped at 24×24 with `CellGrid size="xs"`. Above about 13 columns it sits in `WideRegion` (≈ 520 px) so the cell text stays ≥ 8 px; the walk scene stacks above.

**`gcd-euclid` · GCD & the Euclidean Algorithm**
Track `math` · *"The oldest algorithm still in production"* · Builds on: `modular-arithmetic`, `recursion`
**Spec.**
- **Rectangle tiling:** an a×b rectangle (default 1071×462, scaled) is filled with the largest squares that fit. The leftover strip repeats the process until a square tiles it exactly; that square's side is the GCD (21). Each step is one line of the remainder table: `1071 = 2·462 + 147`, `462 = 3·147 + 21`, `147 = 7·21 + 0`.
- The learner types a and b, or picks presets:
  - `1071, 462`;
  - coprime numbers (`17, 5`);
  - consecutive Fibonacci numbers (`89, 55`), the worst case with the most steps, against a step counter;
  - `a < b`, where the first step just swaps.
- **Extended Euclid:** the same table with back-substituted x, y columns, giving Bézout's identity `1071·(−3) + 462·7 = 21`.
- **Modular inverse:** pick n and a coprime a; the extended algorithm gives a⁻¹ mod n (3⁻¹ mod 11 = 4, since 3·4 = 12 ≡ 1), and the lesson connects it to the RSA private exponent (preview).
- A comparison counter against the naive "try every d from min(a, b) down" method.

**Out of scope.** RSA key generation itself (`rsa`); binary GCD and Lamé's proof are named in a key idea, not taught.

**Kit.** `core/numberTheory` (K-10: `gcd`, `egcd` with its step list, `modInverse`), `createRecorder` (tiling steps), `TextField` ×2 + `core/parse`, `ChipButton` presets, `.data-table` for the remainder table, `Stat` counters. The rectangle tiling SVG is local, with scale computed to fit.

**AC.**
- **Watch:**
  - the square being placed is `--hi`;
  - placed squares are tinted by step with a categorical tone, a category, not status;
  - the remaining strip is `--info`;
  - the final GCD square is `--ok`;
  - the current table row is `--hi`;
  - the x/y back-substitution values are `--violet`.
- **Misconception:** "finding the GCD needs prime factorisation". Euclid never factors anything, and is fast even when factoring is infeasible. A quiz question targets it.
- **Correctness:**
  - `gcd` and `egcd` are tested against brute force for all 1 ≤ a, b ≤ 300.
  - The Bézout identity `a·x + b·y = g` holds for every pair.
  - The step counter for consecutive Fibonacci numbers is the maximum for numbers below that size (checked against brute force up to 1,000).
  - 1071/462 gives 21 in 3 division steps with x = −3, y = 7.
  - The inverse caption appears only when gcd = 1; otherwise it says "no inverse: gcd is g".
- **Hostile input:** 0 is allowed for one argument (gcd(a, 0) = a, captioned); both zero, negatives, non-integers and values > 10¹² are refused.
- **Honesty:** "Very thin rectangles are drawn with a minimum width so they stay visible (not to scale)." This applies when the ratio is extreme.

**Phone.** The tiling SVG scales to the stage width (it's a self-contained drawing with no small text; labels sit in the table below). The table becomes a 4-column `.data-table` that fits at 390; extended columns go in a `WideRegion` (≈ 480 px).

**`primes-factoring` · Primes, Sieves & Factoring**
Track `math` · *"Easy to multiply, brutally hard to undo"* · Builds on: `gcd-euclid`, `logs-exponentials`
**Spec.**
- **Sieve of Eratosthenes:** a grid of 2…N (N = 100, 200 or 400). The learner steps or plays:
  - each new prime p lights;
  - its multiples are crossed out starting from p² (earlier multiples are already gone), in a wave;
  - the sieve stops once p² > N, and every survivor is prime.
  - A counter shows primes found (25 below 100) and crossings done.
- **Multiply vs factor:** pick two primes from chips or a digit-length slider (2-12 digits per prime). Multiplying is instant.
  - "Factor it" runs trial division live up to √n, with a step counter and an elapsed-time readout.
  - The time is extrapolated for longer numbers on a log axis (`Plot2D`), up to 617 decimal digits (RSA-2048).
- **Primality check:** type a number and run a deterministic Miller-Rabin check (fast), next to trial division (slow), on the same number. A Carmichael number (561 = 3·11·17) shows why the plain Fermat test is fooled.
- Where it's used: RSA rests on this asymmetry (`rsa`, wave 3).

**Out of scope.** Real factoring algorithms (quadratic sieve, GNFS) are named only; the Miller-Rabin internals are shown as a black box with its result.

**Kit.**
- `CellGrid` (K-7; the sieve, with `cellTitle` "57 = 3 × 19").
- `core/numberTheory` (K-10: `sieve` with its crossing order, `trialFactor` with a step counter, `isProbablePrime`).
- `Plot2D` (K-12; log-y extrapolation).
- `core/format` (`humanDuration`, `power`).
- `createRecorder` for the sieve; `Slider`, `TextField`, `ChipButton`.
- Trial division runs off the main thread in slices (`useInterval`) so the page stays responsive; it is capped at 10⁸ steps.

**AC.**
- **Watch:**
  - the current prime p is `--hi`;
  - multiples being crossed are `--bad`, then `--dim` once struck;
  - confirmed primes are `--ok`;
  - unvisited numbers have no fill;
  - the factoring step counter bar is `--info`;
  - the measured part of the time plot is solid `--info`, the extrapolated part dashed `--violet`.
- **Misconception:** "factoring big numbers is just slow, so a faster computer fixes it". Each extra digit multiplies the trial-division work, and the plot shows the cliff. A second quiz question targets "you only need to cross out from 2p" (from p² is enough).
- **Correctness:**
  - The sieve output equals a trial-division primality reference for 2…10,000.
  - Crossing starts at p² and stops when p² > N (asserted on the recorded order).
  - `trialFactor` returns factors whose product is n for 1,000 seeded n < 10¹².
  - `isProbablePrime` agrees with the sieve below 10⁶ and rejects 561, 1105 and 1729.
  - The extrapolation formula is a named function: measured steps-per-second × √n. It is tested, and the caption reads its output.
- **Hostile input:** non-integers, n < 2 and values beyond the cap are refused with a message. Factoring above the cap says "too big to try here", not "prime".
- **Honesty:** "Times beyond what we ran are extrapolated from your browser's measured speed, for trial division only; real algorithms are much faster, but 2048-bit RSA moduli are still out of reach." Shown in the factor scene.

**Phone.** The 100-cell sieve is a 10×10 grid that fits at 390 (`size="sm"`); 200 and 400 switch to `size="xs"` with smaller labels inside a `WideRegion` (≈ 480 px). `Plot2D` fits at 356 px wide with ≥ 9 px tick labels.

**`combinatorics` · Counting: Permutations & Combinations**
Track `math` · *"How many ways? More than you think"* · Builds on: `logs-exponentials`, `recursion`
**Spec.**
- Pick n items (3-6 lettered tiles) and k (1…n). A choice tree branches: n options, then n−1, … for k levels, so P(n, k) = n!/(n−k)! leaves.
- Flip to **combinations**: leaves holding the same set merge (each set appears k! times), leaving C(n, k) = P(n, k)/k! groups. The merge animates with the k! count on each group.
- **Pascal's triangle:** rows build alongside, each cell the sum of the two above. The cell C(n, k) lights when n and k change. Clicking a cell sets n and k.
- **"With repetition" toggle:** nᵏ ordered (PIN codes), and C(n+k−1, k) unordered (scoops of ice cream).
- **Explosion panel:**
  - 10 boolean feature flags give 2¹⁰ = 1,024 test combinations, against pairwise testing (named, not taught);
  - an 8-character lowercase password gives 26⁸ ≈ 2.1·10¹¹;
  - the orders of a 10-step deploy give 10! = 3,628,800.
  - All counts are exact `bigint` and shown with `power()` where huge.

**Out of scope.** Generating functions and inclusion-exclusion; probabilities on top of counts are `probability-basics` and `birthday-paradox`.

**Kit.** `TreeSvg` (`tidy` layout, the choice tree, n ≤ 6 and the leaves capped by `hidden` when P > 120), `core/stats` (K-11: `factorial`, `choose` as `bigint`), `CellGrid` (K-7; Pascal's triangle as a left-aligned grid with `onCellClick`), `Segmented` (n, k), `Toggle` (order matters / doesn't; repetition), `core/format` (`power`), `createRecorder`.

**AC.**
- **Watch:** the branch being expanded is `--hi`, completed leaves `--info`, leaves merging into one combination `--violet`, and the matching Pascal cell `--hi`. The two parents summed are `--info`.
- **Misconception:** "order doesn't matter, so it's the same count" (confusing P and C), and "doubling n doubles the count". A quiz question targets the first with a concrete n, k.
- **Correctness:**
  - `choose` and `factorial` are tested against brute-force enumeration for n ≤ 10.
  - The tree's leaf count equals P(n, k), and the merged groups equal C(n, k), for every n ≤ 6 and k ≤ n.
  - Every Pascal cell equals `choose`.
  - With-repetition counts equal enumeration for n ≤ 5, k ≤ 4.
  - 26⁸ = 208,827,064,576 and 10! = 3,628,800 are asserted.
- **Hostile input:** none typed (selectors only).
- **Honesty:** "For more than 120 leaves the tree shows the first branches only; the count is exact" (when capped).

**Phone.** The choice tree for P(6, 3) = 120 leaves won't read at 390, so wrap the tree in `WideRegion` (≈ 720 px) and cap the drawn leaves. Pascal's triangle (≤ 11 rows) fits at `size="xs"`. The explosion panel reflows.

**`birthday-paradox` · Pigeonhole & the Birthday Paradox**
Track `math` · *"23 people, a 50% chance of a shared birthday"* · Builds on: `combinatorics`, `hash-table`
**Spec.**
- **Pigeonhole:** n pigeons into m holes (sliders). When n > m a hole with two lights up as guaranteed; when n ≤ m it can be avoided. With 366 people a shared birthday is certain (365 days, ignoring Feb 29; 367 if Feb 29 is counted).
- **Calendar:** a 365-cell calendar grid. "Add a person" (or play) drops seeded random birthdays until the first collision flashes, and repeated runs build a histogram of "people at first collision" (median around 23).
- The exact curve P(collision | n) = 1 − ∏(1 − i/365) plots beside it, with the learner's run marked. At n = 23 it reads 50.7%, and at 70 it reads 99.9%.
- **IDs and hashes panel:** a bit-length slider (16-128) and an "IDs generated" slider plot collision odds.
  - The approximation 1 − e^(−n(n−1)/2d) is shown with d = 2ᵇ.
  - The ~50% point is ≈ 1.1774·√d: about 77,000 for 32-bit IDs.
  - It is applied to a 7-hex-character short Git hash (28 bits) and to UUIDv4 (122 random bits).
- A "why it surprises you" caption counts pairs: 23 people make C(23, 2) = 253 pairs.

**Out of scope.** Hash table collision handling itself (`hash-table`); the ID schemes are `distributed-id-generation` (wave 9), so they're mentioned here only by bit count.

**Kit.** `CellGrid` (K-7; the calendar), `core/stats` (K-11: `collisionProbability`, `choose`, `histogram`), `Plot2D` (K-12; curve plus histogram `Bars`, a `VLine` at n), `Slider` ×3 (with `format`), `core/random` `mulberry32`, `PauseButton`, `useScenePicker`.

**AC.**
- **Watch:**
  - occupied days are `--info`;
  - the colliding day is `--bad`;
  - the newest arrival is `--hi`;
  - the exact curve is `--violet`;
  - the learner's run marker is `--hi`;
  - the histogram bars are `--info`;
  - the 50% line is `--dim`;
  - in the pigeonhole scene the guaranteed double hole is `--bad`.
- **Misconception:** "you need about 183 people (365/2) for even odds". The quiz targets it, and the pair count explains why.
- **Correctness:**
  - The exact product gives 0.5073 at n = 23 and 0.9992 at n = 70 (to 4 dp).
  - `collisionProbability` switches from exact to the exponential approximation where documented, with the error below 10⁻³ at the switch point (tested).
  - The 50% point for b = 32 is within 1% of 77,163.
  - The seeded simulation's mean first-collision is within 1.0 of the exact expectation 24.62 over 10,000 runs (tested with a fixed seed).
  - The pigeonhole verdict is computed as n > m.
- **Honesty:** "Birthdays are drawn at random, uniform over 365 days (seeded; real birthdays aren't quite uniform)". The IDs panel says "assumes truly random IDs".

**Phone.** The calendar is 365 cells: 19 columns `xs` won't fit at 390, so lay it out as 12 month rows of up to 31 (`CellGrid` with `rowLabels` = months) inside `WideRegion` (≈ 560 px); the plot fits at 356 px; sliders wrap.

---

##### Batch T2-B3 · Graph algorithms (`dsa`, `math`)
Wave 1. Pilots **`GraphView` (K-6)** (`layered` and `fixed` layouts, edge weights, `nodeMark`/`edgeMark`, roving tabindex, `editable`), and **`TreeSvg` forest mode (K-9)** for union-find. Every algorithm here runs on the learner's edited graph, so every verdict must come from the graph, never from the preset (AC-0/T2 rule 1; it's the tree-traversals M-1 lesson again).

**`topological-sort` · Topological Sort & DAGs**
Track `dsa` · *"Build order for anything with dependencies"* · Builds on: `graph-representations`, `graph-search`, `stack-queue`
**Spec.**
- A dependency graph (edge u → v means "u before v") with in-degree badges on every node. **Kahn's algorithm** runs step by step:
  - zero-in-degree nodes wait in a queue lane;
  - the front one is dequeued into the output lane and its outgoing edges fade, decrementing badges;
  - new zero-in-degree nodes join the queue.
- A "valid orders" counter (exact for ≤ 8 nodes) shows there's usually more than one right answer.
- **Cycle:** the learner adds an edge that closes a loop (keyboard: pick source, pick target). Kahn's jams: nodes remain with in-degree > 0, the jam is flagged, and the stuck nodes' cycle is outlined.
- A DFS-based version (post-order, reversed) can be switched in to give a possibly different valid order. Both are checked as valid.
- Presets: a course-prerequisite DAG (from `graph-representations`), an npm-style package graph, a build pipeline, and a database migration chain.

**Out of scope.** Strongly connected components and condensation stay in T3 `strongly-connected-components`. Build caching is `build-systems` (wave 7).

**Kit.**
- `GraphView` (K-6; `layout="layered"`, directed, `editable`, in-degree via node labels, `edgeMark` for removed and cycle edges).
- `Tray` (queue and output lanes), `createRecorder`, `Segmented` (Kahn / DFS).
- `useScenePicker` for presets.
- `ChipButton` for "add edge" in keyboard mode.

**AC.**
- **Watch:**
  - the node being emitted is `--hi`;
  - emitted nodes are `--ok`;
  - nodes queued with in-degree 0 are `--info`;
  - edges already consumed are `--dim`;
  - cycle edges and stuck nodes are `--bad`;
  - in-degree badges are `--violet`.
- **Misconception:** "there's one correct build order", and "any graph can be topologically sorted". The quiz targets both (the cycle preset).
- **Correctness:**
  - For every preset and 500 seeded random DAGs (≤ 12 nodes), every emitted order respects every edge.
  - For cyclic graphs, Kahn's emits fewer than V nodes, and the outlined cycle is a real cycle in the graph.
  - The valid-order count matches brute-force permutation checking for ≤ 8 nodes.
  - DFS and Kahn orders are both valid and may differ.
  - The "jammed: cycle" caption is driven by `emitted < V`, not by the preset name.
- **Honesty:** "Nothing simulated: computed live".

**Phone.** The layered graph for the presets is 4-5 layers wide. Use `StageFrame minWidth={560}`, or a `WideRegion` around the graph only (≈ 560 px), with the queue and output lanes reflowing below it.

**`union-find` · Union-Find (Disjoint Sets)**
Track `dsa` · *"Who's connected, in nearly O(1)"* · Builds on: `trees-bst`, `big-o` (`amortized-analysis` is wave 4, so it isn't linked)
**Spec.**
- Ten elements start as ten single-node trees (a forest). `union(a, b)` links one root under the other; `find(x)` walks parent pointers to the root, with the path highlighted.
- The learner clicks two elements, or uses keyboard pick-pick, to union them, or clicks one to find it.
- Toggles: **union by rank** (or size), and **path compression**.
  - With both off, a "chain" preset (union 1-2, 2-3, … in the worst order) builds a tall tree, and a find walks every link.
  - With compression on, the same find re-parents every node on the path straight to the root, animated.
- A height meter and a "pointer hops" counter compare the variants over a scripted sequence of 30 operations.
- **Connectivity panel:** "are a and b connected?" answered by comparing roots. Applications: network islands, Kruskal (next lesson), image regions.

**Out of scope.** The inverse-Ackermann bound is stated, not proved; persistent and rollback variants are out.

**Kit.** `TreeSvg` forest mode (K-9; `roots`, `tidy` layout, parent glide on re-parent), `ArrayStrip` (the `parent[]` array, kept in sync, `cellState` for the path), `Toggle` ×2, `createRecorder`, `Stat` (height, hops), `ChipButton` (preset sequences). `core/disjointSet.ts` (K-20) does the unions and finds and emits the trace events the frames are built from; `minimum-spanning-trees` uses the same module.

**AC.**
- **Watch:** the find path is `--hi`, the root reached `--ok`, nodes being re-parented by compression `--info`, the two roots being linked `--violet`, and the height meter `--info`.
- **Misconception:** "union-find needs a tree traversal to check connectivity", or "without the optimisations it's still fast". The chain preset's hop count disproves the second. A quiz question targets it.
- **Correctness:**
  - Connectivity answers equal a BFS reference on 1,000 seeded operation sequences (n = 10…200).
  - With union by rank, tree height stays ≤ ⌊log₂ n⌋ (asserted on every step).
  - Path compression leaves every node on a found path pointing directly at the root.
  - The scripted 30-op hop totals are computed and asserted per toggle combination (all 4), and the captions read those totals.
- **Honesty:** "Nothing simulated: computed live".

**Phone.** A forest of ten small trees fits at 390 once merged, but the start state (ten singletons) needs ≈ 420 px, so use `WideRegion` around the forest (≈ 440 px) with the parent array below as an `ArrayStrip` `cellMax`.

**`minimum-spanning-trees` · Minimum Spanning Trees (Kruskal & Prim)**
Track `dsa` · *"Connect everything for the least cost"* · Builds on: `union-find`, `heaps`, `graph-search`
**Spec.**
- A weighted undirected graph (presets: "cabling 6 offices", "road grid", "equal weights"), editable weights (click an edge, type a weight).
- **Kruskal:** edges listed in sorted order beside the graph. Each step takes the cheapest remaining edge:
  - if its ends are in different union-find sets (sets coloured), it's accepted and the colours merge;
  - if not, it's rejected as "would make a cycle".
- **Prim:** grows from a chosen start node. The frontier (edges leaving the tree) sits in a priority-queue lane, and the cheapest frontier edge joins each step.
- **Run both:** the two trees may differ when weights tie, but the total weight always matches, and a total counter compares them.
- **Cut property panel:** pick any split of the nodes into two groups and the lightest crossing edge lights. It is always in some MST.
- An "is it unique?" badge appears when all weights are distinct.
- A greedy-trap note compares this with shortest paths: an MST isn't a shortest-path tree. A preset shows a pair of nodes whose MST path is longer than the direct route (links `graph-search`).

**Out of scope.** Borůvka and Steiner trees; shortest paths themselves are `graph-search`.

**Kit.** `GraphView` (K-6; `fixed` layout, weights, `edgeMark` for accepted, rejected and frontier, roving tabindex, edge weight editing via `onEdgeClick` + `TextField`), `Tray` (sorted-edge list, frontier), `core/disjointSet.ts` (K-20, shared with `union-find`), `Segmented` (Kruskal / Prim), `createRecorder`, `Stat`.

**AC.**
- **Watch:**
  - the edge under consideration is `--hi`;
  - accepted edges are `--ok`;
  - edges rejected as cycles are `--bad`, then `--dim`;
  - frontier edges in Prim are `--info`;
  - Kruskal's sets are categorical tones (categories);
  - the cut's two sides are `--violet` and `--sky`, with the lightest crossing edge `--hi`.
- **Misconception:** "the MST gives the shortest path between any two nodes". A quiz question targets it with the trap preset.
- **Correctness:**
  - MST total weight equals brute force (enumerate all spanning trees) on every preset and 300 seeded random graphs with ≤ 7 nodes.
  - Kruskal and Prim totals are equal on 1,000 seeded graphs (≤ 30 nodes).
  - With distinct weights both produce the identical edge set.
  - The cut-property edge is in the computed MST whenever weights are distinct.
  - A disconnected graph yields "spanning forest, not a tree", computed from component count, not the preset.
- **Hostile input:** weights other than integers 0-999 are refused with a message; the previous weight is kept.
- **Honesty:** "Nothing simulated: computed live".

**Phone.** `StageFrame minWidth={520}` for the graph scenes, keeping weight labels ≥ 9 px. The sorted-edge list and frontier lane reflow below at ≤ 900 px.

**`cycle-detection` · Fast & Slow Pointers (Floyd's Cycle Detection)**
Track `dsa` · *"The tortoise always catches the hare"* · Builds on: `arrays-linked-lists`, `two-pointers`
**Spec.**
- A rho-shaped linked list: a tail of μ nodes leading into a loop of λ nodes. Sliders set μ (0-8) and λ (1-10), plus "no cycle" (a plain list that ends in null).
- **Phase 1:** slow moves 1 step and fast moves 2 per tick. They meet inside the loop, or fast hits null ("no cycle"). A step counter shows the meeting happens within μ + λ steps of slow.
- **Phase 2:** one pointer resets to the head, both move 1 step, and they meet at the loop's start.
  - A stepped proof overlay: at the meeting point slow has walked μ + a, fast 2(μ + a), and the difference is a multiple of λ, so μ ≡ −a (mod λ).
  - Walking μ more from the meeting point lands on the start.
- **Phase 3:** the loop length λ is found by walking once round.
- **Array scene, "find the duplicate":** an array of n+1 values in 1…n, read as a function i → a[i], forms a rho. Floyd finds the duplicate in O(1) extra space, linking the abstraction to an interview problem.
- A hash-set comparison: detects the same, but uses O(n) memory (counter).

**Out of scope.** Brent's algorithm (named); linked-list operations themselves are `arrays-linked-lists`.

**Kit.** `GraphView` (K-6; `fixed` layout computed by a local rho-layout function: tail on a line, loop on a circle), `ArrayStrip` (the duplicate scene, with `pointers` S and F), `Slider` ×2 (`format`), `createRecorder`, `Stat`, `useScenePicker`.

**AC.**
- **Watch:** slow is `--info`, fast `--violet`, the meeting node `--hi`, the cycle start found in phase 2 `--ok`, the loop's nodes a light `--hi` tint once λ is measured, and null `--dim`.
- **Misconception:** "the meeting point is the start of the cycle". It's somewhere in the loop; phase 2 finds the start. A quiz question targets it, alongside "fast could jump over slow forever" (it gains one node per step, so it can't).
- **Correctness:**
  - For every μ ∈ 0…8 and λ ∈ 1…10:
    - the phase-1 meeting happens, and slow's step count is ≤ μ + λ;
    - phase 2 returns the node at index μ;
    - phase 3 returns λ.
  - "No cycle" is reported exactly when the list ends in null.
  - The duplicate finder returns the duplicate for 1,000 seeded arrays with exactly one value repeated (possibly several times), checked against a counting reference.
  - The proof overlay's numbers (μ, a, λ) are computed from the current run.
- **Honesty:** "Nothing simulated: computed live".

**Phone.** The rho drawing with up to 18 nodes uses `StageFrame minWidth={480}`; the array scene fits at 390 with `ArrayStrip cellMax`.

**`relations-orders` · Relations, Equivalence Classes & Partial Orders**
Track `math` · *"Ordering things that can't all be ordered"* · Builds on: `sets-functions`, `topological-sort`
**Spec.**
- A relation on a small set (4-8 elements) is drawn two ways at once: as a clickable relation matrix (cell (a, b) on means a R b) and as a directed graph.
- The learner toggles cells. Property badges update live: reflexive, symmetric, antisymmetric, transitive, with the first counterexample pair named ("(2, 3) is in R but (3, 2) isn't").
- Closure buttons ("make reflexive", "symmetric closure", "transitive closure") add the missing pairs in a highlighted wave.
- **Equivalence mode:** when the relation is reflexive, symmetric and transitive, the graph regroups into coloured classes, a partition. Preset: "same remainder mod 3" on 0-8.
- **Partial-order mode:** when it is reflexive, antisymmetric and transitive, the graph redraws as a **Hasse diagram** (transitive reduction, loops hidden, bigger elements higher).
  - Incomparable pairs light when hovered or picked.
  - "Extend to a total order" produces one linear extension, which is a topological sort (link back to `topological-sort`).
- Presets: "divides" on 1…12, "is a subset of" on the subsets of {a, b, c}, task dependencies, and a not-quite relation (one pair breaks transitivity).

**Out of scope.** Lattices and well-founded orders; happens-before as a partial order is T3 `logical-clocks` (mentioned only in a use case, not linked).

**Kit.**
- `CellGrid` (K-7; the relation matrix with `onCellClick`, roving tabindex, `rowLabels`/`colLabels`).
- `GraphView` (K-6; directed view, self-loops; `layered` for the Hasse diagram).
- `ChipButton` (closures), `useScenePicker`, `.chip` badges.
- The transitive-reduction and closure functions are pure and local in `model.ts`.

**AC.**
- **Watch:**
  - pairs in R are `--info` in both views;
  - pairs added by a closure flash `--hi`, then become `--info`;
  - a property's counterexample pair is `--bad`;
  - a property that holds gets an `--ok` badge;
  - equivalence classes are categorical tones (categories);
  - an incomparable pair is `--violet`.
- **Misconception:** "every set of things can be ranked in a line". Partial orders have incomparable elements (`{a}` vs `{b}`). A second quiz question targets "symmetric and antisymmetric are opposites" (a relation can be both, e.g. equality, or neither).
- **Correctness:**
  - The property checks are tested against brute-force definitions on all 2¹⁶ relations of a 4-element set.
  - The transitive closure equals Warshall's algorithm on 500 seeded relations.
  - The Hasse edges are exactly the covering pairs (tested on "divides" 1…12 and the subset lattice).
  - The equivalence classes partition the set (disjoint, covering) whenever the badges say equivalence.
  - The "this is a partial order" caption is computed from the badges, never from the preset.
  - The linear extension respects every pair.
- **Hostile input:** none typed (matrix and presets only). The element count is a `Segmented`.
- **Honesty:** "Nothing simulated: computed live".

**Phone.** An 8×8 matrix fits at 390 (`CellGrid size="sm"`). The graph or Hasse view stacks below the matrix at ≤ 900 px, with `StageFrame` off and a `WideRegion` around the graph (≈ 420 px) for the 12-element "divides" preset.

---

##### Batch T2-B4 · Kernel & scheduling (`os`)
Wave 2. Pilots **`GanttLanes` (K-13)** (cpu-scheduling, interrupts-context-switch) and **`MemoryMap` (K-15)** (virtual-memory-paging). Batch-wide: every kernel timing (trap cost, context-switch cost, tick length, disk latency) is a named constant labelled "illustrative" on screen; the mechanics are exact, the nanoseconds aren't.

**`syscalls-kernel-mode` · System Calls & Kernel Mode**
Track `os` · *"Crossing into the kernel"* · Builds on: `processes-threads`, `fetch-decode-execute`, `command-line` · **[domain review]**
**Spec.**
- A user/kernel wall drawn as two bands with the CPU's mode bit (ring 3 / ring 0) shown as a switch. A `read(fd, buf, 4096)` call steps through: libc wrapper → syscall number in `rax` and arguments in registers → `syscall` instruction (trap) → mode bit flips → kernel entry → dispatch through the syscall table → driver/page-cache work → copy into the user buffer → `sysret` → mode bit flips back.
- A **cost meter** accumulates illustrative time per crossing.
- A "**What's a syscall?**" sorter: chips for `printf`, `write`, `malloc`, `getpid`, `clock_gettime`, `strlen`, `open`, `fopen`. The learner drops each into "always", "sometimes" or "never traps". `printf` buffers and only sometimes calls `write`, `malloc` only sometimes calls `brk`/`mmap`, `clock_gettime` usually uses the vDSO (no trap) and `strlen` never traps.
- A **batching** preset: copying a 1 MB file with 1-byte `read`s vs 64 KB `read`s shows the syscall count (1,048,576 vs 16) and the cost meter.
- A **privilege** preset: user code tries a privileged instruction (`hlt`). The CPU faults into the kernel, which kills the process with SIGSEGV. This shows why the wall exists.
**Out of scope.** Blocking vs non-blocking vs async I/O models (T3 `io-models`). Only one blocking `read` is shown.
**Kit.** Scene kit (`SceneNode`, `Packet` for the call crossing), `CodePanel` (wrapper code with `stateOf`), `ChipButton` (sorter), `Bar` (cost meter), `useScenePicker`, `createRecorder`, `core/format` (`latency`, `plural`). The two-band wall stays local (one user).
**AC.**
- Watch: the current step is `--hi`; the user band is `--info` and the kernel band `--violet` (structural); a crossing packet is `--info`; a fault is `--bad`; the cost meter fill is `--hi`.
- Misconception: "every library call is a system call" (or the reverse, "syscalls are as cheap as function calls").
- Correctness:
  - The syscall counts for the batching preset come from a pure `copyCost(fileBytes, bufBytes)` and are tested: ⌈size/buf⌉ reads plus a final 0-byte read, and the same number of writes.
  - The sorter's answer key is tested against a documented table with a source note (glibc buffering, the Linux vDSO for `clock_gettime`).
  - The Linux x86-64 syscall numbers shown (`read` = 0, `write` = 1, `getpid` = 39) are pinned in a test.
- Honesty: the stage says "Linux on x86-64; timings are illustrative, real costs vary by CPU and mitigations."
**Phone.** `StageFrame minWidth={520}` on the wall scene; the sorter is HTML and wraps.

**`interrupts-context-switch` · Interrupts & Context Switches**
Track `os` · *"How the OS takes the CPU back"* · Builds on: `processes-threads`, `fetch-decode-execute`, `syscalls-kernel-mode` · **[domain review]**
**Spec.**
- One CPU core runs thread A, drawn as a `GanttLanes` timeline (one lane per thread plus a "kernel" lane).
- Each timer tick (illustrative 4 ms, HZ = 250) raises an interrupt. The CPU finishes the current instruction, saves A's PC, SP and flags, and jumps to the interrupt handler, which runs on the kernel lane.
- **Context switch** as a card animation: A's registers (PC, SP and a few general registers with values) slide into A's PCB/`task_struct` card. B's saved registers load from B's card. The address-space indicator changes only when B is in a different process (thread vs process switch, linked to `processes-threads`).
- Interrupt sources as chips: timer, disk completion, network packet, keypress. Each fires its handler, and only some cause a reschedule (a disk completion wakes a blocked thread and makes it runnable).
- A **cost** control: the switch cost (illustrative µs) and the time slice. A "switches per second" readout and an "overhead %" readout show why tiny slices waste the CPU.
- A **voluntary vs involuntary** toggle: B blocks on I/O (it gives up the CPU) vs A is preempted by the tick.
**Out of scope.** Scheduling policy (`cpu-scheduling`), DMA and device I/O detail (T3 `dma-io-devices`), and multi-core migration.
**Kit.** `GanttLanes` (K-13), `Box`/`SectionTitle` (PCB cards), `AnimatedValue` (register values), `ChipButton` (interrupt sources), `Slider` (with `format`), `createRecorder`, `useScenePicker`.
**AC.**
- Watch:
  - The running thread's bar is `--hi`.
  - Kernel/handler time is `--violet`.
  - Saved registers in flight are `--info`.
  - A ready thread is `--dim` with an outline, and a blocked thread is hatched `wait` (not `--bad`: blocking is normal).
  - The overhead readout turns `--bad` only above a named threshold.
- Misconception: "a context switch is free", or "a thread keeps the CPU until it finishes".
- Correctness:
  - The pure `overhead(slice, switchCost) = switchCost / (slice + switchCost)` is tested.
  - Switches per second = 1 / (slice + cost).
  - The frame builder's register save/restore round-trips: B resumes with exactly the values it was saved with (a test over every preset).
  - A thread switch never changes the address-space id; a process switch always does.
- Honesty: "Illustrative tick length and switch cost; a real kernel saves more state (FPU, vector registers) and may skip ticks when idle."
**Phone.** The Gantt and the PCB cards stack vertically ≤900px; `GanttLanes` sits in a `WideRegion minWidth={480}`.

**`cpu-scheduling` · CPU Scheduling Algorithms**
Track `os` · *"Who runs next: FIFO, round robin, MLFQ"* · Builds on: `processes-threads`, `interrupts-context-switch`, `stack-queue`
**Spec.**
- A job table (name, arrival, CPU burst, optional I/O bursts) feeds a `GanttLanes` chart of one CPU, with a ready-queue strip underneath.
- The policy picker: FCFS, SJF (non-preemptive), SRTF (preemptive SJF), Round Robin (quantum slider 1-8) and MLFQ (3 levels, quanta 2/4/8, a boost-every-N slider).
- A stats table per job: completion, turnaround, waiting and response time, plus the averages. A **compare all** button runs every policy on the same jobs and ranks them by each metric. No single policy wins every column.
- Presets:
  - "Convoy": one long job first, three short ones.
  - "Interactive + batch": short I/O-bound jobs vs a CPU hog.
  - "Starvation": a stream of short jobs arriving under SJF while one long job never runs, with a waiting counter that keeps growing.
  - "Quantum too small": a tiny RR quantum plus a context-switch cost shows the overhead.
- The job table is editable (add, remove, change burst), with hostile-input rules per AC-0/T2 #5.
**Out of scope.** Linux CFS/EEVDF internals, multi-core load balancing, and priority inversion (T3 `priority-inversion`). The summary mentions CFS in one line as "what Linux actually uses: fair share by virtual runtime".
**Kit.** `GanttLanes` (K-13), `ArrayStrip` (ready queue), `.data-table` (stats), `Segmented`, `Slider`, `TextField` + `core/parse`, `createRecorder`, `core/format`.
**AC.**
- Watch: each job has a categorical colour (`categorical(i)`), never `--ok`/`--bad`; the running slice has a `--hi` outline; ready jobs in the queue strip are `--info`; idle CPU is `--dim`; context-switch slivers are `--violet`; the starving job's waiting counter is `--bad`.
- Misconception: "round robin is always fairest and fastest", or "shortest-job-first is always best".
- Correctness:
  - A pure `schedule(jobs, policy, opts)` is tested against hand-worked textbook values. For P1 = 24, P2 = 3, P3 = 3, all arriving at 0: FCFS average waiting time is 17 and SJF is 3. RR with q = 4 gives an average wait of 17/3 ≈ 5.67.
  - Invariants on seeded random job sets (`mulberry32`), for every policy:
    - the CPU is never idle while the ready queue is non-empty;
    - the total busy time equals the sum of the bursts;
    - turnaround = waiting + burst;
    - SRTF's average waiting time ≤ every other policy's, when there's no I/O and no switch cost.
  - MLFQ demotes a job that uses its full quantum, and the boost resets every job to the top level.
- Honesty: "Times are in abstract ticks. Switch cost is optional and illustrative. SJF assumes burst lengths are known, which real schedulers can only estimate."
**Phone.** The Gantt is in a `WideRegion minWidth={520}`; the job and stats tables become their own horizontal scrollers with a hint.

**`virtual-memory-paging` · Virtual Memory & Paging**
Track `os` · *"Every process thinks it owns RAM"* · Builds on: `stack-vs-heap`, `processes-threads`, `memory-hierarchy` · **[domain review]**
**Spec.**
- Two processes, A and B, each with a `MemoryMap` of a 16-page virtual address space (64 KiB, 4 KiB pages). Pages are labelled code, heap and stack, with an unmapped gap between them.
- Each process has a single-level page table: VPN → frame, with present, writable and dirty bits. An 8-frame physical RAM is drawn as a `CellGrid`, and a swap area sits beside it.
- **Translate:** type or pick a virtual address (hex). It splits into VPN (top 4 bits) and offset (low 12 bits) on a `BitStrip`, the page-table row lights, and frame × 4096 + offset gives the physical address.
- Outcomes:
  - **Page fault:** touching a non-present page traps. If RAM is full, a victim is evicted (FIFO or Clock, selectable); a dirty victim is written to swap first. The page then loads and the instruction retries.
  - **Protection:** writing to a read-only code page, or touching the unmapped gap, gives a segmentation fault.
- **Sharing:** both processes map the same libc code frame read-only (two arrows to one frame), while their stacks map to different frames at the same virtual address.
- **Thrashing preset:** a working set of 10 pages over 8 frames makes the fault counter climb, alongside a "useful work" bar.
**Out of scope.** The TLB, multi-level page tables and huge pages (T3 `page-tables-tlb`), mmap'd files and the page cache (T3), and fork's copy-on-write (T3 `fork-copy-on-write`).
**Kit.** `MemoryMap` (K-15), `CellGrid` (K-7) for frames, `BitStrip` (address split, `groups`), memory kit `RefArrow` (page → frame), `TextField` (hex address, refused with a message outside 0x0000-0xFFFF), `Segmented` (eviction policy), `useScenePicker`, `createRecorder`.
**AC.**
- Watch: the address being translated is `--hi`; VPN bits `--violet`, offset bits `--info`; present mappings are solid arrows, while a non-present page is `--dim` with a dashed arrow to swap; a fault flash is `--orange` (a normal event); a protection fault is `--bad`; the dirty bit is `--hi`; shared frames get a `--violet` ring.
- Misconception: "virtual memory means using the disk as RAM", or "two processes can't use the same address".
- Correctness:
  - `translate(pageTable, vaddr)` is tested for every address in a preset table; every mapped address round-trips: physical → (frame, offset) → the same virtual address via the reverse map.
  - Fault counts for FIFO and Clock on reference strings are checked against hand-worked values, including Bélády's anomaly for FIFO on `1 2 3 4 1 2 5 1 2 3 4 5` (9 faults with 3 frames, 10 with 4).
  - A dirty victim always causes exactly one swap write; a clean one causes none.
- Honesty: "Toy sizes: a real x86-64 process has 2⁴⁸ bytes of virtual address space, 4 KiB pages and a 4-level page table. Disk times are illustrative."
**Phone.** `StageFrame minWidth={600}` on the mapping scene; the translate panel (HTML) reflows under it.

**`file-descriptors` · File Descriptors & Everything-Is-a-File**
Track `os` · *"The integer behind every socket"* · Builds on: `command-line`, `processes-threads`, `syscalls-kernel-mode`
**Spec.**
- Three layers, drawn left to right:
  1. a per-process FD table (slots 0-9);
  2. the kernel's open-file table (entries with an offset, flags and a refcount);
  3. vnodes/objects: a file, a pipe, a TCP socket, `/dev/tty`.
- Operation buttons, each animating its arrows:
  - `open` takes the **lowest free FD**.
  - `close` frees the slot and decrements the refcount.
  - `dup(fd)`, and `dup2(old, new)`, which closes `new` first.
  - `pipe()` gives two FDs.
  - `socket` plus `accept` gives a new FD per connection.
  - `fork()` copies the FD table, and both tables point at the **same** open-file entries, so they share the offset.
  - `exec` keeps FDs unless they're close-on-exec.
- A "**How the shell does `cmd > out.txt 2>&1`**" replay runs `open` → `dup2(fd, 1)` → `dup2(1, 2)` → `close(fd)`, linking to `command-line`'s redirection order without re-teaching the syntax.
- A **leak** preset: a server accepts connections but forgets `close` on an error path. The table fills to `ulimit -n` (set to 16 for the demo), and the next `accept` fails with `EMFILE` ("Too many open files").
- A **shared offset** preset: parent and child both `write` after a fork and interleave into one file, rather than overwriting each other.
**Out of scope.** Shell redirection syntax (`command-line` owns it), copy-on-write memory after fork (T3), and epoll/select (T3 `io-models`).
**Kit.** Memory kit (`VarSlot` for FD slots, `HeapObject` for open-file entries, `RefArrow`), `stackBoxes`/`fanBend`, `ChipButton` (operations), `ConsolePanel` (errno output), `Bar` (FDs used vs limit), `createRecorder`.
**AC.**
- Watch: FD slots in use are `--info`; the slot just allocated is `--hi`; free slots are `--dim`; open-file entries are `--violet` (structural) with the refcount shown; a leaked FD (its owning request finished) is `--bad`; the `EMFILE` line is `--bad`.
- Misconception: "an FD is the file itself", or "after fork the child gets its own independent copy of every open file".
- Correctness:
  - A pure FD-table model is tested:
    - the lowest free FD is allocated;
    - `dup2(a, a)` is a no-op returning `a`;
    - `dup2` onto an open FD closes it first;
    - refcounts reach 0 only when every FD referring to the entry is closed;
    - fork duplicates the table and increments refcounts;
    - `EMFILE` happens exactly at the limit.
  - The redirection replay ends with FDs 1 and 2 both pointing at `out.txt`'s entry. A second test checks the wrong order (`2>&1 > out.txt`) leaves 2 on the terminal.
- Honesty: "Simplified kernel tables; limit set to 16 for the demo (Linux's usual soft default is 1024)."
**Phone.** `StageFrame minWidth={560}`; the operation chips wrap above the scene.

---

##### Batch T2-B5 · Automata, parsing & types (`lang`)
Wave 2. Pilots **`core/automata.ts` (K-16)** and **`GraphView` state-diagram mode (K-6: `startNode`, `accept`, self-loops, curved parallel edges)**, and is the first Tier 2 user of `TreeSvg` for parse trees and ASTs. The lessons form one chain: automaton → lexer → grammar → parser → type checker. All five use the same small expression language (integers, identifiers, `+ - * / ^`, parentheses, `let`, `fn`), documented once in the batch's shared lesson text so the learner meets the same tokens at every step. Each lesson keeps its own copy of the grammar constants, since lessons can't import each other. If the copies drift, the batch report files a `core/fixtures` request.

**`dfa-nfa` · Finite Automata (DFA & NFA)**
Track `lang` · *"Machines with no memory but a lot of opinions"* · Builds on: `regex-basics`, `graph-representations`, `propositional-logic`
**Spec.**
- A state diagram (circles, labelled arrows, a start arrow, double-ringed accepting states) beside an input tape. **Step** feeds one character: the current state lights, and the edge it takes pulses. At the end of the input the verdict reads "accepted" or "rejected", computed from the final state.
- **DFA presets:**
  - binary numbers divisible by 3 (3 states, remainder 0/1/2)
  - "contains `ab`"
  - a traffic-light/door controller, to show a UI state machine is the same thing
- **NFA mode:** "ends in `01`" and "the 3rd symbol from the end is 1". Several states light at once (a set of tokens), ε-moves are followed instantly, and the input is accepted if *any* lit state is accepting.
- **Subset construction:** a button converts the NFA into a DFA row by row. The subset table fills in as each new DFA state (a set of NFA states) is discovered, and the finished DFA is drawn beside it. For "3rd from the end", the counter shows 8 = 2³ DFA states. A slider for n (1-4) shows the blow-up to 2ⁿ states.
- **Edit mode:** toggle a state's accepting ring and retarget any transition from a per-state table, so the learner can build a machine for a stated language. A checker runs it on all strings up to length 6 and lists the first counterexample.
**Out of scope.** How regex engines compile and backtrack (T3 `regex-engines`), and minimisation and the pumping lemma (T3 `chomsky-hierarchy`).
**Kit.** `GraphView` (K-6) with `layout="fixed"`, `startNode`, `accept` and `nodeMark`/`edgeMark`. `core/automata.ts` (K-16): `dfaStep`, `nfaStep` with ε-closure, `subsetConstruct`, `accepts`. `ArrayStrip` (input tape with a cursor pointer), `CellGrid` (subset table, `rowLabels`/`colLabels`), `createRecorder`, `useScenePicker`, `Segmented`, `TextField` (input string), `ChipButton` (presets).
**AC.**
- **Watch:**
  - current state(s) `--hi`
  - the transition being taken `--info`
  - accepting rings drawn in the node's own outline with a double ring (shape, not colour)
  - accepted verdict `--ok`, rejected `--bad`
  - unreachable states `--dim`
  - subset-table cells being filled `--violet`
- **Misconception:** "an NFA can recognise more languages than a DFA". Both recognise exactly the regular languages; the NFA is just smaller to write.
- **Correctness:**
  - For every preset NFA, `subsetConstruct` gives a DFA that agrees with NFA simulation on every string over its alphabet up to length 10.
  - The divisible-by-3 DFA agrees with `parseInt(s, 2) % 3 === 0` for all binary strings up to length 12.
  - The "3rd from the end" DFA has exactly 8 reachable states.
  - The edit-mode checker's counterexample is the shortest one (tested against a brute-force enumeration).
  - Input outside the alphabet is refused with "not in this machine's alphabet {0,1}" and the run isn't started (AC-0/T2 #5).
- **Honesty:** "Nothing simulated: the machine runs live on your input."
**Phone.** The diagram is a `WideRegion minWidth={560}`. The tape, controls and subset table reflow below it. At ≤ 900px the subset table (≤ 9 rows) scrolls inside its own `WideRegion`.

**`lexing-tokens` · Lexing: Source to Tokens**
Track `lang` · *"Chopping code into words"* · Builds on: `dfa-nfa`, `regex-basics`, `char-encoding`
**Spec.**
- A fixed source line in the batch's expression language. A cursor scans it left to right and emits coloured token chips (`NUMBER 42`, `IDENT total`, `OP +`, `LPAREN`, `KEYWORD let`) into a token stream. Whitespace and comments are consumed and shown as dimmed, discarded spans.
- A side panel shows the combined lexer DFA (one accepting state per token kind) with its current state. The learner steps one character at a time and sees **maximal munch**: the lexer keeps going while a longer token is still possible, then backs up to the last accepting position.
- **Presets:**
  - `let total = price*qty + 10`
  - `iffy = 1` (one identifier, not the keyword `if` plus `fy`)
  - `a+++b` (lexed `a`, `++`, `+`, `b`; in JavaScript that's `(a++) + b`)
  - `x = 3.14.15` (the number stops at the second dot, and the lexer errors at `.15`, showing line and column)
  - `"unterminated`
  - a line with a `// comment`
- **Type your own line:** the learner edits the source in a `TextField` and the token stream rebuilds live. An unknown character becomes an error token with its position, and lexing resumes after it.
- A toggle swaps the token rule order (identifier rule before keyword rule) to show why keywords must win ties of equal length.
**Out of scope.** JavaScript's regex-literal vs division ambiguity, and lexer generators (lex/flex); the actual regex engines stay in T3 `regex-engines`.
**Kit.** `GraphView` (K-6) state mode, `core/automata.ts` `longestMatch` (K-16), `CodePanel` with `renderLine` (source with the scanned span highlighted), `Tray` (token stream of `.chip`s), `TextField`, `Toggle`, `ChipButton`, `createRecorder`, `useScenePicker`.
**AC.**
- **Watch:**
  - the lexeme being scanned `--hi`
  - the last accepting position, a `--ok` marker
  - characters read past it and then given back `--orange`
  - token chips coloured by kind: numbers `--info`, identifiers `--violet`, keywords `--amber`, operators `--sky`
  - discarded whitespace and comments `--dim`
  - error tokens `--bad`
- **Misconception:** "the lexer understands grammar". It only chops characters into tokens; `1 + + 2` lexes fine and fails later in the parser.
- **Correctness:**
  - The token stream equals a hand-written reference tokenizer (an ordered regex-alternation loop with longest match) on every preset and on 500 seeded random lines from the language's alphabet.
  - `a+++b` → `[a, ++, +, b]`.
  - `iffy` is one `IDENT`.
  - Error tokens carry correct 1-based line and column.
  - With the rule order swapped, `if` lexes as `IDENT` (asserted, since that's what the toggle demonstrates).
- **Honesty:** "A teaching lexer for a small language; real languages have more token kinds and edge cases."
**Phone.** The code line and token tray wrap and fit. The DFA panel stacks below the source at ≤ 900px inside a `WideRegion minWidth={480}`.

**`grammars-parsing` · Context-Free Grammars & Parse Trees**
Track `lang` · *"Why you can't parse HTML with regex"* · Builds on: `lexing-tokens`, `dfa-nfa`, `tree-traversals`, `recursion`
**Spec.**
- An editable grammar panel of a few productions, with presets:
  - **Ambiguous:** `E → E + E | E * E | ( E ) | num`
  - **Layered:** `E → E + T | T`, `T → T * F | F`, `F → ( E ) | num`
  - **Balanced brackets:** `S → ( S ) S | ε`
- The learner types an expression and builds a **leftmost derivation** step by step. At each step they pick which production to apply to the highlighted non-terminal, from chips. The parse tree grows with each choice. "Auto-derive" plays one valid derivation.
- **Ambiguity:** with the ambiguous grammar, `1 + 2 * 3` offers two complete parse trees side by side. One evaluates to 7 and one to 9 (each tree is evaluated bottom-up on screen). Switching to the layered grammar leaves exactly one tree.
- **"Why not regex":** a slider for nesting depth n generates `(ⁿ)ⁿ`. A fixed DFA with k states (k is learner-chosen, 2-6) is fed the string and wrongly accepts or rejects once n > k, while the grammar derives it at every depth. The caption says the general proof is the pumping lemma, covered later.
**Out of scope.** Building a parser program (`parsing-ast`), LL vs LR and parser generators (T3 `parsing-algorithms`), and the pumping lemma proof (T3 `chomsky-hierarchy`).
**Kit.** `TreeSvg` (`tidy` layout, `renderNode` for terminal vs non-terminal boxes), `CodePanel` (grammar productions, `stateOf` for the production just applied), `ChipButton` (production choices), `TextField`, `Segmented`, `Slider`, `createRecorder`, `useScenePicker`.
**AC.**
- **Watch:**
  - non-terminal being expanded `--hi`
  - non-terminals `--violet`
  - terminals (leaf tokens) `--info`
  - the production just applied, a `--hi` tint in the grammar panel
  - the two competing trees: their evaluated results labelled, with the chosen-by-precedence tree `--ok` and the other `--orange`
  - the DFA's wrong verdict `--bad`
- **Misconception:** "a grammar has one parse tree for every string". Ambiguous grammars have several, and precedence comes from the grammar's shape.
- **Correctness:**
  - A CYK or Earley-style recogniser over the preset grammars agrees with the derivation checker on every string up to length 7 over each grammar's terminals.
  - The ambiguous grammar yields exactly 2 trees for `1+2*3` (values 7 and 9) and the layered grammar exactly 1 (value 7).
  - For the bracket demo, a k-state DFA (the best "counting" DFA up to depth k) misjudges a string at depth k+1, asserted for k = 2..6.
- **Honesty:** "The bracket DFA is one example machine; the pumping lemma proves no DFA works, which this demo only illustrates."
**Phone.** The grammar panel and choice chips reflow. The parse tree sits in a `WideRegion minWidth={520}`, and the two side-by-side ambiguous trees stack vertically at ≤ 900px.

**`parsing-ast` · Parsing & Abstract Syntax Trees**
Track `lang` · *"Grammar in, tree out"* · Builds on: `grammars-parsing`, `lexing-tokens`, `recursion`, `tree-traversals`
**Spec.**
- A **recursive-descent parser** for the layered grammar, shown as its fixed source (one function per non-terminal: `parseExpr`, `parseTerm`, `parseFactor`). Stepping through `1 + 2 * 3` shows:
  - the call stack pushing and popping
  - the token cursor advancing
  - the **AST** growing node by node
- The AST is set beside the full parse tree from `grammars-parsing`, to show which nodes the AST drops (parentheses, single-child chains).
- **Precedence and associativity presets:**
  - `8 - 3 - 2` → 3 (left-associative, built by a loop, not left recursion)
  - `2 ^ 3 ^ 2` → 512 (right-associative)
  - `(1 + 2) * 3`
  - `-2 ^ 2`, where the language's documented rule (unary minus binds looser than `^`) gives −4
- **Left recursion:** a toggle switches `parseExpr` to the naive `E → E + T` form. Stepping shows `parseExpr` calling itself without consuming a token until the stack-depth cap is hit, with a caption explaining why it's rewritten as a loop.
- **Type your own expression** (`TextField`): it's lexed and parsed live, and the AST is evaluated by a post-order walk shown as a `ConsolePanel` result. Syntax errors name the unexpected token and its column.
- Use-case chips: linters, codemods, Prettier and query engines all start from an AST.
**Out of scope.** LL/LR tables and parser generators (T3 `parsing-algorithms`), and interpreting statements (`interpreters-compilers-jit`).
**Kit.** `CodePanel` (`active` line, `renderLine`), `CallStackPanel`, `TreeSvg` (`tidy`; full tree and AST), `ArrayStrip` (token stream with the cursor pointer), `ConsolePanel`, `TextField`, `Toggle`, `createRecorder`, `useScenePicker`.
**AC.**
- **Watch:**
  - current parser line and running frame `--hi`
  - waiting frames dimmed (`CallStackPanel` `waiting`)
  - the token cursor `--info`
  - AST nodes just created `--ok`
  - operator nodes `--violet`, number leaves `--info`
  - nodes the AST drops, shown faded in the parse-tree view `--dim`
  - a syntax error and the stack-cap overflow `--bad`
- **Misconception:** "the AST is the same as the parse tree". It keeps meaning (operators, operands), not every grammar step or bracket.
- **Correctness:**
  - On 1,000 seeded random expressions (depth ≤ 6, with parentheses and unary minus), evaluating the AST equals a reference shunting-yard evaluator that follows the lesson's precedence table.
  - `8-3-2 = 3`, `2^3^2 = 512`, `-2^2 = -4` under the documented rule.
  - The naive left-recursive parser hits the cap without consuming a token.
  - Error positions are tested.
  - Learner input is parsed by this hand-written parser only, never `eval` (CLAUDE.md).
- **Honesty:**
  - "The stack cap is set low (12 frames) so the runaway is visible."
  - "`-2 ^ 2` follows this lesson's rule; languages differ (in JavaScript `-2 ** 2` is a SyntaxError)."
**Phone.** At ≤ 900px the code, stack and AST stack vertically, with the AST in a `WideRegion minWidth={480}`. The token strip uses `cellMax` and fits.

**`type-systems` · Type Systems: Static, Dynamic & Inference**
Track `lang` · *"Catching bugs before they run"* · Builds on: `parsing-ast`, `functional-programming`, `closures-scope`, `error-handling-models`
**Spec.**
- **Scene 1 · Two axes, not one.** A 2×2 grid places languages by checking time (static/dynamic) and implicit conversion (strict/loose): JavaScript, Python, TypeScript, Java, C, Haskell. Example chips show `"5" * 2` → `10` and `"5" + 2` → `"52"` in JavaScript, while Python raises a `TypeError` on `"5" + 2`. The point is that these are separate axes.
- **Scene 2 · When the error appears.** The same buggy snippet (calling `.toUpperCase()` on a number in one branch) runs as untyped JavaScript, where it fails only when that branch executes and a coverage strip shows the untested branch, and as TypeScript, where the checker flags the line before anything runs. Both outcomes are fixed, lesson-authored results.
- **Scene 3 · Inference by unification.** A small ML-like function, `fn twice f x = f (f x)`, as an AST. Type variables (`α`, `β`…) are assigned to each node as badges. Stepping through the constraints shows each one unify (`α = β → γ`…), with a substitution table filling in. The result rises to the root: `(a → a) → a → a`.
- **Presets:** `id`, `twice`, `compose`, `fn x = x + 1`, and a type error: `fn f = f f` fails the occurs check, and `if true then 1 else "a"` reports a mismatch with both conflicting constraints highlighted.
- Notes linking to `generics-polymorphism` (the `a` in the result is a generic) and `null-option-adts`.
**Out of scope.** Generics in practice and variance (`generics-polymorphism`), null and option types (`null-option-adts`), and soundness proofs and dependent types.
**Kit.** `TreeSvg` (AST with type badges via `renderNode`), `CellGrid` (2×2 axis grid; also the substitution table with `rowLabels`), `CodePanel` (snippets, `stateOf` `bad` for the flagged line), `ConsolePanel` (runtime error vs checker message), `createRecorder`, `useScenePicker`, `ChipButton`.
**AC.**
- **Watch:**
  - the AST node whose constraint is being solved `--hi`
  - type-variable badges `--violet`
  - resolved concrete types `--info`
  - the unified result at the root `--ok`
  - a type error, its conflicting constraints and the runtime crash `--bad`
  - the untested branch in the coverage strip `--dim`
- **Misconception:** "static typing and strong typing are the same thing" (or "type inference means it's dynamically typed").
- **Correctness:**
  - The lesson's unifier (with occurs check) infers the documented principal type for every preset, up to renaming of type variables. `fn f = f f` fails the occurs check, and the `if` mismatch fails with exactly the two constraints shown.
  - A property test applies the final substitution to every collected constraint, and both sides end up equal.
  - The JavaScript coercion chips match real JavaScript (the test evaluates the fixed strings).
- **Honesty:**
  - "Inference here is Hindley-Milner style on a tiny language, the kind ML, OCaml and Haskell use; TypeScript infers differently (locally) and asks you to annotate parameters."
  - "The TypeScript and Python results shown are fixed outputs, not run in your browser."
**Phone.** Scene 1's grid fits. Scene 3's AST is in a `WideRegion minWidth={500}`, with the substitution table below it reflowing. The code panels wrap.

---

##### Batch T2-B6 · Joining a network (`net`)
Wave 2. The first user of **`SequenceDiagram` (K-14)**: DHCP's DORA, ARP and the DNS resolver walk are all ladder diagrams, so API friction shows up before the wave 3 to 9 users depend on it. `BitStrip` gets its first 32-bit and 128-bit address work. Example addresses come from the documentation ranges only (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32) plus RFC 1918 private ranges for LANs. The host is `203.0.113.10`, as in `ip-ports` and `osi-tcpip-layers`.

**`subnetting-cidr` · Subnets & CIDR**
Track `net` · *"What /24 actually means"* · Builds on: `binary-hex`, `ip-ports`, `bit-manipulation`
**Spec.**
- A 32-bit IPv4 address as a `BitStrip` in four octet groups, with a draggable (and arrow-key) **prefix divider**. Bits left of it are network bits, bits right of it are host bits.
- Live readouts: network address, broadcast, first and last usable host, usable host count, the netmask in dotted and hex form, and the wildcard mask.
- A **"Does it belong?"** field: type a second address. Its bits are ANDed with the mask in a second strip, and the result says same subnet or not, showing the AND row.
- A **split** mode: carve a /24 into /26s, or into variable-length blocks for "3 teams of 50, 10, 2 hosts". The blocks are drawn as a bar along the address range, with alignment enforced. A misaligned block is refused with the reason ("a /26 must start on a multiple of 64").
- Presets: `192.168.1.0/24` (home LAN), `10.0.0.0/8`, `/31` point-to-point (RFC 3021: 2 usable), `/32` a single host, `0.0.0.0/0` "everything" (a default route).
**Out of scope.** VPC and subnet design in a cloud, route tables and security groups (T3 `cloud-networking-vpc`). This lesson is the arithmetic only.
**Kit.** `BitStrip` with `chunkGroups(32, 8)` and `toneOf`, `TextField` (validated by a tested lesson parser), `Slider` for the prefix, `ChipButton` presets, `.data-table`, `AnimatedValue`. The range bar is local SVG.
**AC.**
- Watch: network bits `--info`, host bits `--violet`, the divider `--hi`, the AND result row `--ok` when the address is in the subnet and `--bad` when it isn't, and blocks in split mode take categorical colours.
- Misconception: "a /24 has 256 usable hosts" (network and broadcast are reserved, except in /31 and /32), and its partner "a bigger prefix number means a bigger network".
- Correctness:
  - Mask, network, broadcast and host-range maths are tested against a reference implementation over 2,000 seeded addresses at every prefix 0-32.
  - /31 and /32 follow RFC 3021 and host-route semantics.
  - The membership test equals `(a & mask) === (net & mask)` with unsigned 32-bit maths (`>>> 0`).
  - Alignment rejection is tested.
  - Hostile input follows AC-0/T2 #5: `256.1.1.1`, `1.2.3`, leading zeros and `/33` are refused with a message.
- Honesty: "Nothing simulated: computed live."
**Phone.** The 32-bit strip wraps between octets (BitStrip wraps between groups only) into 2 rows of 16 at 390px, and the readouts reflow. No `minWidth`. Split mode's range bar goes in a `WideRegion minWidth={560}`.

**`ipv6` · IPv6**
Track `net` · *"Addresses for everything"* · Builds on: `subnetting-cidr`, `ip-ports`, `dns-resolution` (same batch)
**Spec.**
- A 128-bit address in eight 16-bit hextet groups, coloured into the /48 site prefix, the subnet ID (up to /64) and the 64-bit interface ID.
- A **compress / expand** toggle animates leading zeros dropping and the longest run of zero hextets collapsing to `::`, with the rule that applied highlighted.
- Type any address: the field accepts compressed or full forms and shows the canonical one (RFC 5952).
- An address-type badge: global unicast (`2000::/3`), link-local (`fe80::/10`), unique local (`fc00::/7`), loopback (`::1`), multicast (`ff00::/8`), documentation (`2001:db8::/32`).
- **SLAAC scene** as a `SequenceDiagram`: the host forms a link-local address, sends a Router Solicitation, gets a Router Advertisement carrying a /64 prefix, and builds its global address from prefix + interface ID. A toggle switches the interface ID between privacy (random, RFC 8981) and EUI-64 from the MAC (RFC 4291 appendix: flip the U/L bit, insert `ff:fe`).
- **Dual-stack lookup**: a name returns both an A and an AAAA record, and the client prefers IPv6 ("Happy Eyeballs", RFC 8305, shown as two racing attempts).
- A "no NAT needed" panel: 2¹²⁸ vs 2³² (via `power()`), and the note that a firewall, not NAT, now decides what reaches you.
**Out of scope.** NAT64/DNS64, transition tunnels and routing protocols. NDP is shown only as RS/RA in SLAAC.
**Kit.** `BitStrip` (`chunkGroups(128, 16)`, `size="sm"`), `SequenceDiagram` (K-14), `Toggle`, `TextField`, `core/format` `power`, `.chip` for type badges. The parser and formatter are local pure code (`model.ts`).
**AC.**
- Watch: site prefix `--info`, subnet ID `--violet`, interface ID `--orange` (a category), the zeros being removed `--dim`, the current SLAAC message `--hi`, and the IPv6 attempt winning `--ok`.
- Misconception: "`::` can appear more than once" or "an IPv6 address is just a longer IPv4 address that still needs NAT".
- Correctness:
  - The RFC 5952 canonical form is tested:
    - lowercase;
    - leading zeros removed;
    - `::` replaces the longest run of two or more zero hextets, the first if tied, and never a single hextet;
    - its test vectors and `2001:db8:0:0:1:0:0:1` → `2001:db8::1:0:0:1`.
  - Parse → format round-trips 1,000 seeded addresses.
  - Malformed inputs are refused: two `::`, nine groups, a hextet over 4 hex digits.
  - The EUI-64 derivation from `00:1a:2b:3c:4d:5e` gives `021a:2bff:fe3c:4d5e`.
  - The type classifier is tested for each prefix.
- Honesty: "The SLAAC exchange and the dual-stack race are scripted; addresses are computed live."
**Phone.** The 128-bit strip shows 8 hextets as 2 rows of 4 groups at 390px with `size="sm"`. The SLAAC `SequenceDiagram` (3 lifelines) fits without a scroller. The dual-stack race reflows.

**`ethernet-arp` · Ethernet, MAC Addresses & ARP**
Track `net` · *"Who has 10.0.0.1?"* · Builds on: `osi-tcpip-layers`, `subnetting-cidr`, `dhcp` (same batch)
**Spec.**
- A LAN of 4 hosts and a router on one switch (scene kit). The switch shows a **MAC address table** that starts empty.
- The learner picks a sender and a target IP:
  1. The sender checks whether the target is on its subnet (the `subnetting-cidr` AND).
  2. If the target is off-subnet, the sender ARPs for the **default gateway** instead.
  3. Its ARP cache misses, so it broadcasts "Who has 192.168.1.20? Tell 192.168.1.10" to `ff:ff:ff:ff:ff:ff`.
  4. The switch floods the broadcast to every port and learns the sender's port.
  5. Only the owner sends a unicast reply.
  6. Both ARP caches and the switch table fill in.
- Send again: the cache hit skips ARP, and the switch forwards to one port only.
- An **unknown unicast** toggle (the table is cleared) shows a frame being flooded.
- A frame inspector shows the Ethernet header (destination MAC, source MAC, EtherType `0x0806` ARP / `0x0800` IPv4) as a `ByteGrid`.
- An **ARP-cache-timeout** slider ages entries out.
- A short, payload-free "why ARP is trusting" note: any host may answer, so a LAN attacker can claim an IP. The defences (dynamic ARP inspection, static entries on critical hosts) are named, with no spoofing steps.
**Out of scope.** VLANs, STP, Wi-Fi (moved to T3) and IPv6 NDP (`ipv6` covers RS/RA only).
**Kit.** Scene kit (`SceneNode`, `Packet` with `keyframes="even"` for the flood), `SequenceDiagram` (K-14) for the request/reply ladder, `ByteGrid` (K-8), `.data-table` (ARP caches and the switch table), `Slider`, `Segmented`.
**AC.**
- Watch: the broadcast `--info` flooding to every port, the unicast reply `--ok`, a newly learned table row `--hi`, an aged-out entry `--dim`, and the gateway `--violet` (its structural role).
- Misconception: "the MAC address is used to reach hosts across the internet". It changes every hop; ARP only resolves the next hop on the local link.
- Correctness:
  - The next-hop decision is tested: same subnet → the target, otherwise the gateway.
  - The switch's learn/flood/forward logic is a pure state machine with tests: an unknown destination floods to every port except the ingress; a known destination forwards to one port; a broadcast always floods.
  - ARP aging is tested.
  - EtherType values match IEEE (0x0806, 0x0800).
- Honesty: "Simulated LAN; MAC addresses are made up."
**Phone.** `StageFrame minWidth={520}` for the LAN scene. The tables sit below as HTML and wrap. The ladder goes in a `WideRegion` only if it has more than 3 lifelines.

**`dhcp` · DHCP: Getting an Address**
Track `net` · *"Discover, offer, request, acknowledge"* · Builds on: `ip-ports`, `osi-tcpip-layers`, `subnetting-cidr` (same batch)
**Spec.**
- A new laptop joins a LAN with no IP. A `SequenceDiagram` steps through **DORA**:
  1. DHCPDISCOVER: broadcast from `0.0.0.0:68` to `255.255.255.255:67`.
  2. DHCPOFFER from the server: offered address, subnet mask, router, DNS servers, lease time.
  3. DHCPREQUEST: broadcast, so other servers see which offer was taken.
  4. DHCPACK.
- A side panel shows the laptop's interface config filling in field by field.
- A **lease clock** runs. At 50% of the lease (T1) the client unicasts a renewal REQUEST to its server. At 87.5% (T2) it broadcasts a rebind to any server. At expiry it must drop the address.
- Scenes:
  - **Two servers**: both offer, one wins, the other withdraws its offer.
  - **Pool exhausted**: no offer arrives. The client falls back to a 169.254/16 link-local (APIPA) address, and the stage explains "why your laptop says 169.254…".
  - **Relay agent**: a router forwards a DHCP request from another subnet.
- A pool view shows addresses as leased, offered or free (the pool is a `.data-table` or chip row).
**Out of scope.** DHCPv6 and option internals beyond the listed fields. Static reservations get one line only.
**Kit.** `SequenceDiagram` (K-14), `Bar` for the lease clock with T1/T2 markers, `ScenePicker`, `.data-table`, `Slider` for lease time, `createRecorder`.
**AC.**
- Watch: broadcasts `--info`, unicasts `--violet`, the current message `--hi`, an ACK and a configured field `--ok`, a missing offer and an expired lease `--bad`, a withdrawn offer `--dim`, and the link-local fallback address `--orange`.
- Misconception: "the server just hands over an address in one message", or "the lease is permanent once you get it".
- Correctness:
  - The DORA message order, source and destination addresses and ports (68 → 67, broadcast `255.255.255.255`) are tested per scene.
  - T1 = 0.5 × lease and T2 = 0.875 × lease (RFC 2131 defaults) are tested.
  - The pool never offers an address that is leased or out for offer to someone else (an invariant over a seeded run of joins and leaves).
  - The APIPA range is `169.254.1.0`-`169.254.254.255` (RFC 3927).
- Honesty: "Scripted exchange; timings compressed (a 24-hour lease runs in seconds)."
**Phone.** The `SequenceDiagram` has 2-4 lifelines (laptop, server(s), relay). It fits at 390 with 2-line labels; the relay scene is wrapped in `WideRegion minWidth={480}`.

**`dns-resolution` · DNS Resolution, Records & TTLs**
Track `net` · *"It's always DNS"* · Builds on: `web-request`, `ip-ports` · **[domain review]**
**Spec.**
- **Records panel** for a fictional zone `example.com`, one row per type with what it's for: A, AAAA, CNAME (`www → example.com`), MX (with priority), TXT (SPF-style text, no real keys), NS, and SOA (with its negative-caching TTL).
- **Resolve scene** (`SequenceDiagram`: stub → recursive resolver → root → `.com` TLD → authoritative):
  - A cold lookup walks the chain, each referral listing NS records.
  - The resolver caches each answer with a countdown TTL.
  - A second lookup is answered from cache.
  - A CNAME is followed to its target, and the resolver does a second lookup.
- **Change a record** scene:
  - Edit `example.com A` from `203.0.113.10` to `198.51.100.7` at the authoritative server.
  - Three resolvers (labelled office, home ISP, mobile carrier) cached the old answer at different times, so each keeps serving the old IP until its own TTL runs out. A timeline shows when each one flips.
  - A TTL slider (60 s-86,400 s) and a "lower the TTL a day before the migration" preset make the lesson concrete.
- **Negative caching**: an NXDOMAIN is cached for the SOA minimum, so "I created the record but it still says not found" is explained.
- The "it's always DNS" moment: a typo'd CNAME target fails, and the failure is coloured differently from a timeout.
**Out of scope.** The basic name → IP step inside a page load (`web-request` owns it), and DNSSEC, anycast and GeoDNS internals (named only). `web-request`'s chain isn't re-taught step by step; this lesson's chain is the cached, TTL-aware one.
**Kit.** `SequenceDiagram` (K-14); `GanttLanes` (K-13) for the per-resolver "old vs new answer" timeline (P0-b gates wave 2, so it is available). Also `Slider`, `Bar` (TTL countdowns), `.data-table` (records), `ScenePicker`, `createRecorder`, `core/format` `humanDuration`.
**AC.**
- Watch: queries `--info`, referrals `--violet`, the final answer `--ok`, an answer served from cache with its TTL bar `--hi`, a stale (old) answer `--orange`, and NXDOMAIN / SERVFAIL `--bad`. The two failure kinds are told apart: NXDOMAIN is `--bad`, a timeout is `--orange` with a ✕.
- Misconception: "DNS changes propagate" (there is no push; caches expire on their own TTLs), and "lowering the TTL now speeds up a change made now".
- Correctness:
  - A pure resolver model is tested: a cache hit before expiry, a miss after; TTLs count down per resolver from the time each one cached.
  - A changed record is seen by resolver r exactly at `cachedAt_r + ttl`.
  - Lowering the TTL only helps resolvers that re-fetch after the change (tested).
  - The negative-cache TTL = min(SOA MINIMUM, SOA TTL) (RFC 2308).
  - CNAME chains are followed and a loop is detected.
- Honesty: "Simulated resolvers and a fictional zone; latencies are illustrative."
**Phone.** The resolve ladder has 5 lifelines, so it goes in `WideRegion minWidth={600}`. The change-a-record timeline fits (3 rows) and the records table scrolls inside `.data-table`.

---

##### Batch T2-B7 · Probability & evaluation (`math`, `ml`, `dsa`)
Wave 3. Pilots **`ConfusionMatrix` (K-18)**, the `Plot2D` ROC curve and histograms, and the `core/fixtures/datasets` `twoClassScores` generator. **`classification-metrics` needs a domain review.** All randomness is seeded `mulberry32`, with a visible "new seed" button. Simulated frequencies are always shown next to the exact value computed by the model, so the learner sees convergence rather than trusting a script.

**`probability-basics` · Probability Fundamentals**
Track `math` · *"Sample spaces, events and the odds of failure"* · Builds on: `combinatorics`, `sets-functions`
**Spec.**
- **Dice lab:** one or two dice. The sample space appears as a 6×6 grid for two dice. The learner picks an event (sum = 7, a double, at least one 6) or clicks cells to build their own, and its probability shows as favourable/total (6/36).
- "Roll ×1 / ×100 / ×10,000" fills a frequency bar chart. The empirical frequency line converges toward the exact value: the law of large numbers, with the sample size on a log axis.
- **Rules panel:**
  - complement P(not A) = 1 − P(A);
  - union P(A ∪ B) = P(A) + P(B) − P(A ∩ B), with the overlap cells double-highlighted;
  - independence P(A ∩ B) = P(A)·P(B), checked live for the chosen events ("independent: yes/no", computed).
- **Availability calculator:**
  - n replicas, each down with probability p, assumed independent;
  - P(all down) = pⁿ (3 replicas at 1% is 10⁻⁶);
  - P(at least one down) = 1 − (1 − p)ⁿ (2.97%).
  - A "correlated failure" toggle (the replicas share a rack) shows the independence assumption breaking: P(all down) jumps to the rack failure rate.
- **Flaky suite:** 200 tests, each flaky 1% of the time, so P(the suite goes red) = 1 − 0.99²⁰⁰ ≈ 86.6% (links `flaky-tests`, wave 7, by name only).

**Out of scope.** Distributions beyond uniform dice (T3 `distributions`); conditional probability is the next lesson.

**Kit.**
- `CellGrid` (K-7; the 6×6 sample space, `onCellClick`, roving tabindex).
- `Plot2D` (K-12; frequency `Bars` plus a convergence `Curve` on a log x axis with the exact `HLine`).
- `core/stats` (K-11), `core/random` `mulberry32`.
- `Slider` (n, p, with `format` giving "1%"), `Toggle` (correlated), `Segmented` (event presets), `core/format` (`pct`, `power`).

**AC.**
- **Watch:**
  - favourable outcomes are `--info`;
  - the overlap of A and B is `--violet`;
  - the latest roll is `--hi`;
  - frequency bars are `--info`;
  - the exact value line is `--ok`;
  - P(all down) is `--bad` when above the chosen SLO line, and `--ok` otherwise;
  - the correlated-failure path is `--orange`.
- **Misconception:** "independent backups multiply safety no matter what" (correlation breaks it), and "after five heads, tails is due" (the gambler's fallacy, with a roll-streak question). The quiz targets the first.
- **Correctness:**
  - Event probabilities equal enumeration over the 36 outcomes for every preset and for 1,000 seeded custom cell sets.
  - The union rule holds for every pair of presets.
  - The independence verdict equals the exact product check, with rational arithmetic on counts and no float compare.
  - pⁿ and 1 − (1 − p)ⁿ match closed forms; 3 replicas at 1% gives 1·10⁻⁶ and 2.9701%; 0.99²⁰⁰ gives 13.40% (red 86.60%).
  - 10,000 seeded rolls land within 0.02 of 6/36 for sum = 7 (fixed seed).
- **Hostile input:** n is capped 1-10 and p is 0-50% via sliders, so nothing is typed.
- **Honesty:** "Rolls are pseudo-random (seeded) so runs are repeatable"; "independence is an assumption: real replicas often fail together".

**Phone.** The 6×6 grid and charts stack vertically ≤ 900 px; both fit at 390 (`Plot2D` at 356 px). Calculator controls wrap.

**`conditional-bayes` · Conditional Probability & Bayes' Theorem**
Track `math` · *"99% accurate test, 50% chance you're fine"* · Builds on: `probability-basics`
**Spec.**
- A population grid of 1,000 people (dots). Sliders set prevalence (base rate), sensitivity (true-positive rate) and specificity (true-negative rate).
- The dots colour by truth (has it / doesn't) and by test result (positive / negative). "Filter to positives" fades everyone who tested negative, so the learner can see what fraction of the remaining dots really have it. That fraction is P(has it | positive).
- **The headline preset:** prevalence 1%, sensitivity 99% and specificity 99% give P(sick | positive) = 0.0099 / (0.0099 + 0.0099) = 50%. Lowering prevalence to 0.1% drops it to about 9%.
- **Bayes panel:** P(A | B) = P(B | A)·P(A) / P(B), with each term linked to its group of dots, and a tree diagram (prior → test → posterior) in the same numbers.
- An "update again" button applies a second independent positive test, using the posterior as the new prior: 50% → 99%.
- **Engineering presets:**
  - an alert that fires on 99% of real incidents with a 1% false-alarm rate, where incidents are 1 in 1,000 checks, so most pages are false;
  - a spam filter;
  - a fraud check.
- A `ConfusionMatrix` sits under the grid.

**Out of scope.** Classifier thresholds and ROC (`classification-metrics`, same batch); Bayesian inference over continuous parameters and A/B testing stay in T3.

**Kit.** `CellGrid` (K-7; 1,000 cells, canvas path; ordering puts groups together), `ConfusionMatrix` (K-18), `core/stats` (K-11), `TreeSvg` (`tidy`, the probability tree, with custom nodes showing counts), `Slider` ×3 (`format` with `pct` to 0.1%), `ChipButton` presets, `core/format`.

**AC.**
- **Watch:**
  - people who have the condition are `--violet`; those who don't, `--sky` (categories, not status);
  - a positive test is drawn as a filled dot, a negative as an outline;
  - true positives are `--ok`, false positives `--bad` and false negatives `--orange` in the `ConfusionMatrix`;
  - faded (filtered-out) dots are `--dim`;
  - the posterior readout is `--hi`.
- **Misconception:** "a 99% accurate test means a positive is 99% likely to be right" (base-rate neglect). The quiz targets it with the headline numbers, and asks the alert-precision version.
- **Correctness:**
  - The posterior is computed exactly from the three rates: 0.5 for 1%, 99%, 99%, and ≈ 0.0902 for 0.1%, 99%, 99%.
  - The two-test update gives 0.99 for the headline preset.
  - Dot counts come from largest-remainder rounding of the expected counts to 1,000, summing to 1,000 and matching the four confusion cells, tested on 500 seeded slider settings.
  - The count-based ratio TP/(TP+FP) is shown only with the exact posterior beside it, and the caption says which is which.
- **Honesty:** "The grid shows expected counts rounded to whole people; the percentage is exact." "Assumes the second test's errors are independent of the first."

**Phone.** The 1,000-dot grid is drawn at 40×25 in a 356 px-wide canvas (dots about 7 px, no text inside cells); the tree and `ConfusionMatrix` stack below. Sliders wrap. No `minWidth`.

**`expected-value` · Random Variables & Expected Value**
Track `math` · *"What happens on average, and how far off it can be"* · Builds on: `probability-basics`
**Spec.**
- A sampling machine. The learner picks a random variable:
  - one die;
  - the sum of two dice;
  - "attempts until success" (geometric, success probability p);
  - "retries with a cap" (up to r retries, each failing with probability p);
  - a custom discrete table with editable values and weights.
- "Draw ×1 / ×100 / ×10,000" stacks the outcomes into a histogram. A running-mean line and a ±1 standard deviation band settle toward the exact E[X] and SD drawn as reference lines.
- **Exact panel:** E[X] = Σ x·P(x) written out term by term for the chosen variable. A die gives 3.5 with variance 35/12 ≈ 2.92, and a die is never 3.5, which is one of the captions. Geometric: E = 1/p.
- **Linearity:** E[X + Y] = E[X] + E[Y] even for dependent X and Y. A preset shows two dependent variables where it still holds and the variance doesn't add.
- **Retry storm calculator:**
  - expected attempts per request with up to r retries = Σᵢ₌₀ʳ pⁱ;
  - at p = 0.5 and r = 3 that's 1.875× load;
  - the variance shows the tail.
  - Links `circuit-breakers`.
- A "sample mean of n" toggle shows the histogram of averages narrowing as n grows (variance of the mean = σ²/n), named but not proved.

**Out of scope.** Named distributions, percentiles and confidence intervals stay in T3 `distributions` and `percentiles-statistics`; the CLT is named only.

**Kit.** `Plot2D` (K-12; histogram `Bars`, running-mean `Curve`, `HLine` for E[X], a band as a `Polygon`), `core/stats` (K-11: `variance`, `stdDev`, `histogram`, `runningMean`), `core/random` `mulberry32`, `Segmented` (variable), `Slider` (p, r), `TextArea` or a small table editor for the custom distribution (+ a tested parser), `CodePanel` for the Σ terms, `PauseButton`.

**AC.**
- **Watch:**
  - histogram bars are `--info`;
  - the newest draw is `--hi`;
  - the running mean is `--violet`;
  - the exact E[X] line is `--ok`;
  - the ±1 SD band is a light `--violet` tint;
  - in the retry calculator, load above 1× is `--orange` and above 2× is `--bad`.
- **Misconception:** "the expected value is the most likely outcome" (a die never shows 3.5, and the geometric mode is 1 while its mean is 1/p). The quiz targets it. A second question targets "expectation doesn't add for dependent variables" (it does).
- **Correctness:**
  - Exact E and Var for every preset match closed forms: a die gives 3.5 and 35/12; two dice give 7 and 35/6; geometric gives E = 1/p and Var = (1 − p)/p²; capped retries give Σpⁱ, with the 1.875 case asserted.
  - Linearity holds on the dependent preset, and variance doesn't add there (asserted).
  - 10,000 seeded draws land within 3 standard errors of E (fixed seed).
  - The custom table's weights are normalised, and an all-zero table is refused.
- **Hostile input:** custom values must be numbers in ±10⁶ and weights ≥ 0, with ≤ 12 rows; bad rows are flagged in place.
- **Honesty:** "Draws are pseudo-random (seeded)." The retry calculator says "assumes each attempt fails independently with the same p; real retry storms make failures more likely".

**Phone.** The histogram (`Plot2D` at 356 px) fits at 390; the exact panel and custom table stack below at ≤ 900 px; the Σ line wraps inside `CodePanel`.

**`classification-metrics` · Precision, Recall & ROC Curves**
Track `ml` · *"Accuracy is the wrong question"* · Builds on: `conditional-bayes`, `expected-value` · **[domain review]**
**Spec.**
- About 60 scored examples on a horizontal score axis (0-1), drawn as two rows: actual positives and actual negatives, from the seeded `twoClassScores` dataset.
- The learner drags a threshold line, or uses arrow keys on it. Everything right of it is predicted positive.
- A `ConfusionMatrix` and live precision, recall (TPR), false-positive rate, F1 and accuracy update with every move.
- **ROC curve:** TPR against FPR. The current threshold is a moving point on the curve, and the curve is traced as the threshold sweeps.
  - AUC is shown, with its meaning stated: the chance that a random positive scores above a random negative.
  - A "random classifier" diagonal is drawn for comparison.
- **Precision-recall view:** a toggle swaps in the PR curve.
- **Imbalance slider:** the positive rate goes from 50% down to 1%.
  - "Always say negative" reaches 99% accuracy with recall 0, the accuracy paradox.
  - The ROC barely moves while precision collapses, which is why PR is preferred for rare events.
- **Cost panel:** set costs for a false positive (a wasted page) and a false negative (a missed incident). The cost-minimising threshold is marked. Presets: fraud check, alerting rule, medical screen.
- "Separation" slider: how far apart the two score clouds sit.

**Out of scope.** Multi-class metrics, calibration and fairness metrics (T3 `ml-fairness-bias`); training the model that produces the scores is `linear-logistic-regression`.

**Kit.** `ConfusionMatrix` (K-18), `Plot2D` (K-12; the score strip as `Points`, ROC and PR `Curve`s, a draggable `VLine` threshold with keyboard steps, `Points` for the current operating point), `core/fixtures/datasets` (K-17 `twoClassScores`), `core/stats`, `Slider` ×2 (imbalance, separation), `Toggle` (ROC / PR), `TextField` (costs) + `core/parse`.

**AC.**
- **Watch:**
  - actual positives are `--violet` and actual negatives `--sky` (classes are categories);
  - the threshold line is `--hi`;
  - correctly classified points get a filled marker, misclassified points an outline;
  - in the `ConfusionMatrix`, TP and TN are `--ok`, FP `--bad` and FN `--orange`;
  - the ROC curve is `--info`, the current point on it `--hi`, and the random diagonal `--dim`;
  - the cost-minimising threshold is a dashed `--ok` line.
- **Misconception:** "a high-accuracy model is a good model", via the always-negative case at 1% positives. The quiz targets it. A second question targets "raising the threshold improves both precision and recall" (they trade off).
- **Correctness:**
  - TP, FP, FN and TN at each threshold equal a brute-force count.
  - The ROC points are every distinct threshold (ties handled by grouping equal scores into one step).
  - AUC from the trapezoid rule equals the Mann-Whitney pairwise count (ties count ½) on 200 seeded datasets.
  - Precision with no predicted positives shows "–" (`NA`), not 0 or NaN.
  - The always-negative baseline's accuracy equals 1 − the positive rate.
  - The cost-minimising threshold equals brute-force minimisation over all thresholds.
  - Every metric caption is computed from the counts.
- **Hostile input:** costs must be non-negative numbers ≤ 10⁶, refused otherwise.
- **Honesty:** "Scores come from a seeded synthetic dataset, not a trained model." "Example costs are illustrative."

**Phone.** The score strip and the ROC plot stack vertically ≤ 900 px, each a 356 px `Plot2D`; the `ConfusionMatrix` and metric stats wrap below. The threshold drag has a keyboard path (focus the line, then ←/→ step one example).

**`shuffle-reservoir` · Fisher-Yates Shuffle & Reservoir Sampling**
Track `dsa` · *"Fair randomness in one pass"* · Builds on: `probability-basics`, `sorting`
**Spec.**
- **Shuffle lab:** a short array (n = 3-8) shuffled by the learner's choice of algorithm:
  - **Fisher-Yates** (swap i with a random j in [i, n)), stepped with the shrinking unshuffled region shown;
  - the **naive** shuffle (swap each i with a random j in [0, n)): every index can be chosen at every step, so it makes nⁿ equally likely paths;
  - **sort with a random comparator** (`sort(() => Math.random() - 0.5)`).
- "Run ×10,000" fills a position × value heatmap. Fisher-Yates is flat; the naive shuffle has a visible diagonal bias.
- **Exact view for n = 3:** all 27 naive paths are enumerated and grouped by the permutation they produce (counts 4, 5, 5, 5, 4, 4 of 27). Fisher-Yates's 6 paths give one each. This is the proof, not a simulation: 27 isn't divisible by 6.
- **Reservoir sampling (Algorithm R):** a stream of items flows past a k-slot reservoir.
  - Item i (1-based) for i > k replaces a random slot with probability k/i.
  - The learner sets k and stream length, steps or plays, and an inclusion-count chart over many runs shows every item kept with probability k/n.
- Use cases: shuffling a playlist, sampling log lines from a stream of unknown length, picking an A/B cohort.

**Out of scope.** Cryptographically secure randomness (T3 `randomness-csprng`; one key idea says `Math.random` isn't), and weighted reservoir sampling.

**Kit.** `ArrayStrip` (the array and pointers i/j, `range` for the shuffled region; the reservoir slots), `CellGrid` (K-7; the n × n frequency heatmap with `intensity`), `Plot2D` (K-12; inclusion-count `Bars` with the k/n `HLine`), `core/random` (`mulberry32`, `shuffle` for reference), `Segmented` (algorithm, n), `Slider` (k, stream length), `createRecorder`, `PauseButton`.

**AC.**
- **Watch:**
  - the current index i is `--info`, the random pick j `--violet`, and the swap flash `--hi`;
  - the already-shuffled region is a light `--ok` tint;
  - heat cells take one tone (`--info`) by intensity;
  - cells deviating from the uniform expectation by more than 3 standard errors get a `--bad` outline;
  - the reservoir's newly admitted item is `--hi`, and an item evicted from it `--dim`;
  - the k/n line is `--ok`.
- **Misconception:** "swapping each element with any random position is a fair shuffle". The exact n = 3 count disproves it, and the quiz targets it. A second question targets "you need the stream length in advance to sample fairly" (reservoir doesn't).
- **Correctness:**
  - Exact enumeration: Fisher-Yates gives each of the n! permutations exactly one path for n ≤ 6.
  - The naive shuffle at n = 3 gives the counts {4, 5, 5, 5, 4, 4} over 27, with 123, 312 and 321 at 4 and 132, 213 and 231 at 5.
  - Reservoir inclusion probability is exactly k/n by enumeration for n ≤ 6 and all k.
  - The seeded 10,000-run heatmaps match expectations within 3 standard errors for Fisher-Yates, and the naive bias exceeds that at n = 3 (fixed seed).
  - The random-comparator result is shown as measured in this browser, never asserted as a fixed pattern.
- **Honesty:**
  - "Runs use a seeded pseudo-random generator, so you can repeat them."
  - "How biased the random-comparator sort is depends on the browser's sort algorithm; this is what yours does."

**Phone.** The array and reservoir strips fit at 390 (`cellMax`). The 8×8 heatmap fits at `size="sm"`; the exact-paths table for n = 3 (27 rows) collapses into the 6 grouped rows with a "show all paths" disclosure.

---

##### Batch T2-B8 · Linear algebra & fitting (`math`, `ml`)
Wave 3. Pilots `Plot2D` in full (draggable `Points`, `Curve`, `Arrow`, `Polygon`, `Heat`), `core/vec`, `core/fit` and `core/fixtures/datasets`. Every fitted line or curve on screen comes from a real closed form or a real gradient step computed in the lesson, never drawn by hand (§3.1.9 ML correctness).

**`vectors-similarity` · Vectors, Dot Products & Cosine Similarity**
Track `math` · *"How search engines measure 'close enough'"* · Builds on: `sets-functions`, `logs-exponentials` · **[domain review]**
**Spec.**
- Two draggable 2D arrows **a** and **b** from the origin. Live readouts show the components, the lengths ‖a‖ and ‖b‖, a·b = aₓbₓ + a_yb_y, the angle θ and cos θ = a·b / (‖a‖‖b‖).
- The projection of **b** onto **a** is drawn as a shadow segment, so "dot product = how much b points along a, times ‖a‖" is visible.
- Scale-invariance toggle: "double b". The dot product doubles, cosine stays the same, which is why search ranks by cosine.
- Presets: same direction (cos 1), perpendicular (cos 0), opposite (cos −1), "long but off-angle vs short and aligned".
- A **nearest neighbours** panel: a query point and 12 labelled points from a lesson-authored set. A metric switch (cosine vs Euclidean) relights the top 3, and one preset ranks the two metrics differently.
**Out of scope.** 2D only, brute-force neighbours. Embedding models are `embeddings`; ANN indexes are T3 `vector-search`.
**Kit.** `Plot2D` (`Arrow`, `Points` with `onDrag`, `Segments`), `core/vec` (`dot`, `norm`, `cosine`), `Segmented`, `ChipButton` presets, `Stat`, `AnimatedValue`.
**AC.**
- Watch: **a** is `--info`, **b** is `--violet`, the projection is a dashed `--violet`, the query point is `--hi`, the top-3 neighbours are `--ok`, and the other points are `--dim`.
- Misconception: "a bigger dot product always means more similar". Length inflates it; cosine removes length.
- Correctness: `cosine` equals `dot/(norm·norm)` and stays in [−1, 1] on seeded random vectors; scaling either vector by k > 0 leaves cosine unchanged; the rankings for both metrics match a brute-force sort, and the preset that ranks them differently is asserted; a zero vector gives "undefined" on screen, not NaN.
- Honesty: "Hand-picked 2D points; real embeddings have hundreds of dimensions."
**Phone.** `Plot2D` is square and scales down to about 320px, and the readouts reflow below it. No `minWidth` is needed if the axis labels stay at 10px or more; check this with `smoke --mobile`.

**`matrices-transformations` · Matrices as Transformations**
Track `math` · *"A matrix is a function that bends space"* · Builds on: `vectors-similarity` · **[domain review]**
**Spec.**
- A unit grid, the basis arrows **î** and **ĵ**, and a lesson-authored shape (an "F", so mirroring shows). An editable 2×2 matrix (four number fields plus sliders) warps all of them live. The columns of the matrix *are* where î and ĵ land, and the screen says so.
- The determinant is shown as the signed area of the transformed unit square. A negative determinant flips the F; a zero determinant collapses the plane to a line, and the "can't be undone" note appears with the inverse readout "none".
- Presets: rotate 30°, scale ×2, shear, reflect, project onto x, singular.
- **Compose:** pick A then B. The panel shows B·A applied left-to-right in time, next to A·B, so order visibly matters (rotate-then-scale-x vs scale-x-then-rotate).
- **Homogeneous 3×3** tab: translation, impossible in 2×2, becomes a matrix. It's linked to CSS `transform: matrix(a, b, c, d, e, f)`, with the real CSS applied to a small DOM box beside the plot.
**Out of scope.** 3D, cameras and projection stay in T3 `3d-transforms-projection`; eigenvectors stay in T3 `eigen-pagerank`.
**Kit.** `Plot2D` (`Polygon`, `Arrow`, grid), `core/vec` (`mat2`/`mat3` multiply, apply, `det`, `inverse`), `TextField` (numbers via a tested lesson parser), `Slider`, `Segmented`, `ChipButton`.
**AC.**
- Watch: î is `--info`, ĵ is `--violet`, the original shape is `--dim`, the transformed shape is `--hi`, and the determinant area is an `--ok` tint when det > 0 and an `--orange` tint when det < 0 (a flip is not an error).
- Misconception: "matrix multiplication is commutative", that is, "the order of transforms doesn't matter".
- Correctness:
  - `apply(M, v)` matches hand-computed results on the presets.
  - det equals the shoelace area ratio of the transformed unit square, sign included.
  - `inverse(M)·M = I` within 1e-12 for random non-singular M, and it is null for det = 0.
  - A·B ≠ B·A on the compose preset.
  - The 3×3 translation result matches the browser's computed `DOMMatrix` for the CSS string.
- Honesty: nothing is simulated. The CSS box says "real CSS transform".
**Phone.** The plot scales to its width. The matrix editor reflows under it, and the compose tab stacks the two results vertically at ≤900px. No `minWidth`.

**`gradient-descent` · Gradient Descent**
Track `ml` · *"Roll downhill until you can't"* · Builds on: `matrices-transformations`, `logs-exponentials` · **[domain review]**
**Spec.**
- A loss surface over two parameters (w₁, w₂), drawn as a `Heat` contour map. A ball steps from a start point the learner drops by click (or keyboard). Each step draws the gradient arrow, then moves −η·∇L.
- Sliders: learning rate η (log scale), momentum β (0-0.95), and steps per press. A step/play transport and a loss-vs-step `Curve` beside the map.
- Surfaces: a round bowl, a narrow ravine (zig-zag without momentum, smoothed with it), two minima (the start decides which one you find), and a saddle.
- Presets: "too small" (crawls), "just right", "too big" (oscillates), and "divergent", where the loss shoots off and the run stops with a "diverged" caption.
- A batch toggle: full gradient vs mini-batch on the B8 regression data, where the steps get noisy but cheap. The noise is real: it's sampled from seeded batches.
**Out of scope.** Backprop and neural nets stay in T3 `neural-networks-backprop`; Adam etc. are named only.
**Kit.** `Plot2D` (`Heat`, `Points`, `Arrow`, `Curve`), `core/fit` (`gradientStep`, `mse`), `core/fixtures/datasets` (`lineWithNoise`), `Slider` with `format`, `Segmented`, `usePlayer`/`Transport`, `createRecorder`.
**AC.**
- Watch:
  - contours run from `--dim` (high) to `--info` (low);
  - the ball is `--hi`;
  - the gradient arrow is `--violet`;
  - the path so far is a thin `--hi` trail;
  - the minimum found is `--ok`;
  - a divergent run's last step is `--bad`.
- Misconception: "a bigger learning rate always converges faster".
- Correctness:
  - Analytic gradients match central finite differences within 1e-6 at seeded points on every surface.
  - On the bowl, the step count to within ε of the minimum is checked against the closed-form contraction rate.
  - The "too big" preset diverges (the loss increases monotonically), and "just right" converges, both asserted.
  - Momentum reduces the ravine step count, asserted.
  - Mini-batch results are deterministic per seed.
- Honesty: "Two-parameter toy loss; real models have millions of parameters. Mini-batch noise is seeded."
**Phone.** The map and the loss curve stack vertically at ≤900px; the map is square at full width. `Heat` is canvas, so check that its labels (SVG) stay at 8px or more.

**`linear-logistic-regression` · Linear & Logistic Regression**
Track `ml` · *"Fitting a line, then a probability"* · Builds on: `gradient-descent` · **[domain review]**
**Spec.**
- **Linear tab:** a scatter of seeded points. The learner drags points or clicks to add and remove them, and the least-squares line refits instantly. Residuals are drawn as vertical segments, and their squares as small squares (an MSE readout), so "least squares" is literal.
- An outlier preset drags one point far away and the line tilts toward it. A toggle shows the fit with that point removed.
- A "fit by gradient descent" button runs real GD steps from a flat line and lands on the same line as the closed form, linking back to `gradient-descent`.
- **Logistic tab:** two classes on one feature, then two features. A sigmoid curve or decision boundary is fitted by real gradient steps on log loss. A probability readout follows the cursor, and a threshold slider moves the boundary.
- A "perfectly separable" preset shows the weights growing without bound (the loss keeps falling). The caption says why regularisation exists, and an L2 toggle stops it.
**Out of scope.** Model validation and overfitting are `supervised-learning`; threshold metrics are `classification-metrics`.
**Kit.** `Plot2D` (`Points` with `onDrag`, `Curve`, `Segments`, `Heat` for the 2-feature probability map), `core/fit` (`leastSquares`, `sigmoid`, `logLoss`, `gradientStep`), `core/fixtures/datasets` (`lineWithNoise`, `blobs`), `Segmented`, `Toggle`, `Slider`.
**AC.**
- Watch:
  - points are `--info`, or `--info`/`--violet` by class;
  - the fitted line or boundary is `--hi`;
  - residuals are `--orange`;
  - the GD line in progress is a dashed `--hi`;
  - the probability map is tinted toward each class's colour;
  - a dragged point is `--hi`.
- Misconception: "logistic regression predicts a class directly". It predicts a probability; the threshold makes the class.
- Correctness:
  - `leastSquares` matches the normal-equation solution and a hand-computed 3-point example.
  - The GD line matches the closed form within 1e-4 after convergence.
  - The logistic gradient matches finite differences.
  - Log loss is non-increasing per step at the chosen η.
  - On separable data, weights grow without L2 and stay bounded with it (asserted).
  - With fewer than 2 distinct x values, the lesson says "need at least two different x values" instead of drawing NaN.
- Honesty: "Seeded synthetic data."
**Phone.** It fits. The plot uses full width and the controls wrap below. Dragging has the select-then-arrow-keys path from `Plot2D`.

**`supervised-learning` · Supervised Learning: Fitting, Overfitting & Validation**
Track `ml` · *"Memorising isn't learning"* · Builds on: `linear-logistic-regression` · **[domain review]**
**Spec.**
- Seeded noisy samples of a hidden curve, split into training points (filled) and validation points (hollow). A "reshuffle split" button re-splits them with a new seed.
- A model-complexity slider (polynomial degree 0-12) refits by least squares. A second plot draws training error and validation error against degree. Training error keeps falling, while validation error makes a U, and the best degree is marked.
- A regularisation slider (ridge λ, log scale) at a high degree smooths the wiggle back down, and the error plot shows the λ that minimises validation error.
- A "more data" slider (10 → 200 points) shows the same high-degree model overfitting less with more data.
- A "peek at the test set" button reveals a third held-out set's error once. Its caption explains why tuning on it would make the number lie.
- Presets: underfit (degree 1), good fit, overfit (degree 12, 15 points), "fixed by λ", "fixed by data".
**Out of scope.** Specific model families beyond polynomials are `decision-trees-ensembles`; cross-validation folds are named only; metrics for classifiers are `classification-metrics`.
**Kit.** `Plot2D` ×2 (`Points`, `Curve`, `VLine` for the best degree), `core/fit` (`leastSquares` with degree and ridge λ, `mse`), `core/fixtures/datasets`, `Slider`, `ChipButton`, `Stat`.
**AC.**
- Watch: training points are solid `--info`, validation points are hollow `--violet`, the fitted curve is `--hi`, the hidden true curve is dashed `--dim`, training error is `--info`, validation error is `--violet`, the best-degree line is `--ok`, and the test error reveal is `--orange`.
- Misconception: "the lowest training error is the best model".
- Correctness:
  - Training MSE is non-increasing in degree on every seed (nested least squares).
  - The ridge solution matches the normal equations (XᵀX + λI)⁻¹Xᵀy.
  - λ → 0 matches plain least squares.
  - The best degree on screen equals argmin of the validation MSE.
  - The fit warns when degree ≥ the number of training points ("as many coefficients as points: it can pass through every one") rather than solving a singular system silently. The condition check comes from `core/fit`.
- Honesty: "Synthetic data from a known curve plus seeded noise, so we can show the true curve. With real data you never see it."
**Phone.** The two plots stack vertically at ≤900px, each at full width; the sliders wrap. No `minWidth`.

---

##### Batch T2-B9 · Cryptography (`sec`)
Wave 3. Pilots `core/numberTheory` (`modPow`, `egcd`, `modInverse`, `toyRsa`), the `crypto.ts` additions (`hmac`, `aesBlockEncrypt`, `ecdsaKeyPair`/`ecdsaSign`/`ecdsaVerify`), `ByteGrid` and `SequenceDiagram` in a security context. The whole batch is **[domain review]**.

Batch rules:
- Anything shown as "real" runs through `crypto.subtle` and says so.
- Every toy parameter carries the on-screen label "toy key, trivially breakable — real RSA uses 2048+ bit moduli" (or the DH equivalent).
- No forged tags, forged signatures or attack walkthroughs.

**`symmetric-ciphers` · Symmetric Ciphers & Block Modes**
Track `sec` · *"Why ECB mode leaks the picture"* · Builds on: `hashing-encryption`, `bit-manipulation` · **[domain review]**
**Spec.**
- **Picture lane:**
  - A lesson-authored 48×48 pixel picture (an original two-tone mascot with large flat areas) is encrypted with a key generated in the browser.
  - The ciphertext bytes are re-drawn as pixels side by side for ECB, CBC, CTR and GCM.
  - In ECB, identical 16-byte plaintext blocks give identical ciphertext blocks, so the outline survives. The other three look like noise.
  - Hovering a block highlights every block with the same ciphertext.
- **Chaining lane:**
  - Four plaintext blocks in a `ByteGrid`, with the mode diagram drawn underneath: XOR with the previous ciphertext (CBC), or a counter keystream (CTR).
  - Flipping one plaintext bit lights which ciphertext blocks change: from that block on in CBC, only that block in CTR and ECB.
- **IV / nonce lane:**
  - Encrypt the same message twice with "reuse the IV" on and off.
  - With reuse, CBC gives an identical first block, and CTR leaks the XOR of the two plaintexts. This is shown as a highlighted `ByteGrid` of equal bytes, not as a recovery procedure.
- **Integrity lane:** flip a ciphertext byte, then decrypt.
  - CBC decrypts to silently garbled text.
  - CTR flips exactly the same plaintext bit.
  - GCM refuses with an authentication failure.
  - The recommendation chip "use AES-GCM (or ChaCha20-Poly1305) with a fresh nonce" is the summary.
**Out of scope.** What encryption is vs hashing is `hashing-encryption`; key wrapping and KMS stay in T3 `envelope-encryption-kms`; cipher internals (rounds, S-boxes) are named only.
**Kit.** `crypto.ts` (`aesBlockEncrypt` for ECB; `crypto.subtle` AES-CBC/AES-CTR/AES-GCM for the rest), `useAsyncValue` (`keepPrevious`), `ByteGrid` (fields per block), `BitStrip` (the flipped byte), canvas for the 48×48 pixel lanes (local `draw.ts`), `ScenePicker`, `Toggle`, `ChipButton`.
**AC.**
- Watch:
  - plaintext bytes are `--info`;
  - ciphertext bytes are `--violet`;
  - repeated ciphertext blocks get a `--bad` outline (a leak);
  - changed blocks are `--hi`;
  - the GCM refusal is `--ok` (detected), and a silently garbled decrypt is `--bad`;
  - the picture's two tones are categorical (`--sky`, `--amber`).
- Misconception: "any AES encryption hides patterns", and "encryption alone stops tampering".
- Correctness:
  - `aesBlockEncrypt` matches the FIPS-197 Appendix C.1 vector.
  - CBC and CTR match the SP 800-38A F.2.1 and F.5.1 vectors (single-block slices via the same path).
  - The equal-block count in the ECB picture equals the count of equal plaintext blocks.
  - CBC bit-flip propagation (current block garbled, next block flips the same bit) is asserted on decrypt.
  - GCM decrypt of a tampered ciphertext rejects.
  - Without `crypto.subtle` (`hasSubtle()` false), the lesson says so instead of drawing fake noise.
- Honesty: "Real AES in your browser via WebCrypto. ECB isn't offered by WebCrypto; we build it one block at a time to show why you should never use it (SP 800-38A still lists it; NIST intends to drop it)."
**Phone.** The four picture lanes become a 2×2 grid at ≤900px. Each lane is 120px, with crisp pixels via `image-rendering: pixelated`. `ByteGrid` uses `perRow={8}` on phones. No stage `minWidth`; the chaining diagram goes in a `WideRegion` (about 560).

**`macs-hmac` · MACs & HMAC**
Track `sec` · *"A checksum only the keyholder can make"* · Builds on: `hashing-encryption`, `symmetric-ciphers` · **[domain review]**
**Spec.**
- A sender, a channel and a receiver. The message (an editable JSON order such as `{"amount": 10}`) and a shared secret go through HMAC-SHA-256, and the tag travels with the message.
- **Tamper toggle:** an editor in the channel changes the amount to 1000 without the key. The receiver recomputes the tag, and the mismatch is shown byte by byte in `ByteGrid`.
- **"Use a plain hash instead" toggle:**
  - The tag becomes `sha256(message)`. Anyone in the middle can recompute it after editing, so the check passes on a modified message: the reason a MAC needs a key.
  - The `hash(key ‖ message)` construction is named, with one plain-words line: "some hash constructions let others extend a tagged message without the key; HMAC's nested design exists to rule that out". No extension is computed.
- **Comparison panel:** comparing tags with `===` vs a constant-time compare, explained in words ("early exit can reveal how many bytes matched"). Not timed on screen.
- Use-case chips that set the scene: webhook signature header, signed cookie, an HS256 JWT signature (linked to `auth-sessions-jwt`).
**Out of scope.** Signatures with public keys are `digital-signatures-pki`; webhook delivery is `webhooks`; timing attacks in depth stay in T3 `timing-side-channels`.
**Kit.** `crypto.ts` (`hmac` with `{ hash: 'SHA-256' }`, `sha256Hex`), `useAsyncValue`, `ByteGrid` (`highlight` on mismatched bytes), scene kit (`SceneNode`, `Packet`), `TextArea`, `Toggle`, `ChipButton`.
**AC.**
- Watch:
  - the message packet is `--info`;
  - the tag is `--violet`;
  - the edited field is `--hi`;
  - a matching tag is `--ok`, mismatched bytes are `--bad`;
  - the plain-hash "passes but shouldn't" verdict is `--bad` with the word "forged".
- Misconception: "a hash of the message proves it wasn't changed".
- Correctness:
  - `hmac` matches RFC 4231 test cases 1, 2 and 6 (long key).
  - Any single-byte edit to the message changes the tag (property test over seeded edits).
  - The plain-hash mode verifies the edited message, asserted, which is exactly the flaw shown.
  - The constant-time compare returns the same result as `===` on seeded pairs.
- Honesty: "Real HMAC-SHA-256 in your browser. Length extension is described, not demonstrated."
**Phone.** The three-actor scene goes in a `WideRegion` (about 560). The JSON editor, tag `ByteGrid` (`perRow={8}`) and toggles reflow below.

**`diffie-hellman` · Diffie-Hellman Key Exchange**
Track `sec` · *"Agree on a secret while everyone's listening"* · Builds on: `modular-arithmetic`, `primes-factoring`, `tls-handshake` · **[domain review]**
**Spec.**
- **Paint lane:** Alice and Bob each mix a private colour into a public base. They swap the mixtures and add their own private colour again, and arrive at the same final colour. Eve, on the wire, sees only the base and the two mixtures. The colours are real `color-mix` blends.
- **Numbers lane:**
  - The same exchange with toy numbers, as a `SequenceDiagram`: p = 23, g = 5, with editable private keys a and b.
  - It shows A = gᵃ mod p and B = gᵇ mod p crossing the wire, and both computing s = Bᵃ = Aᵇ mod p.
  - Eve's panel lists what she has, and a "try every a" counter brute-forces the toy a instantly. A digits slider on p shows that the counter's projected time explodes, extrapolated and labelled.
- **Real lane:** a real ECDH P-256 key agreement via `crypto.subtle`. Both sides derive the same 256-bit secret (shown as hex), with the public keys shown and the private keys marked non-extractable.
- **Man-in-the-middle toggle:**
  - Eve swaps both public values. Each side now shares a different secret with Eve, while the sides still "agree" with someone.
  - The caption: DH alone doesn't prove *who* you agreed with, which is why TLS signs it (linked to `digital-signatures-pki` and `tls-handshake`). Plain-words only; no interception steps.
**Out of scope.** The TLS handshake flow is `tls-handshake`; forward secrecy and ratchets stay in T4 `e2ee-forward-secrecy`; elliptic-curve maths stays in T4 `elliptic-curves`.
**Kit.** `core/numberTheory` (`modPow`, `isProbablePrime` to validate an edited p), `SequenceDiagram` (actors Alice, Eve and Bob; `step`), `crypto.subtle` ECDH (local helper; a single user, so not extracted), `useAsyncValue`, `TextField` (integer parse via `core/parse`), `Slider`, `ScenePicker`, `Toggle`.
**AC.**
- Watch:
  - public values are `--info`;
  - private values are `--violet` with a lock glyph;
  - the shared secret is `--ok`;
  - Eve and everything she sees are `--orange` (an observer, not an error);
  - the MITM-split secrets are `--bad`;
  - paint colours are categorical and stated per chip.
- Misconception: "the shared key is sent over the wire, encrypted".
- Correctness:
  - Bᵃ ≡ Aᵇ (mod p) for all a, b in 1…p−2 on the toy group.
  - An edited non-prime p is refused with a message.
  - g's order is checked, so a weak g gets "this g only makes k distinct values".
  - The ECDH secrets derived by both sides are byte-equal.
  - In MITM mode, Alice's and Bob's secrets differ, asserted.
- Honesty: "Toy numbers, trivially breakable: real DH uses 2048+ bit primes or elliptic curves. The ECDH lane is real WebCrypto."
**Phone.** `SequenceDiagram` in its `WideRegion` (about 480). The paint lane fits at 390 with stacked actors. The ECDH hex wraps in a mono block.

**`rsa` · RSA & Public-Key Cryptography**
Track `sec` · *"A lock anyone can close but only you can open"* · Builds on: `gcd-euclid`, `primes-factoring`, `modular-arithmetic`, `hashing-encryption` · **[domain review]**
**Spec.**
- **Keygen stepper:** pick toy primes p and q (default 61 and 53), then e (default 17). It steps through n = pq, φ = (p−1)(q−1), the check gcd(e, φ) = 1, and d = e⁻¹ mod φ via the extended-Euclid remainder table (linked to `gcd-euclid`). An invalid choice (e sharing a factor with φ, or p = q, or a non-prime) stops with the exact reason.
- **Encrypt/decrypt:** a message number m < n (or a short word encoded per character, labelled as a toy encoding). c = mᵉ mod n is shown around a modular clock, and m = cᵈ mod n comes back.
- **Sign vs encrypt:** the same key used the other way round. s = mᵈ is checked with sᵉ, and the "who holds which key" table makes it explicit.
- **Why size matters:** a "factor n" button finds p and q for the toy n instantly with a trial-division step counter. A key-size slider (16 → 2048 bits) shows the projected trial-division work exploding. Labelled as extrapolated; GNFS is named as the real attack, not run.
- **Textbook-RSA pitfalls panel** (plain words, no attack steps): deterministic encryption (the same m always gives the same c), so real systems pad (OAEP) and sign hashes (PSS). It links to `hashing-encryption`'s real RSA-OAEP lane.
**Out of scope.** Square-and-multiply internals stay in T3 `modular-exponentiation`; CRT speed-ups stay in T3 `chinese-remainder`; real RSA usage is already in `hashing-encryption` lane ④.
**Kit.** `core/numberTheory` (`toyRsa`, `modPow`, `egcd`, `modInverse`, `isProbablePrime`, `trialFactor`), `.data-table` (remainder table), `TextField`, `Slider` (key bits, `format`), `ScenePicker`, local SVG modular clock.
**AC.**
- Watch: the public key (n, e) is `--info`, the private d is `--violet` with a lock, the message is `--hi`, the ciphertext `--orange`, a successful decrypt or verify `--ok`, and an invalid parameter `--bad`.
- Misconception: "the public key can decrypt what it encrypted", or "RSA is secure with any key size".
- Correctness:
  - `toyRsa(61, 53, 17)` gives n = 3233, φ = 3120 and d = 2753.
  - Decrypt(encrypt(m)) = m for **every** m < n on that key and on 20 seeded toy keys.
  - Verify(sign(m)) holds, and fails for m + 1.
  - The invalid-parameter cases each give their own message.
  - `trialFactor` recovers p and q and its step count is asserted.
- Honesty: "Toy key, trivially breakable — real RSA uses 2048+ bit moduli, padding (OAEP/PSS) and a vetted library. Never use textbook RSA."
**Phone.** It fits. The stepper is HTML rows, the modular clock is an SVG of about 280px that scales down, and the tables scroll inside a `WideRegion` only if wider than 340.

**`digital-signatures-pki` · Digital Signatures & Certificate Chains**
Track `sec` · *"Proving who said it, and who vouches for them"* · Builds on: `rsa`, `macs-hmac`, `tls-handshake` · **[domain review]**
**Spec.**
- **Sign & verify:**
  - A real ECDSA P-256 key pair is generated in the browser.
  - Sign an editable release note. The signature and public key are shown in `ByteGrid`.
  - Editing one character of the note, or flipping one signature byte, makes verify fail.
  - Contrast chip: with HMAC, the verifier could also forge; with a signature, only the private key signs.
- **Chain walk:**
  - A fictional leaf `shop.example`, issued by a fictional intermediate, issued by a fictional root in a simulated trust store.
  - Step up the chain: each certificate's issuer name must match the next one's subject, and its signature must verify with that certificate's key. These are real ECDSA verifies over lesson-built "certificates": JSON stand-ins, labelled as not X.509.
- **Validation failures**, each a preset that turns one link red with the browser-style reason:
  - expired leaf;
  - not yet valid;
  - name mismatch (`www.shop.example` vs `shop.example`);
  - unknown root;
  - missing intermediate;
  - intermediate not allowed to issue (CA flag off);
  - tampered leaf.
- Revocation is named, with one plain-words line on OCSP and CRLs. No scene.
- **"Self-signed" preset:** valid signature, untrusted root. The signature is fine; trust is the problem.
**Out of scope.** Where certificates sit in the handshake is `tls-handshake`; renewal and expiry operations are `cert-lifecycle`; X.509/ASN.1 encoding is named only.
**Kit.** `crypto.ts` (`ecdsaKeyPair`, `ecdsaSign`, `ecdsaVerify`), `useAsyncValue`, `ByteGrid`, `TreeSvg` (`tidy`, three levels, for the chain; local card renderNode), `TextArea`, `ScenePicker`, `ChipButton` (failure presets).
**AC.**
- Watch:
  - the private key is `--violet` with a lock, the public key `--info`;
  - the step being checked is `--hi`;
  - a verified link is `--ok`;
  - a failing link is `--bad`, with the reason chip;
  - the trust store is a `--violet` outline;
  - certificates not yet checked are `--dim`.
- Misconception: "a valid signature means the certificate is trusted".
- Correctness:
  - Verify succeeds for the untouched note and fails for every single-byte edit to the message or the signature (seeded sample of 64 positions).
  - The chain validator returns exactly the documented reason for each failure preset, with an exhaustive test over the presets.
  - Validity uses a fixed lesson clock, not `Date.now()`, so tests are deterministic.
  - The name match follows the single-label wildcard rule (`*.shop.example` matches `www.shop.example`, not `a.b.shop.example`).
- Honesty: "Real ECDSA signatures in your browser; the certificates are simplified stand-ins, not X.509, and the trust store is simulated. All names are fictional."
**Phone.** The chain tree is three nodes stacked vertically and fits at 390. The `ByteGrid` uses `perRow={8}`. The failure chips wrap.

---

##### Batch T2-B10 · Inside the CPU (`hw`, `sec`)
Wave 4. Uses **`MemoryMap` (K-15)** heavily (isa-assembly, calling-conventions, memory-safety-bugs) and **`CellGrid` (K-7)** for cpu-caches. One ISA for the whole batch: **x86-64, System V AMD64 ABI, Intel syntax**, as `gcc -O1 -masm=intel` would print it. The listings are hand-checked against real compiler output and labelled as such. memory-safety-bugs is payload-free (AC-0/T2 #9).

**`cpu-pipelining` · Pipelining & Hazards**
Track `hw` · *"An assembly line for instructions"* · Builds on: `fetch-decode-execute`, `logic-gates`
**Spec.**
- The classic 5-stage RISC pipeline (IF, ID, EX, MEM, WB) as a stage × cycle chart: instructions are rows, cycles are columns, and each cell names a stage.
- A non-pipelined toggle shows the same program taking 5 cycles per instruction; pipelined, it's about 1 per instruction once full. CPI and total cycles are shown side by side.
- Hazards, each a preset program in a tiny MIPS-like syntax:
  - **Data hazard (RAW):** `add r1,r2,r3` followed by `sub r4,r1,r5`. With forwarding off it stalls 2 cycles; with forwarding on, an arrow from EX/MEM to EX removes the stall.
  - **Load-use:** `lw r1,0(r2)` followed by `add r3,r1,r4` stalls 1 cycle even with forwarding.
  - **Control hazard:** a taken branch flushes the 2 instructions fetched behind it (with branch resolution in EX).
  - **Structural:** one memory port shared by IF and MEM, as a toggle.
- The learner can reorder independent instructions (drag, or up/down buttons) to hide a load-use stall, and watch the cycle count drop.
- A **latency vs throughput** readout: one instruction still takes 5 cycles; the pipeline finishes one per cycle.
**Out of scope.** Branch prediction and speculation (T3 `branch-prediction`), superscalar and out-of-order execution (one summary line).
**Kit.** `CellGrid` (K-7) with `rowLabels` (instructions) and `colLabels` (cycles), `CodePanel` (program, `stateOf` per row), `Toggle` (forwarding), `Segmented` (preset), `useArrowMarker` (forwarding arrows), `AnimatedValue`, `createRecorder`.
**AC.**
- Watch: each stage has a categorical tone (`categorical(i)`); the current cycle column is `--hi`; a stall bubble is `--dim` with a hatched `wait` look; flushed instructions are `--bad` struck through; forwarding arrows are `--info`; the dependent register in the code panel is `--violet`.
- Misconception: "pipelining makes each instruction faster".
- Correctness:
  - A pure `pipeline(program, { forwarding, branchStage, memPorts })` is tested on every preset. Without forwarding, RAW = 2 stalls (register file written in the first half-cycle and read in the second); with forwarding 0; load-use = 1; a taken branch resolved in EX flushes 2.
  - Total cycles = n + 4 + stalls + flushes on every preset and on seeded random hazard-free programs.
  - Reordering never changes the program's final register values (the program is executed against a reference interpreter).
- Honesty: "A textbook 5-stage pipeline (MIPS-style), not any real x86 or ARM core."
**Phone.** The chart is in a `WideRegion minWidth={560}`; the code panel sits above it at full width.

**`cpu-caches` · CPU Caches, Cache Lines & Locality**
Track `hw` · *"Access memory the way the hardware wants"* · Builds on: `memory-hierarchy`, `arrays-linked-lists`, `binary-hex`
**Spec.**
- A 2D array (8×8 `int32`, so 4 bytes each and a 64-byte line holds 16 ints, or 2 rows) is drawn as a `CellGrid` in row-major memory order. Beside it, a small cache: 4 sets × 2 ways of 64-byte lines with LRU per set.
- Controls:
  - Loop order (row-wise `a[i][j]` vs column-wise `a[j][i]`).
  - Array width: 8, 16, or a 64-int power-of-two stride that maps every row to the same set (conflict misses).
  - Step through, or run.
  - A struct layout preset: array-of-structs vs struct-of-arrays, summing one field.
- Each access lights its cell. The address splits into tag | set | offset on a `BitStrip`, and the set lights. Then a hit (the line is present) or a miss (the line loads and all 16 ints in it tint as "brought in for free").
- Counters: hits, misses, hit rate, and an illustrative time from `memory-hierarchy`'s L1/RAM latencies. Miss kinds are labelled: compulsory, capacity, conflict.
- A "**Why it matters**" line compares row-wise and column-wise hit rates for the same work.
**Out of scope.** Coherence between cores and false sharing (T3 `cache-coherence`), prefetchers (one honesty line), and TLBs.
**Kit.** `CellGrid` (K-7) for the array and for the cache sets, `BitStrip` (`groups` for tag/set/offset), `Segmented`, `Stat`/`AnimatedValue`, `core/format` (`pct`, `latency`), `createRecorder`.
**AC.**
- Watch: the current access is `--hi`; a hit flashes `--ok` and a miss `--bad`; cells brought in by the current line are a `--info` tint; set index bits are `--violet`, tag bits `--info` and offset bits `--dim`; the evicted line is struck in `--orange`.
- Misconception: "memory access cost doesn't depend on order; only the number of accesses matters".
- Correctness:
  - A pure set-associative LRU `simulateCache(addresses, { lineBytes, sets, ways })` is tested against a brute-force fully-modelled reference on seeded address streams.
  - Row-wise over 8×8 int32 gives exactly 4 misses in 64 accesses (all compulsory); column-wise gives the hand-worked count.
  - Miss classification is tested: compulsory = first touch of a line; capacity = it would also miss in a fully associative cache of the same size; conflict = everything else.
  - The address split is tested for every set count.
- Honesty: "Toy cache: real L1 data caches are 32-48 KB with 8-12 ways, and hardware prefetchers hide much of the column-wise penalty for simple strides. Latencies are illustrative."
**Phone.** The array and cache stack vertically; each grid fits at `size="sm"` at 390px. The address `BitStrip` wraps between groups.

**`isa-assembly` · Instruction Sets & Assembly**
Track `hw` · *"What your code turns into"* · Builds on: `fetch-decode-execute`, `stack-vs-heap`, `twos-complement`
**Spec.**
- Three panels: C source, its x86-64 assembly (Intel syntax, `-O1` style), and live state (registers `rax rbx rcx rdx rsi rdi rsp rbp rip` plus flags `ZF SF CF OF`, and a `MemoryMap` of the stack and a small data region).
- Clicking a C line highlights its instructions, and vice versa.
- **Step** executes one instruction:
  - registers change with a flash;
  - memory cells change;
  - `rip` advances or jumps;
  - `cmp` sets flags and the following `jl`/`jge` reads them, with the flag that decided it highlighted.
- Programs: `sum` of an array (a loop with a pointer increment), `max(a, b)` (a branch, then the same function compiled with `cmov`), `abs` with a signed/unsigned twist (`jl` vs `jb`), and a struct field access (`[rdi+8]`).
- An "**x86-64 vs ARM64**" toggle on `max` shows the AArch64 equivalent side by side (`cmp`/`csel`), with a short note: fixed-width 4-byte instructions vs variable length, and more registers.
- Register sizes: `rax` / `eax` / `ax` / `al` drawn as nested widths. Writing `eax` zeroes the upper 32 bits, and a test checks it.
**Out of scope.** Calling conventions in depth (`calling-conventions`), compiler optimisation passes (T3 `compiler-optimisations`), and SIMD (T3).
**Kit.** `CodePanel` ×2 (`active`, `onLineClick` for cross-highlighting), `MemoryMap` (K-15), `BitStrip` (register width nesting, `size="sm"`), `AnimatedValue` (register values), `Toggle`, `Segmented`, `createRecorder` (frames from a tiny interpreter).
**AC.**
- Watch: the current instruction is `--hi`; registers changed by it flash `--info`; the flag that decided a branch is `--violet`; memory cells written are `--info` with the stack pointer arrow in `--violet`; the cross-highlighted C line is a `--hi` tint.
- Misconception: "assembly maps one-to-one onto C statements", or "`if` always compiles to a jump".
- Correctness:
  - A small lesson-local interpreter for the instruction subset used (`mov lea add sub imul cmp test jmp jl jge jb cmovl ret push pop`) runs every listing.
  - Its final `rax` matches the C semantics computed in JS for seeded inputs (including negative numbers and the unsigned case).
  - Flags after `cmp` are tested against the Intel SDM definitions for edge values (0, −1, `INT_MIN`).
  - Writing a 32-bit register zero-extends into the full 64 bits; writing an 8-bit register doesn't.
  - Listings are stored as data with a comment recording the compiler and flags they were checked against.
- Honesty: "Hand-checked against gcc -O1 output for x86-64; the interpreter runs only the instructions shown, not real machine code."
**Phone.** The three panels stack ≤900px (source, asm, state). The `MemoryMap` sits in a `WideRegion minWidth={300}` only if its labels need it.

**`calling-conventions` · Calling Conventions & Stack Frames**
Track `hw` · *"How a function call really works"* · Builds on: `isa-assembly`, `recursion`, `stack-vs-heap`
**Spec.**
- A `MemoryMap` of the stack with addresses, growing **down**, plus `rsp` and `rbp` pointers and the register file.
- Code: `main` calls `area(w, h)`, which calls `mul(a, b)`. Stepping through:
  - arguments go into `rdi` and `rsi` (the first six integer args are `rdi rsi rdx rcx r8 r9`);
  - `call` pushes the return address;
  - the prologue runs `push rbp; mov rbp, rsp; sub rsp, N`;
  - locals and a saved callee-saved register (`rbx`) are stored;
  - the result comes back in `rax`;
  - the epilogue runs `leave; ret`, and `ret` pops the return address into `rip`.
- Each frame is outlined, and a **frame-pointer chain** arrow links each saved `rbp` to the caller's frame. A "**backtrace**" button walks that chain and prints `mul ← area ← main`, which is how debuggers and profilers build stack traces.
- Scenes:
  - "**7 arguments**": the 7th argument goes on the stack.
  - "**Caller- vs callee-saved**": `rcx` is clobbered across the call unless the caller saved it; `rbx` survives because the callee saved it.
  - "**Alignment**": `rsp` is 16-byte aligned at the `call`, so the callee sees `rsp ≡ 8 (mod 16)` on entry.
  - "**Deep recursion**": frames march down to a guard page and the program stops with a stack overflow (linked to `recursion`).
- A toggle for frame-pointer omission (`-fomit-frame-pointer`) removes the `rbp` chain and shows why backtraces then need unwind tables.
**Out of scope.** Exploiting a corrupted return address (`memory-safety-bugs` shows the corruption, payload-free), the Windows x64 ABI (one-line note), C++ name mangling, and exceptions.
**Kit.** `MemoryMap` (K-15) with `pointers` (`rsp`, `rbp`) and `regions` (frames), memory kit `RefArrow` (frame-pointer chain), `CodePanel` (asm with `active`), `CallStackPanel` (the logical view beside the physical one), `useScenePicker`, `createRecorder`.
**AC.**
- Watch: the current instruction is `--hi`; the return address slot is `--violet`; the saved `rbp` chain is `--violet` arrows; argument registers are `--info`; the return value in `rax` is `--ok`; a clobbered caller-saved register is `--orange`; the guard page and the overflow are `--bad`.
- Misconception: "arguments are always passed on the stack", or "the stack grows up".
- Correctness:
  - The frame builder runs on the B10 interpreter: at every `ret`, `rsp` equals its value before the matching `call` + 8.
  - Callee-saved registers (`rbx rbp r12-r15`) hold the same values after the call as before.
  - `rsp % 16 === 0` immediately before every `call`.
  - The 7-argument case puts exactly one 8-byte argument on the stack.
  - The backtrace from the frame chain equals the `CallStackPanel` frames at every step.
  - The ABI facts shown are pinned in a test with a source note (System V AMD64 ABI, §3.2).
- Honesty: "System V AMD64 (Linux/macOS) only; Windows x64 uses different registers. The frame sizes shown are what this listing uses."
**Phone.** `MemoryMap` + `CallStackPanel` side by side above 900px, stacked below it. The asm panel is full width. No sideways scroll expected.

**`memory-safety-bugs` · Memory Safety: Overflows & Use-After-Free**
Track `sec` · *"When a write lands somewhere it shouldn't"* · Builds on: `calling-conventions`, `stack-vs-heap`, `security-principles` · **[domain review]**
**Payload-free (AC-0/T2 #9).** The lesson shows the corrupted state and teaches the fixes. There is no shellcode, no exploit recipe, and no talk of choosing addresses or "what to put there". The risk is stated in plain words: "If an attacker controls the bytes that overwrite this slot, they may be able to change what the program does next."
**Spec.**
- **Stack overflow scene:**
  - A `MemoryMap` of one frame: `char name[8]`, then a stack canary, the saved `rbp` and the return address.
  - The learner types a name, or picks benign chips: `Ada` (fits), `Grace Hopper` (12 bytes) and a 40-character name.
  - Without bounds checking (`strcpy`), bytes march past `name[7]` into the canary, saved `rbp` and return slot, each overwritten byte shown in place.
  - The outcome reads "the return address now holds bytes from the input: on `ret` the program would jump somewhere it never intended", and the run stops there. It doesn't continue the execution.
- **Defence toggles,** each changing the outcome:
  - **Bounds check** (`strncpy`/`snprintf`, or `std::string`): the write stops at 8 bytes.
  - **Stack canary:** the overwrite is detected at the epilogue and the process aborts with "stack smashing detected".
  - **ASLR:** addresses are shown as randomised per run, with the plain note "makes guessing where things are much harder".
  - **NX/DEP:** the stack region is marked non-executable.
  - **Memory-safe language:** the same code in Rust panics with an index-out-of-bounds error, and in JS the string just grows.
- **Use-after-free scene:**
  - `p = malloc(16)`, then `free(p)`, then `q = malloc(16)` reuses the same chunk, then a write through stale `p` changes `q`'s data.
  - Drawn with `HeapObject` `variant="freed"` and a `RefArrow dangling`.
  - Defences: set `p = NULL` after free (a later use crashes cleanly), ownership in Rust (the compile error is shown as text), and GC languages (no manual free).
  - **The allocator is a black box** (re-scoped 2026-10-07 after a build attempt went deeper). Say only "the allocator may hand freed memory to the next request". There is:
    - no free-list, bin, chunk-header or metadata model;
    - no double-free or over-read scenes;
    - no "what an attacker would write there".
- **Finding it** strip: fixed, lesson-authored report text in the style of AddressSanitizer for both bugs (`stack-buffer-overflow`, `heap-use-after-free`), labelled as illustrative output, with a one-line note that sanitizers and fuzzing catch these in testing.
- A "**Why it matters**" strip states, with a source note, that memory-safety bugs account for roughly 70% of serious security bugs in large C/C++ codebases (Microsoft MSRC 2019; Chromium).
**Out of scope.** Writing exploits, ROP, heap-grooming techniques, allocator internals of any kind, double free, info-leak/over-read scenes, and undefined behaviour beyond these two bugs (T3 `undefined-behavior`). The lesson shows the two bug classes as corrupted program state, then how to prevent, detect and mitigate them; it never models how corruption is turned into control.
**Kit.** `MemoryMap` (K-15) with `regions` (`variant="guard"` for the canary), memory kit (`HeapObject` `freed`, `RefArrow dangling`), `ByteGrid` (K-8) for the bytes being written, `Toggle` ×5, `TextField` (refused above 64 characters, with a message), `ChipButton` (benign samples), `ConsolePanel` (abort / panic text), `useScenePicker`, `createRecorder`.
**AC.**
- Watch: bytes from the input are `--info`; bytes written past the buffer are `--bad`; the canary is `--violet` (`--bad` when clobbered); the return slot is `--violet`; a defence that stopped it is `--ok`; randomised addresses are `--dim` and change per run; the freed chunk is dashed `--bad`; the stale pointer is a dashed `--bad` arrow.
- Misconception: "a buffer overflow just crashes the program; it's not a security problem".
- Correctness:
  - A pure `writeString(frame, input, { boundsCheck })` returns the frame bytes and is tested:
    - overflow length = max(0, len + 1 − 8), counting the NUL;
    - each defence's outcome comes from the first enabled defence in a fixed order;
    - with bounds checking, nothing past the buffer ever changes.
  - The canary check fires iff any canary byte differs.
  - The UAF model: the reused chunk has the same address, and the stale write changes `q`'s bytes and nothing else.
  - The 70% claim carries its source in `index.tsx`.
- Honesty: "Simulated memory and allocator; nothing runs native code. Real frame layouts vary by compiler and flags."
**Phone.** `StageFrame minWidth={420}` on the frame scene; the toggles wrap above it. The UAF scene fits.

---

##### Batch T2-B11 · Algorithm design (`dsa`)
Wave 4. First real users of **`TreeSvg` forest mode** (K-9, huffman-coding) and **`CellGrid`** (K-7) as a board (backtracking). All five lessons need a brute-force reference in their tests, because each one claims "optimal" or "linear".

**`greedy-algorithms` · Greedy Algorithms & When They Fail**
Track `dsa` · *"Take the best now, and prove it's safe"* · Builds on: `sorting`, `dynamic-programming`
**Spec.**
- **Interval scheduling:** a timeline of 8-12 meeting bars. The learner picks a greedy rule with `Segmented`: earliest finish, earliest start, or shortest first. The chosen rule then scans the bars in its order, accepting a bar (it slides into the "booked" lane) or rejecting it because it clashes.
- Next to the result, a "best possible" count comes from brute force. Earliest finish always matches it. The other two rules have presets where they lose, and the bars they wrongly took are outlined.
- **Exchange argument panel:** step through swapping the optimum's first meeting for the greedy's first meeting. The schedule stays valid and the count stays the same, which shows why earliest finish is safe.
- **Coin change:** a target amount with two coin systems side by side, `{1, 5, 10, 25}` and `{1, 3, 4}`. Greedy takes the largest coin that fits. For 6 with `{1, 3, 4}` greedy gives 4+1+1 (3 coins) while the optimum is 3+3 (2 coins), shown from a small DP table.
- The learner can edit the target (`TextField`, integers 1-99) and the coin list (`parseIntegers`).
**Out of scope.** Proving greedy optimality in general (matroids). Coin change by DP is shown only as the reference answer; `dynamic-programming` owns the DP itself.
**Kit.** `GanttLanes` (K-13: the meeting lanes; the booked lane is one more lane), `Segmented`, `TextField`, `parseIntegers`, `ChipButton` (presets), `createRecorder`, `CellGrid` (K-7, the small coin DP row), `AnimatedValue`.
**AC.**
- Watch: the bar being considered is `--hi`, accepted bars `--ok`, rejected bars `--dim`, and greedy picks that the optimum doesn't make are outlined `--bad`. The optimum's lane is `--violet`. Coins greedy took are `--info`.
- Misconception: "taking the locally best choice always gives the best overall answer".
- Correctness:
  - Earliest-finish count equals the brute-force maximum on 300 seeded instances (`mulberry32`, n ≤ 10).
  - The two losing presets really lose: a test asserts their count is below the optimum.
  - Greedy on `{1, 3, 4}` for 6 gives 3 coins and the DP optimum gives 2. Greedy equals DP for every amount 1-99 on `{1, 5, 10, 25}`.
  - The verdict caption ("greedy was optimal here" or "greedy lost by k") comes from comparing the two counts (AC-0/T2 #1).
- Honesty: "Nothing simulated: computed live. The 'best possible' count comes from trying every subset (fine for 12 meetings, hopeless for 1,000)."
**Phone.** `GanttLanes` inside `WideRegion minWidth={560}`. The coin panel reflows underneath the timeline.

**`huffman-coding` · Huffman Coding**
Track `dsa` · *"Short codes for common symbols"* · Builds on: `heaps`, `tree-traversals`, `logs-exponentials`
**Spec.**
- The learner types up to 40 characters (`TextField`; default "mississippi river"). A frequency table becomes a row of leaf nodes, which form the starting forest.
- **Step** merges the two smallest-weight trees into one, under a new parent whose weight is their sum. A side priority-queue list shows the current forest weights in order.
- The finished tree labels its edges 0 and 1. Each symbol's code is read off by tracing from the root to its leaf.
- The encoded bitstring runs under the text. A savings meter compares Huffman bits, fixed-width bits (⌈log₂ distinct⌉ per symbol) and 8-bit ASCII.
- **Decode mode:** walk the bitstring through the tree bit by bit. This shows that no code is a prefix of another.
- Tie-break toggle: two valid trees can give different codes but the same total bits.
**Out of scope.** The real DEFLATE format (canonical codes plus LZ77) belongs to T3 `lz-compression`. The heap's sift-up and sift-down belong to `heaps`; here the queue is a sorted list.
**Kit.** `TreeSvg` forest mode (K-9, `layout="tidy"`), `Bar` (savings meter), `TextField`, `Toggle`, `createRecorder`, `.data-table` (frequencies and codes), `Tray` (bitstring), `BitStrip` (`size="sm"`) for the encoded bits.
**AC.**
- Watch: the two trees being merged are `--hi`, the new parent `--info`, finished leaves `--ok`, edge labels 0/1 `--violet`, and the decode cursor `--hi`. In the meter, Huffman is `--ok` (cheap side) and ASCII is `--bad` (costly side).
- Misconception: "the most frequent symbol always gets a 1-bit code", or "the codes need separators".
- Correctness:
  - Total encoded bits equal Σ freq × depth, and match a reference Huffman cost (repeatedly sum the two smallest) on 200 seeded strings.
  - Every code set is prefix-free.
  - Decode(encode(s)) = s.
  - Both tie-break trees have the same total.
  - A single-distinct-character input ("aaaa") gets a 1-bit code, with its own caption.
  - Empty input is refused with a message (AC-0/T2 #5).
- Honesty: "The tree has to be stored or sent too; this meter counts only the message bits."
**Phone.** `StageFrame minWidth={520}` for the tree. The frequency table and meter reflow underneath.

**`backtracking` · Backtracking**
Track `dsa` · *"Try, recurse, undo"* · Builds on: `recursion`, `tree-traversals`
**Spec.**
- **N-Queens:** an n×n board (n = 4-8 via `Segmented`) beside its search tree. Each placement adds a child node. A conflict marks the branch dead, and the player undoes it ("backtrack"), so the queen visibly lifts off.
- Counters: nodes visited, solutions found, and the brute-force count of placements without pruning (`C(n², n)`, or nⁿ with one queen per row).
- **Pruning toggle:** with "check as you place" on, the search never expands a doomed partial board; with it off, it only checks full boards. The node counter shows the gap.
- **Subsets preset:** generate all subsets of {a, b, c, d} as a binary include/skip tree, which shows the try/recurse/undo template without any pruning.
- The call stack panel shows the current row choices as frames.
**Out of scope.** Minimax and alpha-beta pruning belong to T3 `game-tree-search`. Constraint propagation (Sudoku solvers) belongs to T4 `sat-solvers`.
**Kit.** `CellGrid` (K-7) for the board, `TreeSvg` (`tidy`, with `hidden` for unexplored nodes; the tree is capped and the cap is disclosed), `CallStackPanel`, `Segmented`, `Toggle`, `createRecorder`, `AnimatedValue`.
**AC.**
- Watch:
  - The board square being tried is `--hi`, a placed queen `--info`, attacked squares are a `--bad` tint, and a found solution `--ok`.
  - In the tree, the current node is `--hi`, dead branches `--bad` (removed and lost), and unexplored nodes `--dim`.
  - Call frames use their `CallStackPanel` states.
- Misconception: "backtracking tries every possibility, so it's no better than brute force".
- Correctness:
  - Solution counts n = 4 → 2, 5 → 10, 6 → 4, 7 → 40, 8 → 92.
  - The visited-node counts with pruning are asserted per n, and are always below the no-pruning counts.
  - Every reported solution is checked conflict-free.
  - Subsets generates exactly 2⁴ distinct subsets.
- Honesty: "The search tree is drawn for n ≤ 6; for 7 and 8 only the counters run (8-queens visits thousands of nodes)."
**Phone.** At 390 the board stacks above the tree. The tree goes in `WideRegion minWidth={600}`.

**`amortized-analysis` · Amortized Analysis & Dynamic Arrays**
Track `dsa` · *"Why append is O(1) even when it isn't"* · Builds on: `arrays-linked-lists`, `big-o`, `hash-table`
**Spec.**
- A dynamic array drawn as capacity slots. **Push** fills a slot. When the array is full, push allocates a new block of 2× capacity and visibly copies every element across, then frees the old block.
- **Cost-per-push bars:** most pushes cost 1, and a resize push costs 1 + n. A running "average cost per push" line settles near 3.
- **Banker's account:** each push deposits 3 coins and spends 1 on itself. Two coins are saved, and a resize spends one saved coin per element copied. The coin balance is shown, and the caption checks it never goes below 0.
- **Growth-factor `Segmented`:** 2×, 1.5× or "+10 slots". The +10 policy makes the average climb linearly, which is O(n) per push amortized. A `Plot2D` line of total cost against pushes shows the difference.
- **Pop-shrink trap preset:** shrinking at half full can thrash on alternating push/pop. Shrinking at a quarter full doesn't.
**Out of scope.** `hash-table` resizing is named as another example, not animated again. The potential method gets one key idea only.
**Kit.** `ArrayStrip` (slots, with `dim` for empty capacity), `Plot2D` (K-12) for cumulative cost, `Bar`/SVG bars for per-push cost, `Segmented`, `Button`, `AnimatedValue`, `createRecorder`.
**AC.**
- Watch:
  - The slot being written is `--hi`, filled slots `--info`, empty capacity `--dim`, and the elements being copied in a resize `--violet`.
  - A resize push's tall bar is `--bad` (costly side) and a cheap push `--ok`.
  - Coins are `--hi`.
- Misconception: "one slow push means push is O(n)".
- Correctness:
  - With doubling and 3 coins per push, the balance is ≥ 0 after every push, for 1-10,000 pushes and for seeded push/pop sequences with the quarter-shrink rule.
  - Total copy work under doubling is < 2n for every n, and under "+10" is Θ(n²/20), asserted at n = 1,000.
  - The half-shrink thrash preset is asserted to copy on every operation.
- Honesty: "Costs are counted in element writes; real allocators and memcpy change the constants, not the shape."
**Phone.** `ArrayStrip` with `cellMax` fits at 390 up to 16 slots; above that, `WideRegion minWidth={640}`. The plot fits at full width.

**`monotonic-stack` · Monotonic Stacks & Queues**
Track `dsa` · *"Next greater element in one pass"* · Builds on: `stack-queue`, `sliding-window`
**Spec.**
- **Daily temperatures:** a row of bars. A scan cursor moves left to right, and a stack column beside the bars shows the indices waiting for a warmer day.
- When a taller bar arrives, it pops every shorter bar off the stack. An arrow is drawn from each popped bar to the bar that answered it, and its answer ("3 days") is written underneath.
- An operation counter shows each index pushed once and popped at most once (≤ 2n), against the brute-force n² scan.
- **Sliding-window maximum:** the same idea with a monotonic deque and window size k. Indices leave at the front when they fall out of the window, and at the back when a bigger value arrives.
- **Largest rectangle in a histogram:** an extra preset where popping computes the area each bar can extend over.
- The learner edits the values with `parseIntegers`, and k with `Segmented`.
**Out of scope.** The plain stack and queue mechanics belong to `stack-queue`. The variable-size window belongs to `sliding-window`.
**Kit.** `ArrayStrip` (bars as values, with `pointers` for the scan cursor and the window `ranges`), `Tray` or a local stack column (a vertical list; check `CallStackPanel` first; if neither fits, it's a Phase 2 note), SVG arrows via `useArrowMarker`, `Segmented`, `TextField` + `parseIntegers`, `createRecorder`.
**AC.**
- Watch: the scan cursor is `--hi`, items on the stack or deque `--violet`, a popped item `--info`, its answer arrow `--ok`, the window `--hi` range tint, and indices with no answer `--dim`.
- Misconception: "the nested pops make it O(n²)".
- Correctness:
  - Next-greater answers equal brute force on 500 seeded arrays, including duplicates and equal-height runs, where strictly greater is the rule and the caption says so.
  - The push+pop count is ≤ 2n on all of them.
  - Sliding max equals brute force for every k.
  - Largest rectangle equals brute force.
  - Empty or one-element input gets defined captions.
- Honesty: "Nothing simulated: computed live."
**Phone.** It fits at 390 for ≤ 12 values with `cellMax`. The stack column moves under the bars at ≤ 900px.

---

##### Batch T2-B12 · Models from data (`ml`, `web`)
Wave 4. Reuses the wave 3 kit (`Plot2D`, `core/fit`, `core/vec`, `core/fixtures/datasets`, `ConfusionMatrix`), plus `TreeSvg` for learned trees. `usability-laws` measures the learner's own clicks and fits them with `core/fit`, the same machinery as B8.

**`decision-trees-ensembles` · Decision Trees, Random Forests & Boosting**
Track `ml` · *"Twenty questions, learned"* · Builds on: `supervised-learning`, `classification-metrics`, `tree-traversals` · **[domain review]**
**Spec.**
- **Tree tab:**
  - A 2D two-class scatter (seeded `moons` or `blobs`; the learner can click to add points of either class).
  - Press "split" to grow the tree one node at a time. The chosen axis-aligned split is drawn on the plot, cutting the plane into rectangles shaded by majority class (`Heat`).
  - The tree itself grows in a `TreeSvg` beside the plot. Each node shows its question, its counts and its Gini impurity.
  - Clicking a node lists every candidate threshold with its weighted impurity, so "greedy best split" is visible.
- **A max-depth slider and a min-samples slider**, with train and validation accuracy. A deep tree carves a sliver around a single noisy point.
- **Forest tab:**
  - Grow N trees (1-25) on seeded bootstrap samples, each with a random feature choice per split.
  - Thumbnails show each tree's regions. The vote map averages them into a smoother boundary.
  - A variance readout shows the effect of different seeds on one tree vs the forest.
- **Boosting tab:** AdaBoost with stumps. After each round, the points the last stump got wrong grow larger (higher weight), and the combined boundary updates. A round counter runs 1-30.
- A `ConfusionMatrix` for the current model on the validation set.
**Out of scope.** Gradient-boosted tree libraries (XGBoost) are named only; feature importance is mentioned in a key idea; neural models stay in T3.
**Kit.** `Plot2D` (`Points`, `Heat`, `Segments` for split lines), `TreeSvg` (`tidy`, `renderNode` with counts), `ConfusionMatrix`, `core/fixtures/datasets`, `core/random` (`mulberry32` for the bootstraps), `Slider`, `ScenePicker`, `.data-table` (candidate splits).
**AC.**
- Watch:
  - the classes are `--info` and `--violet` (points and region tints);
  - the split being chosen and its tree node are `--hi`;
  - validation points are hollow;
  - misclassified points get a `--bad` ring;
  - boosted weights are shown as point size, not colour;
  - the individual forest trees are `--dim` thumbnails.
- Misconception: "a deeper tree is always more accurate".
- Correctness:
  - Each split equals the best Gini (or entropy, via a toggle) over **all** thresholds between sorted distinct values on both features. A brute-force reference test covers the presets and 50 seeded datasets.
  - Leaves are pure, or stop at the depth or sample limits.
  - Forest predictions equal the majority of the member trees.
  - AdaBoost weights follow αₜ = ½ ln((1−εₜ)/εₜ), and the training error is non-increasing on the presets.
  - Everything is deterministic per seed.
- Honesty: "Seeded synthetic data; trees, forest and boosting are computed live in your browser."
**Phone.** The plot and the tree stack vertically at ≤900px. The tree sits in a `WideRegion` (about 520) once depth exceeds 3. The forest thumbnails wrap 3 per row.

**`clustering-kmeans` · Unsupervised Learning & k-Means Clustering**
Track `ml` · *"Finding groups without labels"* · Builds on: `vectors-similarity`, `supervised-learning` · **[domain review]**
**Spec.**
- Unlabelled 2D points (seeded blobs; the learner can click to add or remove). Pick k (1-8) and the initialisation: random, or k-means++.
- Step through Lloyd's algorithm in two visible half-steps:
  1. **Assign:** points recolour to their nearest centroid, with Voronoi cells shown faintly via `Heat`.
  2. **Update:** each centroid slides to the mean of its points.
- An inertia (sum of squared distances) readout is drawn per iteration on a small curve.
- An **elbow plot** runs k = 1…8 (best of 5 seeded restarts each) and marks the bend. A caption warns that the elbow is a heuristic, not an answer.
- Presets:
  - three clear blobs;
  - "bad init" (two centroids in one blob → a worse local optimum; restarts fix it);
  - "moons", where k-means draws a straight boundary through curved clusters, the shape limitation;
  - "different scales" (one feature ×100), with a "standardise features" toggle that fixes it.
- An "Empty cluster" event, when a centroid loses all its points, is handled and narrated: it's reseeded to the farthest point.
**Out of scope.** Density and hierarchical clustering are named only; anomaly detection is one use case; dimensionality reduction stays in T3 `svd-pca`.
**Kit.** `Plot2D` (`Points`, `Heat` for the Voronoi regions, `Curve` for the inertia and elbow plots), `core/vec`, `core/fixtures/datasets` (`blobs`, `moons`), `core/random`, `usePlayer`/`Transport`, `createRecorder`, `Slider`, `Segmented`, `Toggle`.
**AC.**
- Watch:
  - clusters are categorical (`categorical(i)`), never `--bad`/`--ok`;
  - centroids are large ✚ marks in their cluster's colour with a `--hi` ring while moving;
  - unassigned points are `--dim`;
  - the chosen elbow k is `--hi`.
- Misconception: "k-means finds the true groups", and "it always gives the same answer".
- Correctness:
  - Inertia is non-increasing after every assign and every update step on every preset and on 100 seeded runs.
  - The algorithm terminates when assignments stop changing.
  - The update step's centroid equals the arithmetic mean.
  - k-means++ init follows D² sampling for a fixed seed.
  - The empty-cluster rule is tested.
  - The elbow curve is non-increasing in k, using best-of-restarts.
- Honesty: "Seeded synthetic points. k-means' result depends on the starting centroids; that's real, not a bug in the demo."
**Phone.** The plot is at full width and the elbow plot stacks below it. The controls wrap. No `minWidth`.

**`embeddings` · Embeddings**
Track `ml` · *"Meaning as a point in space"* · Builds on: `vectors-similarity`, `clustering-kmeans` · **[domain review]**
**Spec.**
- **Word map:**
  - About 60 lesson-authored words, each a hand-made 8-dimensional toy vector. The dimensions are named features (animal, food, vehicle, size, …), so the vectors are inspectable.
  - The words are projected to 2D by PCA computed in the lesson.
  - Clicking a word lights its 5 nearest neighbours by cosine in the full 8D, with lines, and lists the scores. A note says the 2D picture distorts distances, and one preset shows a pair that is close in 2D but not in 8D.
- **Type a phrase:** its vector is the average of its known words' vectors. Unknown words are listed as "not in this toy vocabulary" and ignored. The phrase lands on the map with its neighbours.
- **Vector arithmetic preset:** a lesson-authored analogy (e.g. *puppy − dog + cat* lands near *kitten*, built into the toy vectors on purpose and labelled that way). A second preset shows an analogy failing, so it isn't oversold.
- **"Why not just match words?" panel:** keyword overlap vs cosine for "car repair" vs "fixing my vehicle". Overlap is zero; the toy vectors are close.
- A **search mini-scene:** rank 8 short lesson-authored documents for a typed query by brute-force cosine (linked to T3 `vector-search` as "how this scales").
**Out of scope.** How real models learn embeddings stays in T3 `neural-networks-backprop`, `attention-transformers` and `tokenization-bpe`; ANN indexes stay in T3 `vector-search`; RAG stays in T3 `rag-pipelines`.
**Kit.** `Plot2D` (`Points` with labels, `Segments` for the neighbour lines), `core/vec` (`cosine`, `add`, `scale`), `TextField`, `ChipButton` presets, `.data-table` (scores). PCA by power iteration stays local in `model.ts` (one user; T3 `svd-pca` is the second use).
**AC.**
- Watch: the query word or phrase is `--hi`, the top-5 neighbours `--ok` with `--ok` lines, the other words `--dim`, word groups categorical tints, and an analogy's result arrow `--violet`.
- Misconception: "embeddings match keywords", or "the 2D picture shows the real distances".
- Correctness:
  - Neighbours equal the brute-force cosine sort in 8D.
  - The PCA axes are orthonormal and capture variance in decreasing order (tested against a reference eigen-decomposition of the 8×8 covariance).
  - The phrase vector equals the mean of its known word vectors, and an all-unknown phrase shows a message, not NaN.
  - Both analogy presets assert their (success and failure) outcomes.
  - Documents ranked by cosine match brute force.
- Honesty: "Toy embeddings: 60 hand-made 8-dimensional vectors, not a trained neural model. Real models learn hundreds of dimensions from text, and their dimensions don't have names."
**Phone.** The map is at full width with labels at 10px or more. It uses `StageFrame minWidth={360}` if the label density forces it, which smoke decides. The search scene reflows below.

**`usability-laws` · Usability Laws: Fitts & Hick**
Track `web` · *"Big, close, and few choices"* · Builds on: `linear-logistic-regression`, `logs-exponentials`, `accessibility`
**Spec.**
- **Fitts game:**
  - Click a start dot, then a target. The game varies distance D and width W over a seeded schedule of 24 trials and records your real movement time from `performance.now()`.
  - Each trial is plotted as a point at index of difficulty ID = log₂(D/W + 1) against time. A least-squares line MT = a + b·ID is fitted live, with the R² shown.
  - Mis-clicks are counted and excluded, and the screen says so.
- **Design panel:** the same toolbar laid out three ways (tiny icons far away, big buttons near, edge-pinned). Each predicts time from *your* fitted a and b. Screen edges and corners are effectively infinitely wide on a desktop pointer; this is named, and not true on touch.
- **Hick tab:**
  - A menu of n choices (2-32) where you click the named item. Decision time is plotted against log₂(n + 1) with a fit.
  - A caption notes that Hick's law models choice among equally likely options you don't have to search for; scanning an unfamiliar list grows roughly linearly, and practice flattens the slope.
- A "touch" note: the minimum target size guidance (WCAG 2.2 AA 24×24 px, platform guidelines 44-48), linked to `responsive-design`.
- If you skip the game, a seeded synthetic participant fills the plot, clearly labelled.
**Out of scope.** Running user studies is `usability-testing`; full accessibility guidance is `accessibility`; GOMS/KLM models are named only.
**Kit.** `Plot2D` (`Points`, `Curve` for the fit), `core/fit` (`leastSquares`), a local game surface (absolutely positioned real buttons, so keyboard and pointer both work), `Segmented`, `ChipButton`, `Stat`.
**AC.**
- Watch: the current target is `--hi`, the start dot `--info`, your trials `--info` points, the synthetic participant's `--dim` points, the fitted line `--ok`, and a mis-click flash `--bad`.
- Misconception: "making a button bigger can't matter if it's already visible", or "more options are just more choice, at no cost".
- Correctness:
  - ID uses the Shannon formulation log₂(D/W + 1), tested.
  - The fit matches `leastSquares` on the recorded data.
  - Mis-clicks never enter the fit.
  - The predicted times for the three layouts use the fitted a and b exactly.
  - Hick's predictor uses log₂(n + 1).
  - With fewer than 3 valid trials, the lesson says "need at least 3 trials" instead of fitting.
- Honesty: "Your own clicks, timed by the browser (± a few ms). With a keyboard or touch, the law changes, and so will your fit. The grey participant is synthetic."
**Phone.** The Fitts arena uses the full stage width (about 340 at 390). Distances scale to it, and the plot sits below. Touch is acknowledged in the caption; no `minWidth`.

---

##### Batch T2-B13 · Graphics & motion (`web`)
Wave 4. This batch is the first heavy user of `Plot2D` (K-12) for curves and of `CellGrid` (K-7) as a pixel grid, and the first graphics user of `core/vec` (K-17). Everything here is real computation in the browser; nothing is drawn by hand.

**`rasterization` · Rasterization & Pixels**
Track `web` · *"Triangles become pixels"* · Builds on: `matrices-transformations`, `binary-hex`
**Spec.**
- A 24×16 pixel grid with one triangle over it. The learner drags its three vertices, or nudges them with the keyboard.
- "Step" tests one pixel centre at a time, at (x + 0.5, y + 0.5). Three edge-function signs show beside it (w0, w1, w2), and a pixel lights when all three agree. "Run" fills the bounding box row by row, and pixels outside the bounding box are never tested.
- A shared-edge preset draws two triangles that share an edge. With the top-left fill rule off, the edge pixels are counted twice (overdraw, shown as a second tint) or not at all. With it on, every pixel belongs to exactly one triangle.
- An antialiasing toggle (off, 2×2 or 4×4 samples per pixel) turns coverage into a fractional shade, and a "real canvas" strip beside the grid renders the same triangle with `CanvasRenderingContext2D` for comparison.
- A z-buffer preset draws two overlapping triangles at different depths in the wrong order. With the z-buffer on, the nearer one wins per pixel. A depth readout shows the interpolated z for the hovered pixel, using barycentric weights.
- Readouts: pixels tested, pixels covered, and how efficient the bounding box was.
**Out of scope.** Triangle setup in 2D screen space only. Projection, shaders and the GPU pipeline stay in T3 `gpu-rendering-pipeline` and `3d-transforms-projection`.
**Kit.** `CellGrid` (K-7) for the pixel grid, using `intensity` for coverage. The triangle and vertex handles are an overlay drawn in grid coordinates through `usePlot()`, or kept local if that doesn't fit. Also `core/vec` (K-17), `Segmented`, `Toggle`, `Stat`, `usePlayer`/`StageFrame`, `createRecorder`. The edge functions and barycentric maths live in `model.ts`.
**AC.**
- Watch:
  - The pixel being tested is `--hi`, and covered pixels are `--info`.
  - The three edge signs are `--ok` when that edge passes and `--dim` when it fails.
  - Double-covered pixels are `--bad`, and pixels outside the bounding box are `--dim`.
  - Each of the two triangles in the depth preset takes a categorical hue (`--violet`, `--amber`).
- Misconception: "a pixel is drawn if any part of the triangle touches it". By default it's the pixel centre, and antialiasing is an extra cost.
- Correctness:
  - For every pixel of the preset triangles, the edge-function coverage matches a reference point-in-triangle test.
  - Shared-edge presets give zero overdraw and zero gaps under the top-left rule, checked across 500 seeded random triangle pairs that share an edge.
  - Barycentric weights sum to 1.
  - Supersampled coverage equals the share of covered sample points.
  - Z-buffer output doesn't depend on the order the triangles are drawn.
- Honesty: the stage says "A software rasterizer written for this lesson; GPUs do the same tests in parallel hardware. The canvas strip is your browser's real renderer, which antialiases its own way."
**Phone.** `StageFrame minWidth={560}`: the grid needs at least about 18px per cell for the edge signs to read. The readouts wrap under the grid.

**`bezier-interpolation` · Bézier Curves, Easing & Interpolation**
Track `web` · *"The maths of smooth motion"* · Builds on: `rasterization`, `matrices-transformations`
**Spec.**
- A cubic Bézier editor. The learner drags the four control points (P0-P3) on a `Plot2D`. A `t` slider shows De Casteljau's construction: three lerped points, then two, then one, drawn as nested segments that sweep along the curve.
- A "show Bernstein weights" toggle adds a second small plot of the four weight curves at the current `t`, so the learner can see that the point is a weighted average of the control points.
- **Easing mode:** the same editor is clamped to the CSS `cubic-bezier(x1, y1, x2, y2)` unit square, with P0 = (0, 0) and P3 = (1, 1).
  - Preset chips: `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, plus an overshoot curve with y > 1.
  - A ball moves along a track twice: once driven by the lesson's solver, and once by a real CSS transition with the same `cubic-bezier`. The two should match.
- An "x is not t" panel samples t at even steps and plots the uneven x spacing. This shows why easing has to solve x(t) = time for t before it can read off y.
- A lerp panel lerps a colour, an angle and a number, and shows naive angle lerp going the long way round from 350° to 10°.
**Out of scope.** Splines, surfaces and font hinting. Colour interpolation spaces belong to `color-spaces`.
**Kit.** `Plot2D` (K-12) with `<Points onDrag>`, `<Curve>` and `<Segments>`; `core/vec` (K-17); `core/math` `lerp`; `Slider`; `ChipButton` presets; `CodePanel` showing the generated `cubic-bezier()` CSS. The ball track is real DOM with a real `transition`.
**AC.**
- Watch:
  - The control points and the control polygon are `--violet`, and the curve is `--info`.
  - The De Casteljau levels go `--dim`, then `--violet`, then `--hi` for the final point.
  - The CSS ball is `--ok` and the solver's ball `--info`.
  - The long-way angle lerp is `--bad`.
- Misconception: "the `t` in an easing curve is the time". t is the curve parameter; time is the x coordinate.
- Correctness:
  - The De Casteljau point equals the Bernstein-form point for 101 values of t across seeded random control points, within 1e-12.
  - The x(t) solver (Newton's method, falling back to bisection) inverts x within 1e-6 for every preset and for curves where x isn't monotonic in the editable range.
  - The preset keywords use the CSS Easing spec values: `ease` = (0.25, 0.1, 0.25, 1), `ease-in` = (0.42, 0, 1, 1), `ease-out` = (0, 0, 0.58, 1), `ease-in-out` = (0.42, 0, 0.58, 1).
  - The shortest-arc angle lerp is tested across the 0/360 wrap.
- Honesty: "Nothing simulated. The curve maths runs here, and the second ball is your browser's own CSS easing."
**Phone.** Fits at 390. The plot is square, sized to the stage width with a minimum of 300px, and the weights plot and lerp panel stack underneath.

**`color-spaces` · Color Spaces, Gamma & Color Models**
Track `web` · *"Why your gradient looks muddy"* · Builds on: `accessibility`, `binary-hex`
**Spec.**
- **Gradients:** two colour pickers (red to green, blue to yellow and black to white are presets) feed three real CSS gradient strips: `linear-gradient(in srgb, …)`, `in srgb-linear` and `in oklch`. A luminance profile under each, computed in the model, shows the muddy dip in the sRGB midpoint.
- **Gamma:** a `Plot2D` of the sRGB transfer curve (encoded value against linear light). Dragging the 50% grey patch shows that sRGB 128 is about 22% linear light. A "physically half the light" patch shows that 50% linear is sRGB ≈ 188.
- **Models:** one colour shown as hex, RGB, HSL and OKLCH. A "same lightness?" row uses HSL with L = 50% for yellow, blue and green, which look very different, next to OKLCH at the same L, which look even.
- **Contrast:** the WCAG 2.x ratio for the current foreground and background, reusing the accessibility lesson's formula, extracted to a pure helper (see Kit). It's shown next to OKLCH ΔL, to make the point that perceptual lightness and WCAG contrast are related but aren't the same thing.
- If the browser lacks `in oklch` gradient support, the strip says so and draws a model-computed version instead.
**Out of scope.** ICC profiles, wide gamut (P3) and HDR, beyond one line saying they exist. Image processing pipelines.
**Kit.** `Plot2D` (K-12) for the transfer curve, `Bar`, `.data-table` for the model table, `Segmented`. `ColorField` and `core/contrast.ts` (K-21: this is the second user of both, so they're extracted from accessibility in the wave 3→4 kit round, before this batch starts).
**AC.**
- Watch:
  - The gradient strips show the colours themselves. These are the drawing's own material, so each literal carries an `allow-color` reason.
  - The luminance profile is `--info` and the sRGB dip marker is `--bad`.
  - The current colour's row in the model table is `--hi`.
  - Contrast results are `--ok` for a pass and `--bad` for a fail.
- Misconception: "RGB 128 is half as bright as 255" and "HSL lightness is perceived lightness".
- Correctness:
  - The sRGB ↔ linear transfer follows IEC 61966-2-1 (the 0.04045 and 0.0031308 thresholds, exponent 2.4) and round-trips all 256 channel values.
  - sRGB → OKLab → OKLCH uses Ottosson's published matrices. #ff0000 → OKLab ≈ (0.6280, 0.2249, 0.1258) and white → L = 1, within 1e-3.
  - The WCAG ratio for `#777` on `#fff` is 4.48.
  - The midpoint luminance of in-srgb red → green is below the in-oklch midpoint.
- Honesty: "The gradients are drawn by your browser. The numbers come from the standard formulas. Your screen's own profile changes what you actually see."
**Phone.** Fits: the strips are full width and the panels stack. The transfer plot has a 300px minimum, which fits.

**`game-loop` · The Game Loop & Fixed Timesteps**
Track `web` · *"Update, render, repeat"* · Builds on: `event-loop`, `processes-threads`
**Spec.**
- A small physics box: a ball bouncing between walls, plus a thin wall it should never pass. It runs in a canvas driven by real `requestAnimationFrame`.
- The learner picks a loop: **variable dt** (position += v × frame time), **fixed step with an accumulator** (Fiedler's "fix your timestep"), or **fixed step with interpolation** (render blended between the last two states).
- A "lag spike" slider injects a deliberate busy-wait of 0-400 ms every few seconds.
  - Under variable dt, a big spike makes the ball tunnel through the thin wall.
  - Under a fixed step it doesn't, but the frame catches up with several updates.
  - Under "no max frame time" a long spike shows the spiral of death, with updates per frame climbing.
- A frame-budget bar shows the 16.7 ms (60 Hz) budget split into update and render, plus the measured frame time.
- A "two machines" toggle runs a 30 Hz and a 144 Hz simulated display side by side. Variable dt gives slightly different trajectories; the fixed step gives identical ones.
**Out of scope.** Rendering engines, ECS architectures and networking or rollback. Stage simulations here use `useSimulation`; that's mentioned only as an "inside Kinetic" aside.
**Kit.** The canvas kit (`useCanvas`, `core/canvas.ts`) with `draw.ts`; `useLoop` for the real rAF loop; `Segmented`; `Slider` with `format`; `Bar`; `Sparkline` for frame times and updates per frame. The physics step and the accumulator are pure in `sim.ts`.
**AC.**
- Watch:
  - The ball is `--info` and the thin wall `--violet`.
  - A tunnelling event flashes `--bad`.
  - Update time in the budget bar is `--hi` and render time `--ok`, against a `--dim` track. Over-budget frames are `--bad`.
  - The interpolated ghost position is a `--dim` outline.
- Misconception: "a faster computer just makes the game run faster or smoother", meaning frame rate doesn't change behaviour. Under variable dt it changes the physics.
- Correctness:
  - The accumulator never runs more than `MAX_STEPS` updates per frame and carries the remainder (`accumulator < dt` after every frame).
  - With fixed steps, the 30 Hz and 144 Hz runs give identical state at every whole simulated step, for 10 seeded spike schedules.
  - The tunnelling preset tunnels under variable dt and never under the fixed step.
  - The interpolation alpha is in [0, 1).
- Honesty: "Lag spikes are injected on purpose (a busy-wait). The second display rate is simulated by stepping the same code at a different dt."
**Phone.** Canvas `--h` 260 at ≤900px; `StageFrame minWidth={340}`, which fits. The side-by-side machines stack vertically.

---

##### Batch T2-B14 · Sorting, selection & strings (`dsa`)
Wave 5. Exercises **`core/stats`** (K-11, `log2Factorial`) and **`Plot2D`** (K-12) on the lower-bound plot, plus `CellGrid` (K-7) as the edit-distance table. Every lesson's headline claim gets checked against a library function (`Array.prototype.sort`, `indexOf`, `startsWith`).

**`linear-time-sorting` · The Sorting Lower Bound & Linear-Time Sorts**
Track `dsa` · *"Beating n log n by not comparing"* · Builds on: `sorting`, `logs-exponentials`, `trees-bst`
**Spec.**
- **Scene 1, the lower bound:** the decision tree for sorting three items a, b, c. Each internal node is a comparison ("a < b?"). The learner answers each one by clicking yes or no, or picks an input order from chips, and walks a path to one of the 3! = 6 leaves.
- The tree's height is 3, so some inputs need 3 comparisons. A `Plot2D` then plots ⌈log₂ n!⌉ against n log₂ n for n up to 64, showing that no comparison sort can beat ~n log₂ n comparisons in the worst case.
- **Scene 2, counting sort:** small integers (0-9) drop into a count array. The prefix-summed counts become output positions, and a stable pass places each item. Equal keys keep their colour order, which shows stability.
- **Scene 3, radix sort (LSD, base 10):** 3-digit numbers pass through 10 digit buckets, ones, then tens, then hundreds. After each pass the strip is re-read, and the sort only works because each pass is stable.
- A "why not always?" panel shows the cost O(n + k) when the key range k is huge. Example: 32-bit keys need 2³² counts, or 4 radix passes of 256 buckets.
**Out of scope.** Bucket sort's float-distribution analysis is one key idea only. Comparison sorts belong to `sorting`.
**Kit.** `TreeSvg` (`tidy`, decision tree), `Plot2D` (K-12), `core/stats` (K-11) `log2Factorial`, `ArrayStrip` (input, counts, output), `CellGrid` (K-7) for the bucket rows, `ScenePicker`, `ChipButton`, `TextField` + `parseIntegers`, `createRecorder`.
**AC.**
- Watch: the current comparison or digit is `--hi`, the path taken `--violet`, the leaf reached `--ok`, the count array `--info`, and items already placed `--ok`. Items with equal keys use categorical tokens (`categorical(i)`), never `--bad`/`--ok`. The lower-bound curve is `--info` and n log n is `--violet`.
- Misconception: "radix sort breaks the n log n limit, so the limit is wrong". The limit is only for comparison sorts.
- Correctness:
  - The decision tree has exactly 6 leaves, and each leaf's permutation sorts its input; tested for all 6 orders.
  - `log2Factorial(n)` matches Σ log₂ i to 1e-9.
  - Counting sort and LSD radix sort equal `[...a].sort((x, y) => x - y)` on 500 seeded arrays.
  - Stability is asserted with tagged duplicates.
  - Negative numbers are refused in this lesson with "this demo sorts 0-999" (AC-0/T2 #5).
- Honesty: "Comparison counts are exact; the chart's 'n log₂ n' is the leading term of the bound, not a measured sort."
**Phone.** The decision tree goes in `StageFrame minWidth={540}`. The radix buckets go in `WideRegion minWidth={600}`.

**`quickselect` · Quickselect & Order Statistics**
Track `dsa` · *"Find the k-th without sorting everything"* · Builds on: `sorting`, `binary-search`, `expected-value`
**Spec.**
- An array with a `Segmented` k (the median by default). Each round picks a pivot and partitions the array (Lomuto, shown as the same moves as `sorting`'s quick sort).
- Only the side containing index k stays lit. The other side dims and is never touched again.
- A comparison counter races a full sort's comparison count on the same array.
- **Pivot rule:** last element, random, or median-of-three. On sorted input, "last" degrades to ~n²/2, which a preset shows.
- **Top-k panel:** the same partition gives the k smallest elements, unordered, which is how libraries do `nth_element` or partial sort.
**Out of scope.** Median-of-medians' worst-case O(n) is one key idea only. Randomised analysis in general belongs to T3 `randomized-algorithms`.
**Kit.** `ArrayStrip` (`cellState`: active / dim / done; `ranges` for the live side; `pointers` for i, j and the pivot), `Segmented`, `Toggle`, `TextField` + `parseIntegers`, `createRecorder`, `core/random` `mulberry32` (seeded random pivots).
**AC.**
- Watch: the pivot is `--hi`, the pointers i and j are `--info` and `--violet`, the side that's thrown away `--dim`, the answer cell `--ok`, and the live range a `--hi` tint.
- Misconception: "you have to sort to find the median".
- Correctness:
  - The result equals `sorted[k]` on 500 seeded arrays, for every k, including duplicates.
  - Comparisons on the sorted preset with the last-element pivot equal n(n−1)/2 for the median search, as asserted.
  - The seeded random-pivot mean comparisons over 200 runs is < 4n.
  - The race caption names the actual winner from the counts (AC-0/T2 #1).
- Honesty: "Random pivots are seeded so the replay is repeatable."
**Phone.** It fits at 390 for ≤ 16 values (`cellMax`). Above that, `WideRegion minWidth={640}`.

**`rolling-hash` · Rolling Hash & Rabin-Karp**
Track `dsa` · *"Slide a fingerprint, not the whole string"* · Builds on: `hash-table`, `modular-arithmetic`, `sliding-window`
**Spec.**
- A text strip and a pattern box. A window the length of the pattern slides across the text. The window's hash updates in O(1): subtract the outgoing character's term, multiply by the base, add the incoming character. The arithmetic is shown mod a small prime.
- When the window's hash equals the pattern's hash, the window flashes and a character-by-character verification runs.
- The **small-modulus preset** (mod 13) produces a spurious hit. Verification rejects it, which shows why the check can't be skipped.
- Counters: hash updates, verifications, and false positives, against a naïve scan's character comparisons.
- The modulus is chosen with `Segmented` (13, 101, 2³¹−1), and the false-positive count drops as it grows.
- **Use-case strip:** rsync-style content-defined chunking, where a chunk boundary is cut wherever hash mod 64 = 0, so inserting one byte only moves nearby boundaries.
**Out of scope.** KMP and failure functions belong to T3 `kmp`. Cryptographic hashes belong to `hashing-encryption`.
**Kit.** `ArrayStrip` (characters, `ranges` = window), `core/numberTheory` (K-10) `mod`/`modPow` (bigint) or a local number version with a comment saying why, `Segmented`, `TextField`, `TextArea` (text), `createRecorder`, `AnimatedValue`.
**AC.**
- Watch: the window is a `--hi` range tint, the outgoing character `--bad` (removed) and the incoming one `--ok`, a hash match being verified `--info`, a confirmed match `--ok`, a spurious hit `--orange` (a second kind of failure, not a real miss), and checked text `--dim`.
- Misconception: "matching hashes means matching strings".
- Correctness:
  - The rolling hash equals a from-scratch hash of every window (500 seeded strings × 3 moduli).
  - The match list equals the positions `indexOf` finds when stepped (and `matchAll` for overlaps).
  - The mod 13 preset is asserted to contain ≥ 1 spurious hit that verification rejects.
  - The chunking preset's boundaries are asserted unchanged before the insertion point.
- Honesty: "Base and moduli are small so the arithmetic is readable; real implementations use 64-bit arithmetic."
**Phone.** The text strip goes in `WideRegion minWidth={600}`. The counters and arithmetic panel reflow underneath.

**`edit-distance` · Edit Distance & Diffs**
Track `dsa` · *"How many edits from kitten to sitting?"* · Builds on: `dynamic-programming`
**Spec.**
- Two words with an (m+1)×(n+1) Levenshtein table, filled cell by cell.
- Each cell shows its three candidates: from the left (+1 insert), from above (+1 delete) and from the diagonal (+0 match or +1 substitute). The winning arrow lights.
- **Traceback** lights the path back to (0, 0). Then **Replay** applies the edits to the first word letter by letter: "kitten" → "sitten" (substitute) → "sittin" (substitute) → "sitting" (insert).
- The learner types both words (≤ 12 characters each), with presets kitten/sitting, flaw/lawn and intention/execution.
- **Line-diff scene:** two short versions of a config file. The same DP over lines produces a `+`/`−` diff like `git diff`, and the costs are switched to insert/delete only, which is LCS-based diff.
- The cost of each operation can be weighted (substitute = 2 makes it the "insert + delete" distance), which reshapes the path.
**Out of scope.** The DP technique itself, memoisation vs tabulation, and the character LCS grid with traceback are owned by `dynamic-programming`. This lesson builds on them. Myers' O(ND) algorithm is one key idea only.
**Kit.** `CellGrid` (K-7, `rowLabels`/`colLabels`, cell text, `highlight` for the traceback), `TextField`, `ChipButton` presets, `Segmented` (operation costs), `createRecorder`, `CodePanel` (`renderLine` for the `+`/`−` line diff), `Tray` (the replayed word).
**AC.**
- Watch:
  - The cell being computed is `--hi`, and its three candidate sources are `--info`. The traceback path is `--violet`.
  - Replayed edits: a match is `--ok`, a substitution `--hi`, an insertion `--info`, a deletion `--bad` (removed). Diff lines use the same tokens: `+` `--ok`, `−` `--bad`.
- Misconception: "edit distance is the number of positions where the words differ" (Hamming distance), shown wrong by flaw/lawn, where Hamming gives 4 and Levenshtein gives 2.
- Correctness:
  - Levenshtein matches an independent recursive reference on all pairs of seeded strings up to length 7.
  - kitten→sitting = 3, flaw→lawn = 2, intention→execution = 5.
  - Replaying the traceback's edits on word A yields word B, exactly (tested for every preset and 300 seeded pairs).
  - The line diff, applied to version 1, yields version 2.
  - Empty strings give distance = the other's length.
- Honesty: "Nothing simulated: computed live. Real diff tools use faster algorithms that give the same kind of answer."
**Phone.** `CellGrid size="xs"` fits a 7×8 table at 390. Longer words put the grid in `WideRegion minWidth={480}`. Replay sits underneath.

**`tries` · Tries & Prefix Trees**
Track `dsa` · *"Autocomplete's secret weapon"* · Builds on: `trees-bst`, `hash-table`, `tree-traversals`
**Spec.**
- A trie built from a word list (presets: 12 programming words, US states, and a learner-typed list in `TextArea`).
- **Insert** a word: the path animates down one character per edge, creating nodes only where the path doesn't exist yet. The end-of-word node gets a ring.
- **Type a prefix:** the matching path lights, its whole subtree highlights, and completions are listed in order, read out by a DFS of the subtree.
- **Compress toggle:** a radix tree merges single-child chains into one labelled edge, and a node counter shows the saving.
- A cost panel compares checks per prefix lookup: trie (≤ prefix length steps) vs scanning the list with `startsWith`.
- **Delete** a word: the end mark goes, and nodes that no longer lead anywhere are pruned.
**Out of scope.** Suffix trees and suffix arrays belong to T4 `suffix-arrays`. Aho-Corasick belongs to T4. Spell-check edit distance belongs to `edit-distance`.
**Kit.** `TreeSvg` (`tidy`, n-ary, `nodeMark`, `edgeMark`, `onNodeClick` with action names, `hidden` for nodes animating in), `TextField`, `TextArea`, `Toggle`, `ChipButton`, `Tray` (completions), `createRecorder`.
**AC.**
- Watch: the character being matched is `--hi`, the matched prefix path `--violet`, the subtree with completions an `--info` tint, end-of-word rings `--ok`, newly created nodes `--info`, pruned nodes `--bad` (removed), and unmatched nodes `--dim`.
- Misconception: "a trie stores each word in its own node", or "tries always use less memory than a list".
- Correctness:
  - Completions equal `words.filter(w => w.startsWith(p)).sort()` for every prefix of every preset word and for 300 seeded word lists.
  - The node count equals the distinct prefixes + 1 (the root).
  - The radix tree has no single-child non-terminal node and returns identical completions.
  - Deleting then re-inserting gives the identical structure.
  - Input that's only whitespace, or duplicate words, gets defined messages.
- Honesty: "Nothing simulated: computed live."
**Phone.** The tree goes in `StageFrame minWidth={560}` (the trie gets wide). The completions tray and cost panel reflow underneath.

---

##### Batch T2-B15 · Logic, proof & complexity (`math`, `dsa`, `lang`)
Wave 5. Theory-heavy: every lesson names what the learner *manipulates*, and none is narration with a Next button. Exercises `Plot2D` (K-12), `TreeSvg`, `CellGrid` (K-7) and `core/stats.ts` (K-11), all proven by then. `proof-techniques` has a step-picker interaction (pick the next step and its justification from chips). It stays local, because `induction-invariants` toggles and injects bugs instead and has no step picker. If a second user appears, the batch report files a Phase 2 extraction.

**`predicate-logic` · Predicates & Quantifiers**
Track `math` · *"For all, there exists, and the order matters"* · Builds on: `propositional-logic`, `sets-functions`, `sql-basics`
**Spec.**
- A grid: rows are people (x), columns are dishes or people (y), and a cell is filled when `likes(x, y)` holds. The learner toggles cells by click or keyboard.
- A formula panel evaluates live:
  - `∀x ∃y likes(x, y)` ("everyone likes something")
  - `∃y ∀x likes(x, y)` ("there's one dish everyone likes")
  - the two `∃∃`/`∀∀` forms
- Each shows true or false and a witness: the y found for each row, or the single column that satisfies everyone. A false formula highlights a counterexample row or column.
- **Presets:**
  - "everyone likes something, but no common dish", where the two orders disagree
  - "pizza for all", where both are true
  - an empty domain, where `∀` is vacuously true and `∃` false
- **Negation drill:** the learner pushes a `¬` through a quantifier by clicking it. `¬∀x P` becomes `∃x ¬P` and both sides are evaluated on the grid to show they agree.
- A translation strip shows the `∀∃` form as SQL `NOT EXISTS (… NOT EXISTS …)` ("customers who bought every product") and as a type signature reading.
**Out of scope.** Formal proof systems, and quantified logic in model checkers (T4 `formal-methods`).
**Kit.** `CellGrid` (K-7) with `rowLabels`/`colLabels` and `onCellClick`, `CodePanel` (formula and SQL lines, `renderLine` for clickable `¬` steps), `ChipButton` (presets), `Segmented` (formula), `createRecorder` for the negation steps.
**AC.**
- **Watch:**
  - `likes` cells, an `--info` fill
  - the witness or counterexample being examined `--hi`
  - satisfying witnesses `--ok`
  - the counterexample row or column `--bad`
  - true and false verdicts `--ok`/`--bad`
  - empty grid cells `--dim`
- **Misconception:** "swapping ∀ and ∃ doesn't change the meaning".
- **Correctness:**
  - On all 2⁹ relations over a 3×3 domain (exhaustive), the evaluator matches brute-force definitions for every formula, `∃y∀x → ∀x∃y` always holds, and the converse fails on exactly the relations the preset family shows.
  - The empty domain gives `∀` true and `∃` false.
  - Every negation rewrite agrees with the original on all 512 relations.
- **Honesty:** "Nothing simulated: every truth value is computed from your grid."
**Phone.** The grid is at most 5×5 at `size="sm"` and fits at 390. The formula and SQL panels stack below.

**`proof-techniques` · Proof Techniques**
Track `math` · *"Direct, contrapositive, contradiction: pick your weapon"* · Builds on: `propositional-logic`, `predicate-logic`
**Spec.**
- A **proof builder**. A claim is shown with an empty proof column. The learner first picks a technique (direct, contrapositive, contradiction, counterexample), then fills each line by choosing the next step from 3-4 candidate chips.
- A correct step locks in with its justification ("definition of odd", "algebra", "assumption"). A wrong step is rejected with the specific reason ("assumes what we're proving", "doesn't follow: n² even ⇏ n = 2k without the lemma").
- **Claims:**
  - the sum of two odd numbers is even (direct)
  - if n² is even then n is even (contrapositive: the direct route stalls, and the builder says so)
  - √2 is irrational (contradiction, where the assumption "explodes" into "p and q both even" against "lowest terms")
  - "n² + n + 41 is always prime" (counterexample)
- **Counterexample tool:** a slider tests n = 0, 1, 2… with a `primes-factoring`-style check per value. n = 0…39 give primes; **n = 40** gives 1681 = 41².
- After each proof, a strip re-reads it as the propositional form it used (p → q, ¬q → ¬p, ¬p → ⊥), linked to `propositional-logic`'s contrapositive.
**Out of scope.** Induction (`induction-invariants`), and formal and mechanised proof (T4 `formal-methods`).
**Kit.** `CodePanel` (proof lines, `stateOf` done/now/bad), `ChipButton` (candidate steps, `onStyle="solid"` when chosen), `Segmented` (technique), `Slider`, `TruthTable` (the p → q vs ¬q → ¬p strip), `createRecorder`, `useScenePicker`. The step-picker stays local (one user; see the batch note).
**AC.**
- **Watch:**
  - the proof line being filled `--hi`
  - accepted steps `--ok`, rejected steps `--bad` (shake via `useShake`)
  - the assumption in a contradiction proof `--violet`
  - the contradiction itself `--bad`
  - the counterexample value `--bad`, values that pass `--ok`
  - unused candidate chips `--dim` after the choice
- **Misconception:** "checking many examples proves a claim". n² + n + 41 holds for 40 cases and still fails.
- **Correctness:**
  - n² + n + 41 is prime for n = 0..39 and composite at 40 (= 41²), via `isProbablePrime` (K-10).
  - Each claim's scripted step tree has exactly one accepting path per technique offered, and every rejected chip has a reason string (data test).
  - The propositional strip's equivalences are checked with `truthRows`.
- **Honesty:** "Steps are a fixed menu for each claim; real proofs are free-form."
**Phone.** One column: claim, proof lines, chips. It fits at 390, with chips wrapping.

**`induction-invariants` · Induction & Loop Invariants**
Track `math` · *"Knock over the first domino, prove the rest fall"* · Builds on: `proof-techniques`, `binary-search`, `recursion`
**Spec.**
- **Scene 1 · Dominoes.** A row of dominoes for the claim "1 + 3 + … + (2n−1) = n²", drawn as an L-shaped layer added to an n×n square each step.
  - The learner toggles **base case proven** and **step proven** and pushes the first domino.
  - With both on, the dominoes fall to the end.
  - Without the base case, nothing starts.
  - With a broken step (the preset "all horses are the same colour"), they fall until the gap at n = 1 → 2. The caption shows exactly where the step's argument needs two overlapping horses.
- **Scene 2 · Loop invariants.** A binary-search loop on an `ArrayStrip` with the invariant written above the code: "if the target is present, it's within [lo, hi]".
  - Each iteration, a checker evaluates the invariant on the real state and shows ✓.
  - The learner injects bugs from chips: `lo = mid` instead of `mid + 1` (the invariant holds but the range stops shrinking, which the variant counter `hi − lo` exposes: an infinite loop caught at a cap), `hi = mid − 1` with `<=` swapped, and an off-by-one initial `hi = n`.
  - Each bug fails either the invariant or the termination check, and the caption names which.
- **Scene 3 · Strong induction.** A brief preset: every integer ≥ 2 factors into primes, shown as a factor tree (`TreeSvg`) where each node's proof uses smaller cases.
**Out of scope.** Property-based testing of invariants (T3), and formal verification (T4 `formal-methods`).
**Kit.** `ArrayStrip` (ranges `lo..hi`, pointers), `CodePanel` (loop with `active` line and `bad` state), `TreeSvg`, `Toggle` (base and step), `ChipButton` (bug injections), `Bar` (variant `hi − lo`), `createRecorder`, `useScenePicker`.
**AC.**
- **Watch:**
  - the domino or iteration being checked `--hi`
  - fallen dominoes and invariant ✓ `--ok`
  - the broken step's gap and the failed invariant `--bad`
  - the search range `--info`
  - the variant bar `--violet`
  - ruled-out cells `--dim`
- **Misconception:** "the base case is a formality". Without it nothing is proven, and the horses "proof" breaks exactly at its step from n = 1 to n = 2.
- **Correctness:**
  - Σ(2i−1) = n² for n ≤ 1000.
  - The correct binary search keeps the invariant on every iteration and terminates for all targets (present and absent) in 300 seeded sorted arrays.
  - Each injected bug produces its documented failure (wrong answer, invariant violation or non-termination at the cap) on at least one preset input, and the caption's category matches the failure detected.
- **Honesty:** "The infinite loop is stopped after 50 iterations so you can see it."
**Phone.** Scene 1's dominoes are a `WideRegion minWidth={520}` (12 dominoes). Scene 2 fits, because `ArrayStrip` shares the width and the code panel wraps.

**`master-theorem` · Divide & Conquer and the Master Theorem**
Track `dsa` · *"Solve T(n) = aT(n/b) + f(n) by drawing a tree"* · Builds on: `sorting`, `recursion`, `big-o`, `logs-exponentials`
**Spec.**
- **Recursion tree** for T(n) = a·T(n/b) + f(n). The learner sets a (1-8), b (2-4) and f(n) from chips: 1, log n, √n, n, n log n, n².
  - Each level shows its node count aᵏ, its subproblem size n/bᵏ and its level's total work aᵏ·f(n/bᵏ), as a bar on the right.
  - The bars visibly grow (leaves dominate), stay level (every level equal: the log factor), or shrink (the root dominates).
  - The verdict states the case by comparing f(n) with n^(log_b a), shown as a number.
- **Presets:**
  - binary search (1, 2, 1) → log n
  - merge sort (2, 2, n) → n log n
  - Karatsuba (3, 2, n) → n^1.585
  - Strassen (7, 2, n²) → n^2.807
  - a degenerate split (1, 2, n) → n, showing that "divide and conquer" isn't automatically n log n
- **Closest pair of points** (absorbing `divide-and-conquer`): split the plane, recurse, then check only the strip of width 2δ. A counter shows strip checks staying linear per level, so it's the merge-sort case.
- A **"doesn't fit"** preset, T(n) = 2T(n/2) + n/log n, falls between cases. The tree still sums (≈ n log log n) and the verdict says the basic theorem doesn't apply.
**Out of scope.** Merge and quick sort mechanics (`sorting` already shows them), the Akra-Bazzi generalisation, and amortised costs (`amortized-analysis`).
**Kit.** `TreeSvg` (`tidy`, the first 3-4 levels with `hidden` for elided nodes, plus a "⋮" overlay), `Plot2D` (K-12) for the per-level work bars or the "level total" line and the closest-pair points, `Segmented`/`ChipButton` (a, b, f), `power()` for exponents, `createRecorder` for the closest-pair walk.
**AC.**
- **Watch:**
  - the level being summed `--hi`
  - per-level work bars `--info`
  - the dominant part (root levels or leaf levels) `--ok`
  - the n^(log_b a) reference line `--violet`
  - closest-pair strip `--hi`, current best pair `--ok`
  - points outside the strip `--dim`
- **Misconception:** "every divide-and-conquer algorithm is O(n log n)". The answer depends on how a, b and f(n) balance.
- **Correctness:**
  - For every preset and every (a, b, f) combination offered, the case classifier's Θ matches the numerically summed recursion tree (ratio to the claimed bound stays within a constant band for n = 2¹⁰…2²⁰).
  - Karatsuba's exponent equals log₂3 to 3 decimal places.
  - Closest pair matches brute force on 300 seeded point sets.
  - The "doesn't fit" preset's tree sum grows like n log log n (ratio test).
- **Honesty:** "Trees show the first levels; the sums are computed for real n."
**Phone.** The tree is in a `WideRegion minWidth={540}` with the work bars to its right. At ≤ 900px the bars move under the tree as a `Plot2D`. The closest-pair plot fits (square, 340px).

**`p-vs-np` · P, NP & NP-Completeness**
Track `lang` · *"Easy to check vs easy to solve"* · Builds on: `big-o`, `logs-exponentials`, `backtracking`, `combinatorics`
**Spec.**
- **Subset sum, two buttons.**
  - The learner picks n numbers (6-24 from a seeded set, or types their own) and a target.
  - **Verify** takes a proposed subset (click numbers to select) and checks it in n steps.
  - **Solve** brute-forces all 2ⁿ subsets with a live counter, with the elapsed time extrapolated to n = 60 (in years) from the measured rate.
  - The two counters sit side by side.
- **Pseudo-polynomial trap:** a DP solver toggle solves big-n cases fast when the target is small, with a table of size n × target. A slider grows the target's digits, and the DP cost grows with the target's value, i.e. exponentially in its length. The caption explains why this doesn't put subset sum in P.
- **Class diagram:** nested regions P ⊆ NP, with NP-complete inside NP and NP-hard overlapping it. The learner drags problem chips into regions and gets immediate feedback:
  - sorting, shortest path → P
  - subset sum, SAT, 3-colouring, travelling salesman (decision version) → NP-complete
  - the halting problem → NP-hard, not in NP
- **"Spot it at work":** three short scenario cards (scheduling with constraints, packing a truck, choosing features under a budget). The learner tags each as "probably NP-hard: use a heuristic or approximation", with the known problem it maps to.
**Out of scope.** Performing reductions (T4 `np-reductions`), approximation algorithms (T4), and Turing machines (T3).
**Kit.** `ArrayStrip` (numbers, with `onCellClick` to select), `CellGrid` (DP table, small targets only), `Bar`/`AnimatedValue` (counters), `Plot2D` (K-12; 2ⁿ vs n on a log y axis), `core/stats.ts` `choose`, `humanDuration`, `TextField` (with `parseIntegers`), `ChipButton` (problem chips, placed by click then region, so the keyboard path is the same as the mouse), `useScenePicker`.
**AC.**
- **Watch:**
  - the subset being tried `--hi`
  - a verified-correct subset `--ok`, a failed check `--bad`
  - the brute-force counter `--orange` (the costly side) against the verify counter `--ok` (the cheap side)
  - region outlines: P `--info`, NP `--violet`, NP-complete `--hi`, NP-hard `--orange`
  - misplaced chips `--bad`
- **Misconception:** "NP means 'not polynomial'". NP is "verifiable in polynomial time", and P is inside it.
- **Correctness:**
  - The brute-force solver and the DP agree with each other on 500 seeded instances (n ≤ 16).
  - The verifier accepts exactly the subsets whose sum equals the target.
  - The brute-force counter equals 2ⁿ when no early exit is taken.
  - Chip placements match a fixed answer table, and each chip has exactly one correct region.
  - Typed numbers are refused beyond 24 items or outside ±10⁶, with a message.
- **Honesty:**
  - "The nested picture assumes P ≠ NP, which nobody has proven; if P = NP, the regions collapse."
  - "Extrapolated times are from this browser's measured rate."
**Phone.** The subset strip uses `cellMax` and wraps to two rows above 12 items. The class diagram is a `WideRegion minWidth={420}`. The scenario cards stack.

---

##### Batch T2-B16 · Concurrency & performance (`os`, `dsa`)
Wave 5. Uses **`GraphView` (K-6)** for the resource-allocation graph, **`Plot2D` (K-12)** for Amdahl and **`GanttLanes` (K-13)** for the profiler timeline. ring-buffers sits here because the bounded buffer in semaphores-condition-variables *is* a ring buffer. The two link to each other.

**`deadlocks` · Deadlocks: Conditions & Prevention**
Track `os` · *"Four conditions, one frozen system"* · Builds on: `race-conditions`, `graph-representations`, `cycle-detection`
**Spec.**
- A **resource-allocation graph** in `GraphView`: thread nodes (circles) and resource nodes (boxes). A request edge runs thread → resource, an assignment edge resource → thread.
- A scheduler steps the threads through scripted lock acquisitions. When a cycle forms, its edges light, and the threads freeze with a "deadlocked" badge.
- The **four Coffman conditions** are four toggles, each a real prevention strategy:
  1. **Mutual exclusion** off: the resource is shareable (a read-only copy).
  2. **Hold and wait** off: a thread takes all its locks at once or none.
  3. **No preemption** off: `tryLock` with a timeout; on failure a thread releases what it holds and retries.
  4. **Circular wait** off: a global lock order (always A before B before C).
  Breaking any one stops the deadlock; the learner tests each.
- Presets:
  - "Two threads, two locks" (the `race-conditions` case, recapped in one frame).
  - **Dining philosophers** with 5 threads and 5 forks.
  - A "three-service transfer" A→B→C→A.
  - A "**database deadlock**": two transactions update rows in opposite order; a detector finds the cycle and aborts the younger transaction as the victim, which retries.
- **Detection vs prevention vs avoidance:** detection runs cycle-finding periodically; avoidance gets a one-line mention (the Banker's algorithm) without a sim.
**Out of scope.** The read-add-write race and mutex basics (`race-conditions` owns them), livelock in depth (one caption shows tryLock retries in lockstep), and lock-free structures (T4).
**Kit.** `GraphView` (K-6) with `shape: 'box'` resources and `edgeMark`, `Toggle` ×4, `useScenePicker`, `createRecorder`, `ConsolePanel` (DB error text "deadlock detected; transaction aborted").
**AC.**
- Watch: threads are `--info`; resources are `--violet` boxes; request edges are dashed and assignment edges solid; the thread acting now is `--hi`; cycle edges are `--bad`; a frozen thread gets a `--bad` badge; the aborted victim is `--orange`; finished threads are `--ok`.
- Misconception: "deadlocks are rare timing flukes you can't prevent; just add timeouts", or "any cycle in a dependency graph is a deadlock".
- Correctness:
  - A pure scheduler over scripted acquisition lists (round-robin interleaving, seeded) is tested:
    - with all four conditions on, the dining-philosophers preset deadlocks under the canonical interleaving;
    - with any one condition off, no seeded interleaving (500 seeds) deadlocks;
    - with hold-and-wait off, no thread ever holds one lock while waiting for another.
  - Cycle detection on the RAG is the same directed-cycle check as `graph-representations` (tested on the presets).
  - The DB victim is the transaction with the latest start.
- Honesty: "Scripted lock sequences; the database detector is a simplified model (real ones also weigh the work each transaction has done)."
**Phone.** `GraphView` at the fixed layout fits at 390 for ≤6 nodes. Dining philosophers is in a `WideRegion minWidth={420}`, and the toggles wrap.

**`semaphores-condition-variables` · Semaphores, Condition Variables & Monitors**
Track `os` · *"Waiting without spinning"* · Builds on: `race-conditions`, `stack-queue`, `interrupts-context-switch`
**Spec.**
- A **bounded buffer** (capacity slider 1-8, drawn as a flat `ArrayStrip` whose head and tail pointers wrap from the last slot to slot 0, linked to `ring-buffers`, which owns the ring drawing) with 1-3 producers and 1-3 consumers as lanes. Each thread shows its current line in a code panel and its state (running, waiting, ready).
- Mode picker:
  1. **Busy-wait:** a `while (count == N) {}` spin. A CPU meter pins at 100% while nobody does useful work.
  2. **Semaphores:** `empty` (starts at N) and `full` (starts at 0) are drawn as token piles, plus a `mutex`. `wait`/P takes a token or sleeps in the semaphore's queue; `signal`/V adds one and wakes a sleeper.
  3. **Monitor with condition variables:** `notFull`/`notEmpty` queues. `wait` atomically releases the lock and sleeps.
- A **bug toggle** "`if` instead of `while`" around the condition wait: with 2 consumers, a woken consumer finds the buffer already emptied by the other and reads garbage, which is flagged. This is Mesa semantics: a wake-up is a hint.
- A **bug toggle** "signal instead of broadcast" in a scene where the wrong waiter gets woken: everyone ends up asleep, and a "stuck" badge appears.
- Speed sliders for producers and consumers show the buffer filling or draining, and the CPU meter staying low in modes 2 and 3.
**Out of scope.** Mutex mechanics (`race-conditions`), lock-free queues (T4 `lock-free-cas`), and thread pools (T3).
**Kit.** `useSimulation` (seeded scheduler), `ArrayStrip` (the buffer, flat, with wrapping `pointers`), `CodePanel` ×n (`stateOf`), `Segmented`, `Toggle` ×2, `Slider`, `Bar` (CPU meter), `core/random` (`mulberry32`). Token piles are local (one user).
**AC.**
- Watch: running threads are `--hi`; sleeping threads are `--dim`; a ready (woken) thread is `--info`; semaphore tokens are `--violet`; filled buffer slots are `--info`; a garbage read or stuck state is `--bad`; the spin-wait CPU meter is `--bad` at 100%.
- Misconception: "after you're woken up, the condition you waited for is guaranteed to be true".
- Correctness:
  - A pure discrete scheduler, run over 1,000 seeded interleavings in the correct modes, never lets the count go below 0 or above N, never loses or duplicates an item (every produced id is consumed exactly once), and never leaves a thread asleep while the buffer allows it to proceed.
  - With the `if` bug and 2 consumers, at least one seed produces a read from an empty buffer.
  - Semaphore invariant: `empty + full + inFlight = N` at every step.
- Honesty: "A simulated scheduler picks who runs next (seeded); real threads are scheduled by the OS."
**Phone.** Lanes stack vertically; each lane's code panel collapses to the current line at ≤900px. Fits.

**`ring-buffers` · Ring Buffers**
Track `dsa` · *"A queue that eats its tail"* · Builds on: `stack-queue`, `arrays-linked-lists`, `modular-arithmetic`
**Spec.**
- A fixed array of N slots (4-16), drawn **twice**: as a ring and as the flat array it really is. Head (read) and tail (write) pointers move on both.
- Buttons: enqueue (or enqueue ×5), dequeue, and a fill/drain auto-run with producer and consumer speed sliders.
- Wraparound animates `tail = (tail + 1) % N` on the ring and as a jump from the last cell to cell 0 on the flat array.
- **Full vs empty**: `head == tail` is ambiguous. Three strategies are picker options, and each shows how it decides:
  1. keep one slot empty (capacity N−1);
  2. keep a separate `count`;
  3. use ever-increasing counters masked with `& (N−1)` when N is a power of two (the LMAX/Linux kfifo style).
- An **overflow policy** picker for a full buffer: block the producer, drop the newest, or overwrite the oldest (a log or audio buffer). Dropped and overwritten items are counted.
- A "Where you meet it" strip: the kernel log `dmesg`, audio buffers, network card RX rings, and the bounded buffer in `semaphores-condition-variables`.
**Out of scope.** Lock-free multi-producer ring buffers and memory barriers (T4 `memory-ordering-atomics`; one summary line).
**Kit.** `ArrayStrip` (flat view with `pointers`), a local SVG ring (one user: semaphores draws its bounded buffer flat), `Segmented` ×2, `Slider`, `ChipButton`, `AnimatedValue`, `core/format`.
**AC.**
- Watch: head is `--info`; tail is `--violet`; filled slots are `--hi` tint; empty slots are `--dim`; the always-empty slot (strategy 1) is outlined `--dim` dashed; an overwritten item flashes `--orange`; a dropped item `--bad`.
- Misconception: "head == tail always means the buffer is empty".
- Correctness:
  - A pure `RingBuffer` model per strategy is tested against a reference unbounded queue on seeded operation sequences: dequeued order matches FIFO for every item not dropped or overwritten.
  - Capacity: N−1 for strategy 1, N for 2 and 3.
  - Masked counters give the same results as `%` when N is a power of two, and the masked strategy refuses non-powers of two with a visible message.
  - Counters survive wrap past 2³² (tested with `>>> 0` arithmetic).
- Honesty: "Nothing simulated: the buffer logic runs live. Speeds are illustrative."
**Phone.** The ring sits above the flat strip; at 390 the strip uses `cellMax` and stays under 16 slots. Fits.

**`amdahls-law` · Amdahl's & Gustafson's Laws**
Track `os` · *"Why 64 cores isn't 64× faster"* · Builds on: `processes-threads`, `logs-exponentials`
**Spec.**
- A job bar split into a serial part (fraction s) and a parallel part (1 − s). A cores slider (1-256, log steps) splits the parallel part across lanes; the serial part stays one lane. The total length shrinks toward the serial floor.
- A `Plot2D` of speedup vs cores (log x axis) for the current s, with the asymptote 1/s drawn as a dashed line. Preset chips for s = 50%, 10%, 5% and 1% overlay their curves.
- **Gustafson mode:** the problem grows with the cores (fixed time, bigger data). The plotted scaled speedup s + (1 − s)·n climbs nearly linearly, which shows why big clusters still pay off for scalable work.
- An "**overhead**" slider adds a per-core coordination cost (illustrative), and the speedup curve bends **down** past a peak. A "best core count" marker appears.
- A worked example: "a build that's 20% serial (linking) can never get more than 5× faster".
**Out of scope.** Queueing and contention models (T3 `queueing-theory`), and the Universal Scalability Law in depth (the overhead slider is a simplified stand-in, and the stage says so).
**Kit.** `Plot2D` (K-12) with a log x scale, `<Curve>`, `<HLine>` (asymptote), `<VLine>` (cores marker); `Slider` (with `format`); `ChipButton` (presets); `Segmented` (Amdahl/Gustafson); `Bar` (job bars); `core/format` (`times`).
**AC.**
- Watch: the serial part is `--orange` (a category: the cost you can't split); parallel lanes are `--info`; the current speedup point is `--hi`; the asymptote is dashed `--dim`; the overhead-bent curve's peak marker is `--ok`; preset overlay curves take `categorical(i)`.
- Misconception: "doubling the cores halves the run time".
- Correctness:
  - `amdahl(s, n) = 1 / (s + (1 − s)/n)` and `gustafson(s, n) = s + (1 − s)·n` are pure and tested: s = 0.05, n → 10⁶ approaches 20 within 0.1%; n = 1 gives 1 for both laws and every s.
  - The overhead model `1 / (s + (1 − s)/n + c·(n − 1))` has its peak at n* = √((1 − s)/c), tested.
  - Every plotted point is computed, not hand-entered.
- Honesty: "Idealised model; the overhead term is a simplified stand-in for contention and coordination."
**Phone.** Fits. The plot scales via `Plot2D`'s viewBox with text ≥8px at 390; the bars sit above it.

**`profiling-flame-graphs` · Profiling & Flame Graphs**
Track `os` · *"Measure before you optimise"* · Builds on: `recursion`, `calling-conventions`, `big-o`
**Spec.**
- A small fictional web handler (`handleRequest` → `parseJson`, `loadUser` → `db.query`, `renderPage` → `formatPrice` in a loop, plus `logLine`) runs on a `GanttLanes` timeline. A sampling profiler takes stack snapshots at a fixed interval (rate slider).
- Each sample's stack drops into a **flame graph** that builds live: x = share of samples (alphabetically merged, **not time order**), y = stack depth, width = time on CPU including children.
- Toggles: "**Icicle**" (upside down) and "**Time order**" (a flame chart), so the learner sees the difference between the two.
- Click a frame to zoom in. A self-time vs total-time readout shows `renderPage` is wide but its self time is small; the hot leaf is `formatPrice`'s `Intl.NumberFormat` construction inside the loop.
- **"Optimise"** buttons per function: hoisting the formatter out of the loop shrinks its width and the total runtime. A decoy "optimise `parseJson`" button changes almost nothing, which is the lesson.
- A sampling-rate slider: too few samples gives a noisy graph, and a "samples: n" readout shows the uncertainty.
**Out of scope.** Benchmarking methodology (T3 `benchmarking-methodology`), tracing vs sampling profilers in depth (one key idea), and off-CPU/wall-clock profiling (one caption).
**Kit.** `GanttLanes` (K-13) for the timeline, a local flame-graph SVG (one Tier 2 user; listed in §3.1.4 "kept local"), `ChipButton`, `Toggle` ×2, `Slider`, `core/random` (seeded sampling jitter), `core/format` (`pct`, `ms`).
**AC.**
- Watch: frames use a warm categorical ramp by function (`categorical(i)`), never `--bad` (width isn't an error); the hovered or zoomed frame is `--hi`; a just-arrived sample flashes `--info`; the optimised function is `--ok` after its fix; the timeline cursor is `--hi`.
- Misconception: "the x axis of a flame graph is time", or "optimise the function you think is slow".
- Correctness:
  - A pure `foldStacks(samples) → tree` is tested: each node's sample count equals the sum of its children plus its self count; the root count equals the total samples.
  - Widths are proportional to counts; merged siblings are sorted by name (matching Brendan Gregg's `flamegraph.pl` convention).
  - With seeded sampling, the hot leaf's measured share is within ±5 points of its true CPU share at 1,000 samples.
  - Hoisting the formatter reduces the modelled runtime by the amount its frames had.
- Honesty: "A simulated program and profiler; durations are illustrative. Real profilers (perf, pprof, Chrome DevTools) sample the same way."
**Phone.** The flame graph and timeline each sit in a `WideRegion minWidth={480}`. The optimise buttons wrap above.

---

##### Batch T2-B17 · Sockets & the edge (`net`, `arch`)
Wave 6. Uses `GraphView` state mode (K-6) for the TCP socket states, `ByteGrid` (K-8) for captured frame bytes, and `SequenceDiagram` for the capture ladder. All are proven by this wave, so this batch adds no new kit pressure. `latency-bandwidth` keeps a local canvas pipe (one user).

**`sockets-api` · Sockets: bind, listen, accept, connect**
Track `net` · *"The API under every server"* · Builds on: `tcp-udp`, `file-descriptors`, `ip-ports`
**Spec.**
- Two processes, a server and a client, each with a code column of real call names. Stepping runs one call at a time:
  - server: `socket()` → `bind(203.0.113.10:8080)` → `listen(backlog=4)` → `accept()`;
  - client: `socket()` → `connect()`.
- Each socket appears as an FD number in its process's FD table (linking `file-descriptors`).
- A **TCP state diagram** beside it (`GraphView` with `startNode`) lights the current state per socket: CLOSED → LISTEN, SYN_SENT → ESTABLISHED, and on close FIN_WAIT_1/2 → TIME_WAIT → CLOSED, or CLOSE_WAIT → LAST_ACK.
- The **accept queue**: `accept()` returns a *new* connected socket (a new FD) while the listening socket stays in LISTEN. A "slow server" toggle stops accepting, the queue fills to the backlog limit, and new SYNs are dropped or refused, with the client seeing a timeout or retry.
- An **ephemeral port** chip shows the client's source port, chosen by the OS from 49152-65535 by default. The 4-tuple is shown on every connection.
- A **TIME_WAIT pile-up** preset: a client opens and closes 200 short connections. TIME_WAIT sockets accumulate on the side that closed first (2×MSL, shown as an illustrative 60 s) and use up ephemeral ports. The fix chips are keep-alive / connection reuse, and `SO_REUSEADDR` for server restarts (named, described correctly).
- `bind` errors: binding a port already in LISTEN gives `EADDRINUSE`, and a port below 1024 without privilege gives `EACCES`.
**Out of scope.** The packet-level handshake and retransmission (`tcp-udp`), non-blocking sockets and epoll (T3 `io-models`), and UDP sockets beyond one comparison line.
**Kit.** `GraphView` (K-6) state mode, `CodePanel` (active call per process), `.data-table` (FD tables, accept queue), `ConsolePanel` (errno messages), `Bar` (ephemeral ports used), `Toggle`, `ScenePicker`, `createRecorder`.
**AC.**
- Watch: the current call and current state `--hi`, the listening socket `--violet`, connected sockets `--info`, a queued connection `--hi` tint, a dropped or refused SYN `--bad`, TIME_WAIT `--orange`, and closed sockets `--dim`.
- Misconception: "`accept()` uses the listening socket for the conversation", and "a server needs one port per client".
- Correctness:
  - The TCP state machine is a pure transition table, tested against RFC 9293's transitions for the modelled events (active/passive open, active/passive close).
  - Accept-queue invariants: the queue length ≤ backlog; an accepted connection gets a fresh FD ≠ the listener's.
  - Every connection's 4-tuple is unique.
  - The ephemeral-port exhaustion count matches (range size − TIME_WAIT in use) in a seeded run.
  - `EADDRINUSE`/`EACCES` cases are tested.
- Honesty: "Simulated kernel; real systems' backlog and TIME_WAIT values vary (shown values are illustrative)."
**Phone.** `StageFrame minWidth={560}` (two code columns plus the state graph). Below 900px the state graph stacks under the code, and the minWidth then only applies to the code pair.

**`latency-bandwidth` · Latency, Bandwidth & the Bandwidth-Delay Product**
Track `net` · *"A fat pipe can still be slow"* · Builds on: `tcp-udp`, `memory-hierarchy`
**Spec.**
- A pipe drawn on canvas: its **length** is the RTT (slider 1-300 ms) and its **width** is the bandwidth (slider 1 Mbit/s-10 Gbit/s, log). Packets flow in it.
- A **window** slider (in-flight bytes allowed before an ACK). The pipe visibly half-fills when the window is under the BDP, and throughput = min(bandwidth, window ÷ RTT) is shown live.
- A BDP readout: bandwidth × RTT in bytes, plus "you need a window of at least X to fill this pipe".
- **Transfer-time calculator**: send N bytes. Time = handshake RTTs + RTT-bound rounds + size ÷ bandwidth. A 10 KB file and a 1 GB file each show which term dominates.
- A **chatty vs batched** preset: 100 sequential small requests at 80 ms RTT vs 1 batched request, with a Gantt-style bar comparing total time (the reason chatty APIs are slow across regions).
- Presets: same rack (0.5 ms, 25 Gbit/s), cross-continent (80 ms, 1 Gbit/s), satellite (600 ms), mobile 4G (50 ms, 20 Mbit/s).
- `Plot2D`: throughput against window size, flattening at the bandwidth ceiling, with the BDP marked.
**Out of scope.** How TCP grows the window (slow start, congestion avoidance, loss reaction: T3 `congestion-control`). The window is a learner-set number here.
**Kit.** `useSimulation` + local `draw.ts` canvas pipe (one user), `Slider` (with `format` for units), `Plot2D` (K-12), `GanttLanes` (K-13) for chatty vs batched, `core/format` `ms`/`bytes`, `Stat`, `ChipButton` presets.
**AC.**
- Watch: in-flight packets `--info`, ACKs returning `--violet`, the empty part of the pipe `--dim`, the BDP marker `--hi`, the bandwidth ceiling line `--ok`, and in the chatty preset the waiting time `--bad` against the batched `--ok`.
- Misconception: "more bandwidth always makes it faster". For small or chatty transfers, latency dominates.
- Correctness:
  - BDP = bandwidth × RTT, tested with units: 1 Gbit/s × 80 ms = 10 MB.
  - Throughput = min(bw, window/RTT) is tested across the slider grid.
  - The transfer-time formula is tested for the 10 KB vs 1 GB presets, where the dominant term flips.
  - The chatty total = n × RTT + bytes/bw.
  - The canvas packet count in flight equals window ÷ packet size (rounded), within one packet.
- Honesty: "Idealised link: no loss, no congestion control, a fixed window; numbers are computed from the sliders."
**Phone.** The canvas is responsive (`.canvas-wrap` with height 220 at ≤900), so it doesn't need `minWidth`. The plot and readouts stack.

**`firewalls-packet-filtering` · Firewalls & Packet Filtering**
Track `net` · *"Rules at the gate"* · Builds on: `subnetting-cidr`, `ip-ports`, `tcp-udp`, `security-principles`
**Spec.**
- An ordered rule list shown as a `CodePanel`, with columns for chain, source CIDR, destination port, protocol, state and action (ACCEPT / DROP / REJECT).
- Packets arrive one at a time from a preset traffic stream. Each walks the rules top-down: each rule lights as it's checked, and the **first match wins**. Non-matching rules are marked passed, and later rules are greyed out as never reached. If nothing matches, the **default policy** applies.
- The learner reorders rules (up/down buttons, with keyboard), toggles rules on and off, and edits a CIDR or port.
- A **stateless vs stateful** toggle:
  - Stateless: return traffic to an outbound connection is dropped unless you add a broad inbound rule.
  - Stateful: a **connection-tracking table** records the outbound flow, so the return packet matches `ESTABLISHED,RELATED`.
- Presets:
  - **Allow SSH from the office only** (`198.51.100.0/24 → :22`).
  - **The shadowed rule**: a broad DROP above a specific ACCEPT, so the ACCEPT can never match. A static check flags it.
  - **Default-deny web server**: 80/443 open, everything else dropped.
- DROP vs REJECT: drop is silent (the client times out); reject sends an RST or ICMP unreachable (the client fails fast). Each colour shows that on a client lane.
**Out of scope.** Cloud security groups and NACLs (T3 `cloud-networking-vpc`), WAFs and L7 rules (`reverse-proxy-gateway` names them), and NAT tables (`ip-ports`).
**Kit.** `CodePanel` with `stateOf` (now / done / cut / idle per rule) and `renderLine` for columns, `.data-table` (conntrack), `Toggle`, `ScenePicker`, `ChipButton`, `TextField`, `createRecorder`, scene kit `Packet` for the arriving packet.
**AC.**
- Watch: the rule being checked `--hi`, the matching rule `--ok` for ACCEPT and `--bad` for DROP, REJECT `--orange` (the second failure kind), passed rules `--dim`, the shadowed rule flagged `--orange` with a warning chip, a conntrack entry `--info`, and the default policy line `--violet`.
- Misconception: "the most specific rule wins". In iptables-style filtering the first match wins, so order matters.
- Correctness:
  - The rule matcher (CIDR, port ranges, protocol, conntrack state) is pure and tested.
  - First-match semantics are tested against a brute-force "evaluate every rule in order" reference on 500 seeded packets.
  - The shadowing detector is tested: rule j is shadowed if an earlier rule i matches a superset of j's packets with a different action.
  - Stateful return traffic matches only after an outbound flow with the reversed 4-tuple exists.
- Honesty: "Simplified iptables-style model (one chain, the modelled fields only); not a real firewall."
**Phone.** The rule table is wide, so it goes in `WideRegion minWidth={560}` with a `gutter` for the packet. The conntrack table and client lane stack below.

**`packet-capture-debugging` · Network Debugging: tcpdump, Wireshark & traceroute**
Track `net` · *"See what's actually on the wire"* · Builds on: `tcp-udp`, `tls-handshake`, `dns-resolution`, `osi-tcpip-layers`, `firewalls-packet-filtering`
**Spec.**
- A **capture viewer** like Wireshark's three panes:
  - a packet list (time, source, destination, protocol, info);
  - the selected packet's decoded layers (Ethernet, IP, TCP flags, seq/ack);
  - its bytes in a `ByteGrid`, with the selected field highlighted in both panes.
- The learner picks a **mystery** capture and has to diagnose it by choosing the diagnosis chip. Each one teaches the pattern to look for:
  1. **Healthy request**: DNS query/response, SYN, SYN-ACK, ACK, TLS ClientHello…, then data and FIN.
  2. **Port closed**: SYN → RST,ACK immediately ("connection refused").
  3. **Firewall drop**: SYN, SYN retransmitted with growing gaps, then nothing ("timeout", not refused).
  4. **Packet loss**: duplicate ACKs and a retransmission.
  5. **DNS failure**: NXDOMAIN, so no SYN is ever sent.
  6. **TLS failure**: a handshake ending in an alert (named, e.g. `bad_certificate`).
- A **filter** field accepts a small, documented subset of display-filter syntax (`tcp.flags.syn == 1`, `ip.addr == 203.0.113.10`, `dns`). Anything else gets "not supported in this simplified filter".
- A **traceroute** tab: probes with TTL 1, 2, 3… each expire one hop further (ICMP Time Exceeded from that router), giving a hop map with per-hop RTTs. A `* * *` hop shows a router that doesn't answer ICMP, which isn't necessarily broken.
- A tcpdump line view of the same capture shows the equivalent `tcpdump -n host 203.0.113.10` output lines.
**Out of scope.** Decrypting TLS and capturing on real interfaces (the lesson never touches the network), deep protocol dissection beyond the listed fields, and MTR/path MTU internals.
**Kit.** `ByteGrid` (K-8) with `fields`, `SequenceDiagram` (K-14) as a ladder view of the selected stream, `.data-table` (packet list, roving selection), `TextField` (filter, local tested parser over a documented subset), `ChipButton` (diagnoses), `ScenePicker`, `Tray`.
**AC.**
- Watch:
  - the selected packet and field `--hi`;
  - SYN/ACK handshake packets `--info`;
  - RST `--bad`;
  - retransmissions and duplicate ACKs `--orange`;
  - DNS `--violet`;
  - TLS alerts `--bad`;
  - an unanswered traceroute hop `--dim`;
  - the correct diagnosis `--ok`.
- Misconception: "connection refused and connection timed out mean the same thing". A refusal is an RST (something answered); a timeout means silence (usually a drop).
- Correctness:
  - Each fixture capture is generated by a pure builder from a scenario, with valid seq/ack arithmetic (tested: every ACK acknowledges seq + payload length, a SYN consumes one sequence number).
  - TCP flag bits in the bytes match the decoded flags.
  - The IPv4 header checksum in the bytes is valid (tested).
  - The filter parser is tested on its subset and refuses others.
  - Traceroute hop k's reply comes from router k, with TTL k.
- Honesty: "Pre-built captures from a simulated network; addresses are documentation ranges; no real traffic is captured."
**Phone.** The three-pane layout stacks vertically at ≤900. The packet list and `ByteGrid` (8 bytes per row on phones) each sit in a `WideRegion minWidth={480}`.

**`reverse-proxy-gateway` · Reverse Proxies & API Gateways**
Track `arch` · *"One front door for many services"* · Builds on: `load-balancing`, `tls-handshake`, `rate-limiting`, `auth-sessions-jwt`, `client-server`
**Spec.**
- Requests from a client lane enter a **gateway** drawn as a pipeline of stages:
  1. TLS termination: HTTPS outside, plain or mTLS inside, shown on the edge colour;
  2. routing by host and path prefix;
  3. authentication (JWT check);
  4. rate limit (token bucket count);
  5. header rewrite (`X-Forwarded-For`, `X-Request-Id`);
  6. forwarding to one of three services (`/users`, `/orders`, `/static`).
  Each stage lights as the request passes.
- The learner sends preset requests:
  - a valid call;
  - no token → 401 at the auth stage;
  - over the limit → 429 with `Retry-After`;
  - an unknown path → 404 from the router;
  - an upstream down → 502;
  - an upstream slow → 504.
- A routing table (prefix → service) is editable, with a longest-prefix-match demonstration (`/orders/export` vs `/orders`).
- A toggle moves auth out of the gateway into each service, showing duplicated logic, against the "edge does it once" design. A caption notes the trade-off: the services must still not trust the network blindly (link to `zero-trust`).
- A "what the service sees" panel shows the rewritten headers and the client IP arriving via `X-Forwarded-For`, plus the note that it is only trustworthy when set by your own proxy.
**Out of scope.** Load-balancing algorithms (`load-balancing`), rate-limit algorithm details (`rate-limiting`), service meshes (T3 `service-discovery-mesh`), and CDN caching (`cdn-edge`).
**Kit.** Scene kit (`SceneNode`, `Packet` along the stages), `.data-table` (route table), `ConsolePanel` (status lines), `ChipButton`, `Toggle`, `createRecorder`, `CodePanel` (forwarded headers).
**AC.**
- Watch:
  - the request `--info`, the active stage `--hi`, the upstream response `--ok`;
  - 4xx rejections at the edge (401, 404, 429) `--orange`, and 5xx gateway errors (502, 504) `--bad`, as in `http-basics` (its FAMILY_COLOR; corrected 2026-10-07 per review, the earlier text had them swapped);
  - the encrypted edge segment `--violet` and the internal segment `--dim` (or `--violet` when mTLS is on).
- Misconception: "a reverse proxy is the same as a forward proxy" (it acts for the servers, not the clients), or "502 and 504 are client mistakes".
- Correctness:
  - The routing is longest-prefix match, tested.
  - The stage order is fixed, and each preset stops at the right stage with the right status (a table test over all presets).
  - The token bucket reuses `rate-limiting`'s semantics (the 429 appears exactly when the bucket is empty, tested over a seeded burst).
  - `X-Forwarded-For` appends the client address.
- Honesty: "Scripted gateway; services and latencies are simulated."
**Phone.** `StageFrame minWidth={600}` for the pipeline scene. The routing table and header panel sit below as HTML.

---

##### Batch T2-B18 · Runtimes & memory (`lang`)
Wave 6. Uses **`GraphView` (K-6)** or the memory kit for object graphs, **`GanttLanes` (K-13)** for async timelines and **`MemoryMap` (K-15)** for linking-loading. garbage-collection and memory-leaks share an object-graph look. Build both in this batch so they look the same, and file a Phase 2 request if an object-graph helper beyond `HeapObject` + `RefArrow` is needed twice.

**`interpreters-compilers-jit` · Interpreters vs Compilers vs JIT**
Track `lang` · *"Three ways to run code"* · Builds on: `parsing-ast`, `fetch-decode-execute`, `isa-assembly`
**Spec.**
- One function, `sumSquares(n)`, is run three ways in parallel lanes, each with an op counter and an (illustrative) elapsed-time bar:
  1. **Tree-walking interpreter:** a cursor visits AST nodes (from `parsing-ast`'s look) for every operation, every iteration.
  2. **Bytecode VM:** the AST is compiled once into a short stack bytecode (`LOAD`, `MUL`, `ADD`, `JMP_IF`). A program counter steps through it, with a value stack beside it.
  3. **JIT:** it starts in the bytecode VM. A per-function **hotness counter** fills, and at a threshold it compiles to "machine code" (a native-looking listing), after which iterations get cheap. The time bar shows the compile pause and then the faster slope.
- An **AOT compiler** lane is a fourth option: a big upfront compile time, then fast from the start.
- **Deopt preset:** after warm-up, `sumSquares("3")` (a string) invalidates the JIT's "always integers" assumption. Execution falls back to the interpreter, and the bar shows the cliff.
- A "**short script vs long server**" toggle (n = 10 vs n = 1,000,000) shows when JIT warm-up pays off, and when the interpreter wins.
**Out of scope.** Bytecode VM internals (T3 `bytecode-vms`), optimisation passes (T3 `compiler-optimisations`) and WebAssembly (T3).
**Kit.** `TreeSvg` (AST, `tidy`), `CodePanel` ×2 (bytecode and native listing, `active`), `ArrayStrip` (VM value stack), `Bar`, `Segmented`, `Toggle`, `createRecorder`, `core/format`.
**AC.**
- Watch: the node or instruction executing now is `--hi`; the VM stack values are `--info`; the hotness counter is a `--violet` bar; the compile pause is `--orange` (a cost category); native-fast iterations are `--ok`; the deopt flash is `--bad`.
- Misconception: "interpreted languages are always slow and compiled ones always fast", or "the JIT makes the first run faster".
- Correctness:
  - A real tiny tree-walker and a real bytecode compiler + VM for the lesson's expression subset both compute `sumSquares(n)`, and the result equals the closed form n(n+1)(2n+1)/6 for n in 0..200 (tested).
  - The bytecode for the function is pinned in a test.
  - Op counts are counted by the implementations, not typed.
  - The JIT and AOT lanes' timings are a documented cost model (per-op costs as named constants) whose crossover point is tested.
- Honesty: "The interpreter and VM really run; the JIT and machine code are a cost model with illustrative timings, not real compilation."
**Phone.** Lanes stack vertically ≤900px, each collapsed to its counter and bar, with the active lane's detail expandable. The AST sits in a `WideRegion minWidth={360}`.

**`linking-loading` · Compiling, Linking & Loading**
Track `lang` · *"From .c to a running process"* · Builds on: `isa-assembly`, `virtual-memory-paging`, `dependency-management`
**Spec.**
- Three source files (`main.c` calls `area()` from `geom.c`, which calls `printf` from libc) compile into object files. Each object file is a card with **defined symbols** (pegs) and **undefined symbols** (sockets), plus a relocation list: "patch the call at offset 0x12 with the address of `area`".
- **Link:** the linker gathers sections (`.text`, `.data`) into one image, resolves each socket to a peg (an arrow animates), and patches the relocations, so the call addresses fill in on the hex listing.
- Errors as presets:
  - remove `geom.o` from the command line → `undefined reference to 'area'`;
  - define `area` twice → `multiple definition of 'area'`;
  - pass libraries in the wrong order (`-lgeom main.o`), which a static link resolves left to right.
  Each shows the real linker message text.
- **Static vs dynamic** toggle: static copies `printf`'s code into the binary (size bar grows). Dynamic leaves a PLT stub and a `NEEDED libc.so.6` entry, and at run time the **loader** (`ld-linux`) maps `libc.so` and fills the GOT entry the first time `printf` is called (lazy binding).
- **Load:** a `MemoryMap` of the process image: `.text` (r-x), `.data` (rw-), `.bss`, the heap, `libc.so` mapped elsewhere, and the stack. It links to `virtual-memory-paging`.
**Out of scope.** Name mangling, LTO, and symbol versioning (a key-idea footnote at most). The package-manager meaning of "dependency hell" is `dependency-management`'s.
**Kit.** `Box` cards per object file, a local socket/peg rendering using `.scene-edge` and `useArrowMarker`, `ByteGrid` (K-8) for patched call bytes, `MemoryMap` (K-15), `ConsolePanel` (linker messages), `Toggle`, `useScenePicker`, `createRecorder`.
**AC.**
- Watch: defined symbols are `--ok` pegs; unresolved sockets are `--dim`; a socket being resolved is `--hi`; a resolution arrow is `--violet`; patched bytes are `--info`; a link error is `--bad`; a duplicate-definition pair is `--orange` + `--bad` (the second failure kind is orange).
- Misconception: "the compiler finds functions in other files", or "a dynamically linked program contains all the code it runs".
- Correctness:
  - A pure `link(objects, { order, mode })` resolver is tested:
    - every undefined symbol is resolved or reported;
    - duplicates are reported;
    - static-archive left-to-right order is honoured (the wrong-order preset fails, the right order succeeds);
    - relocation = symbol address + addend − place (for PC-relative calls), tested on the preset.
  - The error strings match GNU ld's wording, which is pinned in a test.
- Honesty: "Simplified object files and linker (GNU ld/ELF-style); real binaries have many more sections and relocation types."
**Phone.** Object cards stack in a column ≤900px; the link animation is in a `WideRegion minWidth={480}`; the `MemoryMap` is full width.

**`garbage-collection` · Garbage Collection: Mark-Sweep & Generations**
Track `lang` · *"Who frees the memory you forgot about"* · Builds on: `stack-vs-heap`, `value-vs-reference`, `graph-search`
**Spec.**
- A heap of ~12 objects drawn as an object graph (memory kit `HeapObject` + `RefArrow`), with **roots** on the left: stack variables, globals and registers.
- The learner edits references: click a variable to null it out, drag (or use the keyboard "point to…") to re-point a field, and create objects.
- **Mark-sweep:**
  - Mark floods from the roots in BFS order, with the work list shown as the gray set in tri-colour terms (white, gray, black).
  - Sweep dissolves every white object into the free list.
  - A **cycle preset** (two objects pointing at each other, unreachable from the roots) is collected, which shows why tracing beats naive reference counting (a refcount column shows they'd be stuck at 1).
- A **stop-the-world** timeline (`GanttLanes`): the mutator lane pauses while the GC lane runs, and the pause length scales with live objects.
- **Generational mode:**
  - New objects land in the young generation (a nursery band).
  - A minor GC traces only young objects plus a **remembered set** of old→young pointers. Survivors age, and after 2 survivals they're promoted to old.
  - Most objects die young, so minor GCs are short. A "many short-lived objects" preset shows dozens of tiny pauses vs one long full GC.
- A "**Fragmentation**" toggle on sweep shows free holes; a compacting option slides live objects together and updates the pointers.
**Out of scope.** Reference counting and ownership (T3 `ownership-refcounting`), concurrent and incremental collectors in depth (one caption), and allocators (T3 `memory-allocators`).
**Kit.** Memory kit (`VarSlot`, `HeapObject` with `variant="collectable"`, `RefArrow`, `fanBend`), `GanttLanes` (K-13), `Segmented` (mark-sweep / generational), `Toggle`, `useScenePicker`, `createRecorder`. Layout stays local (a fixed-slot heap). See the batch note on a shared object-graph helper.
**AC.**
- Watch:
  - Roots are `--violet`.
  - Tri-colour: white (not yet seen) is `--dim`, gray (on the work list) is `--hi`, black (marked live) is `--info`.
  - Swept objects are dashed `--bad` and then removed.
  - The young generation band is `--sky` and the old `--amber` (categories).
  - The promoted flash is `--ok`; the pause bars are `--orange`.
- Misconception: "the GC frees objects as soon as you stop using them", or "a reference cycle leaks under a GC".
- Correctness:
  - A pure `mark(heap, roots)` is tested against brute-force reachability (DFS) on every preset and on 500 seeded random heaps; sweep frees exactly the unreachable set.
  - A minor GC with the remembered set marks exactly the young objects reachable from roots or old objects (tested against a full trace restricted to young); without the remembered set, a young object referenced only from old memory is wrongly freed.
  - The pause model is a named constant per live object.
- Honesty: "A simplified collector with illustrative pause times; V8, the JVM and .NET use concurrent and compacting variants of these ideas."
**Phone.** `StageFrame minWidth={560}` for the heap scene; the timeline sits in a `WideRegion` below.

**`memory-leaks` · Memory Leaks in Managed Languages**
Track `lang` · *"Garbage collected doesn't mean leak-proof"* · Builds on: `garbage-collection`, `closures-scope`, `dom-events`, `lru-cache`
**Spec.**
- A simulated single-page app runs for "hours" (a time slider). A `Plot2D` of heap size over time shows the GC **sawtooth**. With a leak, each trough sits higher than the last; without one, the troughs are flat.
- Leak sources as presets, each with its code in a `CodePanel`:
  1. An event listener added on every route change and never removed: `window.addEventListener('resize', onResize)` captures a big component.
  2. An unbounded `Map` cache keyed by request id.
  3. A `setInterval` whose closure holds a detached DOM tree.
  4. A global array of "recent errors" that only grows.
- **Heap snapshot diff:** take snapshot A, use the app, take snapshot B. A table lists object counts by constructor with a "+delta" column. Clicking the biggest delta shows the **retaining path** from a GC root (`window` → listener list → closure → component → 4 MB array) as a highlighted chain.
- **Fix** toggles per leak: `removeEventListener` / `AbortController`, a size-bounded LRU or `WeakMap`, `clearInterval` on unmount, and a capped ring of errors. Each fix flattens the troughs.
- A "**leak vs high usage**" preset: heap is high but flat, which isn't a leak.
**Out of scope.** Native leaks and `malloc`/`free` (`stack-vs-heap`), and GC algorithms (`garbage-collection`).
**Kit.** `Plot2D` (K-12) (`<Curve>`, `<HLine>` for the trough baseline), memory kit (`HeapObject`, `RefArrow`) for the retaining path, `.data-table` (snapshot diff), `CodePanel`, `Toggle`, `useScenePicker`, `useSimulation` (heap growth), `core/format` (`bytes`).
**AC.**
- Watch: the heap curve is `--info`; the rising trough baseline is `--bad` (flat when fixed: `--ok`); GC drops are marked `--dim`; the retaining path is `--hi` arrows from a `--violet` root; leaked objects are `--bad` tint; the fixed line in code is `--ok`.
- Misconception: "a garbage-collected language can't leak memory".
- Correctness:
  - The simulated heap model is tested: with each leak on, the trough after GC k+1 ≥ trough k + the per-cycle leak size; with its fix on, troughs stay within a named tolerance.
  - The retaining path is computed by a BFS from the roots over the model's object graph, and tested to end at the leaked object and start at a root.
  - The snapshot diff equals the count differences between the two model snapshots.
  - `WeakMap` semantics: an entry whose key is unreachable is collectable in the model.
- Honesty: "A simulated app and heap with illustrative sizes. Real snapshots come from Chrome DevTools' Memory panel or `node --inspect`."
**Phone.** The plot fits. The retaining-path diagram is in a `WideRegion minWidth={460}`, and the snapshot table scrolls sideways with a hint.

**`async-await-coroutines` · Promises, async/await & Coroutines**
Track `lang` · *"Suspending without blocking"* · Builds on: `event-loop`, `error-handling-models`, `closures-scope`
**Spec.**
- **Sequential vs parallel:** three fake requests (illustrative 300/500/200 ms) drawn on a `GanttLanes` timeline. The code toggles between:
  - `await a(); await b(); await c();` (1,000 ms in total);
  - `await Promise.all([a(), b(), c()])` (500 ms);
  - a "start them first, then await each" variant (500 ms).
  The total time readout and the bars show the difference.
- **Combinator lab:** each request can be set to resolve or reject at a chosen time. `Promise.all`, `allSettled`, `race` and `any` run on the same three, and the result panel shows what each produces and when it settles:
  - `all` rejects on the first rejection, and the others keep running anyway;
  - `allSettled` always fulfils with statuses;
  - `race` settles with the first settled;
  - `any` fulfils with the first fulfilment, or rejects with an `AggregateError` when all reject.
- **The coroutine as a state machine:** a small `async function checkout()` is shown next to its desugared form: a `switch(state)` with a saved-locals object. Stepping shows the function suspending at each `await`, its locals parked on the heap, control going back to the caller, and resuming in the next state. This is what "suspending without blocking" means.
- **Pitfalls** scene:
  - a forgotten `await` (the error escapes, and an "unhandled rejection" console line appears);
  - `forEach(async …)` not waiting (the "done" line prints before the work);
  - a `try/catch` around a non-awaited promise that doesn't catch.
  Each comes with its fix.
**Out of scope.** Microtask vs macrotask ordering (`event-loop` owns it; one link), threads, actors and CSP (T3 `concurrency-models`), and cancellation in depth (one key idea: `AbortController`).
**Kit.** `GanttLanes` (K-13), `CodePanel` ×2 (async source and desugared state machine, `active`), `ConsolePanel` (output and unhandled-rejection lines), `Segmented`, `ChipButton` (resolve/reject per request), `createRecorder`.
**AC.**
- Watch: request bars are `--info`; awaiting time is hatched `wait`; the current state in the state machine is `--hi`; parked locals are `--violet`; fulfilled is `--ok`, rejected `--bad`, and an unhandled rejection `--bad` in the console; a still-running request after `all` rejected is `--dim` with an outline.
- Misconception: "`await` blocks the thread", or "`Promise.all` cancels the other promises when one fails".
- Correctness:
  - The combinator lab's outcomes are computed by actually running the real `Promise.all/allSettled/race/any` over promises driven by a fake clock in tests: settle time and value for every resolve/reject combination of the three requests (2³ × timing permutations). The lesson model's predictions must match the real outcomes.
  - The desugared state machine, run by hand, produces the same console output as the real `async` function.
  - Sequential total = sum of the durations; parallel = their max (tested).
- Honesty: "Requests are timers with illustrative durations; the promise behaviour itself is real JavaScript."
**Phone.** The timeline is in a `WideRegion minWidth={420}`; the two code panels stack. Fits otherwise.

---

##### Batch T2-B19 · Machines, disks & lifecycles (`os`, `hw`)
Wave 6. Uses **`CellGrid` (K-7)** (flash pages, disk blocks), **`ByteGrid` (K-8)** (an inode's bytes) and **`GanttLanes` (K-13)** (boot timeline, shutdown drain). storage-devices comes before file-systems, so the journal lesson can say why the writes are sequential.

**`virtualization-hypervisors` · Virtualization & Hypervisors**
Track `os` · *"Computers inside computers"* · Builds on: `containers`, `syscalls-kernel-mode`, `interrupts-context-switch` · **[domain review]**
**Spec.**
- A stacked-layer diagram: hardware → hypervisor → guest kernels (two VMs, each with its own kernel and apps). A toggle shows the **containers** stack (one host kernel, isolated processes) beside it, as a one-frame recap of `containers` that then hands off.
- **Trap-and-emulate:**
  - A guest kernel runs a privileged instruction (`cli`, write CR3).
  - The CPU, in guest mode, traps to the hypervisor (a VM exit), which emulates the effect on the guest's virtual CPU state and resumes it (VM entry).
  - Ordinary instructions run directly on the CPU with no trap. A counter splits "direct" from "trapped" instructions.
- **History toggle:**
  - Classic x86 had sensitive instructions that didn't trap (Popek-Goldberg violations).
  - The fixes were binary translation (VMware), paravirtualisation (Xen; the guest calls the hypervisor on purpose) and hardware assist (Intel VT-x / AMD-V).
  - The learner switches between them and sees where each catches the instruction.
- **Type 1 vs type 2:** bare-metal (ESXi, Xen, Hyper-V; KVM noted as "Linux becomes the hypervisor") vs hosted (VirtualBox, VMware Workstation, running on a host OS).
- **Memory and I/O:** guest-physical → host-physical as a second translation (one frame, linked to `virtual-memory-paging`), and a virtio device as a shared queue instead of an emulated NIC. A cost bar shows emulated vs virtio.
- An **overcommit** slider: 4 VMs × 8 GB on a 16 GB host, with a ballooning caption.
**Out of scope.** Container isolation mechanisms (`containers`; T3 `sandboxing-isolation`) and nested page tables in depth (T3 `page-tables-tlb`).
**Kit.** Scene kit (`SceneNode` layers, `Packet` for VM exits/entries), `Toggle`, `Segmented` (technique), `Bar`, `Slider`, `useScenePicker`, `createRecorder`. The layer-stack drawing stays local (§3.1.4 "kept local").
**AC.**
- Watch: the instruction running now is `--hi`; a direct-executed instruction flashes `--ok`; a trap/VM exit packet is `--violet` (structural: a control transfer, not an error); the hypervisor layer is `--info`; guest kernels take `categorical(i)`; an untrapped sensitive instruction (the classic x86 problem) is `--bad`; overcommitted memory beyond physical is `--orange`.
- Misconception: "a VM emulates every instruction in software", or "containers are lightweight VMs".
- Correctness:
  - A pure classifier `handle(instr, technique)` → `direct | trap | translate | hypercall` is tested against a table for every instruction × technique, including the classic-x86 `popf` case (silently ignores the interrupt flag outside ring 0 → `bad` with no assist).
  - The direct/trapped counters equal the classifier's counts over the preset instruction stream.
  - The overcommit ratio is computed from the slider.
- Honesty: "Simplified instruction stream; real VM exits cost hundreds to thousands of cycles (illustrative cost shown)."
**Phone.** `StageFrame minWidth={520}`; the technique picker and toggles wrap above.

**`boot-process` · How a Computer Boots**
Track `os` · *"From power button to login"* · Builds on: `fetch-decode-execute`, `file-systems` (same batch), `processes-threads`
**Spec.**
- A `GanttLanes` boot timeline with one lane per stage. Pressing **Power** plays:
  1. **UEFI firmware:** CPU reset vector → POST and hardware init → reads boot entries from NVRAM.
  2. **Boot manager:** loads the bootloader from the EFI System Partition (a FAT32 partition; the file path `\EFI\...\grubx64.efi` is shown).
  3. **Bootloader** (GRUB or systemd-boot): a menu, then it loads the **kernel** image and the **initramfs** into memory.
  4. **Kernel:** decompresses, initialises memory and drivers, and mounts the initramfs as a temporary root.
  5. The **initramfs** finds and mounts the real root filesystem (or unlocks it), then `switch_root`.
  6. **init**, PID 1 (systemd): starts units in parallel by their dependencies toward `multi-user.target` or `graphical.target`.
  7. A login prompt.
- Each stage hands off to the next with a "who is in control now" chip and "where its code came from": firmware chip, disk partition, RAM.
- The systemd stage expands into a small unit-dependency graph (`GraphView`): network, database and app units starting in parallel where they can. A `systemd-analyze blame`-style table ranks the slowest units.
- **Failure presets:**
  - a missing kernel → a bootloader error;
  - an initramfs without the disk driver → "unable to mount root fs" kernel panic;
  - a failing service → boot continues with it marked failed.
- A **Secure Boot** toggle: each stage verifies the next's signature (shim → GRUB → kernel), and an unsigned kernel is refused.
- A "**Containers and VMs**" note: a VM goes through the same chain with virtual firmware; a container skips everything up to init, and that's why it starts in milliseconds.
**Out of scope.** BIOS/MBR in detail (one legacy toggle caption) and kernel internals.
**Kit.** `GanttLanes` (K-13), `GraphView` (K-6, `layered`) for units, `.data-table` (blame), `Toggle`, `useScenePicker`, `createRecorder`, `ConsolePanel` (boot messages).
**AC.**
- Watch: each stage has a categorical colour; the stage in control is `--hi`; a handoff arrow is `--violet`; a verified signature is `--ok`; a failed stage or panic is `--bad`; a failed unit that boot continues past is `--orange`; stages not reached are `--dim`.
- Misconception: "the operating system starts first and then loads the hardware", or "a container boots a small OS".
- Correctness:
  - The unit start order is a topological order of the dependency graph (tested), with parallel starts only when dependencies allow it.
  - The failure presets stop exactly at the right stage (a pure `bootRun(config)` is tested per preset).
  - With Secure Boot on, an unsigned stage always stops the chain.
  - Stage names and paths are pinned with source notes (UEFI spec; systemd `bootup(7)`).
- Honesty: "A typical Linux on UEFI; timings are illustrative, and firmware and distributions differ."
**Phone.** The timeline is in a `WideRegion minWidth={480}`; the units graph is below it and fits with the `layered` layout at ≤8 units.

**`storage-devices` · How Disks Work: HDD, SSD & NVMe**
Track `hw` · *"Random I/O is the expensive kind"* · Builds on: `memory-hierarchy`, `db-indexes`, `lsm-trees`
**Spec.**
- **HDD scene:**
  - A spinning platter with tracks and a seeking arm, at a 7,200 rpm setting.
  - A request queue reads sectors: each read pays seek time, plus rotational latency (half a rotation on average = 4.17 ms at 7,200 rpm), plus transfer.
  - **Sequential vs random** presets show IOPS (≈100 random vs thousands of sequential sector reads per second) and throughput.
  - An elevator (SCAN) scheduling toggle reorders queued requests to cut seeks.
- **SSD scene:**
  - Flash drawn as a `CellGrid` of erase blocks (rows), each holding pages (cells).
  - Pages are written once. **Overwrites can't happen in place**: an update writes a new page and marks the old one stale.
  - When free blocks run out, **garbage collection** picks a block, copies its still-valid pages elsewhere and erases it.
  - A **write amplification** readout (NAND writes ÷ host writes) climbs under random overwrites at high fill, and stays near 1 for sequential writes.
  - A **TRIM** toggle tells the drive which pages are free and lowers amplification. An over-provisioning slider has the same effect.
- **NVMe:** many parallel queues (up to 64K queues of 64K entries, shown as several lanes) vs SATA/AHCI's single queue of 32. A queue-depth slider shows parallel flash channels filling.
- A summary strip compares the illustrative latencies of an HDD seek, a SATA SSD read and an NVMe read, linking to `memory-hierarchy`, and explains why LSM trees and WALs write sequentially.
**Out of scope.** File-system structures (`file-systems`) and RAID (one key idea at most).
**Kit.** `CellGrid` (K-7) for flash blocks, `useSimulation` (HDD arm and request queue), canvas via `core/canvas` for the platter (`draw.ts`), `Slider` ×2, `Toggle` ×2, `Segmented`, `Stat`, `core/format` (`latency`, `pct`).
**AC.**
- Watch: the request being served is `--hi`; the head/arm is `--info`; valid pages are `--info` tint; stale pages are `--dim` with a strike; free pages are an outline; pages being copied by GC are `--violet`; an erase flash is `--orange`; the write-amplification readout is `--bad` above a named threshold.
- Misconception: "SSDs make random and sequential writes equally cheap", or "an SSD overwrites data in place".
- Correctness:
  - A pure flash translation layer model (greedy GC: pick the block with the fewest valid pages) is tested:
    - no valid page is ever lost (every logical page reads back its latest write over 10,000 seeded operations);
    - write amplification = NAND page writes ÷ host page writes;
    - WA for a purely sequential workload is 1.0;
    - TRIM never increases WA on the same seeded trace.
  - HDD rotational latency = 60/rpm/2 s (4.17 ms at 7,200), tested; SCAN's total seek distance ≤ FCFS's on seeded queues.
- Honesty: "Toy drive sizes and illustrative latencies; real SSD firmware (FTL) is proprietary and smarter."
**Phone.** HDD and SSD scenes are separate (scene picker). The platter canvas uses `StageFrame minWidth={420}`; the flash `CellGrid` fits at `size="sm"`.

**`file-systems` · File Systems: Inodes & Journaling**
Track `os` · *"How files survive a power cut"* · Builds on: `storage-devices`, `command-line`, `file-descriptors`
**Spec.**
- **Structure scene:**
  - The disk is drawn as a `CellGrid` of blocks: superblock, inode table, block bitmap and data blocks.
  - A directory is itself a file: its data block holds `name → inode#` entries. `cat /docs/notes.txt` walks root inode → `/` data → `docs` inode → `docs` data → `notes.txt` inode, whose block pointers lead to the data blocks.
  - An inode's fields (size, mode, link count, timestamps, block pointers) are shown in a `ByteGrid` / field table. The **name is not in the inode**.
- **Links:** `ln notes.txt n2` (a hard link: a second directory entry, the link count becomes 2) vs `ln -s` (a symlink: a new inode holding a path). Deleting the original leaves the hard link working and the symlink dangling. `rm` only unlinks: the data is freed when the link count **and** the open FD count reach 0, which links to `file-descriptors` and the classic "disk full but `du` says otherwise" preset.
- **Crash scene:**
  - Appending a block takes three writes: data, inode and bitmap.
  - **Pull the plug** at any point (a slider over the write sequence). Without a journal, the result is a leaked block, an inode pointing at garbage, or a lost write, each named.
  - With a **journal**, the writes go to the log first, then a commit record, then checkpoint to their real places. Replay after the crash finishes or discards the transaction.
  - Journaling modes picker: `journal` (data and metadata logged), `ordered` (ext4's default: data written before the metadata commits) and `writeback` (metadata only). Each changes what can go wrong.
- An **fsync** toggle: an app writes and the page cache says "done", but power loss before `fsync` loses the write.
**Out of scope.** The page cache and mmap (T3 `mmap-page-cache`), copy-on-write file systems (one key idea: btrfs/ZFS/APFS avoid in-place writes) and RAID.
**Kit.** `CellGrid` (K-7) for disk blocks, `ByteGrid` (K-8) for the inode, `TreeSvg` (directory tree, `tidy`), `Slider` (crash point, with `format`), `Segmented` (journal mode), `Toggle` (fsync, journal), `useScenePicker`, `createRecorder`.
**AC.**
- Watch: the block being written now is `--hi`; inode blocks are `--violet`, data blocks `--info`, bitmap and superblock `--dim` structural; journal entries are `--sky` (a category); the commit record is `--ok`; inconsistent state after a crash is `--bad`; a write that was lost (never fsynced) is `--orange`; a dangling symlink is dashed `--bad`.
- Misconception: "deleting a file erases its data", or "write() returning means the data is on disk".
- Correctness:
  - A pure FS model is tested:
    - path resolution walks the expected inode sequence;
    - the link count matches the number of directory entries;
    - data is freed iff links = 0 and open FDs = 0.
  - The crash model enumerates **every** crash point for each journaling mode, and a test asserts the post-recovery invariants: with `journal` mode there's never an inode pointing at unwritten data; with `ordered` mode, metadata never points at unwritten data; with `writeback` mode, the stale-data case is reachable. These are the documented ext4 semantics (source note: kernel `ext4` docs).
  - Without fsync, the write is lost iff the crash comes before the flush.
- Honesty: "A simplified ext4-like layout; real block and inode sizes and allocation are more involved."
**Phone.** The block grid fits at `size="sm"`; the path walk and directory tree stack vertically; the crash slider is full width. Fits.

**`signals-graceful-shutdown` · Signals & Graceful Shutdown**
Track `os` · *"SIGTERM is a request, SIGKILL is not"* · Builds on: `processes-threads`, `file-descriptors`, `containers`, `load-balancing`
**Spec.**
- A server process with a request lane (`GanttLanes`: in-flight requests as bars), a child worker process, and a load balancer in front.
- **Deploy preset:** the orchestrator sends **SIGTERM**, then a **grace-period countdown** (default 30 s, like Kubernetes `terminationGracePeriodSeconds`; slider), then **SIGKILL**.
- Handler modes:
  1. **No handler:** SIGTERM's default action kills the process at once, and in-flight requests are cut (`--bad` bars), giving 502s at the LB.
  2. **Graceful:** stop accepting (close the listening socket), get removed from the load balancer (its readiness check fails, so no new requests arrive), drain the in-flight requests, close the DB pool, then exit 0 before the deadline.
  3. **Too slow:** draining takes longer than the grace period, so SIGKILL arrives and the remaining requests die.
  4. **PID 1 in a container:** the app runs as PID 1 via a shell `CMD` string. The shell doesn't forward SIGTERM and has no default handler as PID 1, so nothing happens until SIGKILL. Fix: exec form, or a tiny init (`tini`, `--init`).
- **Children and zombies:** the child exits, and without `wait()` it stays a **zombie** (`<defunct>`, its PID held). A SIGCHLD handler that reaps it fixes this. Orphans get re-parented to PID 1.
- A signal table panel: SIGTERM (15, catchable), SIGINT (2, Ctrl-C), SIGKILL (9) and SIGSTOP (19 on x86 Linux; can't be caught or ignored), SIGHUP (1, often "reload config") and SIGCHLD.
**Out of scope.** Health probe configuration (`health-checks`) and deploy strategies (`deployment-strategies`); real-time signals and signal-safety rules (one key idea: do minimal work in a handler and set a flag).
**Kit.** `GanttLanes` (K-13) for requests and the countdown marker, scene kit (`SceneNode` for the LB, process and child; `Packet` for signals), `Segmented` (handler mode), `Slider` (grace, with `format`), `.data-table` (signals), `ConsolePanel` (`ps` output with `<defunct>`), `createRecorder`.
**AC.**
- Watch: in-flight requests are `--info`; requests completed during the drain are `--ok`; requests cut by a kill are `--bad`; SIGTERM packets are `--hi`; SIGKILL is `--bad`; the grace countdown is a `--hi` marker, turning `--bad` at zero; the zombie is `--dim` with a dashed outline; the LB removing the instance is `--violet`.
- Misconception: "SIGTERM kills the process immediately", or "you can catch SIGKILL to clean up".
- Correctness:
  - A pure `shutdown(config)` timeline model is tested:
    - with no handler, all in-flight requests are cut at T;
    - graceful mode cuts none when the drain time ≤ the grace period;
    - too-slow mode cuts exactly the requests still running at T + grace;
    - in the PID 1 shell preset, nothing changes until SIGKILL.
  - The zombie exists iff the child exited and the parent hasn't reaped it.
  - Signal numbers and catchability are pinned in a test with a source note (`signal(7)`, x86/ARM Linux numbering).
- Honesty: "A simulated process and orchestrator; the timings are illustrative, and the signal behaviour follows Linux `signal(7)`."
**Phone.** The timeline is in a `WideRegion minWidth={440}`; the signal table scrolls sideways with a hint; the scene fits.

---

##### Batch T2-B20 · Types & patterns (`lang`, `craft`)
Wave 7. All proven kit. The language-feature claims in this batch are easy to get subtly wrong, so each one names its language explicitly. Every "output" of code in another language (Java, Rust, C#, Kotlin) is a fixed, lesson-authored result, labelled as such. Only JavaScript or TypeScript-as-JavaScript snippets are run, and only in tests. The two pattern lessons share a "call passes through objects" visual. Build it from the scene kit locally in each lesson; it's not a new shared component.

**`generics-polymorphism` · Generics & Parametric Polymorphism**
Track `lang` · *"One function, many types"* · Builds on: `type-systems`, `oop-fundamentals`, `value-vs-reference`
**Spec.**
- **Scene 1 · Why generics.** A `Box` holding values. Three versions are toggled:
  - untyped (`any`/`Object`): a cast at use time fails at runtime when a number was stored
  - one class per type (`IntBox`, `StringBox`): duplicated code is highlighted
  - `Box<T>`: one definition, checked at compile time
- **Scene 2 · Erasure vs monomorphisation.** `List<T>` used with `Integer`, `String` and `Point`.
  - **Java (erasure):** one compiled class; the type arguments are gone at runtime. The fixed demo shows `new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()` → `true`, and that `new T()` and `instanceof List<String>` are rejected by the compiler.
  - **Rust/C++ (monomorphisation):** the template is stamped out once per concrete type, and a "binary size" bar grows per instantiation. The trade-off: faster specialised code, bigger binaries and longer compiles.
  - A note that **C#** keeps type arguments at runtime (reified), and that **TypeScript** erases all types at compile time.
- **Scene 3 · Variance.** Can a `List<Cat>` be used as a `List<Animal>`?
  - The learner tries **read** (`get`) and **write** (`add(dog)`) through the wider type.
  - Covariant read-only use is safe. Writing a `Dog` into a list of cats breaks it.
  - Java generics are invariant, and arrays are covariant: the fixed demo shows `Animal[] a = new Cat[1]; a[0] = new Dog();` compiling and throwing `ArrayStoreException` at runtime.
  - `? extends Animal` allows reads only.
- Constraints chip: `<T extends Comparable<T>>` lets `max(a, b)` call `compareTo`.
**Out of scope.** Inference algorithms (`type-systems`), higher-kinded types and type classes, and C++ template metaprogramming.
**Kit.** `CodePanel` (side-by-side snippets, `stateOf` `bad`), `ConsolePanel` (fixed compiler and runtime outputs), `Bar` (binary size), scene kit (`SceneNode` for stamped-out classes), `Segmented` (language), `Toggle`, `useScenePicker`, `createRecorder`.
**AC.**
- **Watch:**
  - the generic template `--violet`
  - concrete instantiations `--info`
  - a compile-time rejection `--orange` (the earlier, cheaper failure)
  - a runtime exception `--bad`
  - a checked-safe use `--ok`
  - the binary-size bar `--hi` as it grows
- **Misconception:** "generics exist at runtime in every language". In Java and TypeScript they're erased.
- **Correctness:**
  - A data test pins every language claim to one table (erasure: Java, TypeScript; reified: C#; monomorphised: Rust, C++), and the captions are generated from that table.
  - The variance scene's verdict for each (operation × variance) pair is computed and tested over all four combinations.
  - The instantiation counter equals the number of distinct type arguments used.
- **Honesty:** "Java, Rust and C# outputs are fixed, real compiler and runtime results, shown not run; sizes are illustrative."
**Phone.** At ≤ 900px the side-by-side snippets stack vertically. The stamped-out classes are a `WideRegion minWidth={480}`.

**`null-option-adts` · Null, Option Types & Algebraic Data Types**
Track `lang` · *"The billion-dollar mistake, fixed"* · Builds on: `type-systems`, `error-handling-models`, `generics-polymorphism`
**Spec.**
- **Scene 1 · Null.** A chain `user.address.city.toUpperCase()` where any link may be missing.
  - The learner toggles which field is null. In plain JavaScript the fixed program throws `TypeError: Cannot read properties of null` at the matching step, and the dot that crashed is highlighted.
  - Fixes are compared: a ladder of `if` checks, `?.` with `??` (with the result `"unknown"`), and an `Option` chain (`map`/`unwrapOr`).
  - The quote card attributes "billion-dollar mistake" to Tony Hoare (2009 talk).
- **Scene 2 · Option and narrowing.** TypeScript with `strictNullChecks`: `string | null`. The learner inserts or removes an `if (x !== null)` guard, and the checker's verdict on `x.length` flips. It's computed by a tiny lesson narrowing checker over a fixed snippet set.
- **Scene 3 · Sum types and exhaustive matching.** A shape-sorter: a value is one of `Loading | Loaded(data) | Failed(error)` (a payment-status variant is the second preset).
  - The learner switches match arms on and off.
  - A missing arm is flagged at compile time, shown for **Rust** (`non-exhaustive patterns`, a fixed message) and for **TypeScript** (the `never` exhaustiveness check in a `switch`).
  - "Make impossible states impossible": a boolean-flags version (`isLoading`, `error`, `data`) lists 8 combinations, 5 of them nonsense, against 3 variants.
- Links to `error-handling-models` (Result is the same idea for errors).
**Out of scope.** Generics in general (`generics-polymorphism`), monads as a concept, and pattern-matching compilation.
**Kit.** `CodePanel` (`renderLine`, `stateOf` `bad`), `ConsolePanel` (thrown `TypeError` and the fixed compiler messages), `CellGrid` (K-7: the 8-flag-combination table, nonsense rows `--bad` tint), `Toggle`/`ChipButton` (null fields, match arms), scene kit `SceneNode` (shape-sorter slots), `useScenePicker`.
**AC.**
- **Watch:**
  - the current link in the chain `--hi`
  - present values `--info`
  - the null that crashed and nonsense flag combinations `--bad`
  - handled cases and covered arms `--ok`
  - the missing arm flagged by the compiler `--orange` (caught early)
  - unreachable branches `--dim`
- **Misconception:** "optional chaining makes nulls safe". `?.` silences the crash, but the missing value still has to be handled.
- **Correctness:**
  - The null-chain demo is real JavaScript in tests: each toggle combination throws exactly where the caption says, with V8's message prefix. `?.`/`??` gives `"unknown"`.
  - The narrowing checker's verdict for every snippet × guard combination is pinned against `tsc --strict` results, recorded once in a fixture.
  - Exhaustiveness: the missing-arm detector names exactly the uncovered variants for all 2³ arm subsets.
  - The flag table has 8 rows, 5 of them invalid.
- **Honesty:** "Rust and TypeScript compiler messages are fixed, real outputs; the narrowing check is a small model of TypeScript's, for these snippets only."
**Phone.** It fits. The code panels wrap, and the shape-sorter (3-4 slots) is ≤ 360px wide.

**`iterators-generators` · Iterators, Generators & Laziness**
Track `lang` · *"Values on demand"* · Builds on: `functional-programming`, `async-await-coroutines`, `closures-scope`
**Spec.**
- **Scene 1 · Eager vs lazy.** The same pipeline, `range(1, 1_000_000) → map(x²) → filter(even) → take(3)`, as two lanes:
  - **Eager arrays:** each stage builds a whole intermediate array, and the counters show 1,000,000 squared, 1,000,000 filtered and arrays allocated, before `take` keeps 3.
  - **Lazy generators:** `take` pulls, and each value travels through every stage one at a time. The counters stop at 6 values pulled from `range`.
- **Scene 2 · The protocol.** A hand-written iterator object `{ next() }` and a `function*` that does the same. Stepping shows each `next()` call returning `{ value, done }`. The generator's frame pauses at `yield` and resumes, linked to `async-await-coroutines` (the same suspension idea).
  - `for…of` and spread are shown calling `[Symbol.iterator]()`.
  - An "infinite" generator (`naturals()`) is safe with `take` and freezes nothing. The tryThis contrasts it with `[...naturals()]`, which the lesson refuses to run and explains (it would never finish).
- **Scene 3 · Single pass.** Iterating a generator twice yields nothing the second time. A file-lines preset shows why streams are consumed once.
- An options chip notes that ES2025 adds iterator helpers (`Iterator.prototype.map/filter/take`). The lesson writes its own generator functions so every step is visible.
**Out of scope.** Async iterators and streams with backpressure (T4 `backpressure` exists), and reactive streams libraries.
**Kit.** Scene kit (`SceneNode` stations, `Flyer` values travelling between them), `AnimatedValue` counters, `CodePanel` (`active` line for the paused `yield`), `CallStackPanel` (generator frame `waiting` while suspended), `ConsolePanel` (`{ value, done }` results), `Segmented`, `createRecorder`, `useScenePicker`.
**AC.**
- **Watch:**
  - the value currently moving through the pipeline `--hi`
  - stations: map `--info`, filter `--violet`, take `--ok`
  - values the filter drops `--dim`
  - eager intermediate-array counters `--orange` (the costly side) against lazy counters `--ok`
  - the suspended generator frame dimmed (`waiting`)
  - `done: true` `--ok`
- **Misconception:** "lazy evaluation means the work happens later but the same amount of it". With `take`, most of the work never happens.
- **Correctness:**
  - The pipeline's lazy and eager versions return the same 3 values.
  - The pull counts are exact: lazy pulls exactly 6 values from `range` for the default preset. Asserted by running the lesson's generator code in tests with counting wrappers.
  - The `{ value, done }` sequence shown matches real `next()` results for the fixed generator.
  - A second iteration of a spent generator yields `[]`.
- **Honesty:** "Counters come from running the pipeline; the million-item eager lane is counted, not animated item by item."
**Phone.** The two lanes stack vertically at ≤ 900px, and each lane (4 stations) fits at 390 with stations at 72px. The code and stack panels sit below.

**`creational-structural-patterns` · Design Patterns: Factory, Builder, Adapter, Decorator**
Track `craft` · *"Named solutions for making and composing objects"* · Builds on: `oop-fundamentals`, `closures-scope`, `functional-programming`
**Spec.**
- A pattern picker; each pattern is a problem first, then the pattern as the fix.
  - **Factory:** code with `new StripeClient()`, `new PaypalClient()` scattered over 4 call sites. The learner adds a payment provider and every call site lights as a change. With `createPaymentClient(config)`, adding one lights a single place.
  - **Builder:** a constructor with 7 positional options (`new Request(url, 'GET', null, true, 3, 5000, false)`), with the meaning of each argument hidden until hovered. The builder version reads step by step and validates at `build()`. A side note says that in JavaScript an options object often does the same job, so the pattern is a choice, not a rule.
  - **Adapter:** a socket diagram. A legacy `XmlWeather.fetchReport()` doesn't fit the app's `WeatherSource.current()`. An adapter object converts the shape, and the call passes through it and returns the converted data.
  - **Decorator:** a core `fetchUser` wrapped in layers the learner stacks and reorders: logging, caching, retry, timing.
    - A call travels inward through each layer and the response travels back out. Each layer reports its effect.
    - Reordering changes behaviour: caching outside retry means a cache hit never retries, and logging inside the cache hides hits.
- A "recognise it" strip names where each pattern shows up in real frameworks: Express middleware (decorator-like chaining), React higher-order components, `Array.from` as a factory.
**Out of scope.** Behavioural patterns (`behavioral-patterns`), dependency injection containers (`dependency-injection`), and Singleton (mentioned only as a global-state warning in a key idea).
**Kit.** Scene kit (`SceneNode` layers, `Packet` for the call going in and out), `CodePanel` (call sites with `stateOf` for changed lines; `renderLine` for hidden argument meanings), `ChipButton` (add a layer), reorder via up/down buttons (keyboard path; no drag-only), `ConsolePanel` (each layer's log), `useScenePicker`, `createRecorder`.
**AC.**
- **Watch:**
  - the call travelling in `--info`, the response travelling out `--ok`
  - the layer currently handling it `--hi`
  - call sites a change touches `--orange`
  - an adapter's converted shape `--violet`
  - a cache hit short-circuiting `--ok`
  - layers not reached `--dim`
- **Misconception:** "a decorator is just a subclass". It wraps an object of the same interface at runtime and can be stacked and reordered; inheritance fixes the order at compile time.
- **Correctness:**
  - The decorator stack is real JavaScript in tests: for every ordering of the 4 layers (24 permutations), the log sequence and the number of core calls under a fixed failure script match what the frames show.
  - The factory scene's touched-site count is computed from the code model (4 vs 1).
  - The builder's `build()` rejects the same invalid combinations the caption lists.
- **Honesty:** "Framework examples are simplified sketches."
**Phone.** The decorator layers are concentric boxes in a `WideRegion minWidth={460}`. Code panels wrap. The adapter socket diagram fits.

**`behavioral-patterns` · Design Patterns: Strategy, Observer, Command, State**
Track `craft` · *"Patterns for how objects talk and behave"* · Builds on: `oop-fundamentals`, `closures-scope`, `dom-events`, `memory-leaks`
**Spec.**
- **Strategy:** a checkout with a shipping-cost `switch` that grows a branch per carrier. The learner swaps in strategy objects or functions from chips (standard, express, free-over-50) at runtime, and the same order is priced live. Adding a carrier touches one new strategy, not the `switch`.
- **Observer:** a subject (a price feed) and subscribers (chart, alert, log) that the learner attaches and detaches. Each `notify` fans out as packets to the current subscribers.
  - The **forgotten unsubscribe** preset unmounts the chart component without detaching it. The subject keeps notifying a dead subscriber, and the retained-object count climbs (link to `memory-leaks`).
  - A note says `dom-events`' `addEventListener` is the same pattern.
- **Command:** a drawing editor's actions as command objects on an undo stack. The learner draws, moves and deletes, then presses Undo and Redo, which pop and replay commands. A new action after an undo clears the redo stack. The queue view shows commands that could also be logged or sent to a server.
- **State:** a media player's states (Stopped, Playing, Paused, Buffering) as a state diagram. Pressing play, pause, stop and "network drop" moves the current state; invalid presses in a state are greyed and explained.
  - A toggle shows the same logic as nested `if (isPlaying && !isBuffering…)` flags.
  - A counter shows the flag version allows 16 combinations, of which 4 are valid states.
**Out of scope.** Creational and structural patterns (`creational-structural-patterns`), event buses and pub/sub across services (`message-queues`), and Redux-style state stores (`frontend-state-management`).
**Kit.** `GraphView` (K-6) state-diagram mode (`startNode`, `edgeMark` for the taken transition), scene kit (`SceneNode`, `Packet` for notifications), `CallStackPanel`-style list via `Tray` for the undo and redo stacks (`Tray stack`), `ChipButton` (strategies, subscribers, actions), `CodePanel`, `CellGrid` (K-7: the 16-combination flags table), `AnimatedValue`, `useScenePicker`.
**AC.**
- **Watch:**
  - current state, the chosen strategy and the command being applied `--hi`
  - notifications travelling `--info`
  - live subscribers `--ok`
  - a dead-but-still-subscribed component and invalid flag combinations `--bad`
  - undo stack `--violet`, redo stack `--sky`
  - unavailable actions `--dim`
- **Misconception:** "observers clean themselves up". A subscriber stays referenced, and keeps getting called, until it unsubscribes.
- **Correctness:**
  - The undo/redo model is tested against a reference over 500 seeded action sequences: state after undo-all equals the initial state, and the redo stack clears on a new action.
  - The state machine rejects exactly the invalid (state, event) pairs listed, exhaustively.
  - The flags table has 16 rows and 4 valid.
  - The observer notify count equals the number of subscribed listeners per event, including the leaked one.
  - The strategy prices match a reference price function for all carriers × 20 order totals.
- **Honesty:** "Scripted editor and price feed."
**Phone.** The state diagram is a `WideRegion minWidth={440}`. Observer fan-out (≤ 4 subscribers) fits at 390. The undo and redo trays stack.

---

##### Batch T2-B21 · Testing & change (`craft`)
Wave 7. Exercises **`GraphView`** (K-6) on a dependency graph and a build DAG, and **`CellGrid`** (K-7) as a pass/fail strip. Batch-wide rule:
- Every "the tests still pass" or "the test now fails" claim comes from actually running fixed, lesson-authored JS functions and tests inside the stage (a tiny hand-written assertion runner, no `eval` of learner input), and the Vitest suite runs the same snippets.
- The learner picks among pre-written code variants; they never type code that runs.

**`test-doubles` · Mocks, Stubs, Fakes & Spies**
Track `craft` · *"Swap real dependencies for stand-ins you control"* · Builds on: `test-pyramid`, `debugger-tools`
**Spec.**
- A `checkout(cart)` function drawn as a dependency graph: `PaymentGateway`, `TaxService`, `EmailSender`, `Clock`. Each dependency node has a picker: real, stub, fake, mock or spy.
- **Run the test:** call arrows light up as each call is made, and the run shows the time taken, network (yes or no), whether it's deterministic, and the result.
  - A real gateway is slow and "flaky" (scripted, labelled).
  - A stub returns a canned value.
  - A fake keeps an in-memory ledger.
  - A mock records the calls and verifies "charged once with 42.00".
  - A spy wraps the real thing and records calls.
- **Bug presets** let the learner plant a bug and see which test configuration still catches it:
  - Email never sent: only a mock or spy on `EmailSender` catches it.
  - Tax rounding wrong: a stub with the right value hides it.
  - Charging twice: a mock catches it.
- **Over-mocking scene:** the same test with everything mocked passes even after a planted real integration bug (wrong currency field name). The test proves only that the code calls its mocks.
**Out of scope.** Contract tests between services belong to T3 `contract-testing`. DI wiring belongs to `dependency-injection`; here the doubles are passed as parameters.
**Kit.** `GraphView` (K-6, `layout="fixed"`, `nodeMark`, `edgeMark`, `onNodeClick`), `Segmented` per dependency (or a `ChipButton` row), `CodePanel` (test code with `renderLine`), `ConsolePanel` (test runner output), `ChipButton` (bug presets), `createRecorder`.
**AC.**
- Watch:
  - The call in flight is `--info` and the function under test `--hi`.
  - Real dependencies are `--violet` and doubles `--sky`. Double kinds are told apart by their badge text, not by colour.
  - Passing test output is `--ok` and failing `--bad`. A planted bug that escapes is shown as `--bad` "shipped".
- Misconception: "a mock and a stub are the same thing", or "more mocking means better unit tests".
- Correctness:
  - The bug × double matrix (3 bugs × the double choices per dependency) is computed by really running the lesson's JS checkout and test against each configuration, and a Vitest test asserts every cell of the matrix the stage shows.
  - The over-mocked suite passes with the integration bug present.
  - The caption says "caught" only when the run actually failed (AC-0/T2 #1).
- Honesty: "The 'real' payment gateway is simulated: its latency and failures are scripted."
**Phone.** The graph goes in `WideRegion minWidth={520}`. The code and console stack underneath.

**`tdd` · Test-Driven Development**
Track `craft` · *"Red, green, refactor. Repeat"* · Builds on: `test-pyramid`, `debugging-method`
**Spec.**
- A red/green/refactor wheel beside a test list and a code panel, stepping through a FizzBuzz-then-"Bazz for 7" kata.
- Each step, the learner chooses the next move from 2-3 options:
  - "write a failing test for 3 → Fizz"
  - "write all of FizzBuzz now"
  - "refactor while red"
- The good moves advance the wheel. A bad move shows its consequence: code written without a failing test is untested, and the coverage of behaviour drops; refactoring while red loses track of which change broke what.
- Each code version is fixed lesson-authored text. The test list runs against it live: tests go red or green and the wheel's colour follows.
- **"Change request" scene:** add 7 → Bazz. In the TDD version the tests pin the behaviour and the change is safe. In a test-after version with a gap, the regression slips by.
- A counter tracks cycle length (steps per red→green); small steps are the point.
**Out of scope.** Property-based testing and shrinking belong to T3 `property-based-testing`. Mutation testing belongs to T3.
**Kit.** `CodePanel` (`stateOf` for changed lines), `ConsolePanel` (test results), `ChipButton` (move options), `createRecorder` or a local state machine, `Box`, an SVG wheel (local, three arcs; one user).
**AC.**
- Watch: the red phase arc and failing tests are `--bad`, green and passing tests `--ok`, refactor `--info`, the current phase `--hi` ring, a changed code line `--hi` tint, and an untested behaviour flag `--orange`.
- Misconception: "TDD means writing all the tests first", or "TDD is about testing, not design".
- Correctness:
  - Every code version × test list result shown on screen is asserted by running the same functions in Vitest.
  - The "refactor" versions are asserted output-identical to their predecessor over n = 1..105.
  - The test-after gap preset is asserted to let the 7 → Bazz regression pass.
- Honesty: "A scripted kata: the code versions are pre-written, but the tests really run against them."
**Phone.** The wheel shrinks above the panels. Code and tests stack at ≤ 900px. It fits at 390.

**`flaky-tests` · Flaky Tests & Determinism**
Track `craft` · *"A test that sometimes fails is a test nobody trusts"* · Builds on: `test-pyramid`, `race-conditions`, `time-and-timezones`, `ci-pipelines`
**Spec.**
- A test suite run 100 times, drawn as a 10×10 pass/fail strip. The learner presses **Run ×100**, and the cells fill in.
- Four planted sources of flakiness, each with its own fix toggle:
  - `sleep(100)` waiting for an async job, fixed by awaiting the promise or polling a condition.
  - A shared mutable fixture between tests plus random test order, fixed by a fresh fixture per test.
  - The real clock (a test fails near midnight or at a DST change), fixed by injecting a fake clock.
  - Unseeded randomness, fixed by a seed.
- Each fix raises the pass rate. A "retry until green" toggle hides failures (the strip goes green), but a "real bugs hidden" counter climbs, because one preset has a genuine race that retries also mask.
- Clicking a failing cell shows that run's seed and the reason it failed, which leads into "reproduce with this seed".
- A quarantine lane moves known-flaky tests aside with an owner tag.
**Out of scope.** Deterministic simulation testing belongs to T4 `deterministic-simulation-testing`. Test types and the pyramid belong to `test-pyramid`.
**Kit.** `CellGrid` (K-7, 10×10, `onCellClick` with roving tabindex), `Toggle` (per fix), `Bar` (pass rate), `ConsolePanel` (failure detail), `core/random` `mulberry32` (each run's seed), `Segmented`.
**AC.**
- Watch: passing runs are `--ok`, failing runs `--bad`, runs that went green only after a retry `--orange` (a second failure kind), the selected run a `--hi` ring, and quarantined tests `--dim`.
- Misconception: "re-running until it passes fixes a flaky test".
- Correctness:
  - The flakiness model is pure (`sim.ts`). With every fix on, 1,000 seeded runs pass 100%.
  - Each source alone produces a failure rate within ±3 percentage points of its stated rate over 10,000 seeded runs.
  - The retry toggle never lowers the "real bugs hidden" count.
  - The failure reason shown for a cell is the one the model recorded for that seed.
- Honesty: "Simulated test runs; failure rates are illustrative."
**Phone.** The 10×10 `CellGrid` (`size="sm"`) fits at 390. The toggles wrap underneath.

**`refactoring-code-smells` · Refactoring & Code Smells**
Track `craft` · *"Change the structure, never the behaviour"* · Builds on: `code-review`, `functional-programming`, `test-pyramid`
**Spec.**
- A 40-line "smelly" order-pricing function with smells highlighted inline: long function, duplicated discount branch, magic number `0.0725`, a boolean flag argument, a long parameter list, a mysterious name `calc2`.
- Clicking a smell offers the matching refactoring: Extract Function, Replace Magic Number with Constant, Rename, Introduce Parameter Object, Replace Flag with Two Functions, Consolidate Duplicate Branches.
- Applying a refactoring swaps in the next lesson-authored version, diff-highlighted. A test badge re-runs the 12 characterization tests against it and stays green.
- **"Unsafe edit" chip:** a tempting change that alters behaviour ("fix" the rounding while extracting). The badge goes red, which teaches "refactor and behaviour change are separate commits".
- A metrics strip shows function length, nesting depth and duplicated lines dropping.
- The order of refactors is the learner's choice. Every path ends at the same clean version, because each version is keyed by the set of refactors applied.
**Out of scope.** Deciding when debt is worth paying belongs to T3 `technical-debt`. Automated codemods and ASTs belong to `parsing-ast`.
**Kit.** `CodePanel` (`renderLine` for smell underlines, `onLineClick` to pick a smell, `stateOf` for changed lines), `ChipButton` (refactorings), `ConsolePanel` (test results), `Stat` (metrics), `useScenePicker`.
**AC.**
- Watch: smell underlines are `--orange` (a category of concern, not a failure), the selected smell `--hi`, changed lines a `--info` tint, the test badge `--ok` when green and `--bad` when red, and removed lines `--bad` in the diff.
- Misconception: "refactoring means rewriting it better, including fixing bugs as you go".
- Correctness:
  - Every reachable version (all 2⁶ refactor subsets that the spec allows) is real JS that Vitest runs through the 12 characterization tests plus 500 seeded orders, giving output identical to the original.
  - The unsafe edit is asserted to differ on at least one characterization test.
  - The metric numbers are computed from the version's text (line count, max indent depth), not typed in.
- Honesty: "The code versions are pre-written; the tests really run against each one."
**Phone.** At 390 the code panel scrolls sideways in its own `WideRegion minWidth={460}` (40 short lines). Metrics and chips wrap underneath.

**`build-systems` · Build Systems & Incremental Builds**
Track `craft` · *"Rebuild only what changed"* · Builds on: `ci-pipelines`, `topological-sort`, `linking-loading`, `hashing-encryption`
**Spec.**
- A target DAG of about 12 nodes: source files → compiled objects/modules → two libraries → an app and a test binary. Nodes are laid out with the `layered` layout.
- The learner clicks a file to edit it. Only the nodes that can reach it in reverse light up "to rebuild", and they rebuild in topological order with parallel lanes, counting the time saved against a clean build.
- **Cache key panel:** each target's key is a hash of its inputs' hashes plus its command (real SHA-256 via `sha256Hex`, shortened).
  - A **comment-only edit** changes the file's hash. Its object is rebuilt, but the object's output hash is unchanged, so downstream targets are cache hits (early cutoff).
  - A **remote cache toggle** serves hits from a teammate's build.
- **Hermeticity break preset:** a target reads the current time or an undeclared env var. Two "identical" builds give different outputs, and the cache is shown to be poisoned.
- **Missing-dependency preset:** an undeclared header edit doesn't trigger a rebuild, and the app ships stale.
**Out of scope.** Linking itself belongs to `linking-loading`. CI job graphs belong to `ci-pipelines`. Monorepo tooling choices belong to T3 `monorepo-polyrepo`.
**Kit.** `GraphView` (K-6, `layout="layered"`, `nodeMark`, `onNodeClick`), `GanttLanes` (K-13) for the build timeline, `core/crypto` `sha256Hex` + `useAsyncValue`, `Toggle`, `ChipButton`, `Stat`, `createRecorder`.
**AC.**
- Watch: the edited file is `--hi`, targets to rebuild `--info`, a target building now `--hi`, cache hits `--ok`, up-to-date targets `--dim`, a stale output `--bad`, and a poisoned cache entry `--orange`.
- Misconception: "an incremental build just recompiles the files with newer timestamps".
- Correctness:
  - The rebuild set equals the reverse-reachable set from the edited node, minus early-cutoff hits, for every node of the preset DAG and for 200 seeded DAGs.
  - The build order is a valid topological order.
  - The cache key is a deterministic function of declared inputs only (tested).
  - The comment-only edit is asserted to stop at the object.
  - The missing-dependency preset is asserted to skip the needed rebuild.
- Honesty: "Build times are illustrative; the hashes are real SHA-256 of the shown inputs."
**Phone.** The DAG goes in `WideRegion minWidth={620}`. The Gantt and cache panel reflow underneath.

---

##### Batch T2-B22 · Structuring code (`craft`, `arch`)
Wave 7, beside B21: `test-doubles` and `dependency-injection` cross-reference each other, so they ship in the same wave. Pilots **`GraphView`** (K-6) with learner-editable module graphs. The same batch-wide rule as B21 applies: any "still works" claim comes from running fixed lesson-authored JS.

**`coupling-cohesion` · Coupling & Cohesion**
Track `craft` · *"Things that change together should live together"* · Builds on: `reading-codebases`, `oop-fundamentals`
**Spec.**
- About 14 functions from a small shop app (`priceCart`, `applyCoupon`, `sendReceipt`, `formatEmail`, `chargeCard`, …) laid out in three module boxes, with call and data-dependency edges between them.
- The learner moves a function to another module by drag, or with the keyboard: select, then pick a module. A live score shows:
  - **coupling:** edges crossing module boundaries;
  - **cohesion:** the share of each module's edges that stay inside it.
- **Change-request chips** ("change the coupon rules", "switch email provider") light up the set of functions that must change together. The modules touched are counted; a good layout touches one.
- Presets: "by layer" (controllers/services/utils), which scatters each change across all modules, and "by feature", which keeps changes local.
- A "god module" preset puts everything in one box: no coupling, but every change touches the same giant module.
**Out of scope.** Service boundaries belong to `monolith-microservices`. Bounded contexts belong to T3 `domain-driven-design`.
**Kit.** `GraphView` (K-6, `layout="fixed"` with group boxes drawn as an overlay, `onNodeClick`, `editable` off; moving a node is a lesson action), `Stat`, `Bar`, `ChipButton` (change requests and presets), `Segmented` (target module for keyboard moves).
**AC.**
- Watch:
  - Module boxes use categorical tokens (`--sky`, `--amber`, `--violet`).
  - The selected function is `--hi`.
  - Edges inside a module are `--dim`, edges crossing boundaries `--orange` (a cost category; the score itself uses `--ok`/`--bad` as the cheap/costly side).
  - Functions in the current change set are an `--info` ring.
- Misconception: "low coupling means fewer, bigger modules".
- Correctness:
  - The coupling and cohesion formulas are pure and tested on each preset with hand-computed values.
  - "Modules touched per change request" is tested for every preset × request.
  - The score updates exactly by the edges that changed when a function moves (a property test over random moves).
- Honesty: "A toy codebase; the scores are simple edge counts, not a standard metric."
**Phone.** The graph goes in `StageFrame minWidth={560}`. Score and chips wrap underneath.

**`solid-principles` · SOLID Principles**
Track `craft` · *"Five rules for code that bends instead of breaks"* · Builds on: `oop-fundamentals`, `coupling-cohesion`
**Spec.**
- A principle picker (S, O, L, I, D) over one evolving codebase: a report generator, shown as a small class diagram plus code.
- For each principle, the learner applies a **change request**, first against the violating design and then against the fixed one. A ripple animation marks every class that has to change, and a counter compares the two.
  - **S:** "change the PDF layout" touches the class that also computes totals.
  - **O:** "add a CSV export" edits a growing `switch`, compared with adding a new `Exporter` class.
  - **L:** a `ReadOnlyFile extends File` whose `write()` throws. A function written for `File` is run against each subclass for real, and the substitution breaks.
  - **I:** a fat `Printer` interface forces a `SimpleScanner` to stub out five methods.
  - **D:** the report depends on a concrete `MySqlRepo`, compared with an interface. Shown briefly and handed to `dependency-injection`.
- Each principle has a "when it's overkill" note: a 20-line script doesn't need five interfaces.
**Out of scope.** DI containers and wiring belong to `dependency-injection`. Design patterns belong to the two patterns lessons (B20).
**Kit.** `GraphView` (K-6, boxes as class nodes, `layout="fixed"`, `nodeMark`), `CodePanel`, `ConsolePanel` (the L demo's real run), `useScenePicker` (principle), `Toggle` (violating/fixed), `Stat`.
**AC.**
- Watch: classes that must change are `--bad` (the costly side) in the violating design and `--ok` (left alone) in the fixed one, the class being edited is `--hi`, interfaces `--violet`, and the inheritance edges `--info`.
- Misconception: "SOLID means every class needs an interface", and for L, "a subclass is fine as long as it compiles".
- Correctness:
  - The changed-class sets per principle × design are data that a test checks against the code variants (each variant's files are listed and diffed).
  - The L scene's failure is a real thrown `TypeError`, run in Vitest from the same lesson-authored code.
- Honesty: "Each design is a small hand-written example; the ripple counts are the files each change touches in it."
**Phone.** The diagram goes in `WideRegion minWidth={500}`. The code panel stacks below. The picker is a `Segmented` that wraps.

**`dependency-injection` · Dependency Injection & Inversion of Control**
Track `craft` · *"Don't build your dependencies. Ask for them"* · Builds on: `solid-principles`, `test-doubles`, `oop-fundamentals`
**Spec.**
- **Scene 1:** `OrderService` calls `new PostgresRepo()` and `new SmtpMailer()` inside its constructor. The object graph shows the hard-wired edges.
  - "Write a unit test" fails to isolate: the test needs a real DB, and the run is red with "connection refused" (scripted).
  - A refactor toggle switches to constructor injection. The test now passes a fake repo and a spy mailer and goes green.
- **Scene 2, composition root:** a `main()` assembles the graph by hand. The learner swaps the implementation chosen for an interface (Postgres, in-memory; SMTP, console), and arrows re-point without `OrderService` changing.
- **Scene 3, a tiny container:** registrations (`Repo → InMemoryRepo`, lifetimes singleton or transient) resolve the graph automatically.
  - The learner toggles lifetimes and watches instance counts.
  - A circular-dependency preset (A needs B needs A) makes resolution fail with the cycle highlighted.
- A "service locator" comparison chip shows the hidden dependency: the constructor looks clean, but the class reaches into a global registry.
**Out of scope.** The kinds of test double belong to `test-doubles`. Architecture-level dependency direction belongs to `layered-hexagonal`.
**Kit.** `GraphView` (K-6, `layout="layered"`, `edgeMark` for re-pointed edges, cycle `--bad`), `CodePanel`, `ConsolePanel`, `Toggle`, `Segmented`, `ChipButton`, `useScenePicker`.
**AC.**
- Watch:
  - The class being resolved or constructed is `--hi` and injected edges are `--info`.
  - Hard-wired `new` edges are `--orange` (a design cost), a resolution cycle `--bad`, and doubles `--sky`.
  - Singleton instances carry a shared badge in `--violet`.
- Misconception: "dependency injection needs a framework".
- Correctness:
  - The mini container is pure (`model.ts`). Resolution order is topological, cycle detection is tested on the preset, and singleton vs transient instance counts are asserted.
  - The hard-wired and injected test runs execute the same lesson-authored JS in Vitest with the results shown.
- Honesty: "The database is simulated; 'connection refused' is scripted."
**Phone.** The graph goes in `WideRegion minWidth={520}`. Code and console stack underneath.

**`layered-hexagonal` · Layered & Hexagonal Architecture**
Track `arch` · *"Keep the business logic away from the plumbing"* · Builds on: `dependency-injection`, `coupling-cohesion`, `client-server`
**Spec.**
- **Layered view:** controller → service → repository → DB as horizontal bands, with dependency arrows pointing down. The domain rule "orders over $500 need approval" lives in the service.
- **Hexagon view:** the same app redrawn with the domain at the centre. Ports (`OrderRepository`, `PaymentPort`, `Notifier`) sit on the edges, and adapters (Postgres, Stripe-like gateway, HTTP controller, CLI, in-memory) plug in outside.
- **Swap an adapter:** the learner picks Postgres → in-memory, or HTTP → CLI driver. The adapter slides out and a new one slides in. Dependency arrows from adapters always point inward, and the domain's file list is shown unchanged ("0 domain files changed").
- **Violation preset:** the domain imports the ORM directly. An inward-arrow checker flags the outward arrow, and swapping the DB now forces domain edits (the counter jumps).
- A test-speed strip compares domain tests that need no DB (milliseconds) with integration tests through adapters (illustrative).
**Out of scope.** Service splits belong to `monolith-microservices`. Bounded contexts and aggregates belong to T3 `domain-driven-design`.
**Kit.** `GraphView` (K-6, `layout="fixed"` with hexagon and band overlays drawn locally), `Segmented` (adapter pickers), `Toggle` (layered/hexagon), `Stat`, `CodePanel` (import lines), `useScenePicker`.
**AC.**
- Watch:
  - The domain core is `--violet` (structural), ports `--info`, adapters in categorical tokens (`--sky`, `--amber`), and the adapter being swapped `--hi`.
  - An outward-pointing (forbidden) dependency is `--bad`, and the changed-files counter is `--ok` at 0 or `--bad` above 0.
- Misconception: "hexagonal architecture means more layers", or "the domain should know which database it uses".
- Correctness:
  - The dependency-direction checker is pure: it takes the import edges and a ring assignment and returns violations. It's tested on both presets.
  - The changed-files count per swap is computed from each variant's file list (tested).
  - The domain module's lesson-authored code passes its tests with both repository adapters (Vitest runs them).
- Honesty: "A small hand-written app; test timings are illustrative."
**Phone.** The hexagon goes in `StageFrame minWidth={540}`. Pickers wrap underneath.

**`architecture-diagrams-c4` · Architecture Diagrams & the C4 Model**
Track `craft` · *"Zoom levels for systems"* · Builds on: `client-server`, `monolith-microservices`, `layered-hexagonal`
**Spec.**
- One system, "Book a table", shown at the four C4 zoom levels with a zoom control (`Segmented`, plus clicking a box to zoom into it):
  1. **Context:** people and external systems.
  2. **Container:** web app, API, DB, queue, each with its technology.
  3. **Component:** the inside of the API.
  4. **Code:** one component's classes.
- Zooming animates the chosen box expanding into the next level, with a breadcrumb.
- **Audience picker:** exec, new engineer, on-call. It highlights the level that answers that audience's question, and dims detail they don't need.
- **"Bad diagram" fixer:** a diagram with unlabelled arrows, mixed levels (a DB table next to a whole system) and no legend. The learner ticks fixes (label every arrow with intent and protocol, keep one level per diagram, add a key), and a "readability checklist" scores each step.
- Notation notes: C4 is notation-independent; boxes plus labelled arrows are enough.
**Out of scope.** Design docs, RFCs and ADRs belong to T3 `design-docs-rfcs`. Deployment diagrams are one key idea only.
**Kit.** `GraphView` (K-6, `layout="fixed"`, box nodes, edge labels, `onNodeClick` to zoom), `Segmented`, `ChipButton` (fix toggles, with `onStyle="solid"`), `Stat`, `useScenePicker`, a crumb row (local).
**AC.**
- Watch:
  - People nodes are `--sky`, the system in focus `--hi`, external systems `--dim`, containers `--info`, and components `--violet`.
  - Arrows are `--line-2` with labels in the default text colour.
  - Checklist items not yet fixed are `--orange`, and fixed ones `--ok`.
- Misconception: "one detailed diagram should show everything".
- Correctness:
  - The four levels are one nested model (`model.ts`). Every element at level n+1 has a parent at level n (tested).
  - Each zoom shows exactly its parent's children.
  - The checklist score is computed from the diagram model's properties (every edge labelled, a single level, a legend present).
- Honesty: "A made-up system."
**Phone.** `StageFrame minWidth={560}` for the diagram. Picker and checklist wrap.

---

##### Batch T2-B23 · Data models & queries (`data`)
Wave 8. Exercises **`GanttLanes`** (K-13) as a query waterfall (orm-n-plus-one), which `graphql` (B24, same wave) reuses. Batch-wide correctness rule:
- Every SQL result on screen is produced by the lesson's own small, pure evaluator over fixed tables. Lessons can't import SQLite at runtime.
- Vitest checks each preset query against real SQLite through `node:sqlite` (`DatabaseSync`; available without a flag on the repo's Node 24, and verified to run window functions).
- `sql-basics`' existing test uses a hand-written reference instead. The real-SQLite check is new and stronger, and B23 sets the precedent for it.

**`relational-algebra` · The Relational Model & Algebra**
Track `data` · *"SQL is set maths"* · Builds on: `sql-basics`, `sets-functions`, `er-data-modeling`
**Spec.**
- Two or three small relations (Students, Courses, Enrolments) as tables. An operator palette offers σ select, π project, ⋈ natural join, ∪ union, − difference, × product and ρ rename.
- The learner builds an expression tree by picking operators and their inputs and conditions from menus. Rows animate through each operator node: σ filters rows out, π drops columns and **collapses duplicates** (set semantics), and ⋈ pairs matching rows.
- The equivalent SQL is generated beside it. A **bag vs set toggle** shows that SQL's `SELECT` keeps duplicates unless you say `DISTINCT`, while the algebra never has them.
- **Equivalence panel:** σ pushed below ⋈ gives the same result with smaller intermediate tables, and the intermediate row counts are shown. This previews why optimisers rewrite queries.
- Presets: "students in a course taught by X", "students in no course" (difference), and "cross product explosion" (× without σ).
**Out of scope.** Physical join algorithms belong to T3 `join-algorithms`. Cost-based planning belongs to T3 `query-planning`. Outer joins belong to `sql-basics`.
**Kit.** `TreeSvg` (`tidy`, expression tree, `renderNode` for operator glyphs), `.data-table` (relations and intermediates), `CodePanel` (generated SQL), `Segmented`, `ChipButton`, `Toggle`, `createRecorder`.
**AC.**
- Watch: the operator being applied is `--hi`, rows passing through `--info`, rows filtered out `--dim`, duplicate rows collapsed by π flashing `--violet` before they merge, and intermediate row-count chips `--hi` (the larger, unpushed plan's chip `--bad`, the cheaper one `--ok`).
- Misconception: "SQL tables are sets", or "the order you write the operations is the order they're run".
- Correctness:
  - Each preset expression's result equals real SQLite (`node:sqlite`) running the generated SQL (with `DISTINCT` in set mode). Row multisets are compared.
  - The pushdown pair is asserted equal with smaller intermediates.
  - The algebra evaluator is property-tested: σ commutes with σ, and π of π equals the outer π.
- Honesty: "Evaluated by the lesson's own engine; the SQL shown is checked against SQLite in tests."
**Phone.** Expression tree above, tables below. The tables go in `WideRegion minWidth={460}` when they're wide.

**`normalization` · Normalization & Normal Forms**
Track `data` · *"Store each fact once"* · Builds on: `er-data-modeling`, `sql-basics`, `relational-algebra`
**Spec.**
- One wide `orders` table (order, customer name, customer email, product, product price, quantity, warehouse city) with repeated facts highlighted.
- **Anomaly buttons:**
  - Update a customer's email in one row: the other rows now disagree (update anomaly).
  - Delete the only order of a product: the product's price is lost (deletion anomaly).
  - Add a product with no order yet: impossible without nulls (insertion anomaly).
- **Normalize step by step:**
  - 1NF splits the "products: 'pen, ink'" list cell.
  - 2NF removes a partial dependency on part of the composite key (`order_id, product_id` → product price depends on `product_id` only).
  - 3NF removes the transitive dependency (`customer_id → email`).
  - Each split animates columns moving into new tables with their keys, and the anomaly buttons are re-run to show each one fixed.
- A functional-dependency panel lists the FDs (`A → B`). Each normal form's violation is computed from them, not hard-coded.
- **Denormalize toggle:** a read query's join count grows as tables split, which is the honest trade-off, named only.
**Out of scope.** BCNF and 4NF are one key idea. Materialized views and denormalization strategies belong to T3 `materialized-views-denormalization`.
**Kit.** `.data-table` (with column tints via lesson classes), `ChipButton` (anomalies), `Segmented` (normal form step), `CodePanel` (FD list, `renderLine`), `Stat` (join count), `createRecorder`.
**AC.**
- Watch: repeated facts are an `--orange` tint (redundancy, a category of cost), cells an anomaly made inconsistent `--bad`, the key columns `--hi` with a key glyph, foreign keys `--violet`, columns moving in a split `--info`, and a fixed anomaly `--ok`.
- Misconception: "normalization is about saving disk space". It's about anomalies.
- Correctness:
  - The normal-form checker (pure: takes a schema, its FDs and key) is tested on every preset stage: 0NF fails 1NF, the 1NF stage fails 2NF on the named partial dependency, and so on to 3NF passing.
  - Each decomposition is tested lossless: joining the split tables back reproduces the original rows (and checked in `node:sqlite`).
  - Each anomaly reproduces before the split and not after.
- Honesty: "A small hand-made schema; the dependencies are given, not discovered from data."
**Phone.** The wide table goes in `WideRegion minWidth={620}`. The split tables stack vertically at ≤ 900px.

**`sql-aggregation-windows` · GROUP BY, Aggregates & Window Functions**
Track `data` · *"Collapse rows, or peek at their neighbours"* · Builds on: `sql-basics`, `relational-algebra`
**Spec.**
- A `sales` table of about 16 rows (region, rep, month, amount) with a query builder made of menus, so no free-typed SQL:
  - GROUP BY column(s)
  - aggregate (`COUNT(*)`, `COUNT(col)` with NULLs present, `SUM`, `AVG`, `MAX`)
  - an optional `HAVING`
  - an optional `WHERE`
- **GROUP BY mode:** rows sort into coloured buckets that collapse into one summary row each. A `WHERE` vs `HAVING` toggle shows WHERE removing rows before grouping and HAVING removing groups after.
- **Window mode:** `SUM(amount) OVER (PARTITION BY region ORDER BY month)`. Rows **stay put** while a frame bracket slides within each partition, computing running totals. A frame picker (`ROWS 2 PRECEDING`, `UNBOUNDED PRECEDING`) changes the bracket.
- Ranking functions `ROW_NUMBER`, `RANK` and `DENSE_RANK` on tied amounts show the three numbering rules side by side.
- **"Non-aggregated column" preset:** selecting `rep` while grouping by region is shown as an error in standard SQL, with a note that SQLite and MySQL may silently pick a row.
**Out of scope.** Query plans and sort/hash aggregation belong to T3 `query-planning`. Joins belong to `sql-basics`.
**Kit.** `.data-table`, `CodePanel` (generated SQL), `Segmented`/`Toggle` (builder), `ChipButton`, `createRecorder`, categorical tokens for groups.
**AC.**
- Watch:
  - Groups and partitions use categorical tokens (`categorical(i)`), never `--bad`/`--ok`.
  - The row being added is `--hi`, the window frame a `--violet` bracket, rows removed by WHERE `--dim`, and groups removed by HAVING `--dim` with a strikethrough.
  - Tie ranks are `--info`. The non-aggregated-column error is `--bad`.
- Misconception: "a window function groups rows like GROUP BY", and "WHERE and HAVING are interchangeable".
- Correctness:
  - Every builder combination's result (aggregates × grouping × WHERE/HAVING presets, and every window and frame preset) equals real SQLite via `node:sqlite`, compared as ordered rows where `ORDER BY` applies and multisets otherwise.
  - `COUNT(col)` with NULLs is asserted to be smaller than `COUNT(*)`.
  - RANK, DENSE_RANK and ROW_NUMBER on the tie preset are asserted.
- Honesty: "Evaluated by the lesson's engine; checked against SQLite in tests. SQLite's leniency about non-aggregated columns is noted where it differs from standard SQL."
**Phone.** The table plus a result column goes in `WideRegion minWidth={560}`. Builder menus wrap above.

**`nosql-data-models` · NoSQL Data Models: Document, Key-Value, Wide-Column & Graph**
Track `data` · *"Shape the data like the queries"* · Builds on: `sql-basics`, `er-data-modeling`, `normalization`, `hash-table`
**Spec.**
- One shop dataset (customers, orders, line items, products, "customers who bought X also bought Y") shown five ways with a model picker: relational rows, a document (an order with embedded items), key-value (`order:1042` → blob), wide-column (partition `customer_id`, clustering `order_date`), and a graph (nodes and edges).
- **Query chips:**
  - "get order 1042 with its items"
  - "a customer's last 10 orders"
  - "update a product's price everywhere"
  - "who also bought this?"
- Each query animates its lookups in the chosen model, and a counter shows lookups/round trips plus "copies to update".
- Each model has a query where it shines and one where it hurts: the document model embeds the product name, so "update price everywhere" touches every order, and the key-value model can't answer "last 10 orders" without a secondary index.
- **Access-pattern-first exercise:** the learner gets two required queries and picks the model and the key design (partition key choice). A hot-partition warning appears for a bad wide-column key, such as a constant partition.
**Out of scope.** Distribution, replication and consistency belong to `replication`, `sharding` and `cap-theorem`. Vector stores belong to T3 `vector-search`. Search indexes belong to T3 `inverted-index`.
**Kit.** `useScenePicker` (model), `ChipButton` (queries), `.data-table` (rows and wide-column), `CodePanel` (document JSON with `renderLine`), `GraphView` (K-6, graph model), `Stat`, `createRecorder`, `Segmented` (partition key).
**AC.**
- Watch:
  - The record being read is `--hi`, lookups in flight `--info`, and records touched by an update `--orange` (cost, a category).
  - The cheapest model per query is marked `--ok` and the costliest `--bad` in the comparison row.
  - Embedded sub-documents are a `--violet` tint, and a hot-partition warning is `--bad`.
- Misconception: "NoSQL means schemaless, so you don't have to design it", or "one model is just better".
- Correctness:
  - All five representations come from one canonical dataset by pure transforms. Each query's answer is tested identical across all models.
  - The lookup and copies-to-update counts are computed by each model's query function (tested per model × query against hand-worked expectations).
  - The hot-partition rule is tested.
- Honesty: "Lookup counts come from a simplified model of each store; real databases add indexes and caches."
**Phone.** The model picker wraps. The document and table views go in `WideRegion minWidth={520}`. The comparison row stacks.

**`orm-n-plus-one` · ORMs & the N+1 Query Problem**
Track `data` · *"One query became a thousand"* · Builds on: `sql-basics`, `db-indexes`, `client-server`
**Spec.**
- A blog page rendering 20 posts with their authors and comment counts. A lesson-authored ORM snippet `posts = Post.all(); for p in posts: p.author.name` sits beside the SQL log the "ORM" emits, one line per query.
- **Lazy loading:** 1 query for posts plus 20 for authors. A `GanttLanes` waterfall shows them serialised against a per-query round-trip latency slider (0.2-20 ms).
- **Fix chips:**
  - **eager join:** 1 query with a JOIN;
  - **eager batch** (`WHERE author_id IN (…)`): 2 queries;
  - **DataLoader-style batching:** queries collected within one tick.
  - Each shows its SQL, query count and total time.
- **Nested preset:** posts → comments → commenters, where lazy loading becomes 1 + N + N·M. The counter shows hundreds of queries.
- **Over-eager trap:** joining everything returns 20 × comments rows, duplicating post data, so bytes transferred rise. This is the trade-off.
- A page-size slider (10-200 posts) scales the counts live.
**Out of scope.** GraphQL resolver fan-out belongs to `graphql` (B24, same wave, which reuses this lesson's framing). Indexes belong to `db-indexes`. Query planning belongs to T3.
**Kit.** `GanttLanes` (K-13, query waterfall), `CodePanel` (ORM code with `onLineClick` linking a line to its queries, `stateOf`), `ConsolePanel` (SQL log), `ChipButton`, `Slider` (latency, page size, with `format`), `Stat`, `createRecorder`.
**AC.**
- Watch: the ORM line executing is `--hi`, each query bar `--info`, repeated per-row queries `--orange` (the N), the fixed strategy's bars `--ok`, the duplicated rows in the over-eager result `--bad` tint, and idle time `--dim`.
- Misconception: "an ORM writes efficient SQL for you", or "N+1 only matters when the database is slow".
- Correctness:
  - Query counts per strategy are from the model: lazy = 1 + N, nested = 1 + N + Σ comments, batch = 1 + 1 (+ 1 nested), join = 1. Tested for page sizes 1-200.
  - Total time = count × latency + work, for serial waterfalls.
  - Every strategy's rendered page data is equal (deep-equal test).
  - The SQL text of each strategy runs in `node:sqlite` on the fixture and returns the data the page uses.
- Honesty: "Simulated database and latency; the SQL is real and checked against SQLite in tests."
**Phone.** The waterfall goes in `WideRegion minWidth={560}`. Code and log stack underneath at ≤ 900px.

---

##### Batch T2-B24 · HTTP & API protocols (`net`, `arch`)
Wave 8. A heavy `GanttLanes` (K-13) user (waterfalls for http-versions, realtime lanes, GraphQL resolver timing) and the `ByteGrid` (K-8) wire view for protobuf. `graphql` is built in the same wave as `orm-n-plus-one` (T2-B23) and links to it for the general N+1 mechanics.

**`http-versions` · HTTP/1.1 vs HTTP/2 vs HTTP/3**
Track `net` · *"From one lane to multiplexed streams"* · Builds on: `http-basics`, `tcp-udp`, `tls-handshake`, `latency-bandwidth`
**Spec.**
- A page that needs 12 resources (HTML, 2 CSS, 4 JS, 5 images). Three waterfalls are drawn with the same illustrative RTT and sizes:
  - **HTTP/1.1** with 6 connections per origin: requests queue per connection, so one slow response blocks the next on its connection (application-level head-of-line blocking).
  - **HTTP/2**: one TCP connection, frames from every stream interleaved, plus a frame-level strip showing HEADERS and DATA frames tagged by stream ID. HPACK header compression is shown as a byte-count readout.
  - **HTTP/3 (QUIC over UDP)**: independent streams.
- A **lose a packet** button drops one packet mid-transfer:
  - In HTTP/2 every stream stalls until the TCP retransmission arrives (transport HoL blocking), so all bars pause.
  - In HTTP/3 only the stream whose packet was lost pauses.
- Toggles: the number of HTTP/1.1 connections (1, 2, 6) and the RTT slider.
- A short protocol facts table: framing (text vs binary), transport, header compression (HPACK vs QPACK) and connection setup round trips (1.1/2 over TCP + TLS 1.3 = 2 RTT before the first request; HTTP/3 = 1 RTT; 0-RTT is mentioned only as "see T3 `quic`").
**Out of scope.** The QUIC handshake, 0-RTT and connection migration (T3 `quic`), server push (deprecated; one line), and TCP congestion behaviour (T3).
**Kit.** `GanttLanes` (K-13) with `kind="blocked"` for stalls and `markers` for the loss moment, `Segmented`, `Slider`, `Toggle`, `.data-table`, `useSimulation` or a frame builder (`frames.tsx` + `model.ts`), `core/format` `ms`.
**AC.**
- Watch: transferring bars `--info`, queued or waiting time hatched `--dim`, stalled bars after a loss `--bad`, the lost packet marker `--bad` ✕, the stream highlighted in the frame strip `--hi`, completed resources `--ok`, and per-stream frame tags in categorical colours.
- Misconception: "HTTP/2 removed head-of-line blocking". It removed it at the HTTP layer, but TCP still blocks every stream on one loss; HTTP/3 removes that too.
- Correctness:
  - The timing model is pure and tested:
    - With no loss, HTTP/2 total time ≤ HTTP/1.1 at 6 connections for the preset page.
    - After one loss, every HTTP/2 stream's finish time is delayed by the retransmission time, while in HTTP/3 only the affected stream is.
    - 1.1 with 1 connection is fully serial.
  - Setup RTT counts per version are tested.
  - The HPACK readout uses a stated, illustrative compression ratio.
- Honesty: "Illustrative model: fixed RTT, sizes and loss; real browsers and servers prioritise and pace differently."
**Phone.** The waterfalls go in `WideRegion minWidth={560}`, one version visible at a time on phones via `Segmented` (all three stacked on desktop). The frame strip sits in the same region.

**`http-caching` · HTTP Caching: Cache-Control & ETags**
Track `net` · *"The fastest request is the one you never send"* · Builds on: `http-basics`, `cdn-edge`, `lru-cache` · **[domain review]**
**Spec.**
- Three actors in a row: the browser cache, a shared cache (a CDN/proxy) and the origin. A `SequenceDiagram` shows each request's path.
- The learner composes the origin's response headers with chips and fields:
  - `Cache-Control`: `max-age`, `s-maxage`, `no-cache`, `no-store`, `private`, `public`, `must-revalidate`, `stale-while-revalidate`, `immutable`;
  - `ETag`, `Last-Modified`;
  - `Vary: Accept-Encoding` / `Vary: Cookie`.
- A clock scrubber advances time. Each new request is then classified as:
  - **fresh hit**: served from cache, no request sent;
  - **revalidation**: a conditional `If-None-Match` gives `304 Not Modified` (small) or `200` with a new body;
  - **miss** to the origin;
  - **stale-while-revalidate**: served stale while refreshing in the background.
- Presets:
  - **Hashed static asset** (`app.3f9a.js`, `max-age=31536000, immutable`).
  - **HTML page** (`no-cache` + ETag: always revalidates).
  - **Per-user dashboard** (`private, no-store`): the shared cache must never store it. A "forgot `private`" toggle shows user A's page served to user B from the shared cache, explained in words, with fictional user names.
  - **API with Vary**.
- A byte counter compares 304 responses with full 200s.
**Out of scope.** CDN topology, PoPs, shields and purging (`cdn-edge`), service-worker caches, and the browser's heuristic freshness beyond one line (RFC 9111 §4.2.2: 10% of age since Last-Modified, named as a heuristic).
**Kit.** `SequenceDiagram` (K-14), `ChipButton` (`onStyle="solid"` for directives), `TextField`, `Slider` (time), `CodePanel` (the header block), `.data-table` (the decision trail), `core/format` `bytes`/`humanDuration`, `ScenePicker`.
**AC.**
- Watch: requests `--info`, a fresh hit `--ok`, a 304 revalidation `--violet`, a full origin trip `--hi`, a stale response served `--orange`, and a private page wrongly stored in the shared cache `--bad`.
- Misconception: "`no-cache` means don't cache". It means store but revalidate every time; `no-store` means don't store.
- Correctness:
  - The freshness and storage decision is a pure function, tested as a table against RFC 9111 for the modelled directives:
    - freshness lifetime = `s-maxage` for shared caches, else `max-age`;
    - `no-store` → never stored;
    - `private` → never stored by a shared cache;
    - `no-cache` → stored but must revalidate;
    - `must-revalidate` → no stale serving after expiry;
    - `stale-while-revalidate` window (RFC 5861).
  - ETag matching (strong vs weak `W/`) and the 304 response having no body are tested.
  - `Vary` keys the shared cache by the listed request headers (tested).
- Honesty: "Simulated caches following RFC 9111 for the directives shown; real browsers add heuristics and limits."
**Phone.** The `SequenceDiagram` has 3 lifelines and fits. The header composer wraps (chips with `flex-wrap`), and the decision table scrolls inside `.data-table`.

**`realtime-transports` · Polling, Long-Polling, SSE & WebSockets**
Track `net` · *"Four ways to make the server talk first"* · Builds on: `http-basics`, `http-versions` (same batch), `event-loop`
**Spec.**
- One server-side event stream: chat messages arriving at seeded random times.
- Four parallel lanes (`GanttLanes`), one per transport, deliver the same events over 60 simulated seconds:
  - **short polling** every N s: many empty `200 []` responses, each event delayed by up to N;
  - **long polling**: the request hangs until an event arrives or a 30 s timeout, then reconnects;
  - **SSE**: one long-lived HTTP response streaming `data:` lines, with auto-reconnect and `Last-Event-ID`;
  - **WebSocket**: an HTTP `Upgrade` → `101 Switching Protocols`, then frames in both directions.
- Counters per lane: requests made, wasted (empty) responses, average and max delivery latency, open connections, and header bytes.
- Controls: the polling interval, event rate (rare ↔ chatty) and client count (1 → 10,000), where the open-connections and requests-per-second meters show the server-side cost.
- A **disconnect** button drops the network for 5 s: SSE resumes from `Last-Event-ID` with no gap, while the WebSocket needs app-level resync (the gap is shown unless a resync toggle is on).
- A "client sends too?" toggle shows that only WebSocket is bidirectional (SSE is server → client; the client sends with normal requests).
**Out of scope.** WebRTC and peer-to-peer (T3 `nat-traversal-webrtc`), the WebSocket frame byte format (one line), and pub/sub fan-out on the server (T3 `fanout-feeds`).
**Kit.** `GanttLanes` (K-13) with `kind="wait"` for hanging requests, `SequenceDiagram` (K-14) for the `Upgrade` handshake detail, `useSimulation` (a seeded event stream via `mulberry32`), `Slider`, `Toggle`, `Stat`, `core/format` `ms`/`perSec`.
**AC.**
- Watch: requests `--info`, an event delivered `--ok`, wasted empty polls `--dim`, a hanging long-poll `--violet` (waiting), delivery delay over the mean `--orange`, the disconnect window `--bad`, and missed events `--bad` ✕.
- Misconception: "WebSockets are always the best choice". SSE is simpler for server → client push over plain HTTP, and polling is fine for rare updates.
- Correctness:
  - On the same seeded stream:
    - Short polling's max delivery delay ≤ the interval, and its request count = duration ÷ interval.
    - Long polling delivers each event within one RTT of its arrival.
    - SSE resumes with zero missed events after a disconnect when `Last-Event-ID` is honoured.
  - These are tested as model invariants.
  - The handshake uses the RFC 6455 headers and status 101 (tested in the message list).
- Honesty: "Simulated server and network; latencies and byte counts are illustrative."
**Phone.** The four lanes go in `WideRegion minWidth={520}`. Counters sit below as a wrapping `Stat` grid.

**`grpc-protobuf` · gRPC & Protocol Buffers**
Track `net` · *"Typed contracts, binary wire, HTTP/2 streams"* · Builds on: `bit-manipulation`, `endianness`, `data-formats`, `http-versions` (same batch), `client-server`
**Spec.**
- A `.proto` definition in a `CodePanel`: `message Order { int64 id = 1; string item = 2; int32 qty = 3; sint32 delta = 4; repeated int32 tags = 5; }`.
- An editable message instance (fields with values) is encoded live:
  - Each field becomes a **tag byte** = `(field_number << 3) | wire_type`, then the value: a varint, or length-delimited for strings and packed repeated fields.
  - The bytes are drawn in a `ByteGrid` with fields coloured back to the source line.
  - A varint expands into a `BitStrip`, showing 7-bit groups, continuation bits and little-endian group order.
- The same object as JSON beside it, with a size comparison (`bytes`). An unset field takes 0 bytes (proto3 default values aren't encoded).
- A `sint32` vs `int32` toggle for −1: zigzag gives 1 byte, while a negative `int32` varint is 10 bytes.
- **Decode with an older schema**: unknown field 5 is skipped and preserved by length, so old readers survive new fields. One key idea: never reuse or renumber a field number (the full compatibility matrix is T3 `schema-evolution`).
- A **streaming** tab with four lanes: unary, server streaming, client streaming and bidirectional, each as messages over one HTTP/2 stream. A deadline chip links to `timeouts-deadlines` (wave 9; mentioned by id only once that exists, or phrased generically).
**Out of scope.** Schema evolution rules beyond the one key idea (T3 `schema-evolution`), gRPC load balancing and service config, and protobuf `oneof`/`map` internals.
**Kit.** `ByteGrid` (K-8) with `fields`, `BitStrip` (varint groups), `CodePanel`, `TextField`, `Toggle`, `GanttLanes` (K-13) or `SequenceDiagram` (K-14) for the streaming modes (pick the one that reads better; one only), `core/format` `bytes`.
**AC.**
- Watch: tag bytes `--violet`, value bytes in their field's categorical colour, varint continuation bits `--hi`, payload bits `--info`, a skipped unknown field `--dim`, and in the size comparison protobuf `--ok` against JSON `--bad` (the costly side).
- Misconception: "field names are sent on the wire". Only field numbers and wire types are, which is why renumbering breaks old clients.
- Correctness:
  - The encoder is pure and tested against known bytes:
    - field 1 = 150 encodes `08 96 01`;
    - the string "testing" in field 2 gives `12 07 74 65 73 74 69 6e 67`;
    - zigzag(−1) = 1 and zigzag(1) = 2;
    - `int32` −1 encodes as 10 bytes;
    - packed repeated fields use wire type 2.
  - Decode(encode(m)) = m for 500 seeded messages.
  - An unknown field is skipped by its wire type.
  - Varints use `bigint` for int64 (no 2⁵³ precision loss: tested at 2⁶³−1).
- Honesty: "Encoder written for this lesson, matching the protobuf wire format for the field types shown; the streaming lanes are simulated."
**Phone.** `ByteGrid` at `perRow={8}` on phones. The proto and JSON panels stack, and the streaming lanes go in `WideRegion minWidth={480}`.

**`graphql` · GraphQL: Queries, Resolvers & Cost**
Track `arch` · *"Ask for exactly what you need, then pay for it"* · Builds on: `client-server`, `rest-api-design` (wave 8, T2-B25), `orm-n-plus-one` (wave 8, T2-B23), `tree-traversals`
**Spec.**
- **Over/under-fetching vs REST**: a mobile screen needs a user's name plus their last 3 orders with product names.
  - The REST lane shows 1 + 1 + 3 requests and the unused fields fetched (bytes wasted).
  - The GraphQL lane sends one query and gets exactly the requested shape.
- **Query → resolver tree**:
  - The learner ticks fields in a schema explorer (`user { name orders(last: 3) { total product { name } } }`).
  - The query text updates.
  - Execution draws the resolver tree (`TreeSvg` tidy), resolving level by level, with a `GanttLanes` strip of the database calls each resolver makes.
- **N+1 in resolvers**: naive `product` resolvers fire one DB call per order (1 + N). Toggling **DataLoader** batches them per tick into one `WHERE id IN (…)` call. A caption links to `orm-n-plus-one` for the general problem.
- **Cost and abuse limits**: deepening the query (`friends { friends { friends … } }`) makes a cost meter climb (depth × list sizes). Depth and complexity limits reject it before execution with a clear error. Payload-free: described as "a client can ask for far more than it needs"; no attack queries.
- Errors: a field resolver failing returns partial `data` plus an `errors` array with HTTP 200, compared with REST's whole-request failure.
**Out of scope.** The ORM lazy-loading mechanics of N+1 (`orm-n-plus-one`), schema federation, subscriptions (one line pointing to `realtime-transports`), and caching GraphQL over HTTP.
**Kit.** `TreeSvg` (tidy) for the resolver tree, `GanttLanes` (K-13) for the DB calls, `CodePanel` (query and response JSON), `Toggle` (DataLoader), `ChipButton`/checkbox list for the fields, `Bar` (cost meter with `marker` at the limit), `core/format` `bytes`, `createRecorder`.
**AC.**
- Watch: the resolver running now `--hi`, resolved fields `--ok`, DB calls `--info`, the batched DataLoader call `--violet`, over-fetched (unused) bytes `--dim`, a query over the cost limit `--bad`, and a partial-error field `--orange` (it failed while the request still returned 200).
- Misconception: "GraphQL fixes N+1 automatically" or "GraphQL is always faster than REST". Resolvers can make it worse without batching.
- Correctness:
  - A tiny executor (a resolver tree over an in-memory fixture) is pure and tested.
  - The DB-call count = 1 + N without DataLoader and 2 with it, for N orders (tested for N = 0, 1, 3, 50).
  - The response shape equals the query's field selection exactly (no extra fields: a property test over random selections).
  - The cost function = sum over the selection of the product of list sizes, tested, with the limit rejection happening before any resolver runs.
- Honesty: "A simplified GraphQL executor written for this lesson; the database is in-memory and timings are illustrative."
**Phone.** The resolver tree goes in `WideRegion minWidth={520}`. The REST/GraphQL comparison lanes and the cost meter stack, and the field picker wraps.

---

##### Batch T2-B25 · API design (`arch`, `data`)
Wave 8. Mostly proven kit (`SequenceDiagram`, `CodePanel`, `.data-table`, `GanttLanes`). `idempotency-keys` and `webhooks` are the pair to review together: both turn "at least once" into "effectively once" and must not claim exactly-once delivery (that myth is T3 `exactly-once-myth`).

**`rest-api-design` · REST Resource Design**
Track `arch` · *"Nouns, verbs and status codes that mean something"* · Builds on: `http-basics`, `client-server`
**Spec.**
- A **redesign board**: a list of RPC-style endpoints (`POST /getUser`, `POST /createOrder`, `GET /deleteOrder?id=7`, `POST /orders/7/updateStatus`). The learner reshapes each into a resource tree (`/users/{id}`, `/users/{id}/orders`, `/orders/{id}`) by picking a path and a method from chips.
- A live validator checks each choice against REST conventions and explains every flag:
  - "GET must be safe: deleting on GET lets a crawler or prefetch delete data".
  - "use the collection for create: `POST /orders` → `201` + `Location`".
  - "PUT replaces, PATCH changes part".
  - "PUT and DELETE are idempotent".
- A **status-code picker** per scenario: created (201), accepted for async work (202), no content (204), validation error (400 or 422 with a problem-details body, RFC 9457), not found (404), conflict (409), precondition failed (412), rate limited (429). The validator explains each wrong pick.
- A **collection design** panel: filtering, sorting and field selection as query parameters (`GET /orders?status=paid&sort=-created_at`), with `pagination` named for the paging part.
- **Error shape**: an RFC 9457 `application/problem+json` example vs an ad-hoc `{ "error": true }`.
- A "nested too deep" preset (`/users/1/orders/7/items/3/reviews`) and the guideline to stop at one level of nesting.
**Out of scope.** Method and status-code basics (`http-basics` teaches them; here they're applied), versioning and deprecation (T3 `api-versioning`), auth flows (`oauth-flows`), and HATEOAS (one line).
**Kit.** `ChipButton` (method and path chips), `CodePanel` (request/response), `.data-table` (the endpoint board), `ConsolePanel` (validator messages), `ScenePicker`, `TextField`.
**AC.**
- Watch: the endpoint being edited `--hi`, conventions satisfied `--ok`, violations `--bad`, a warning-level style issue (deep nesting, verb in a path) `--orange`, resource nouns `--info`, and methods `--violet`.
- Misconception: "REST means JSON over HTTP with any URL", or "use POST for everything".
- Correctness:
  - The validator rules are pure and table-tested:
    - safe methods: GET, HEAD;
    - idempotent methods: GET, HEAD, PUT, DELETE, OPTIONS, per RFC 9110 §9.2;
    - a create goes to a collection with 201 + `Location`;
    - a verb in a path segment is flagged.
  - Every scenario's accepted status codes are tested.
  - The problem-details example has the RFC 9457 members (`type`, `title`, `status`, `detail`, `instance`).
- Honesty: "Conventions, not a standard: the validator encodes common REST guidelines and says which rules come from RFC 9110."
**Phone.** The board is a list of cards on phones (HTML, wraps), and the code panels stack. No `minWidth`.

**`pagination` · Offset vs Cursor Pagination**
Track `arch` · *"Page 10,000 shouldn't cost 10,000 pages"* · Builds on: `db-indexes`, `sql-basics`, `rest-api-design` (same batch)
**Spec.**
- A feed of rows sorted by `created_at DESC, id DESC`, drawn as a vertical strip. The learner pages through it (page size 5) in two modes side by side:
  - **offset**: `LIMIT 5 OFFSET 10`;
  - **cursor / keyset**: `WHERE (created_at, id) < (:last_ts, :last_id) LIMIT 5`, with an opaque base64 cursor shown.
- An **insert while you page** button adds new rows at the top between page loads. In offset mode the next page repeats rows (**duplicates**, marked); a delete makes rows skipped (**gaps**). Cursor mode stays stable.
- A **cost meter**: the rows the database must walk. Offset scans offset + limit rows (page 10,000 walks 50,005); keyset seeks the index and reads 5.
- A depth slider jumps to page 1, 100 or 10,000 to show the meter grow. A `Plot2D` shows rows scanned against page number for each mode.
- **The tie-breaker trap**: sorting by `created_at` alone with equal timestamps skips rows under cursor paging. Adding `id` to the sort and cursor fixes it.
- Trade-offs panel: offset allows "jump to page 50" and total counts; cursor allows only next/prev but is stable and cheap. Also shown: response shape (`next_cursor`, `has_more`).
**Out of scope.** Index internals (`db-indexes`), search engines' deep paging, and GraphQL Relay connections (one line).
**Kit.** A local SVG row list for the vertical feed (`ArrayStrip` is horizontal-only), `Plot2D` (K-12), `CodePanel` (the two SQL queries), `Bar` (cost), `Slider` (depth), `Button`, `core/format`, `crypto.ts` `b64url` (cursor encoding).
**AC.**
- Watch: the current page's rows `--hi`, rows seen on a previous page `--dim`, a duplicate `--bad`, a gap (a skipped row) `--orange`, newly inserted rows `--info`, the rows scanned by the DB in the cost view `--violet`, and the stable cursor result `--ok`.
- Misconception: "offset pagination is fine because each page is only 5 rows". Its cost grows with depth, and it duplicates or skips under writes.
- Correctness:
  - A pure in-memory table with both strategies is tested.
  - Under k inserts between pages, offset duplicates exactly k rows (inserts at the head); deletes produce gaps.
  - Cursor pagination returns every row exactly once over a seeded sequence of inserts and deletes at the head (property test).
  - Scanned rows: offset = offset + limit, keyset = limit (with an index).
  - The tie-breaker bug reproduces with equal timestamps and is fixed by `(created_at, id)`.
  - Cursors round-trip through `b64url`.
- Honesty: "Simulated table; the scan counts model a B-tree index seek, not a real database."
**Phone.** The two side-by-side strips become stacked strips at 390 (`Segmented` picks one, or both stack). The plot is responsive. Nothing needs `minWidth`.

**`idempotency-keys` · Idempotency Keys & Safe Retries**
Track `arch` · *"Charge the card once, however many clicks"* · Builds on: `http-basics`, `circuit-breakers`, `transactions-acid`, `rest-api-design` (same batch) · **[domain review]**
**Spec.**
- A `SequenceDiagram` with a client, the payment API and a ledger. The client sends `POST /payments`.
- The learner injects failures at three points:
  1. the request is lost (safe to retry);
  2. the server charged but the response was lost (the dangerous one);
  3. the client times out while the server is still working.
- Then they retry. **Without a key**, case 2 creates two ledger rows: the customer is charged twice (red).
- **With an `Idempotency-Key` header**:
  - The server stores the key with a request fingerprint and, once done, the response.
  - A retry with the same key returns the **stored response** without charging again.
  - Reusing a key with a *different* body is rejected (422 or 409, following the IETF Idempotency-Key draft's semantics, named as a draft).
- **Concurrent in-flight** case: two retries with the same key arrive while the first is still processing. The server holds a lock or "in progress" record on the key and answers the second with 409 (retry later), so it never double-processes.
- **Key expiry**: keys are kept for 24 h (illustrative). A retry after expiry would be processed again; the stage says how long to keep keys relative to client retry windows.
- A side panel shows naturally idempotent operations (`PUT /orders/7/status = shipped`, `DELETE`) against ones that need a key (`POST`, "add 10 credits").
- Client retry policy chips (exponential backoff with jitter) link to `circuit-breakers`.
**Out of scope.** Exactly-once delivery in messaging (T3 `exactly-once-myth`), outbox / dual writes (T3 `transactional-outbox`), and consumer-side dedup (`poison-messages-dlq` and `webhooks` mention it).
**Kit.** `SequenceDiagram` (K-14) with `lost` messages, `.data-table` (the ledger and the key store), `Toggle` (key on/off), `ChipButton` (failure points), `ScenePicker`, `createRecorder`.
**AC.**
- Watch:
  - requests `--info`, a lost message `--bad` ✕, the current message `--hi`;
  - a ledger row `--ok`, and the duplicate charge `--bad`;
  - the stored response replayed `--violet`;
  - the in-progress key lock `--hi` tint;
  - 409/422 rejections `--orange` (a correct refusal, not a failure of the system).
- Misconception: "just retry on timeout", or "the server can tell a retry from a new payment by itself". It can't without a client-generated key.
- Correctness:
  - A pure server model is tested:
    - With the key, n retries of the same request create exactly 1 ledger row for any n and any failure point.
    - Without the key, case 2 gives 2 rows.
    - The same key with a different fingerprint is rejected.
    - The concurrent same-key request never runs the handler twice (an interleaving test over all orderings of two requests).
    - Retry after expiry is processed again (documented).
  - The captions' charge counts are derived from the ledger.
- Honesty: "Simulated payment API; the key store is in memory. The `Idempotency-Key` header is an IETF draft widely used in practice."
**Phone.** 3 lifelines fit at 390. The ledger and key-store tables stack below.

**`optimistic-pessimistic-locking` · Optimistic vs Pessimistic Locking**
Track `data` · *"Ask forgiveness or permission"* · Builds on: `transactions-acid`, `race-conditions`, `rest-api-design` (same batch) · **[domain review]**
**Spec.**
- Two users (Ana and Ben) edit the same product's stock in two lanes, with a database row in the middle (`id 7, stock 10, version 3`). The learner steps each user's actions in any interleaving (buttons per lane: read, edit, save).
- **No locking**: both read 10, Ana saves 9 and Ben saves 8. One decrement is lost (**lost update**), shown as a red ghost row.
- **Pessimistic**: `SELECT … FOR UPDATE` takes a row lock. Ben's read blocks (his lane shows a waiting bar) until Ana commits, then he sees 9 and saves 8. A lock-timeout slider shows long waits turning into errors, and a "user went to lunch holding the lock" preset shows the cost.
- **Optimistic**: `UPDATE … SET stock = 8, version = 4 WHERE id = 7 AND version = 3`. Ben's update affects 0 rows, so he must re-read and retry (or show a conflict to the user). A retry loop counter appears.
- **Over HTTP**: the same optimistic idea with `ETag` / `If-Match`. A stale `If-Match` gets `412 Precondition Failed`; a missing one, when it's required, gets `428 Precondition Required` (RFC 6585).
- A contention slider (1-20 concurrent editors) plots retries and waiting time for the two strategies (`Plot2D`): optimistic wins at low contention, pessimistic at high.
- An atomic-update alternative chip: `UPDATE … SET stock = stock - 1` avoids the read-modify-write entirely for simple counters.
**Out of scope.** Isolation levels and their anomalies (T3 `isolation-levels`), MVCC internals (T3 `mvcc`), distributed locks (T4 `leases-fencing`), and deadlocks between row locks (`deadlocks` names it).
**Kit.** `GanttLanes` (K-13) for the two users' timelines with `kind="blocked"` waits, `CodePanel` (the SQL per step), `.data-table` (the row with its version), `Plot2D` (K-12), `Slider`, `Segmented` (strategy), `createRecorder`.
**AC.**
- Watch: Ana's lane `--info`, Ben's `--violet`, the current step `--hi`, the row lock `--hi` padlock, a blocked wait hatched `--dim`, the lost update `--bad`, the version-mismatch conflict `--orange` (a detected conflict, not data loss), a successful commit `--ok`, and 412/428 `--orange`.
- Misconception: "transactions alone prevent lost updates". A read-modify-write across two transactions at READ COMMITTED still loses one without a lock or version check.
- Correctness:
  - A pure row-and-lock model is tested over every interleaving of the two users' 3 steps (20 orderings):
    - no locking loses an update in the interleavings where both read before either writes;
    - pessimistic never loses one;
    - optimistic never loses one and reports a conflict exactly when the version changed.
  - `If-Match` gives 412 on mismatch and 428 when required and absent.
  - The contention plot is computed from the seeded model, not drawn.
- Honesty: "Simulated database row and lock manager at READ COMMITTED; contention numbers are from a seeded model."
**Phone.** The two lanes and the row stack vertically at ≤900 (the row between the lanes). The plot is responsive.

**`webhooks` · Webhooks & Event Delivery**
Track `arch` · *"Don't call us, we'll call you"* · Builds on: `macs-hmac`, `message-queues`, `idempotency-keys` (same batch), `http-basics` · **[domain review]**
**Spec.**
- A provider (a fictional payment service) sends events (`payment.succeeded`, `payment.refunded`) to the learner's receiver endpoint, drawn as a `SequenceDiagram` with a delivery queue on the provider side.
- **Signatures**:
  - Each delivery carries a timestamp and an HMAC-SHA-256 signature header computed for real over `timestamp + "." + body` with a shared secret (built at runtime with `fakeSecret`).
  - The receiver recomputes it and compares in constant time (the comparison is explained, not hand-rolled in a way learners would copy wrong).
  - An "edit the body in transit" toggle makes verification fail.
  - A replayed old delivery is rejected by the timestamp tolerance (5 minutes, illustrative).
  - Payload-free framing throughout: "anyone who knows your URL can send you requests, so check the signature".
- **Receiver offline**: take the receiver down. The provider's retry schedule (exponential backoff, e.g. 1 m, 5 m, 30 m, 2 h… illustrative) shows attempts on a timeline. Bring it back and the backlog drains.
- **Duplicates and ordering**: deliveries are at least once and may arrive out of order (refunded before succeeded). The receiver dedupes by event ID (a seen-IDs table) and handles order by fetching current state or comparing event timestamps, chosen with a toggle.
- **Respond fast**: a receiver that does slow work before replying times out and causes redundant retries. The fix is to ack with 2xx quickly, then process from an internal queue.
- Status handling: 2xx stops retries, while 4xx/5xx and timeouts keep retrying (the provider's documented policy is shown as a table; providers differ).
**Out of scope.** Message brokers in general (`message-queues`), the outbox pattern on the sender (T3 `transactional-outbox`), and OAuth for registering webhooks.
**Kit.** `SequenceDiagram` (K-14), `crypto.ts` `hmac` (K-19) for real signatures, `GanttLanes` (K-13) for the retry timeline, `.data-table` (seen event IDs), `CodePanel` (headers and body), `Toggle`, `ScenePicker`, `createRecorder`.
**AC.**
- Watch:
  - deliveries `--info`, the current one `--hi`;
  - a verified signature `--ok`, a failed signature or stale timestamp `--bad`;
  - a retry attempt `--orange`, the receiver down `--bad` (shown as a down node);
  - a duplicate dropped by dedup `--dim`;
  - an out-of-order event `--violet`.
- Misconception: "a webhook arrives exactly once and in order", and "an unguessable URL is enough security".
- Correctness:
  - The signature is real HMAC-SHA-256 through `crypto.ts`, and a test checks it against a fixed vector.
  - Any one-byte body change fails verification.
  - Timestamp tolerance is tested at the boundary.
  - The dedup model processes each event ID once over a seeded stream with duplicates.
  - The retry schedule is a pure function, tested.
  - The ordering strategy ends at the correct final state for all orderings of 3 events (6 permutations).
- Honesty: "Simulated provider and receiver; the retry schedule and tolerance are illustrative (real providers document their own). Signatures are computed for real in your browser."
**Phone.** 2-3 lifelines fit. The retry timeline goes in `WideRegion minWidth={480}`, and the tables stack.

---

##### Batch T2-B26 · Reliable services (`arch`, `data`)
Wave 9. Proven kit only. Simulations (`useSimulation`) dominate, so every one needs a seeded, tested invariant, and the timing numbers are illustrative and labelled. `connection-pooling`'s queue sets up `resource-exhaustion` (wave 10), so its gauges should match the names that lesson will use (pool in use / waiting / timeouts).

**`timeouts-deadlines` · Timeouts & Deadline Propagation**
Track `arch` · *"How long is too long?"* · Builds on: `circuit-breakers`, `client-server`, `grpc-protobuf` · **[domain review]**
**Spec.**
- A request fans through services A → B → C (C calls the database), drawn as nested `GanttLanes` bars.
- The learner sets each hop's timeout (sliders) and C's latency (normal or a slow spike).
- **No propagation**:
  - The user gives up at 2 s, but A has a 5 s timeout, B 10 s and C 30 s.
  - The bars keep running after the caller is gone ("work nobody is waiting for", shaded red), and threads stay held.
  - A **misordered timeouts** preset (inner timeout longer than outer) shows A timing out while B still succeeds later: wasted work and a possible duplicate on retry (links to `idempotency-keys`).
- **Deadline propagation**:
  - A sets an absolute deadline (`now + 2 s`) and passes the *remaining* budget downstream (gRPC `grpc-timeout` / a deadline header).
  - A shrinking budget bar travels with the call, network and queue time come out of it, and each hop refuses to start work it can't finish ("deadline exceeded", fail fast).
- **Retries inside the budget**: one retry is allowed only if the remaining budget covers it. Shown against a naive retry that blows the deadline.
- **Picking a timeout**: a latency histogram of C (seeded) with the p50/p99 marked. Setting the timeout below p99 times out healthy-but-slow requests; setting it far above wastes resources. A plain-words rule of thumb is given.
**Out of scope.** Circuit breaking, backoff and retry storms (`circuit-breakers`; T4 `metastable-failures`), and queueing theory (T3).
**Kit.** `GanttLanes` (K-13) with `markers` (the user gives up, the deadline), `Slider`, `Bar` (the budget), `Plot2D` (K-12) histogram (`Bars`), `core/stats.ts` `histogram`, `core/sim.ts` `percentile`, `useSimulation` (seeded via `mulberry32`), `Toggle`, `ScenePicker`.
**AC.**
- Watch: active work `--info`, work continuing after the caller gave up `--bad` tint, the deadline marker `--hi`, the remaining budget bar `--ok` shrinking toward `--orange` when under 20%, a fail-fast "deadline exceeded" `--orange`, a timeout `--bad`, and the p99 line `--violet`.
- Misconception: "a timeout cancels the work downstream". It only frees the caller; without propagation and cancellation the callee keeps going.
- Correctness:
  - A pure call-chain model is tested.
  - With propagation, no hop's work extends past the original deadline (invariant over seeded latencies).
  - Without it, the wasted-work time = Σ max(0, finish_i − callerGaveUp) is computed and matches the caption.
  - The remaining budget at each hop = deadline − elapsed (tested).
  - A retry is attempted only when its expected cost ≤ the remaining budget.
  - The percentile marks use `core/sim.ts` `percentile`.
- Honesty: "Simulated services; latencies are seeded and illustrative."
**Phone.** The nested lanes go in `WideRegion minWidth={520}`. Sliders and the histogram stack below.

**`poison-messages-dlq` · Poison Messages, Retries & Dead-Letter Queues**
Track `arch` · *"One bad message, whole queue stuck"* · Builds on: `message-queues`, `idempotency-keys`
**Spec.**
- An **ordered partition** (a FIFO lane of messages) feeds one consumer.
- One message has a malformed field and deterministically makes the handler throw. The learner chooses the retry policy and watches:
  - **retry forever**: the consumer retries the same message; everything behind it waits, and the lag counter and oldest-message age climb (head-of-line blocking);
  - **max attempts + backoff**: after N attempts (with backoff delays shown) it moves to the **DLQ**, with its error and attempt count recorded, and the lane drains;
  - **drop on error**: the lane drains, but the message is lost silently (shown as a red ✕ counter: "data you'll never see again").
- **Transient vs poison**: a second preset where a dependency is briefly down makes *every* message fail for 20 s. Max-attempts-with-no-backoff dumps hundreds of good messages into the DLQ. Backoff, and a "pause consumption when the dependency is down" toggle, keep them. Error classification chips (validation error = poison, timeout = transient) route each failure.
- **Redrive**: fix the bug (a toggle), then redrive the DLQ back into the main queue. Messages succeed, and the stage notes that redrive breaks ordering and must be idempotent (a duplicate-processing counter appears if the consumer doesn't dedupe).
- **Alerting**: a DLQ depth > 0 alarm. The stage notes that a DLQ nobody watches is just a slower way to lose data.
**Out of scope.** Broker basics, acks and at-least-once delivery (`message-queues` owns them and already shows a DLQ as a destination), partitioned logs (T3 `kafka-partitioned-log`), and exactly-once (T3 `exactly-once-myth`).
**Kit.** `useSimulation` with a local `draw.ts` canvas or `ArrayStrip` for the lane (pick one; the lane is a row of message cells, so `ArrayStrip` with `cellState` is preferred), `Segmented` (policy), `Toggle`, `Stat`, `Sparkline` (lag over time), `ChipButton`, `.log-row` (the DLQ records).
**AC.**
- Watch: messages waiting `--info`, the message being handled `--hi`, the poison message `--bad`, retry attempts `--orange`, DLQ entries `--violet` (parked, not lost), dropped messages `--bad` ✕, processed messages `--ok`, and duplicates processed during redrive `--orange`.
- Misconception: "retrying forever is the safe choice" (it blocks everything behind), and "a DLQ fixes the problem" (it only parks it).
- Correctness:
  - A pure queue model is tested.
  - Under "retry forever", lag grows without bound while the poison message is at the head (monotonic over a seeded run).
  - Under max-attempts N, the poison message is attempted exactly N times and then lands in the DLQ, and every other message is processed exactly once.
  - Under "drop", the lost count = poison count.
  - Under the transient preset with backoff and pause, the DLQ stays empty.
  - Redrive without dedup double-processes exactly the messages already partially processed (tested).
- Honesty: "Simulated queue and consumer; rates and delays are illustrative."
**Phone.** The lane is horizontal: wrap it in `WideRegion minWidth={520}` (`ArrayStrip` has no vertical mode). Stats and the DLQ log wrap below.

**`caching-patterns` · Caching Patterns & Invalidation**
Track `arch` · *"There are only two hard things"* · Builds on: `lru-cache`, `db-indexes`, `replication`
**Spec.**
- Three lanes: App, Cache, DB, with a row for one product price key. The learner picks a pattern and steps reads and writes:
  - **cache-aside (lazy loading)**: a read misses, the app loads from the DB and fills the cache; a write updates the DB, then deletes (or updates) the cache key;
  - **write-through**: writes go to the cache and DB synchronously;
  - **write-behind**: writes go to the cache and the DB is updated later from a queue. A "crash before flush" button loses writes.
- **Stale-data traps** (each a preset with a step-by-step race):
  1. **Update-then-set race**: two writers interleave DB and cache updates, so the cache holds the older value indefinitely. Prefer deleting the key over setting it.
  2. **Read-fill race**: a reader fetches old data from the DB, a writer updates the DB and deletes the key, then the reader sets the stale value. TTL as a backstop.
  3. **Read replica lag**: a fill from a lagging replica.
  4. **No invalidation at all**: TTL only, with a staleness window chart.
- A TTL slider shows staleness window against hit rate (`Plot2D`, computed from the seeded workload).
- A **key design** panel: what goes into a cache key (user, locale, version). A "forgot locale in the key" toggle serves the French page to German users (a plain-words description).
- Stampede on a hot key's expiry is named in one line and handed to T3 `cache-stampede`.
**Out of scope.** Eviction policies (`lru-cache`), stampede mitigation (T3 `cache-stampede`), HTTP caching headers (`http-caching`), and CDNs (`cdn-edge`).
**Kit.** `GanttLanes` (K-13) or a `SequenceDiagram` (K-14) for the step-by-step races (`SequenceDiagram` preferred: App/Cache/DB lifelines), `Segmented` (pattern), `Slider`, `Plot2D` (K-12), `.data-table`, `createRecorder`, `ScenePicker`.
**AC.**
- Watch: a cache hit `--ok`, a miss `--hi`, DB reads and writes `--info`, an invalidation (delete) `--violet`, a stale value served `--orange`, and writes lost by write-behind on a crash `--bad`.
- Misconception: "updating the cache after updating the DB keeps them consistent". Concurrent writers can leave the cache stale forever; delete plus TTL is the safer default.
- Correctness:
  - A pure model of the three patterns is tested over every interleaving of two concurrent operations (enumerated):
    - The race presets end stale exactly as captioned.
    - "Delete the key" never leaves a stale value without a concurrent stale fill (the read-fill race), and TTL bounds staleness to ≤ TTL in every case (invariant).
    - Write-behind loses exactly the writes queued after the last flush when crashed.
  - The hit-rate vs TTL curve comes from a seeded workload run, not a formula.
- Honesty: "Simulated cache and database; the workload is seeded and the rates illustrative."
**Phone.** The `SequenceDiagram` with 3 lifelines fits. The plot is responsive and the panels stack.

**`distributed-id-generation` · Unique ID Generation: UUIDs, Snowflake & ULIDs**
Track `arch` · *"Unique without coordination"* · Builds on: `bit-manipulation`, `birthday-paradox`, `db-indexes`, `binary-hex`
**Spec.**
- **ID anatomy**: each format as a `BitStrip` with coloured fields, generated live (Generate button, or auto every 200 ms):
  - **UUIDv4**: 122 random bits plus version and variant bits.
  - **UUIDv7** (RFC 9562): 48-bit Unix ms timestamp, version, 74 random-or-counter bits.
  - **Snowflake-style 64-bit**: 1 sign bit, 41-bit ms timestamp since a custom epoch, 10-bit machine ID, 12-bit sequence.
  - **ULID**: 48-bit timestamp + 80 random bits, Crockford base32.
  - **Database auto-increment** for contrast.
- **Index locality**: insert 2,000 IDs of each kind into a simulated B-tree index drawn as leaf pages (`CellGrid`, one cell per page, coloured by "touched in the last 100 inserts"). UUIDv4 scatters writes across every page (page splits and cache misses); v7, ULID and Snowflake append to the rightmost page. Counters show pages touched and splits.
- **Snowflake limits**:
  - The sequence fills 4,096 IDs per ms per machine, after which the generator must wait for the next ms (a counter shows waits).
  - The **clock goes backwards** button: the generator must refuse or wait, or it risks duplicates. The duplicate risk is shown if the safeguard is toggled off.
  - Machine-ID assignment must be unique (two machines with the same ID collide).
- **Collision odds**: random 122 bits vs a short random 32-bit ID, with odds computed via `core/stats.ts` `collisionProbability` (linking `birthday-paradox`).
- Trade-offs table: sortable by time, size (128 vs 64 bits), leaking creation time (v7 and Snowflake reveal it), and coordination needed.
**Out of scope.** Clock sync and NTP (T3 `physical-clocks-skew`), B-tree internals (`db-indexes`), and distributed sequences via consensus.
**Kit.** `BitStrip` (fields via `groups`), `CellGrid` (K-7) for index pages, `core/stats.ts` `collisionProbability` (K-11), `Segmented`, `Button`, `Toggle`, `Stat`, `.data-table`, `core/random` `mulberry32` (seeded mode for tests; the live generator uses `crypto.getRandomValues` for random bits).
**AC.**
- Watch:
  - timestamp bits `--info`, machine ID `--violet`, sequence `--orange` (a category), random bits `--sky` (a category), and version/variant bits `--hi`;
  - in the index view, pages touched recently `--hi` tint and a page split `--bad`;
  - a duplicate ID `--bad`;
  - "waited for next ms" `--orange`.
- Misconception: "UUIDv4 is fine as a primary key everywhere". Random keys scatter B-tree inserts; time-ordered IDs keep them local.
- Correctness:
  - Generators are pure (with injected clock and randomness) and tested:
    - Snowflake encode/decode round-trips its fields, including the boundary values (sequence 4095, max machine ID 1023).
    - The 4,097th ID in the same ms waits for the next ms.
    - A clock regression is refused.
    - UUIDv7 IDs are monotonic for strictly increasing ms (and within a ms using the counter method, RFC 9562 §6.2).
    - The version and variant bits are correct for v4 and v7.
    - ULID uses the Crockford alphabet and sorts lexicographically by time.
  - The index-locality simulation's page-touch counts are tested: v7 touches ≤ 2 pages per 100 sequential inserts, v4 touches many more (a seeded threshold).
- Honesty: "The B-tree index is a simplified simulation; generated IDs are real formats, but this page's generator isn't for production use."
**Phone.** The 128-bit strips use `size="sm"` and wrap between fields. The `CellGrid` uses `size="xs"`. Nothing needs `minWidth` beyond the table scrolling inside `.data-table`.

**`connection-pooling` · Connection Pooling**
Track `data` · *"Opening a connection is the slow part"* · Builds on: `tcp-udp`, `tls-handshake`, `processes-threads`, `semaphores-condition-variables`
**Spec.**
- Requests arrive (rate slider) at app instances, each needing a database connection. A **pool** of N connection slots sits between them and a database with a max-connections limit. Slots are drawn as boxes: in use, idle, or opening.
- **No pool**: every request pays the connect cost (TCP + TLS + auth, illustrative 20-50 ms, shown as a stacked bar) before a 2 ms query. Throughput and latency suffer, and the database's process count spikes.
- **Pool too small**: requests queue for a slot. The queue grows and wait time dominates; past the acquire timeout, requests fail with "timed out waiting for a connection".
- **Pool too big × many instances**: 20 app instances × pool 50 = 1,000 connections against a database max of 500. New connections are refused, and the database slows from per-connection memory and context switching (a CPU meter). The lesson's point: total = instances × pool size.
- **Leak**: a code path that forgets to release a connection, toggled. Slots stay "in use" forever until the pool is exhausted, with a leak-detection timer flagging the long-held connection.
- Sizing helper: Little's law (connections ≈ request rate × query time) gives a starting pool size, compared with the simulation's measured in-use average. A note on PgBouncer-style external poolers for many instances.
- Gauges named as `resource-exhaustion` will name them: pool in use, waiting, timeouts.
**Out of scope.** Queueing theory derivations (T3 `queueing-theory`), database-side process models in depth, and HTTP connection reuse (`http-versions`).
**Kit.** `useSimulation` with `sim.ts` + `draw.ts` (canvas lanes) or SVG slots via `CellGrid` (K-7) for the pool boxes (`CellGrid` preferred for the slots), `Slider` (rate, pool size, instances), `Toggle` (leak), `Stat`, `Bar` (DB connections with a `marker` at the max), `Sparkline` (wait time), `core/sim.ts` `percentile`/`mean`, `ScenePicker`.
**AC.**
- Watch: a connection in use `--info`, idle `--dim`, opening (handshake) `--hi`, queued requests `--violet`, acquire timeouts `--bad`, connections refused by the DB max `--orange` (the second failure kind), a leaked connection `--bad` outline, and a served request `--ok`.
- Misconception: "a bigger pool is always faster". Past the database's capacity it makes everything slower, and instances multiply it.
- Correctness:
  - A seeded simulation is tested for these invariants:
    - in-use ≤ pool size;
    - total DB connections = Σ instance pools in use, and never above the DB max (excess refused);
    - with the leak on, in-use never decreases until the pool is exhausted;
    - a queued request either gets a slot or fails at exactly the acquire timeout.
  - Little's-law sizing = rate × mean hold time, tested; the measured mean in-use is within 10% over a long seeded run.
- Honesty: "Simulated app and database; connect and query costs are illustrative."
**Phone.** `StageFrame minWidth={520}` for the pool scene. Controls and gauges wrap below.

---

##### Batch T2-B27 · Cloud building blocks (`ops`, `data`)
Wave 9. This batch pilots `CellGrid` (K-7) as a node and pod grid, and uses `SequenceDiagram` (K-14) for cold starts. It reuses `useSimulation` heavily. Every lesson here carries "Simulated cloud; nothing touches a real account."

**`serverless-cold-starts` · Serverless & the Compute Spectrum**
Track `ops` · *"Pay per request, wait on the first one"* · Builds on: `containers`, `processes-threads`, `boot-process`
**Spec.**
- **Spectrum scene:** four columns: bare-metal or VM, container on a VM, managed containers, functions. Rows list what you manage: OS patching, runtime, scaling, capacity planning, idle cost and maximum run time. The learner clicks a row to see which columns put it on you and which on the provider.
- **Function pool scene:** requests arrive at a request-rate slider. Each one goes to a warm instance if one is free. Otherwise a cold start's three phases (provision sandbox, start runtime, run your init code) show as stacked segments ahead of the handler on a timeline.
- Idle instances fade out after an "idle reap" timer.
- Controls:
  - **Init work** slider: heavy SDK imports and connections at startup.
  - **Provisioned concurrency** count, which keeps N instances warm and charges for them.
  - **Concurrency limit**: arrivals over it are throttled (429).
- A cost panel compares pay-per-request plus provisioned with an always-on VM over the same traffic, at illustrative prices.
- Presets: "spiky traffic", "steady traffic" (the VM wins on cost) and "nightly batch".
**Out of scope.** Container internals (`containers`) and autoscaling policy (T3 `autoscaling`). Cost optimisation as a practice is T3 `finops-cloud-cost`.
**Kit.** `GanttLanes` (K-13) for per-request timelines; scene kit (`SceneNode`, `Packet`) for the pool; `useSimulation` with a `sim.ts` pool model; `Slider`, `Stat`, `Sparkline` for p50 and p99 latency; `.data-table` for the spectrum; `core/format` (`duration`, `pct`).
**AC.**
- Watch:
  - Warm instances are `--ok` and instances cold-starting are `--hi`.
  - Cold-start phases are `--hi`, `--amber` and `--violet`, and handler work is `--info`.
  - Throttled requests are `--bad`, and reaped instances fade to `--dim`.
  - Provider-managed cells are `--dim` and cells you manage are `--info`.
- Misconception: "serverless has no servers, so there's nothing to manage or tune". Also "cold starts happen only on the first request ever"; they happen whenever no warm instance is free.
- Correctness:
  - Requests see a cold start exactly when no warm idle instance exists, checked on seeded runs.
  - Provisioned N ≥ peak concurrency gives zero cold starts.
  - Concurrency above the limit gives 429s and never queues.
  - The cost model is linear in requests and duration, and matches a hand-worked case.
- Honesty: "Simulated function platform; timings and prices are illustrative, not any provider's."
**Phone.** The spectrum table scrolls in a `WideRegion` (`minWidth={560}`). The pool scene uses `StageFrame minWidth={520}`. The cost panel reflows.

**`infrastructure-as-code` · Infrastructure as Code: Plan & Apply**
Track `ops` · *"Declare the world you want; let the tool diff it"* · Builds on: `ci-pipelines`, `data-formats`, `git-internals`
**Spec.**
- Three panes:
  - **Config:** an editable declarative file (HCL-like, in a fictional provider) with a network, two VMs, a bucket and a DNS record.
  - **State:** what the tool last recorded.
  - **Real world:** the simulated cloud.
- "Plan" diffs config against state and refreshed reality:
  - `+` create, `~` update in place, `-/+` replace (a field that forces a new resource, such as a VM image), `-` destroy.
  - Each change is listed with the attribute that caused it.
- "Apply" executes in dependency order, network first, then VMs and DNS. A `GraphView` (K-6) in `layered` layout shows the resource graph lighting up as each one is applied.
- Presets:
  - Rename a VM: replace, so the learner sees the destroy coming.
  - Change a tag: in place.
  - Delete a block: destroy.
  - **Drift**: someone edits a VM size in the "console" by hand. The next plan shows the tool undoing it.
  - Lost state file: the plan wants to create everything again, and the duplicates collide.
- A "review the plan" checkpoint asks the learner to approve or reject before applying, and highlights destroys.
**Out of scope.** Continuous reconciliation from git (T3 `gitops`), module systems and state locking beyond one note.
**Kit.** `GraphView` (K-6) in `layered` layout; `CodePanel` with `stateOf` for the config and `renderLine` for the plan lines; `TextArea` for editing; `Segmented`; `.log-row` for apply output; `ScenePicker`. The diff and the dependency order are pure in `model.ts`. The config parser is a small tested lesson parser over a documented subset.
**AC.**
- Watch:
  - Create is `--ok`, update `--hi`, replace `--orange` and destroy `--bad`.
  - Resources in the graph are `--info`, and the one being applied is `--hi`.
  - Drifted attributes are `--orange` outlines.
  - No-change resources are `--dim`.
- Misconception: "apply just runs the file top to bottom" and "the config is the source of truth for what exists". The tool diffs against its recorded state and real infrastructure.
- Correctness:
  - The plan's create, update, replace and delete sets match a reference diff for every preset and for 200 seeded random config mutations.
  - The apply order is a topological order of the dependency graph.
  - Apply followed by plan gives an empty plan.
  - The drift preset's plan reverts exactly the drifted attribute.
  - The config parser refuses unknown syntax with a line number (AC-0/T2 #5).
- Honesty: "Simulated provider and cloud; the syntax is HCL-like, not a real tool's."
**Phone.** The three panes become `ScenePicker` tabs at ≤900px. The graph uses `WideRegion minWidth={480}`.

**`kubernetes-basics` · Kubernetes: Pods, Deployments & Services**
Track `ops` · *"Declare desired state; controllers make it so"* · Builds on: `containers`, `load-balancing`, `infrastructure-as-code`
**Spec.**
- Three nodes as columns, each with pod slots, drawn as a `CellGrid`. Above them is a desired-state card: Deployment `web`, `replicas: 3`, labels `app=web`. The ReplicaSet's "current vs desired" counter sits beside it.
- A **reconcile loop** indicator ticks: observe, diff, act. Each tick names its action ("2 running, want 3: create pod").
- Controls:
  - Replicas stepper (0-8).
  - "Kill a pod".
  - "Drain or kill node 2": its pods are rescheduled once the node is marked NotReady, after a timeout shortened for the lesson.
  - "Change image to v2": a new ReplicaSet scales up while the old one scales down. Only the mechanism is shown; strategies are in `deployment-strategies`.
- A Service box selects pods by label. Requests (`Packet`) only go to Ready pods. A "relabel a pod" action pulls it out of the Service without killing it.
- The scheduler places a pod on the node with free capacity. An "over-request CPU" preset leaves a pod Pending with "insufficient cpu".
**Out of scope.** Images, isolation and cgroups (`containers`). Probes (`health-checks`). Rollout strategies (`deployment-strategies`). Ingress, Helm, RBAC and operators get one line each.
**Kit.** `CellGrid` (K-7) for node slots; scene kit (`SceneNode`, `Packet`) for the Service; `useSimulation` with the controller model in `sim.ts`; `.log-row` for the event log; `Stat`, `ChipButton`, `Segmented`.
**AC.**
- Watch:
  - Running and Ready pods are `--ok`, and Pending or ContainerCreating pods are `--hi`.
  - Terminating pods are `--dim`, and a dead node is `--bad` with the cell-dead fill.
  - The reconcile action being taken is `--hi`.
  - Service traffic is `--info`, and pods outside the selector have a `--dim` outline.
  - Old and new ReplicaSet pods take `--violet` and `--sky`, as categories.
- Misconception: "`kubectl scale` starts pods directly" or "killing a pod is permanent". The controller notices the difference and recreates it.
- Correctness:
  - From any seeded sequence of pod kills, node failures and replica changes, the loop converges to `desired` Ready pods within a bounded number of ticks.
  - The Service endpoints always equal Ready pods matching the selector.
  - The scheduler never overcommits node capacity.
  - Pending is reported exactly when no node fits.
- Honesty: "Simulated cluster; timings are shortened (a real node is marked NotReady after about 40 s and its pods are evicted minutes later)."
**Phone.** `StageFrame minWidth={540}`: three node columns plus the Service. The event log reflows below.

**`health-checks` · Health Checks: Liveness vs Readiness**
Track `ops` · *"Alive isn't the same as ready"* · Builds on: `kubernetes-basics`, `load-balancing`
**Spec.**
- Four pods behind a Service, each showing three probe lights: startup, liveness and readiness. A shared database sits behind them.
- The learner configures, per probe:
  - **What it checks**: "process responds", "DB reachable", or "warm cache loaded".
  - **Period** and **failure threshold**.
- Scenarios:
  1. **Slow boot:** the app takes 30 s to warm up. Without a startup probe, the liveness probe kills it before it finishes, a restart loop that looks like CrashLoopBackOff. With a startup probe, liveness waits.
  2. **DB outage:** liveness checks "DB reachable". Every pod fails, every pod restarts at once, and the restarts reconnect and hammer the DB as it returns: a restart storm. Moving the DB check to readiness takes the pods out of rotation without restarting them.
  3. **Deadlocked process:** responds to TCP but never serves. Only an HTTP liveness check that exercises the handler catches it.
  4. **Ready too early:** readiness passes before the cache loads, and the first requests are slow or fail.
- A timeline (`GanttLanes`) per pod shows probe results, restarts and in-rotation periods.
**Out of scope.** Load-balancer health-check algorithms (`load-balancing`). Graceful shutdown on SIGTERM (`signals-graceful-shutdown`), linked rather than repeated.
**Kit.** `GanttLanes` (K-13); scene kit; `useSimulation`; `Segmented` per probe; `Slider` with `format`; `Stat` for restarts, errors served and DB connection attempts; `ScenePicker`.
**AC.**
- Watch:
  - A passing probe is `--ok`, failing `--bad`, and not yet run `--dim`.
  - A restart is an `--orange` tick on the timeline, so it reads separately from probe failures.
  - In-rotation periods are `--info`, and DB connection attempts are `--hi` pulses.
- Misconception: "liveness should check every dependency, so it's as thorough as possible". A dependency failure should take pods out of rotation, not restart them.
- Correctness:
  - A pure `probeOutcome(pod, probe, t)` drives everything.
  - Liveness failing `failureThreshold` times in a row means a restart.
  - Readiness failing means removal from endpoints, with no restart.
  - While the startup probe hasn't succeeded, neither of the other probes runs.
  - The full cross product of check type and probe in each scenario is asserted in a decision table (AC-0/T2 #2).
  - Scenario 2's restart count is all pods with the DB check on liveness, and zero with it on readiness.
- Honesty: "Simulated pods and probes; timings are compressed."
**Phone.** The pod row wraps to two by two at ≤900px. The timeline uses `WideRegion minWidth={480}`.

**`object-storage` · Object Storage vs Block vs File**
Track `data` · *"Flat keys, big buckets, different rules"* · Builds on: `file-systems`, `storage-devices`, `http-basics`
**Spec.**
- One 40 MB file, `reports/2026/q3.csv`, stored three ways side by side:
  - **Block:** numbered blocks on a volume, which the OS's file system maps.
  - **File:** a directory tree with `reports` and `2026` as real directories.
  - **Object:** a flat bucket where the whole path is one key, and "folders" are just a shared prefix. A list call with delimiter `/` fakes them.
- Operation buttons, applied to all three at once, with a verdict and cost per column:
  - **Append a line:** block and file rewrite one block. Object storage has no partial update, so it re-uploads the whole object.
  - **Rename the folder:** a file system does one metadata change. Object storage copies and deletes every key under the prefix, and it isn't atomic.
  - **Read bytes 1-100:** a block read, a file read, or an object GET with a `Range` header.
  - **List `reports/`:** paginated listing of keys.
- **Multipart upload:** the object is split into parts that upload in parallel. One part fails and is retried alone. "Complete" stitches them into one object. A part-size slider shows the minimum-part-size rule.
- An HTTP panel shows each object operation as its request (`PUT`, `GET`, `Range`, `ListObjects`-style), with fictional bucket names.
**Out of scope.** Inodes and journaling (`file-systems`). Data lakes and table formats (T3 `warehouse-lake-lakehouse`). Replication and storage-class economics get one line.
**Kit.** `CellGrid` (K-7) for blocks and parts; `TreeSvg` (tidy) for the directory tree; `.data-table` for keys; `CodePanel` for HTTP lines; `Bar` for upload progress; `ChipButton` operations; `core/format` `bytes`.
**AC.**
- Watch:
  - The cheap side of each operation is `--ok` and the costly side `--bad`.
  - The keys and blocks being touched are `--hi`, and uploading parts are `--info`.
  - A failed part is `--bad` and its retry `--hi`.
  - The prefix shared by "folder" keys is `--violet`.
- Misconception: "a bucket is a file system in the cloud" (renames, appends and directories behave differently).
- Correctness:
  - The per-operation cost model (bytes moved, requests made) matches hand-worked values for every operation and store.
  - Prefix and delimiter listing over a seeded key set matches a reference implementation, including keys that contain the delimiter twice.
  - Multipart: parts reassemble byte-identically in part-number order regardless of completion order.
  - Every part except the last respects the minimum size.
- Honesty: "Simulated stores. The 5 MiB minimum part size and the API shape follow the common S3-compatible convention, and other services differ."
**Phone.** The three columns become `ScenePicker` tabs at ≤900px, with a cost-comparison table under them that always shows all three.

---

##### Batch T2-B28 · App security (`sec`)
Wave 9. Uses `SequenceDiagram` (`csrf-cookies`, `mfa-passkeys`), `crypto.ts` `hmac` (TOTP, SHA-1), `GraphView` (IAM blast radius), `TreeSvg` (path traversal) and `CodePanel` (`renderLine`). **Every lesson in this batch is payload-free (AC-0/T2 rule 9) and [domain review].**

Batch rules:
- The "attacker" is always an abstract, labelled actor or token, never code that does something.
- Example inputs are benign strings that break naive code.
- All names, sites and accounts are fictional (`shop.example`, `other-site.example`).
- Every scene says "Simulated browser" or "Simulated cloud account" on screen.

**`xss` · Cross-Site Scripting (XSS) & Content Security Policy**
Track `sec` · *"Your page, their script"* · Builds on: `injection-attacks`, `browser-storage`, `cors-same-origin` · **[domain review]**
**Spec.**
- **Contexts scene:**
  - One comment value is rendered into four places in a page template: HTML text, a quoted attribute, a URL (`href`), and inside a script string.
  - The learner picks a benign sample: `I <3 it`, `use <b>bold</b>`, `Tom's "best" pick`, `5 > 3 & 2 < 4`, or a link `see https://shop.example/a?b=1&c=2`.
  - Per context, it shows the naive output (where the sample changes the page's structure: tags appear, the attribute ends early, the script string breaks) next to the encoded output for that context.
  - The point: the right encoding depends on the context, and "escape HTML" is wrong for a URL or a script.
- **Sinks scene:** the same value through `textContent` / `setAttribute` (data stays data) vs `innerHTML` / `document.write` / an `href` set from input. Unsafe sinks are highlighted in a `CodePanel` with the safe replacement next to them. Frameworks' auto-escaping is named, along with their escape hatches (`dangerouslySetInnerHTML`, `v-html`).
- **Damage-limitation scene:**
  - Assume an injected script got in. It's drawn as an abstract labelled "untrusted script" token; there is no code.
  - Toggle the layers and watch what the token can and can't reach:
    - **CSP** `script-src 'self'` with a nonce: the token never runs;
    - **HttpOnly** session cookie: the cookie is out of reach, but the token could still act as the user on the page;
    - **SameSite** and short sessions.
  - Each layer's effect comes from a decision table.
- Stored, reflected and DOM-based XSS are three chips that re-route *where* the value comes from (database, URL, client-side code). Plain words, no payloads.
**Out of scope.** Data-vs-code in SQL/shell is `injection-attacks`; the cookie flag matrix is `browser-storage`; CSRF is `csrf-cookies`; the full CSP directive reference is named only.
**Kit.** `CodePanel` (`renderLine` for coloured template slots, `stateOf` `bad` for unsafe sinks), a real `DOMParser`-based encoder check, scene kit (`SceneNode`, `TravelDot` for the abstract token), `ChipButton` (benign samples), `Toggle`, `ScenePicker`, `.data-table`.
**AC.**
- Watch:
  - data characters are `--info`;
  - characters that became markup or structure are `--bad`;
  - encoded output is `--ok`;
  - the abstract untrusted-script token is `--orange` (a labelled actor), turning `--dim` when blocked;
  - an active defence layer is `--violet`, and the layer that stopped it is `--ok`.
- Misconception: "escaping HTML everywhere is enough", and "HttpOnly prevents XSS".
- Correctness:
  - Each context encoder round-trips: parsing the encoded output with a real `DOMParser` and reading the text or attribute back yields the original sample, for every sample and for 500 seeded random strings.
  - The naive outputs change the parsed DOM structure exactly for the samples the screen says they do (structure diff asserted).
  - The CSP/HttpOnly/SameSite reach table is tested exhaustively over all toggle combinations.
- Honesty: "Simulated browser; the 'untrusted script' is a placeholder, nothing is executed. Real CSP has many more directives."
**Phone.** The four contexts stack as cards at ≤900px. `CodePanel` lines wrap (the snippets are short by design). The damage scene's layer rings are an SVG with `StageFrame minWidth={360}`.

**`csrf-cookies` · CSRF & SameSite Cookies**
Track `sec` · *"Your browser, their form"* · Builds on: `browser-storage`, `cors-same-origin`, `auth-sessions-jwt` · **[domain review]**
**Spec.**
- A `SequenceDiagram` with actors You (browser), `shop.example` (logged in, cookie session) and `other-site.example`.
- **Scenario:** you visit the other site while logged in. Its page makes your browser send a "change email" POST to `shop.example`. Described in words as "a page on another site can make your browser submit a request"; the diagram shows the request leaving with your cookie attached.
- The server can't tell this apart from a real click without a defence.
- Defence toggles, each re-running the diagram with the exact point it stops:
  - **SameSite=Lax/Strict** on the session cookie: the cookie isn't attached, so the request arrives logged-out;
  - **CSRF token** (a synchronizer token in the form, or double-submit): the other site can't read it, so the request is rejected;
  - **Origin/Referer check**: the header shows `other-site.example`, rejected;
  - **require a JSON content type + custom header**: forces a CORS preflight the other site fails (linked to `cors-same-origin`).
- Defence-in-depth note: SameSite=None cookies (needed for some embeds) bring the risk back; GET must never change state.
- A "why CORS doesn't stop this" chip: the request is *sent*; CORS only hides the response.
- A "token auth in a header" preset (`Authorization: Bearer`): the browser doesn't attach it automatically, so classic CSRF doesn't apply, and the caption explains the trade-off with `browser-storage`.
**Out of scope.** The full SameSite send matrix belongs to `browser-storage` (this lesson reuses its rule, described, not re-derived); XSS defeats CSRF tokens and is `xss`; clickjacking is named only.
**Kit.** `SequenceDiagram` (`lost` for a rejected request, `note` for each defence's verdict), `Toggle` ×4, `Segmented` (cookie mode), `CodePanel` (request headers), `ScenePicker`.
**AC.**
- Watch: requests you meant to send are `--info`, the cross-site request `--orange`, the cookie header `--hi`, a request the server accepted `--bad` (the harm), a request that was rejected or stripped `--ok`, and a disabled defence `--dim`.
- Misconception: "CORS protects against CSRF", and "a POST-only endpoint is safe".
- Correctness:
  - The verdict table (cookie sent? token valid? origin allowed? preflight passed?) is tested exhaustively over every combination of the four defences and the three cookie modes.
  - The SameSite rule matches the browser-storage rule (Lax: sent on top-level cross-site GET navigations, not on a cross-site POST), and that rule is asserted in this lesson's test too.
  - The token check uses constant-time comparison.
- Honesty: "Simulated browser and sites; nothing leaves your machine. Browser defaults differ: Chromium treats cookies without SameSite as Lax."
**Phone.** `SequenceDiagram` in its `WideRegion` (about 480). The defence toggles wrap above it; the header panel stacks below.

**`mfa-passkeys` · MFA, TOTP & Passkeys**
Track `sec` · *"Something you know, have, or are"* · Builds on: `macs-hmac`, `digital-signatures-pki`, `time-and-timezones` · **[domain review]**
**Spec.**
- **Factors panel:** know / have / are chips. Two of the same kind (password + security question) is not two-factor, and a preset shows it.
- **TOTP lane:**
  - A shared secret (base32, generated in the browser, shown once like a QR enrolment) and a ticking 30-second clock.
  - The steps: counter = ⌊unix time / 30⌋ → HMAC-SHA-1 of the 8-byte counter → dynamic truncation (the offset nibble and the 31-bit slice highlighted in `ByteGrid`) → 6 digits.
  - A clock-skew slider shows the server accepting ±1 window and refusing beyond it.
  - The phone and server computing the same code independently is the "aha".
- **Phishing comparison lane**, in plain words only:
  - A look-alike site (`shop-example.test`) asks for your password and code.
  - With password + TOTP, "anything you can type, a fake site can pass on within the 30 seconds", drawn as a single labelled arrow.
  - With a **passkey**, your authenticator signs a challenge bound to the real origin. On the look-alike origin it has no credential to offer, so nothing usable exists to pass on.
  - It's shown as the origin check in a `SequenceDiagram` and a real ECDSA signature over (challenge, origin).
  - No relay mechanics, kits or steps.
- **Recovery panel:** SMS codes (SIM swap named as a risk), backup codes, and multiple passkeys. The weakest recovery path sets the real security.
**Out of scope.** Session handling after login is `auth-sessions-jwt`; federation is T3 `oauth-flows` (exists); the WebAuthn wire format and attestation are named only.
**Kit.** `crypto.ts` (`hmac` with `{ hash: 'SHA-1', out: 'bytes' }`, `ecdsaKeyPair`/`ecdsaSign`/`ecdsaVerify`), `ByteGrid`, `SequenceDiagram`, `Bar` (the 30 s window), `useInterval`, `Slider` (skew, `format`), `ScenePicker`. The base32 codec is local (one user).
**AC.**
- Watch:
  - the shared secret is `--violet` with a lock;
  - the counter is `--info`;
  - the truncation offset nibble and the selected 4 bytes are `--hi`;
  - the accepted code is `--ok`, a rejected one `--bad`;
  - the look-alike site is `--orange`;
  - the passkey's origin match is `--ok` and its mismatch `--bad`;
  - the countdown bar is `--info`.
- Misconception: "any MFA stops phishing".
- Correctness:
  - TOTP matches the RFC 6238 Appendix B SHA-1 vectors (e.g. T = 59 → 94287082 at 8 digits; T = 1111111109 → 07081804).
  - The 6-digit output equals the last 6 digits.
  - The skew window accepts exactly ±1 step.
  - Base32 round-trips.
  - The origin-bound check: a signature over (challenge, `shop.example`) verifies only for that origin, and an assertion for the look-alike origin is never produced (the authenticator has no credential for it), asserted.
  - The lesson clock is injectable for tests.
- Honesty: "Real HMAC-SHA-1 and ECDSA in your browser; the sites, phone and authenticator are simulated. Passkeys are simplified: real WebAuthn adds attestation, counters and user verification."
**Phone.** The TOTP lane fits (`ByteGrid perRow={8}`). The phishing `SequenceDiagram` uses its `WideRegion` (about 480). The factor chips wrap.

**`iam-least-privilege` · Cloud IAM, Least Privilege & Short-Lived Credentials**
Track `sec` · *"Grant the minimum, for the shortest time"* · Builds on: `security-principles`, `secrets-management` · **[domain review]**
**Spec.**
- **Policy simulator:**
  - A request (principal, action, resource) is evaluated against an editable list of policy statements (`Allow`/`Deny`, action patterns like `storage:Get*`, resource patterns like `bucket/reports/*`).
  - Evaluation lights each statement as matching or not and shows the order of the rule: an explicit Deny wins, then any Allow, else an implicit deny.
  - Presets: "works", "wildcard too wide", "deny overrides allow", "typo in resource", "no statement matches".
- **Blast radius:**
  - A fictional account's resources (buckets, queues, databases, a secrets store) in a `GraphView`.
  - Compromise a principal and every resource it can reach lights up. Widen `storage:*` to `*` and the reachable set floods; trim it to what the service uses and it shrinks.
  - A "used in the last 90 days" overlay suggests the trimmed policy (access-analysis style), computed from a lesson-authored access log.
- **Short-lived credentials:**
  - A long-lived access key in a config file vs a role assumed for 15 minutes.
  - A countdown expires the temporary key, and a "copied to a laptop" event shows the leaked key dying on its own vs living for months.
  - A vault issues per-deploy database credentials that rotate on a timer (the follow-up from T1 `secrets-management`).
- Plain-words risk line: "an attacker with an over-broad role can reach everything it reaches". No privilege-escalation steps.
**Out of scope.** RBAC/ABAC/ReBAC models stay in T3 `authz-models`; network segmentation is `zero-trust` (exists); the principle itself is `security-principles`.
**Kit.** `GraphView` (`fixed` layout; `nodeMark` for reachable), `CodePanel` (statements, `stateOf` `now`/`done`/`cut`), `Bar` (credential lifetime), `useInterval`, `TextField` (pattern edit via a tested lesson glob matcher), `ScenePicker`, `ChipButton` presets.
**AC.**
- Watch:
  - the request is `--info`;
  - the statement being checked is `--hi`;
  - a matching Allow is `--ok` and a matching Deny `--bad`;
  - non-matching statements are `--dim`;
  - reachable resources are a `--bad` tint (blast radius), unreachable ones `--dim`;
  - the compromised principal is `--orange`;
  - an expired credential is `--dim`.
- Misconception: "a broad role is fine because the service only calls what it needs".
- Correctness:
  - The evaluator implements explicit deny > allow > implicit deny, tested exhaustively over all presets × all requests and over seeded random policy sets against a straightforward reference.
  - Glob matching (`*` within and across `/` per the documented rule) is tested.
  - The blast radius equals the set of resources with at least one allowed action.
  - The suggested policy grants exactly the actions present in the access log.
  - Expiry uses a lesson clock.
- Honesty: "Simulated cloud account with a simplified policy language; real IAM systems add conditions, boundaries and resource policies."
**Phone.** The policy list and the request card stack. The `GraphView` sits in a `WideRegion` (about 520). The countdown bars fit.

**`deserialization-path-traversal` · Path Traversal & Insecure Deserialization**
Track `sec` · *"When input picks the file, or the type"* · Builds on: `injection-attacks`, `command-line`, `data-formats` · **[domain review]**
**Spec.**
- **Path scene:**
  - A fictional server tree in a `TreeSvg`: `/srv/shop/uploads/…` beside `/srv/shop/config/settings.yml` and `/srv/shop/keys/` (all fictional).
  - The download handler joins `uploads/` with a user-supplied file name. The learner types or picks benign names: `invoice-42.pdf`, `2026/march.csv`, `notes..txt` (two dots inside a name, harmless), and `reports/../../config/settings.yml`.
  - The resolver walks segment by segment, highlighting each `..` climbing a level, until the final path is drawn and checked against the uploads folder.
  - **The fix toggle:** resolve first, then require the result to stay under the uploads root (with a trailing separator, so `uploads-old/` doesn't pass). Better: look files up by ID, not name.
  - Encoded or alternate separators are named in one line ("check after decoding, on the platform's own resolver"), not demonstrated.
- **Deserialization scene:**
  - The same "saved cart" read back two ways.
  - **Data-only format:** JSON parsed, then validated against a schema; unknown fields are rejected.
  - **Type-naming format:** a blob whose header names a class to construct. The loader looks the type up and runs its setup code before your code sees the object. Drawn as "the input chose which constructor ran", with a constructor box lighting up. There is no gadget, no class names from real libraries, and no executable content.
  - Fix toggles: data-only format; an allow-list of types; signing the blob (`macs-hmac`) so only your server's output is accepted; never deserialising untrusted input with native serializers. Pickle, Java serialization and YAML tags are named as examples of type-naming formats.
**Out of scope.** Injection into interpreters is `injection-attacks`; SSRF and broken access control stay in T3 `ssrf-access-control`; sandboxing stays in T3 `sandboxing-isolation`.
**Kit.** `TreeSvg` (`tidy`; `nodeMark` for the walk), `CodePanel` (handler code with the check line, `renderLine`), `TextField` (a learner-typed name, with hostile-input rules per AC-0/T2 rule 5), `ChipButton` (benign samples), `Toggle`, `ScenePicker`, `ConsolePanel` (validation errors).
**AC.**
- Watch:
  - the current path segment is `--hi`;
  - the `..` steps are `--violet` arrows up the tree;
  - the uploads root is an `--ok` outline;
  - a resolved path outside it is `--bad`, and inside it `--ok`;
  - the constructor box that ran because the input named it is `--bad`;
  - a schema rejection is `--ok`;
  - untouched tree nodes are `--dim`.
- Misconception: "stripping `../` from the name is enough", and "deserialising is just parsing".
- Correctness:
  - The lesson resolver matches `path.posix.resolve`/`normalize` on the samples and on 1,000 seeded benign paths built from a fixed alphabet of segments (`a`, `b`, `.`, `..`, empty).
  - The containment check accepts exactly the paths under `uploads/`, including the `uploads-old/` sibling case.
  - The naive "strip ../" filter is shown failing as a plain-words statement ("removing a pattern once can leave a new one behind"), asserted on the abstract segment model. No bypass string is shown.
  - The schema validator rejects unknown types and extra fields.
  - The type-naming loader runs a constructor only when its allow-list is off.
- Honesty: "Fictional file tree and loader; nothing on your machine is read, and nothing is executed."
**Phone.** The tree is 3-4 levels and sits in a `WideRegion` (about 480). The `CodePanel` and the name field reflow below. The deserialization scene stacks its two lanes vertically at ≤900px.

---

##### Batch T2-B29 · How browsers render (`web`)
Wave 10. This batch pilots `GanttLanes` (K-13) as a network waterfall. Following Tier 1's web batch, anything the real browser can show is shown from the real browser. Where a page load has to be scripted (a real reload can't run inside a stage), the stage says "scripted page load".

**`browser-rendering-pipeline` · How Browsers Render a Page**
Track `web` · *"Parse, style, layout, paint, composite"* · Builds on: `dom-events`, `css-layout`, `web-request`
**Spec.**
- A pipeline strip (Parse HTML → DOM, Parse CSS → CSSOM, Style, Layout, Paint, Composite) above a small real sandbox element.
- The learner changes one CSS property on the sandbox box from a picker (`width`, `top`, `color`, `background`, `box-shadow`, `transform`, `opacity`). The strip lights the stages that property typically re-runs: geometry runs layout, paint, composite; paint-only runs paint, composite; `transform`/`opacity` on a promoted layer runs composite only.
- **Layout thrashing:** a real loop over 200 sandbox rows, written two ways.
  - Interleaved: read `offsetHeight`, then write a style, in each iteration.
  - Batched: all reads, then all writes.
  - The real time for each, measured with `performance.now()`, shows on a bar, and the interleaved one forces synchronous layout per row.
- **Animation:** the same box animated with `left` and with `transform`, side by side, with a frame-time sparkline from real `requestAnimationFrame` deltas. Optional "stress the main thread" busy-wait: the transform animation keeps running on the compositor and the `left` one stutters.
- A "render tree" panel shows that `display: none` removes a node from it while `visibility: hidden` keeps its box.
**Out of scope.** Resource loading order and first paint (`critical-rendering-path`). Metrics (`core-web-vitals`). GPU internals (T3).
**Kit.** Pipeline strip from scene kit nodes (`SceneNode`); `TreeSvg` (tidy) for the DOM → render tree; `Segmented`; `Bar`; `Sparkline`; `useMeasure`; `CodePanel` for the two thrash loops (`renderLine` highlights the forced-layout line).
**AC.**
- Watch:
  - Stages re-run by the change are `--hi`, skipped stages `--dim`, and composite-only paths `--ok`.
  - The interleaved loop's bar is `--bad` and the batched one `--ok`.
  - Render-tree nodes are `--info`, and nodes removed by `display: none` are `--dim` and dashed.
- Misconception: "every CSS change costs the same", or "the browser redraws the whole page on any change".
- Correctness:
  - The property-to-stages table is data, tested against a documented list. Each of its entries is noted as "typical Chromium behaviour".
  - The thrash demo really interleaves reads and writes, and a test checks the generated loop order.
  - The render-tree builder drops `display: none` subtrees and keeps `visibility: hidden` ones.
  - Measured times are shown as measured, never typed in.
- Honesty: "Which stages re-run is the typical behaviour in Chromium-based browsers. Engines differ, and DevTools' Performance panel is the real authority. The timings are measured live on your device."
**Phone.** The pipeline strip wraps into two rows (three stages each) at ≤900px. The sandbox and bars stack.

**`critical-rendering-path` · Critical Rendering Path & Resource Loading**
Track `web` · *"What blocks the first pixel"* · Builds on: `browser-rendering-pipeline`, `web-request`
**Spec.**
- A page-load waterfall (`GanttLanes`): one lane each for HTML, two stylesheets, three scripts, a web font and the hero image, plus a "parser" lane and a "first paint" marker.
- The learner edits the `<head>` with toggles per resource:
  - Scripts: sync, `async`, `defer`, or `type="module"`.
  - Stylesheets: normal, `media="print"`, or inlined critical CSS.
  - Font: `preload`, and `font-display: swap`.
  - Hero image: `preload` / `fetchpriority="high"`.
- On every change the waterfall re-solves.
  - Sync scripts pause the parser until they download and run.
  - CSS blocks rendering, and also blocks a following sync script from running.
  - `async` runs as soon as it arrives, interrupting parsing and in any order.
  - `defer` and modules run after parsing, in document order, before `DOMContentLoaded`.
- First paint moves left or right accordingly, with "blocked by …" labels.
- A filmstrip under the waterfall shows the page's visible state at first paint, DOMContentLoaded and load: blank, text in a fallback font, then the hero.
- Presets: "everything sync in head", "the fixed version", and "async scripts that depend on each other", which breaks because the order isn't guaranteed.
**Out of scope.** HTTP/2 multiplexing (`http-versions`). Caching (`http-caching`). Metric definitions (`core-web-vitals`). Bundling (`bundlers-code-splitting`).
**Kit.** `GanttLanes` (K-13) with `markers` for first paint and DCL; `Segmented` per resource; `Toggle`; `CodePanel` showing the generated `<head>`; `core/format` `duration`. The loading model is pure in `model.ts`.
**AC.**
- Watch:
  - Download bars are `--info` and execution bars `--hi`.
  - Parser-blocked time is hatched `--bad`, and render-blocking CSS has a `--bad` outline.
  - The first-paint marker is `--ok` and the DOMContentLoaded marker `--violet`.
  - Non-blocking resources are `--dim` outlines until they matter.
- Misconception: "`async` and `defer` are the same, just make scripts non-blocking", and "CSS doesn't block anything because it's not JavaScript".
- Correctness:
  - Per the HTML spec ordering:
    - defer and module scripts execute in document order after parsing.
    - async scripts execute when fetched.
    - A sync script waits for pending stylesheets before running.
  - First paint never happens before all render-blocking CSS has arrived.
  - All of this is tested on every preset and on 200 seeded random `<head>` configurations against an independent reference.
- Honesty: "Scripted page load on an illustrative network (fixed latencies and sizes); the ordering rules are the real ones."
**Phone.** The waterfall uses `WideRegion minWidth={560}`, so lane labels stay at least 8px. Toggles wrap above it, and the filmstrip shows three thumbnails in a row at 100px each.

**`core-web-vitals` · Core Web Vitals: LCP, INP & CLS**
Track `web` · *"Speed as users actually feel it"* · Builds on: `critical-rendering-path`, `browser-rendering-pipeline`
**Spec.**
- Three tabs, each with its own meter: LCP, INP and CLS. Each meter shows the good / needs improvement / poor bands: LCP ≤ 2.5 s / ≤ 4 s / above; INP ≤ 200 ms / ≤ 500 ms / above; CLS ≤ 0.1 / ≤ 0.25 / above.
- **LCP:** a scripted page-load filmstrip where candidate elements appear (a heading, then the hero image, then a big text block). The current LCP candidate is outlined, and LCP is the render time of the last, largest candidate before input. Fixes: preload the hero, don't lazy-load it, serve a smaller image.
- **CLS:** the learner triggers shifts: a late ad without reserved space, a web font swap, an image without dimensions. Each shift's score is impact fraction × distance fraction, shown with both rectangles. Shifts group into session windows (under 1 s apart, at most 5 s long), and CLS is the largest window. A "within 500 ms of your click" shift is excluded and labelled so. Fixes: `width`/`height` or `aspect-ratio`, and reserved slots.
- **INP:** a real button in the sandbox whose handler does a configurable amount of synchronous work. The learner clicks it. Each interaction is broken into input delay, processing and presentation delay, measured with real `performance.now()` around the handler and the next frame. INP is the worst interaction, ignoring one per 50 interactions. Fixes: yield with `setTimeout` or `scheduler.yield` where available, and move work off the main thread.
- A "field vs lab" note: the real metrics are judged at the 75th percentile of real users' page loads.
**Out of scope.** Collecting RUM data and analytics pipelines. Older metrics (FID, TTI) get one line.
**Kit.** `GanttLanes` (K-13) for the INP breakdown; `CellGrid` or local SVG rectangles for the CLS impact area; `Bar` with `marker` for the threshold meters; `ScenePicker`; `Slider` for handler work; `.log-row` for the interaction log.
**AC.**
- Watch:
  - Band colours: good `--ok`, needs improvement `--orange`, poor `--bad`.
  - The current LCP candidate is outlined `--hi`.
  - In a shift: the shifting element is `--info`, the impact region a `--hi` tint, and the excluded shift `--dim`.
  - INP phases: input delay `--violet`, processing `--hi`, presentation `--info`.
- Misconception: "a fast load time means a fast page". The layout jumping and laggy clicks are separate metrics.
- Correctness:
  - CLS: layout-shift score = impact fraction × distance fraction, and the session-window grouping (1 s gap, 5 s cap, maximum window) is tested against hand-worked sequences.
  - Shifts with recent input are excluded.
  - INP selection: the worst interaction, ignoring the highest one per 50 interactions.
  - LCP picks the largest candidate rendered before the first input.
  - Threshold bands are tested exactly at their edges.
- Honesty: "The LCP and CLS page loads are scripted (a real load can't run inside this page); the formulas are the real definitions. INP's timings are measured live from your clicks."
**Phone.** Tabs; each scene fits at 390. The INP breakdown lane chart uses `WideRegion minWidth={420}`.

**`bundlers-code-splitting` · Bundlers, Tree Shaking & Code Splitting**
Track `web` · *"Shipping less JavaScript"* · Builds on: `build-systems`, `critical-rendering-path`, `dependency-management`
**Spec.**
- A module graph (`GraphView`, layered layout) for a fictional app:
  - `main.js` imports `router`, `ui/button`, `utils` (with five named exports) and a date library.
  - Three routes: `home`, `settings`, `reports`.
  - Every module has a size in KB.
- Step 1, **bundle**: the graph is walked from the entry and everything reachable is concatenated into one chunk. A bytes bar shows its size.
- Step 2, **tree shaking**: unused exports fade out of `utils` (only `formatDate` is imported).
  - A toggle marks one module as having side effects (`sideEffects: true` style), so it can't be dropped.
  - A `require()`-style (CommonJS) toggle on the date library makes it un-shakeable.
- Step 3, **code splitting**: turn `reports` into `import('./reports')`. The graph splits into an initial chunk and a lazy chunk, and a shared vendor chunk appears when two routes use the same library.
- A "navigate" control (home → reports) shows the lazy chunk loading on demand in a small waterfall, with the cost of a too-fine split (many tiny requests) as a preset.
**Out of scope.** Build caching and incremental builds (`build-systems`). Minification internals and source maps get one line. Real bundler configuration.
**Kit.** `GraphView` (K-6) in `layered` layout with `nodeMark` per chunk; `GanttLanes` (K-13) for chunk loading; `Bar`; `Toggle`; `ScenePicker`; `core/format` `bytes`. Reachability, shaking and chunking are pure in `model.ts`.
**AC.**
- Watch:
  - Modules and exports in the initial chunk are `--info`, and shaken-out exports are `--dim` and dashed.
  - The lazy chunk is `--violet` and the vendor chunk `--sky`, as categories.
  - A module kept only because of side effects has a `--orange` outline.
  - The module being visited is `--hi`.
- Misconception: "importing one function from a library only ships that function" (it depends on ES modules and side-effect-free code). Also "more chunks are always faster".
- Correctness:
  - Included modules equal what's reachable from the entry.
  - Shaken output keeps exactly the used exports, plus every side-effectful module.
  - CommonJS modules are never shaken.
  - Split chunks partition the graph: every module is in exactly one chunk, shared modules go to vendor when used by two or more chunks, and the initial chunk contains no lazy-only module.
  - Byte totals equal the sums of module sizes.
  - All of this is tested on presets and seeded random graphs.
- Honesty: "A model of what bundlers do with a fictional app. Real tools (and their heuristics) differ in detail."
**Phone.** The graph uses `WideRegion minWidth={520}`. The bytes bar and waterfall stack below at full width.

**`rendering-strategies` · CSR vs SSR vs SSG & Hydration**
Track `web` · *"Where the HTML is made, and when"* · Builds on: `critical-rendering-path`, `client-server`, `web-request`
**Spec.**
- Four lanes side by side, one per strategy: client-side rendering, server-side rendering, static generation (at build time), and SSR with streaming.
- Each lane is a timeline (`GanttLanes`) with:
  - **Server:** data fetch, render HTML (SSR at request time; SSG at build time, shown off to the left).
  - **Network:** HTML arrives, JS bundle arrives.
  - **Browser:** first paint, hydration, interactive.
- A mock phone screen per lane steps through **blank → visible → interactive**. The "uncanny valley" between visible and interactive is highlighted: a click during it is shown as ignored or queued.
- Sliders: data-fetch latency, bundle size, and device speed (CPU multiplier for hydration). Each lane re-solves.
- A trade-off table under the lanes: SEO-visible HTML, time to first paint, time to interactive, server cost per request, and data freshness (SSG is stale until the next build; on-demand revalidation gets a one-line note).
- Presets: "marketing page" (SSG wins), "logged-in dashboard" (CSR or SSR), "slow phone" (hydration dominates).
**Out of scope.** Framework specifics, edge rendering and caching layers (`http-caching`, `cdn-edge`). The virtual DOM (`virtual-dom-reconciliation`).
**Kit.** `GanttLanes` (K-13) with markers; `Slider` with `format`; `.data-table`; `ScenePicker` for presets; a lesson-local mock phone frame. The timeline model is pure in `model.ts`.
**AC.**
- Watch:
  - Server work is `--violet`, network transfer `--info` and browser work `--hi`.
  - The first-paint marker is `--ok`, and the interactive marker `--ok` with a solid fill.
  - The visible-but-not-interactive gap is a `--orange` tint.
  - Blank screens are `--dim`.
- Misconception: "SSR makes the page interactive sooner". It makes the page visible sooner, but interactivity still waits for the JS to download and hydrate.
- Correctness:
  - Each lane's milestones follow its dependency rules (for example, CSR's first contentful paint is after the JS runs; SSR's first paint is before the JS arrives; hydration starts only after both the HTML and the JS are present).
  - These are tested for every preset and over a slider grid.
  - The ordering paint ≤ interactive holds in every lane.
  - The table's cells are derived from the model, not typed in.
- Honesty: "Illustrative timings on a modelled network and device; real frameworks add their own steps."
**Phone.** The four lanes become a `Segmented` choice showing one or two at a time at ≤900px ("compare two" picks both), plus a `WideRegion minWidth={480}` timeline.

---

##### Batch T2-B30 · UI frameworks & product (`web`)
Wave 10. This batch reuses `TreeSvg` for virtual DOM and component trees, and `GraphView` (K-6) for lifecycle state machines. Where it can, the lesson runs **real React** inside the stage (the app is already React), so its behaviour is real by construction.

**`virtual-dom-reconciliation` · Virtual DOM, Reconciliation & Keys**
Track `web` · *"Describe the UI; let the framework diff it"* · Builds on: `dom-events`, `tree-traversals`, `browser-rendering-pipeline`
**Spec.**
- Two virtual trees, old and new, drawn as a pair of `TreeSvg`s. A diff pass walks them node by node and emits patches into a log (UPDATE text, REPLACE, INSERT, MOVE, REMOVE), applied to a third "real DOM" panel with a DOM-ops counter.
- Rules shown as they fire:
  - The same element type updates in place.
  - A different type replaces the whole subtree.
  - Children are matched by index without keys, and by key with keys.
- List presets: insert at the start of 5 items, reverse, delete the middle, and change one item. Each is run with **no keys**, **index keys** and **stable id keys**, with the op counts compared.
- **Real React panel:** a real list of rows, each with an uncontrolled text input, rendered with `key={index}` or `key={id}`. The learner types in row 2, then clicks "insert at top". With index keys the typed text sticks to the wrong row. This is the bug, running for real.
- A "wasted render" toggle shows a component re-rendering with identical output. The DOM-ops counter stays at 0, but the render counter climbs.
**Out of scope.** State ownership (`frontend-state-management`). Tree traversal mechanics (`tree-traversals`). Fiber scheduling and concurrency get one line.
**Kit.** `TreeSvg` (tidy, `nodeMark`, `hidden` for removed nodes); `.log-row` for patches; `Stat`; `Segmented`; `ScenePicker`. The diff algorithm is pure in `model.ts`; it's a teaching reconciler implementing the documented React heuristics. The real React list is a small lesson component.
**AC.**
- Watch:
  - The node being compared is `--hi`.
  - Patches: update `--info`, insert `--ok`, remove `--bad`, move `--violet`.
  - Replace is `--orange`, as the costly kind of change, distinct from remove.
  - Unchanged nodes are `--dim`.
  - In the real React panel, the mismatched row's input is outlined `--bad`.
- Misconception: "index keys are fine because React handles the rest", and "the virtual DOM makes updates free". Diffing has its own cost, and keys decide what gets reused.
- Correctness:
  - For every preset, the patch list applied to the old real-DOM model yields the new tree, checked by a structural comparison.
  - Keyed insert-at-start gives exactly 1 insert and 0 updates. Unkeyed gives n updates plus 1 insert.
  - Reversing with keys gives moves only.
  - A seeded random list mutation property test checks that applying the patches always reaches the target.
  - The React panel's bug is reproduced in a Vitest + React test (render, type, insert, read input values).
- Honesty: "The diff on the left is a teaching reconciler following React's documented rules; the list on the right is real React."
**Phone.** At ≤900px the old and new trees stack vertically (each `WideRegion minWidth={360}`). The log and real-React panel go below.

**`frontend-state-management` · Frontend State: Stores, Signals & Server State**
Track `web` · *"Who owns this data?"* · Builds on: `virtual-dom-reconciliation`, `functional-programming`
**Spec.**
- A component tree (`TreeSvg`): App → Header (cart badge), ProductList → ProductCard ×4, and Sidebar → CartSummary. The learner clicks "add to cart" on a card.
- The same change runs under four approaches, picked with a `Segmented`:
  - **Lifted state with prop drilling:** the state lives in App. Every component on the path re-renders, and intermediate components pass props they never use.
  - **Context:** every consumer re-renders, even ones that only read an unrelated field.
  - **Store with selectors:** only components whose selected slice changed re-render.
  - **Signals:** a fine-grained dependency graph updates only the badge and the summary text.
- Re-render flashes are counted per component.
- **Real React panel:** the same tree implemented with real `useState`, Context and a tiny `useSyncExternalStore` store. Render counters come from real renders, and they should match the model's flashes.
- **Server state:** a "product prices" fetch with stale-while-revalidate. The learner edits a price "on the server". The UI shows the stale value, then the revalidated one. A "copy server data into a local store" anti-pattern preset shows the two drifting apart.
- **Derived state:** a cart total that's computed from the items vs one that's stored separately and forgotten on update. The stored copy goes stale.
**Out of scope.** Specific libraries by name. Reconciliation mechanics (`virtual-dom-reconciliation`). Offline sync (T3 `offline-first-sync`).
**Kit.** `TreeSvg` (tidy, `nodeMark`, `nodeScale` flash); `GraphView` (K-6) for the signals dependency graph; `Stat`; `Segmented`; `ScenePicker`; `SequenceDiagram` (K-14) for the SWR fetch and revalidate. The signals implementation is a small, lesson-local, tested `signal`/`computed`/`effect`.
**AC.**
- Watch:
  - A component that re-rendered flashes `--hi`, and one that rendered with nothing changed is a `--orange` tint ("wasted").
  - Components that didn't re-render are `--dim`.
  - The state's owner is `--violet`.
  - A stale value is outlined `--bad` and a fresh value `--ok`.
- Misconception: "put everything in one global store" or "Context is a state manager that only updates what changed".
- Correctness:
  - For each approach, the set of re-rendered components equals the model's prediction.
  - In the real React panel, real render counts equal the model's for every action. That is checked in the real browser (`npm run shot` with `--press` over the action buttons, results in the batch report), because Vitest here has no DOM. Adding jsdom or Testing Library is a kit-round decision, not the batch's.
  - A signals `computed` recomputes only when one of its dependencies changes, with a glitch-free diamond dependency test.
  - The derived-total preset is correct after any sequence of seeded edits.
  - The SWR model shows stale, then fresh, in that order.
- Honesty: "The tree on the left is a model; the counters on the right come from real React renders. The server is simulated."
**Phone.** The tree uses `WideRegion minWidth={440}`. The approach picker and counters wrap above it, and the real-React panel goes below.

**`mobile-app-lifecycle` · Mobile App Lifecycle & Constraints**
Track `web` · *"The OS can kill your app at any moment"* · Builds on: `processes-threads`, `signals-graceful-shutdown`, `browser-storage`
**Spec.**
- A phone mock with a draft-message form, beside a lifecycle state machine (`GraphView` with `startNode`). A platform toggle switches between the real state names:
  - **Android activity:** Created, Started, Resumed, Paused, Stopped, Destroyed.
  - **iOS app:** Not running, Inactive, Active, Background, Suspended.
- Event buttons:
  - Incoming call (→ paused / inactive).
  - Home button (→ stopped / background).
  - Rotate the screen (Android recreates the activity).
  - Low memory (the OS kills the backgrounded process).
  - Return to the app.
- The learner types a draft, triggers "home", then "low memory", then "return". Without saving state the draft is gone. With "save instance state" or persistence on, it's restored. A third option, "persist to disk on every keystroke", works but costs battery and I/O, and the meters show it.
- A constraints panel shows a flaky-network toggle (offline, then reconnect), a background-work budget (a task that's cut off when its time is up), and a battery meter for polling vs push.
- Each transition's callback names show as they fire, from the platform's real callback list.
**Out of scope.** Offline-first sync and conflict resolution (T3 `offline-first-sync`). App store distribution. Native UI frameworks.
**Kit.** `GraphView` (K-6) with `startNode`, `edgeMark` for the transition just taken, and the current state `--hi`; lesson-local phone frame; `Toggle`; `Bar` (battery); `.log-row` (callbacks); `TextField` (draft). The state-machine tables are pure data in `model.ts`.
**AC.**
- Watch:
  - The current state is `--hi`, and the transition just taken is `--info`.
  - Killed or destroyed is `--bad`.
  - Saved state is `--ok`, and lost state flashes `--bad`.
  - Offline is shown with `--dim` network bars.
- Misconception: "when you leave the app it's paused in memory and will be exactly as you left it", or "the app gets a warning before being killed". A backgrounded process can be killed with no callback.
- Correctness:
  - The transition tables match each platform's documented lifecycle for every event in every state. Invalid events are disabled.
  - The draft survives the home → kill → return sequence exactly when it has been saved or persisted, tested over all event sequences up to length 4.
  - Rotation recreates the activity only on Android.
- Honesty: "Simulated phone. State and callback names are the real Android and iOS ones; timing and memory pressure are scripted."
**Phone.** The phone mock and the state machine stack vertically at ≤900px. The state machine uses `WideRegion minWidth={360}`.

**`i18n-l10n` · Internationalization & Localization**
Track `web` · *"Your app, in every language"* · Builds on: `char-encoding`, `time-and-timezones`, `css-layout`
**Spec.**
- A real sandbox UI card (title, button, "N items in cart", price, date, a relative time) with a locale picker: `en-US`, `de-DE`, `ar-EG`, `ja-JP`, `pl-PL`, `fr-FR`.
- Everything is formatted live by the real `Intl` APIs: `NumberFormat` (decimal and grouping separators, currency), `DateTimeFormat`, `RelativeTimeFormat` and `PluralRules`.
- **Plurals:** an item-count slider (0-25) shows the active plural category per locale: English one/other; Polish one/few/many; Arabic zero/one/two/few/many/other; Japanese other only. The learner sees that `count === 1 ? 'item' : 'items'` can't be right for Polish.
- **Concatenation trap:** a string built as `"Welcome, " + name + "! You have " + n + " messages"` vs a message with placeholders, in a language whose word order differs. The concatenated version reads wrongly.
- **Expansion and direction:**
  - German strings grow 30-40% and overflow a fixed-width button.
  - Arabic sets `dir="rtl"`. Physical `margin-left` breaks the layout, and logical `margin-inline-start` mirrors correctly. The real CSS is shown in a `CodePanel`.
  - A pseudo-localisation toggle (accented, padded text) shows the bugs before translators arrive.
**Out of scope.** Encoding and byte lengths (`char-encoding`). Time-zone maths (`time-and-timezones`). The translation workflow and tooling get one line.
**Kit.** `ResizablePane` for the card width; `useMeasure` to detect overflow; `Segmented` locale picker; `Slider`; `CodePanel`; `.data-table` for plural categories; `Toggle`. Pure helpers in `model.ts`: a pseudo-localiser and a placeholder formatter.
**AC.**
- Watch:
  - The active plural category is `--hi`, and the other categories of that locale are `--dim`.
  - Text overflowing its box is outlined `--bad`.
  - The concatenated (wrong) sentence is `--bad` and the placeholder one `--ok`.
  - Logical-property boxes are `--info` and physical ones `--orange`.
- Misconception: "localisation means translating the strings", and "plural is just one vs many".
- Correctness:
  - Plural categories come from real `Intl.PluralRules`, and tests pin `pl` 2→few, 5→many, 22→few and `ar` 0→zero, 2→two, 11→many.
  - The number formatting tests pin `de-DE` 1234.5 → "1.234,5".
  - The overflow flag comes from real measurement.
  - The pseudo-localiser is deterministic and preserves placeholders.
- Honesty: "Formatting is your browser's real Intl data. The translations are short samples written for this lesson."
**Phone.** Fits: the card is shown at its real width inside a `ResizablePane` (`scaleToFit`), and the panels stack.

**`usability-testing` · User Research & Usability Testing**
Track `web` · *"Watch users, not opinions"* · Builds on: `usability-laws`, `requirements-user-stories`, `probability-basics`
**Spec.**
- A small fictional checkout prototype with three planted usability problems:
  - an unlabelled icon button;
  - a "Continue" that looks disabled;
  - a coupon field that's mistaken for the payment step.
- **Session replays:** the learner runs 1-8 seeded participants through the task "buy the blue mug". Each replay shows a click path with hesitations and backtracks, and a think-aloud caption ("I'm not sure what this icon does").
  - A heatmap accumulates clicks across sessions.
  - Task success, time on task and errors per participant fill a table.
- **Problem log:** each problem is marked "found" once a participant hits it. A curve plots the share found against participants, next to Nielsen & Landauer's 1 − (1 − L)ⁿ with L adjustable (default 0.31). It shows diminishing returns past about 5, and that rare problems need more users or another round.
- **Method picker:** the same question ("will people find coupons?") answered by a survey (what people say), analytics (what happened, not why) and a moderated test (why). Each is shown with what it can and can't tell you.
- **Bias toggles:** leading questions ("Isn't this easy?") and helping the participant. Both inflate the success rate, and the table flags the contaminated sessions.
**Out of scope.** A/B testing statistics (T3 `hypothesis-testing-ab`). HCI laws (`usability-laws`). Accessibility audits (`accessibility`).
**Kit.** `Plot2D` (K-12) for the problems-found curve; `CellGrid` (K-7) heatmap over the prototype (`intensity`); `.data-table`; `Slider`; `Toggle`; `.log-row` for think-aloud lines; `useSimulation` or a frame player for replays. Participant behaviour comes from a seeded model in `model.ts`.
**AC.**
- Watch:
  - The current participant's path is `--info`, and hesitations are `--hi` dots.
  - Errors and backtracks are `--bad`.
  - Found problems are `--ok` and unfound ones `--dim`.
  - The heatmap tints toward `--hi`.
  - Contaminated sessions are outlined `--orange`.
- Misconception: "ask users what they want" or "five users always find 85% of problems". The 85% assumes L ≈ 0.31, an average that varies a lot by product and task.
- Correctness:
  - 1 − (1 − 0.31)⁵ ≈ 0.84 is tested.
  - The seeded participant model reproduces each problem's hit probability within tolerance over 10,000 simulated participants.
  - The found-curve is monotonic.
  - Success and time stats are recomputed from the replays.
- Honesty: "Simulated participants with seeded behaviour. Real sessions are messier. The 31% figure is Nielsen & Landauer's 1993 average, not a law."
**Phone.** The prototype is shown at its own width (`scaleToFit`). The table and curve stack below, and the curve fits at 320px.

---

##### Batch T2-B31 · Shipping safely (`ops`)
Wave 10. This batch reuses `CellGrid` (K-7) for server and user grids, and `GanttLanes` (K-13). `resource-exhaustion` is the tier's integrator: it links to and doesn't re-teach `file-descriptors`, `connection-pooling`, `memory-leaks` and `file-systems`. `cert-lifecycle` is **[domain review]**, because its date maths are time-sensitive.

**`deployment-strategies` · Rolling, Blue-Green & Canary Deploys**
Track `ops` · *"Ship to 1% before you ship to everyone"* · Builds on: `kubernetes-basics`, `load-balancing`, `ci-pipelines`
**Spec.**
- A 20-server grid (`CellGrid`) behind a load balancer, with a stream of user requests. The learner deploys v2 under a chosen strategy:
  - **Recreate:** all down, then all up, with a visible outage.
  - **Rolling:** `maxSurge` / `maxUnavailable` sliders control how many servers are replaced at a time.
  - **Blue-green:** a full second fleet, then an instant traffic switch.
  - **Canary:** 1%, then 10%, 50% and 100%, with a bake time per step.
- A "plant a bug in v2" toggle sets v2's error rate (5% by default). Each request is `--ok` or `--bad`.
- A counter shows **users hit by errors**, plus time to detect and time to roll back. A side-by-side comparison runs all four on the same bug.
- **Automated canary analysis:** compares the canary's error rate with the baseline's over the bake window, and rolls back automatically when the difference exceeds a threshold. A too-short bake window preset lets a low-rate bug through.
- Extra resources needed (blue-green doubles the fleet; rolling needs `maxSurge`) are shown as a cost bar.
- A "database migration that isn't backward compatible" preset breaks rolling and canary, because v1 and v2 run at the same time. It's linked to T3 `zero-downtime-migrations` only by name, and labelled as coming later.
**Out of scope.** Feature flags (`feature-flags`). Load-balancer algorithms (`load-balancing`). Kubernetes mechanics (`kubernetes-basics`).
**Kit.** `CellGrid` (K-7); scene kit (`Packet`, `SceneNode`) for the load balancer; `useSimulation`; `Slider`; `Segmented`; `Stat`; `Sparkline` for error rates; `GanttLanes` (K-13) for the comparison timeline.
**AC.**
- Watch:
  - v1 servers are `--info` and v2 servers `--violet`, as categories.
  - Successful requests are `--ok` and failed ones `--bad`.
  - Servers being replaced are `--hi`, and idle standby servers `--dim`.
  - An automatic rollback flashes `--orange`.
- Misconception: "blue-green is always safest" (it exposes 100% of users at the switch, and costs double), or "a canary catches every bug" (short bakes and low error rates slip through).
- Correctness:
  - Expected users hit equals the sum over time of the share exposed × the error rate × the request rate, with every strategy checked against a closed form on seeded runs.
  - The canary rollback rule fires exactly when the observed difference exceeds the threshold over the window, tested on seeded request streams.
  - Rolling never has fewer than `replicas − maxUnavailable` servers serving.
- Honesty: "Simulated fleet and traffic; the error rates and bake times are illustrative."
**Phone.** Grid of 5 × 4 cells at 52px each, which fits. The comparison timeline uses `WideRegion minWidth={480}`.

**`feature-flags` · Feature Flags & Progressive Delivery**
Track `ops` · *"Deploy is not release"* · Builds on: `deployment-strategies`, `branching-workflows`, `hash-table`
**Spec.**
- A crowd of 400 seeded users (`CellGrid`), each showing the old or new checkout. The code is deployed with the flag off: everyone still sees the old UI, which makes the point that deploy isn't release.
- A rollout dial (0-100%). Bucketing is deterministic: `hash(flagKey + userId) mod 100 < rollout`. Ramping from 10% to 20% keeps the original 10% in, and a "random each request" toggle shows users flickering between UIs.
- Targeting rules evaluated top to bottom, with the first match winning:
  - "internal staff" → on.
  - "country = NL" → 50%.
  - default → 10%.
  - The learner reorders them and sees which users change.
- A kill switch flips everyone back instantly with no deploy, next to a "roll back the deploy" timer for comparison.
- **Flag debt:** a code panel shows nested `if (flag)` branches piling up over months, and stale flags get a "remove me" badge.
- A flag-types strip: release, experiment, ops kill switch and permission, each with its expected lifetime.
**Out of scope.** Experiment statistics (T3 `hypothesis-testing-ab`). Config rollout safety (T3 `safe-config-rollout`). Deploy mechanics (`deployment-strategies`).
**Kit.** `CellGrid` (K-7); `core/hash` `hash32` for bucketing; `core/random` `mulberry32` for users; `Slider`; `Toggle`; `CodePanel` for the rule list and the flag-debt code (`stateOf` for the matched rule); `Stat`.
**AC.**
- Watch:
  - Users seeing the new UI are `--violet` and the old UI `--info`, as categories.
  - The rule that matched is `--hi`, and rules not reached are `--dim`.
  - The kill switch is `--bad` when engaged.
  - Stale flags are tagged `--orange`.
- Misconception: "a 10% rollout picks a fresh random 10% on every request", or "flags are free to leave in".
- Correctness:
  - Bucketing is stable: the same user and flag give the same bucket, so ramping up never removes a user who was already in.
  - The measured rollout share is within ±3 points of the dial for 10,000 seeded users at every step of 10.
  - Rule evaluation is first-match, tested for every reorder of the three rules over the seeded population.
  - The kill switch takes effect for every user on the next evaluation.
- Honesty: "Seeded users and a simulated flag service. The hashing is real."
**Phone.** The crowd is 20 × 20 at `size="xs"`, which fits at 390. The rules and code stack.

**`structured-logging` · Structured Logging & Correlation IDs**
Track `ops` · *"Logs are data, so make them queryable"* · Builds on: `observability`, `data-formats`, `regex-basics`
**Spec.**
- A request fans out from `gateway` → `orders` → `payments` and `inventory` (scene kit). Ten concurrent requests run, one of which fails in `payments`.
- **Mode 1, free text:** every service writes lines like `Processing order for user 42...`. The interleaved log stream scrolls. The learner tries to find the failed request's lines with a text search (`grep`-style); it misses lines and catches unrelated ones.
- **Mode 2, structured:** the same events as JSON with `ts`, `level`, `service`, `msg`, `request_id`, `order_id` and `duration_ms`. The gateway generates a request ID and passes it along in a header. Filtering by `request_id` returns exactly the failed request's whole story across four services, in time order.
- **Levels:** a minimum-level picker (DEBUG, INFO, WARN, ERROR) shows log volume and cost against what's kept. A "debug left on in production" preset blows the volume bar.
- **What not to log:** a toggle logs the full request body, including a fake card number built at runtime. A redaction step masks it. This is payload-free: it only shows a credential-shaped placeholder being masked.
- The query box accepts a small documented filter syntax (`field=value`, `level>=WARN`, `AND`).
**Out of scope.** Metrics and distributed traces (`observability`); trace context is mentioned as where the request ID goes next. Log pipelines and storage engines.
**Kit.** Scene kit (`SceneNode`, `Packet`); `.log-row` for the stream; `TextField` for the query; `Segmented`; `Bar` for volume; `CodePanel` for one JSON line; `core/format` `bytes`. The filter parser and evaluator are pure in `model.ts`, and anything outside the subset is refused with a message.
**AC.**
- Watch:
  - The request ID's lines and its path are `--hi`.
  - ERROR lines are `--bad` and WARN lines `--orange`.
  - Other lines are `--dim` when filtered out.
  - Service tags take categorical hues.
  - The redacted field is `--ok` and an unredacted secret placeholder `--bad`.
- Misconception: "more log lines means better debugging", or "grep over text is enough".
- Correctness:
  - Filtering by the failed request's `request_id` returns exactly the lines generated for it (the sim knows ground truth), with no extras, for every seed.
  - The text-search mode's misses and false hits are computed against the same ground truth and shown as numbers.
  - The query parser handles the documented syntax and refuses the rest.
  - The level filter keeps exactly the lines at or above the chosen level.
  - Redaction leaves no card-shaped string in the output (checked by regex).
- Honesty: "Simulated services and logs; the card number is fake and generated at runtime."
**Phone.** The service diagram uses `WideRegion minWidth={460}`. The log stream is a full-width list with wrapped lines.

**`cert-lifecycle` · Certificate Lifecycle & Expiry**
Track `ops` · *"The outage scheduled a year ago"* · Builds on: `digital-signatures-pki`, `tls-handshake`, `time-and-timezones` · **[domain review]**
**Spec.**
- A calendar timeline for a fictional service's leaf certificate: issued (`notBefore`), renewal window, expiry (`notAfter`). Clients connect at intervals, and each handshake is `--ok` or `--bad`. A "today" cursor can be scrubbed.
- **Manual mode:** a 1-year certificate with a calendar reminder, and the person who set it up "left the team". At `notAfter` (shown at 00:00 UTC, and in two client time zones) every handshake fails at once.
- **ACME mode:** a 90-day certificate with an automated renewal job. By convention it renews when about a third of the lifetime remains (around day 60). The learner can:
  - break the renewal (DNS challenge misconfigured, rate-limited);
  - watch retries;
  - watch monitoring alerts fire at 30, 14 and 7 days left;
  - fix it inside the window.
- **Gotchas presets:**
  - An expired intermediate in an otherwise fresh chain.
  - A client whose clock is wrong, so `notBefore` is in the future.
  - A cert renewed on disk but never reloaded by the server process.
  - A pinned old cert in a mobile app.
- A lifetimes strip shows the CA/Browser Forum schedule shortening maximum public TLS certificate lifetimes (200 days from March 2026, 100 days from March 2027, 47 days from March 2029). The lesson's point: renew by automation, not by calendar.
**Out of scope.** Signature and chain-validation mechanics (`digital-signatures-pki`). The handshake (`tls-handshake`). Revocation (OCSP/CRL) gets one line.
**Kit.** `GanttLanes` (K-13) with `markers` for issue, renew and expiry; `Slider` for the date scrubber; `.log-row` for renewal attempts and alerts; `Toggle`; `SequenceDiagram` (K-14) optional for an ACME exchange; `core/format` `humanDuration`. Date maths are pure in `model.ts`, using `Date` in UTC only.
**AC.**
- Watch:
  - Valid periods are `--ok`, the renewal window a `--hi` tint, and expiry a `--bad` marker.
  - Failed handshakes are `--bad`, and a failed renewal attempt is `--orange` (a different kind of failure from expiry).
  - Alerts are `--hi`, and a cert renewed but not yet loaded is `--violet` and dashed.
- Misconception: "a certificate is valid until the server stops using it", or "expiry happens at midnight in my time zone".
- Correctness:
  - Validity is `notBefore ≤ now < notAfter` evaluated in UTC, and a test runs it under five emulated time zones, as Tier 1's `time-and-timezones` did.
  - The renewal window and alert days are computed from the dates, never typed in.
  - The chain is valid only if every certificate in it is in its validity period.
  - The skewed-clock client fails exactly when its clock is before `notBefore`.
  - The CA/B lifetime schedule is data with dated sources in a comment, and **the domain reviewer re-checks it at build time**.
- Honesty: "Scripted timeline for a fictional service. The 90-day lifetime and renew-at-two-thirds are common ACME conventions, not rules."
**Phone.** The timeline uses `WideRegion minWidth={520}` with a sticky "today" readout. The presets and log stack.

**`resource-exhaustion` · Resource Exhaustion: Disk, FDs, Connections & Memory**
Track `ops` · *"The limits you forgot existed"* · Builds on: `file-descriptors`, `connection-pooling`, `memory-leaks`, `file-systems`, `sockets-api`
**Spec.**
- One server with six gauges: disk bytes, inodes, file descriptors (per-process limit), DB connection pool, ephemeral ports, and memory (container limit). Each has a configured limit line.
- Leaky workload toggles, any combination:
  - Logs never rotated.
  - Millions of tiny temp files (inodes, not bytes).
  - Sockets never closed.
  - Connections not returned to the pool.
  - A new outbound connection per request (ports stuck in TIME_WAIT).
  - An unbounded cache.
- Gauges fill under load.
- When one hits its limit, the error that real systems report appears in the log, with the cascade it starts:
  - `ENOSPC` for bytes, and also for inodes with free bytes.
  - `EMFILE: too many open files`.
  - A pool acquire timeout.
  - `EADDRNOTAVAIL` on connect.
  - The OOM killer (SIGKILL, exit code 137 in a container).
  - For example: disk full → log writes fail → health check fails → restart loop.
- **"Find the limit" game:** a symptom ("requests hang for 30 s then 500") is shown. The learner picks which gauge to check, and each wrong guess costs time.
- **Headroom alerts:** set an alert at 80% of each gauge. With alerts on, the incident becomes a warning hours earlier. Gauges that only alert at 100% are flagged.
- Each gauge links to the lesson that teaches its mechanism (`file-descriptors`, `connection-pooling`, `memory-leaks`, `file-systems`, `sockets-api`).
**Out of scope.** The mechanisms themselves, which are taught in the linked lessons and not repeated here. Capacity planning (T3 `capacity-planning`). Kernel tuning beyond naming the limits.
**Kit.** `Bar` with `marker` for gauges; `useSimulation` with `sim.ts`; `Toggle`; `.log-row` for errors; `Sparkline` per gauge; `ChipButton` for the game; `GanttLanes` (K-13) for the cascade timeline; `core/format` (`bytes`, `humanDuration`).
**AC.**
- Watch:
  - Gauge fill is `--info`, rising to `--hi` past the alert line and `--bad` at the limit.
  - The alert line is `--orange`.
  - The first limit hit is `--bad`, and downstream effects in the cascade are `--orange`.
  - Idle gauges are `--dim`.
- Misconception: "disk full means out of bytes" (inodes, or deleted-but-open files), and "a restart fixes it" (it comes back with the leak).
- Correctness:
  - Each gauge's limit maps to its documented error name (ENOSPC, EMFILE, EADDRNOTAVAIL, OOM-kill exit 137), tested.
  - The ephemeral-port gauge uses the Linux default range 32768-60999 (28,232 ports) and the TIME_WAIT duration from a named constant.
  - Inode exhaustion triggers ENOSPC with free bytes remaining.
  - The cascade order is derived from the dependency rules, tested for each first failure.
  - Alerts at 80% always fire before the limit for monotonic fills.
- Honesty: "Simulated server; growth rates are illustrative and compressed. The limit names and error codes are the real Linux ones."
**Phone.** Gauges in a two-column grid, which fits. The cascade timeline uses `WideRegion minWidth={460}`, and the game chips wrap.

---

##### Batch T2-B32 · Engineering responsibly (`lead`)
Wave 10, the last wave, so these lessons can point at any Tier 2 technical lesson. **[domain review]** for `software-licensing` (the licence facts) and for `computing-ethics` (fairness of the case summaries). This is the first non-technical visual grammar in Kinetic. `computing-ethics`' scenario stepper stays **local** in Tier 2 by decision (§3.1.4 "Considered and kept local"); it gets extracted when T3 `design-docs-rfcs` becomes its second user. Every consequence in these lessons is authored, and the screen says so.

**`software-licensing` · Open Source Licensing: MIT, Apache & GPL**
Track `lead` · *"What you're allowed to ship"* · Builds on: `dependency-management`, `build-systems` · **[domain review]**
**Spec.**
- A **dependency tree** for a product, with a picker above it: "how is it shipped?"
  - internal tool only
  - distributed binary / app
  - SaaS (network service)
  - library others link against
- Each dependency node carries a licence badge: MIT, BSD-3-Clause, Apache-2.0, MPL-2.0, LGPL-2.1, GPL-2.0-only, GPL-3.0, AGPL-3.0, or "no licence".
- The learner swaps a dependency's licence or adds one from a palette. A **resolver** recomputes the obligations panel live:
  - attribution and licence text (all)
  - NOTICE file and the patent grant (Apache-2.0)
  - modified files stay MPL (MPL-2.0)
  - allow relinking (LGPL)
  - the whole combined work under the GPL with source available (GPL, when distributed)
  - source offered to network users (AGPL, when SaaS)
- Conflicts are flagged, e.g. Apache-2.0 code inside a GPL-2.0-only product is incompatible, while Apache-2.0 + GPL-3.0 is fine.
- **Presets:**
  - "MIT app adds a GPL chart library" (red when distributed, fine as an internal tool)
  - "AGPL database behind your SaaS"
  - "copy-pasted code with no licence" (all rights reserved: you have no permission)
  - "relicensing your own project"
- A checklist strip covers what teams actually do: an SPDX identifier in each package, a licence scanner in CI, and an allow-list policy.
**Out of scope.** Supply-chain integrity and provenance (T3 `supply-chain-security`), contributor agreements (CLAs/DCO), and patents beyond Apache-2.0's grant.
**Kit.** `TreeSvg` (`tidy`; the dependency tree, `nodeMark` per obligation status), `Segmented` (distribution model), `ChipButton` (licence palette, presets), `.data-table` (obligations), `Tray` (conflicts), `useScenePicker`.
**AC.**
- **Watch:**
  - the selected dependency `--hi`
  - permissive licences with obligations met `--ok`
  - copyleft licences that are triggered, but fine, `--violet`
  - a conflict and "no licence" `--bad`
  - obligations not triggered by this distribution model `--dim`
  - licence badges carry the SPDX id as text, so colour isn't the only signal
- **Misconception:** "using GPL code means you must open-source everything, always". Obligations are triggered by distribution (or network use, for AGPL), not by use alone.
- **Correctness:**
  - A data table of (licence × distribution model) → obligations, and of (licence A in product B) → compatible?, with a source note per row:
    - FSF's licence-compatibility list: Apache-2.0 is compatible with GPL-3.0 and incompatible with GPL-2.0-only
    - the OSI licence texts: MIT/BSD attribution; Apache-2.0 §4 NOTICE and §3 patent grant; MPL-2.0 file-level copyleft; AGPL-3.0 §13 network interaction
  - The resolver's verdict for every preset and for all single-licence swaps in the default tree is snapshot-tested against that table.
  - "No licence" always yields "no permission granted".
- **Honesty:** "Simplified for learning, not legal advice. Real compliance depends on the exact licence version and how you combine the code; ask your legal team."
**Phone.** The tree is in a `WideRegion minWidth={480}`. The obligations table and conflicts tray reflow below it. The palette chips wrap.

**`computing-ethics` · Ethics & Professional Responsibility**
Track `lead` · *"Just because you can"* · Builds on: `requirements-user-stories`, `accessibility`, `security-principles`, `race-conditions` · **[domain review]**
**Spec.**
- A **scenario stepper**. Each case is a short branching story the learner plays as the engineer: at 2-3 decision points they pick an action, and the outcome panel shows authored, labelled consequences for users, the team and themselves. A "map" of the case shows every branch and which ones they've seen. Cases:
  1. **Therac-25** (historical, 1985-87): what happened, told as the engineers' decisions. Hardware interlocks were removed in favour of software checks; a race condition was triggered by fast operator edits; the cryptic "MALFUNCTION 54" errors were dismissed; reports went uninvestigated. At each point the learner picks what a responsible engineer would push for. The real outcome (massive radiation overdoses, deaths) is stated plainly as history, and the link to `race-conditions` names the bug class.
  2. **Dark pattern request** (fictional): product asks for a cancellation flow with confirm-shaming and a hidden "cancel" link. The learner chooses to build it as asked, push back with data, or propose an honest retention flow; consequences include complaint volume and regulator attention.
  3. **Data you didn't need** (fictional): a feature can collect precise location "just in case". The options are collect, minimise, or ask; links to `security-principles`.
  4. **Ship it Friday** (fictional): a known accessibility blocker before a launch; links to `accessibility`.
- Each decision point cites the relevant **ACM Code of Ethics (2018)** principle by number and short name (e.g. 1.2 "Avoid harm", 2.5 "Give comprehensive and thorough evaluations of computer systems and their impacts, including analysis of possible risks"). The learner can open the principle's one-line paraphrase.
- No score or "correct answer" points. The end card summarises the choices made against the principles, without grading the person.
**Out of scope.** Privacy engineering in depth (T3 `privacy-engineering`), ML fairness (T3 `ml-fairness-bias`), and law and regulation specifics.
**Kit.** The scenario stepper and branch map stay **local** (`ce-` prefix; first use, see the batch note). `GraphView` (K-6, `layout="layered"`) draws the branch map, `ChipButton` (choices, `onStyle="solid"`), `Box`/`SectionTitle` (outcome panels), `useScenePicker` (case), `Tray`.
**AC.**
- **Watch:**
  - the current decision point `--hi`
  - branches taken `--info`
  - branches not yet explored `--dim`
  - outcomes: harm to users `--bad`, a risk raised and handled `--ok`, a trade-off still open `--orange`
  - principle citations `--violet` chips
- **Misconception:** "ethics is someone else's job: the engineer just builds the spec". The ACM Code puts responsibility on the professional.
- **Correctness:**
  - Every branch of every case reaches an end card, and no decision point has a dead end (graph test over the authored data).
  - Every principle citation exists in a fixture of the ACM Code's principle numbers and titles.
  - The Therac-25 facts match the cited sources: Leveson & Turner, "An Investigation of the Therac-25 Accidents" (IEEE Computer, 1993), with the dates and the number of known accidents (six, 1985-87) asserted in a data test.
- **Honesty:**
  - "Cases 2-4 are fictional and their consequences are illustrative, written to show likely effects, not predictions. Case 1 is history, summarised from Leveson & Turner (1993)."
**Phone.** One column: story, choices and outcome. The branch map is a `WideRegion minWidth={420}` that's collapsed behind a "show map" toggle at ≤ 900px.

**`technical-writing` · Technical Writing & Communicating Trade-offs**
Track `lead` · *"Clear writing is clear thinking"* · Builds on: `code-review`, `requirements-user-stories`, `debugging-method`
**Spec.**
- **Scene 1 · Tighten a status update.** A wordy 180-word incident update. The learner applies edits from chips, one at a time:
  - move the conclusion first (BLUF)
  - cut hedges ("just", "basically", "I think maybe")
  - replace passive voice where the actor matters
  - add the ask and its deadline
  - turn a list buried in a paragraph into bullets
- Each edit rewrites the text visibly (a diff with removed text struck through), and measured stats update:
  - word count
  - sentence count and average sentence length
  - Flesch-Kincaid grade level
  - the word position where the ask first appears
- An **attention strip** under the text marks where a skimming reader typically stops (after the first lines and the first bullet). Before the edit, the ask sits past that point; after BLUF, it's inside.
- **Scene 2 · Write the trade-off.** A decision (Postgres vs a document store for a feature) with 4 facts as cards. The learner assembles a one-paragraph trade-off summary from sentence chips in a structure slot by slot: context → options → recommendation → what we give up → when we'd revisit.
  - Missing slots are flagged.
  - The result is compared with a weak version that lists features without recommending anything.
- **Scene 3 · Same facts, three readers.** One change described for an exec, a peer engineer and an on-call SRE. The learner matches each version to its reader and sees which details each one keeps.
**Out of scope.** Design docs, RFCs and ADRs (T3 `design-docs-rfcs`), and architecture diagrams (`architecture-diagrams-c4`).
**Kit.** `CodePanel` with `renderLine` (prose lines with struck-through and inserted spans), `ChipButton` (edits, sentence chips), `Stat`/`AnimatedValue` (measured stats), `Bar` (grade level), `Tray` (slot assembly, `Tray stack`), `useScenePicker`. The diff rendering is local (`code-review`'s diff is local too; they differ). File a Phase 2 request only if the two converge.
**AC.**
- **Watch:**
  - the edit just applied `--hi`
  - removed text struck through `--bad`, inserted text `--ok`
  - the ask `--info` with its marker on the attention strip
  - the "typical skim stops here" line `--orange`
  - filled slots `--ok`, missing slots `--bad` outline
  - unused chips `--dim`
- **Misconception:** "more detail up front makes an update more complete". Readers stop early, so the conclusion and the ask go first.
- **Correctness:**
  - Word, sentence and grade numbers come from a tested text-stats module: the Flesch-Kincaid formula `0.39·(words/sentences) + 11.8·(syllables/words) − 15.59`, with a heuristic syllable counter tested on a fixed word list within ±1 syllable.
  - Every edit chip's rewrite is pure, and applying all chips in any order reaches the same final text (tested over all orders, or the chips declare their order dependency and the UI enforces it).
  - The ask position is computed from the text, not hard-coded.
- **Honesty:**
  - "The attention strip is an illustrative model of skimming, not measured from real readers."
  - "Grade level uses an approximate syllable count."
**Phone.** One column, and it fits. The text panel wraps, the stats sit in a wrapping row, and the slot tray stacks.

#### 3.1.9 Known risks, Tier 2

- **Scale.** 156 new lessons plus 16 retrofits is 3.25× Tier 1. The schedule is ten waves because review is the bottleneck. Don't compress waves to save calendar time; add a wave instead.
- **Kit surface.** Twenty-one kit and tooling items is twice Tier 1's. Mitigations:
  - the P0-a/P0-b split, so wave 1 isn't waiting on pieces it doesn't use;
  - pilots in wave 1 with exact answers;
  - a kit round after every wave.
  
  A new component whose second user doesn't show up by wave 4 gets folded back into its one lesson at the wave 4 kit round, not kept "in case".
- **The retrofit will find Tier 1-style majors.** Tier 1's 14 older lessons produced T-2, T-3 and several false captions. That's why R1 and R2 are in waves 1-2: their fixes land long before sign-off, and no new lesson ships links to a lesson whose claims are still unchecked.
- **ML correctness.** Every plotted fit, boundary, cluster and ROC comes from real computation in `core/fit` or the lesson model, on seeded `datasets`, and has a unit test. No hand-drawn curves. Embeddings are a labelled toy; never claim semantic understanding the model doesn't have.
- **Crypto honesty.**
  - Toy parameters are labelled as toys at the moment they're shown.
  - "Real" means `crypto.subtle`, with vectors in the tests.
  - Nothing implies a toy RSA or DH key is secure.
  - [domain review] on every B9 lesson before the batch is accepted.
- **Payload-free security** (B9's `macs-hmac`, B10's `memory-safety-bugs`, all of B28). Reviewers reject any working attack string, exploit step, forged tag, exfiltration snippet or real system path, even if it's "harmless". Benign inputs that break naive code are the teaching tool.
- **Theory as slideshow** (B15; also `p-vs-np`, `grammars-parsing`, `relations-orders`). Each spec names what the learner manipulates. A reviewer who can complete the lesson by pressing Next only sends it back.
- **Lead topics** (B32) are the first non-technical visual grammar. `computing-ethics` builds a local scenario stepper. T3 `design-docs-rfcs` extracts it on second use, and Tier 4's lead topics wait for that extraction (§3.3).
- **Dense diagrams on phones.** `SequenceDiagram`, `GraphView` and `GanttLanes` will be the most common `WideRegion` content in Tier 2. K-4 (the hint doesn't cover content) and AC-0/T2 rule 10 (every scene, every frame, at 390 and 768) are the controls. Smoke alone can't see these problems.
- **Quiz lint gaming.** K-2 catches length and position tells. It can't catch implausible distractors padded to length, so the reviewer still reads every question.
- **Home page density.** 156 planned cards in one tier. K-1's acceptance includes the collapsed "Show N planned" disclosure and eyeballing every filter state.

### 3.2 Tier 3 · Architect

**Validated count: 155** (154, plus `wifi-shared-medium` moved up at the Tier 2 kickoff), in **~31 batches**. If Tier 2's review rhythm holds, plan on 3-4 agents per wave, which is ~9-10 waves, not 8.

| Track | hw | os | lang | math | dsa | net | arch | data | sec | ops | craft | web | ml | lead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| n | 4 | 9 | 12 | 15 | 19 | 9 | 16 | 21 | 12 | 10 | 5 | 5 | 11 | 7 |

**Fences set by the Tier 2 kickoff.** Tier 2 specs stop short of these Tier 3 topics, so their Tier 3 specs can start where Tier 2 stops:
- `branch-prediction`, `cache-coherence`, `page-tables-tlb`, `io-models`, `fork-copy-on-write`
- `parsing-algorithms`, `regex-engines`, `bytecode-vms`, `ownership-refcounting`, `undefined-behavior`, `modular-exponentiation`
- `kmp`, `cache-stampede`, `api-versioning`, `schema-evolution`, `quic`, `congestion-control`, `cloud-networking-vpc`
- `materialized-views-denormalization`, `mvcc`, `query-planning`, `join-algorithms`
- `envelope-encryption-kms`, `authz-models`, `vector-search`
- `property-based-testing`, `technical-debt`, `design-docs-rfcs`, `gitops`, `hypothesis-testing-ab`
- `gpu-rendering-pipeline`, `3d-transforms-projection`, `offline-first-sync`

`wifi-shared-medium` keeps its backlog spec idea (CSMA/CA contention, backoff and collisions).

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
| 1 | T1-B4 Code flow | 4 | 3 | t1/b4 | done | merged d5c8b62 |
| 1 | T1-B7 Security & data | 5 | 3 | t1/b7 | done | merged 19f6ea6; injection-attacks re-scoped to defensive, payload-free teaching (eea720c) |
| 1 | T1-B9 Everyday tools | 5 | 3 | t1/b9 | done | merged f9b2c36 |
| 1 | T1-B10 Networks & teams | 4 | 3 | t1/b10 | done | merged 527b49e |
| 1 | Tier 1 close-out kit round | — | 3→QA | kit owner | done | ChipButton onStyle/ariaLabel/aria-pressed only with `on`, Tray stack, WideRegion gutter, CodePanel marker + bad state, BitStrip ariaLabelOf, Box/SectionTitle/Tray forward native attributes, CallStackPanel selectedTone, check-tokens inline-spring rule + tested rules (allow-color marker bug fixed), shot --press + Git Bash route guard, shared ACCESS_LOG fixture, runtime-code-execution rule |
| 1 | Re-verify the 14 existing T1 lessons against the tier DoD | 14 | 3 | QA | done | T-2 (tests) and T-3 (disclosure) fixed and verified in docs/qa-tier1-recheck.md |
| 1 | **Tier 1 sign-off** | 62 | — | | ✅ done | all 62 built, merged and QA-signed-off (docs/qa-tier1-report.md, docs/qa-tier1-recheck.md); pushed |
| 2 | Kickoff: validation, specs, batch and wave plan (§3.1) | — | pre | Atlas | done | 2026-10-01: 156 new + 16 existing = 172; 32 batches + 2 retrofit; 10 waves |
| 2 | K-1 register the 156 Tier 2 topics | — | pre | kit A | done | merged before wave 1 |
| 2 | K-2 lesson-content lint, K-4 swipe hint off content, K-5 CLAUDE.md payload-free rule | — | pre | kit A | done | Tier 1 baseline emptied; payload-free rule in CLAUDE.md |
| 2 | K-3 secret-shape scan test | — | pre | kit A | done | src/core/secretScan.ts |
| 2 | P0-a kit: K-6 `GraphView`, K-7 `CellGrid`, K-8 `ByteGrid`, K-9 `TreeSvg` forest, K-10 `numberTheory`, K-11 `stats`, K-12 `Plot2D`, K-20 `disjointSet` | — | pre | kit B, kit C | done | |
| 2 | P0-b kit: K-13 `GanttLanes`, K-14 `SequenceDiagram`, K-15 `MemoryMap`, K-16 `automata`, K-17 `vec`/`fit`/datasets, K-18 `ConfusionMatrix`, K-19 `crypto.ts` additions | — | pre | kit B, kit C | done | merged efaae3e |
| 2 | Tier 1 leftovers L-1 to L-7 | — | alongside 1 | kit A | done | L-6 closed as already shipped |
| 2 | T2-R1 retrofit, part 1 | 8 | 1 | t2/r1 | done | 2026-10-06, merged 2b85c97; ten false captions fixed, all 8 off the lint baseline |
| 2 | T2-B1 Bits & encoding | 5 | 1 | t2/b1 | done | 2026-10-06, merged 5c6196d |
| 2 | T2-B2 Number theory & counting | 5 | 1 | t2/b2 | done | 2026-10-06, merged 04f526c |
| 2 | T2-B3 Graph algorithms | 5 | 1 | t2/b3 | done | 2026-10-06, merged 94598c0 |
| 2 | P-follow-up after wave 1 | — | 1→2 | kit owner | done | 2026-10-07: kit1 + kit2 merged (tones, BitStrip/TreeSvg roving keys, CellGrid canvas text + overlay, GraphView layoutEdges/detours, gate drawing, ScenePicker focus, core/parse bounded ints, humanDuration, minWidthForText, shot --settle); 1926 tests, smoke 114/114 desktop + 390px |
| 2 | T2-R2 retrofit, part 2 | 8 | 2 | t2/r2 | done | 2026-10-07, merged 0133ac1; false claims fixed incl. JWT verify ignoring exp; PENDING_RETROFIT empty. Domain review (Sentry) of tls-handshake + auth-sessions-jwt: 1 MAJOR (weak-HMAC-key lesson backwards) + minors, fixed e4c9bac |
| 2 | T2-B4 Kernel & scheduling | 5 | 2 | t2/b4 | done | 2026-10-07, merged 0893844. Domain review of syscalls/interrupts/VM: 3 MAJOR (skipped timer ticks x2, open vs openat) + 20 minor, fixed d5af4f1 |
| 2 | T2-B5 Automata, parsing & types | 5 | 2 | t2/b5 | done | 2026-10-07, merged 643e09a |
| 2 | T2-B6 Joining a network | 5 | 2 | t2/b6 | done | 2026-10-07, merged e74e0af. Domain review of dns-resolution: 3 MAJOR (propagation, in-zone CNAME, single NS) + 8 minor, fixed acf38e7 |
| 2 | P-follow-up after wave 2 | — | 2→3 | kit owner | done |  wave 2 gates on d5af4f1: 2399 tests, check-tokens 0, smoke 129/129 desktop + 390px, captions unchanged (6 known CHECKs), 768px stage shots of all 11 unchecked lessons looked at. Queue: docs/tier2-wave2-kit-requests.md (usePlayer caption-inheritance bug first; core/ipv4 extraction; 6 only-export-components lint warnings in R2 lessons) |
| 2 | T2-B7 Probability & evaluation | 5 | 3 | t2/b7 | done | 2026-10-07, merged efb4ac0. Domain review: 3 MAJOR (rounding contradicting verdicts, unlabelled rounded Bayes metrics, comparator shuffle implied fair) + 14 minor, fixed cae9c92 |
| 2 | T2-B8 Linear algebra & fitting | 5 | 3 | t2/b8 | done | 2026-10-07, merged 25835dc. Domain review: ~10 MAJOR caption/verdict contradictions (exact-case tolerance, false singular refusals, GD quiz missing maxima, momentum story) + minors, fixed 2a7e765 incl. core/vec leastSquaresQR |
| 2 | T2-B9 Cryptography | 5 | 3 | t2/b9 | done | 2026-10-07, merged 98f4fc2. Domain review: 3 MAJOR (CTR keystream caption, false e<phi rule, key-size plot vs factoring records) + 17 minor, fixed 0685fc9; payload-free confirmed |
| 2 | P-follow-up after wave 3 | — | 3→4 | kit owner | done | kit-k5 merged 4881f8c: K-21 ColorField + core/contrast, format/stats/parse/crypto/paint helpers, slow tests 7.3→2.0 s; Vitest testTimeout 15 s |
| 2 | T2-B10 Inside the CPU | 5 | 4 | t2/b10 | done | merged e667760 + memory-safety-bugs 1fc5f12 (re-scoped after a safety-classifier stop; allocator a black box). Reviews: 8 MAJOR fixed 0310a83; msb payload-free PASS, 2 MAJOR fixed a5c88bf |
| 2 | T2-B11 Algorithm design | 5 | 4 | t2/b11 | done | merged 3b8ea84; review 3 MAJOR fixed aaba751 |
| 2 | T2-B12 Models from data | 4 | 4 | t2/b12 | done | merged c5bbed4; domain review 5 MAJOR fixed 12a1cdf; spec's Hick and AdaBoost claims corrected |
| 2 | T2-B13 Graphics & motion | 4 | 4 | t2/b13 | done | merged 2675566 (K-21 ColorField used); review 3 MAJOR fixed 2b0697f |
| 2 | P-follow-up after wave 4 | — | 4→5 | kit owner | done (kit-k6 merged: Plot2D family, CellGrid canvas edges, Button ref, CodePanel roving, core/x86, MemoryMap rows/labels, Gantt motionId) | waves 4+5 gates on main (2026-10-07): 3788 tests, smoke 177/177 desktop + 390px, captions only the 6 known CHECKs. Component kit round kit-k6 running; queues docs/tier2-wave4-kit-requests.md, tier2-wave5-kit-requests.md |
| 2 | T2-B14 Sorting, selection & strings | 5 | 5 | t2/b14 | done | merged c388c87; spec quickselect formula corrected; review 3 MAJOR fixed 68ddc42 |
| 2 | T2-B15 Logic, proof & complexity | 5 | 5 | t2/b15 | done | merged e1da29a; review 5 MAJOR fixed 5ea578c |
| 2 | T2-B16 Concurrency & performance | 5 | 5 | t2/b16 | done | merged 30d8015; review 5 MAJOR fixed 0f0ae7c |
| 2 | P-follow-up after wave 5 | — | 5→6 | kit owner | done | kit round merged on main (k6/k7/k8 queues in docs/tier2-wave*-kit-requests.md); gates green |
| 2 | T2-B17 Sockets & the edge | 5 | 6 | t2/b17 | done | merged 624cd85 with review fixes on-branch (11 MAJOR: latency defaults, REJECT=ICMP default, Wireshark bare-field semantics, retry-safety) |
| 2 | T2-B18 Runtimes & memory | 5 | 6 | t2/b18 | done | merged 067cb39 with review fixes on-branch (3 MAJOR: refcount cascade, leak try-this, rejected-promise explanation) |
| 2 | T2-B19 Machines, disks & lifecycles | 5 | 6 | t2/b19 | done | merged c7c12b9 with review fixes on-branch (9 MAJOR: PV model, Secure Boot scope, emergency.target, fsync try-this, SIGCHLD, post-SIGKILL handler) |
| 2 | P-follow-up after wave 6 | — | 6→7 | kit owner | done | kit round merged on main (k6/k7/k8 queues in docs/tier2-wave*-kit-requests.md); gates green |
| 2 | T2-B20 Types & patterns | 5 | 7 | t2/b20 | done | merged c594c8d with review fixes on-branch (6 MAJOR: decorator error narrated as success, builder 'same request', x! crash type, tsc 'refuses to compile', State shape, Strategy 'no existing code') |
| 2 | T2-B21 Testing & change | 5 | 7 | t2/b21 | done | merged 2074fb9 with review fixes on-branch (5 MAJOR: flaky try-this 2 and 5 false as written, quarantine caption, build fetch captioned building) |
| 2 | T2-B22 Structuring code | 5 | 7 | t2/b22 | done | merged ee2ef1e with review fixes on-branch (6 MAJOR: test-speed strip, layered strawman, ISP emailScan, locator count, Q5 always, DIP/DI/IoC) |
| 2 | P-follow-up after wave 7 | — | 7→8 | kit owner | done | kit round merged on main (k6/k7/k8 queues in docs/tier2-wave*-kit-requests.md); gates green |
| 2 | T2-B23 Data models & queries | 5 | 8 | t2/b23 | done | merged d505494 with review fixes on-branch (10 MAJOR: pushdown 17 vs 8 includes join reorder, SELECT before HAVING, 0NF key, nosql unit asymmetry, hidden controls, DataLoader snippet) |
| 2 | T2-B24 HTTP & API protocols | 5 | 8 | t2/b24 | done | merged 12c5be8 with review fixes on-branch (5 MAJOR: conditional request dropped by shared cache, open-connections, protobuf size verdict, GraphQL caching) |
| 2 | T2-B25 API design | 5 | 8 | t2/b25 | done | merged 79ae572 with review fixes on-branch (6 MAJOR: 200 vs 204, delete caption, duplicate vs different payment, Django, webhook retry timestamps) |
| 2 | P-follow-up after wave 8 | — | 8→9 | kit owner | done | kit round merged on main (k6/k7/k8 queues in docs/tier2-wave*-kit-requests.md); gates green |
| 2 | T2-B26 Reliable services | 5 | 9 | t2/b26 | done | merged 737e8bf, 8 MAJOR fixed on-branch (stale -6 s, DLQ redrive, pool captions/refused stat) |
| 2 | T2-B27 Cloud building blocks | 5 | 9 | t2/b27 | done | merged af7dfee, 5 MAJOR fixed (IaC lost-state, rollout note unrendered, Ready-too-early, Fail-part slider) |
| 2 | T2-B28 App security | 5 | 9 | t2/b28 | done | merged 0768c9c, 6 MAJOR fixed (IAM exposure vs lane, CSRF on GET, path . handling); payload-free audit passed |
| 2 | P-follow-up after wave 9 | — | 9→10 | kit owner | done | kit round merged on main (k6/k7/k8 queues in docs/tier2-wave*-kit-requests.md); gates green |
| 2 | T2-B29 How browsers render | 5 | 10 | t2/b29 | done | merged 4898c6c, 6 MAJOR fixed (shared chunk, Too fine, img preload scanner, a11y claim) |
| 2 | T2-B30 UI frameworks & product | 5 | 10 | t2/b30 | done | merged cee5f9e, 3 MAJOR fixed (Android call vs Stopped, 85% line, word-order caption) |
| 2 | T2-B31 Shipping safely | 5 | 10 | t2/b31 | done | merged d583103, 7 MAJOR fixed (disk claim, port boundary, canary rollback, rule panel inversion, cert dates) |
| 2 | T2-B32 Engineering responsibly | 3 | 10 | t2/b32 | done | merged 28a855f, 5 MAJOR fixed (invented history labelled, contested licence verdicts, chip order) |
| 2 | Tier 2 close-out kit round | — | 10→QA | kit owner | done | merged 9647649: <sup> rule, miss colour, core/lineDiff + core/testing/tsc + segmentHitsBox extracted, shot.mjs fixes, 45 lint warnings cleared; smoke 255/255 desktop + 390px |
| 2 | **Tier 2 sign-off** | 172 | — | | done | Sentry QA: sign-off with conditions C1-C3, all closed (docs/qa-tier2-report.md); 172 lessons, 7,951 tests; push after sign-off |
| 3 | Kickoff: specs (docs/tier3-specs/part1-6.md), batch and wave plan (docs/tier3-plan.md) | — | pre | | done | 154 new + 12 existing = 166; 31 batches + 2 retrofit; 10 waves; `wifi-shared-medium` added at the T2 kickoff |
| 3 | Kit A-C (kickoff kit: distSim, simTick, ScenarioStory prerequisites, content lint T3) | — | pre | kit A, B, C | done | merged 40ff7ca9, df1d36f7, 90f3060c |
| 3 | T3-R1 retrofit, part 1 | — | 1 | t3/r1 | done | merged 6d0fb55b; the 12 existing Tier 3 lessons are retrofitted across R1 and R2 |
| 3 | T3-B1 Statistics & estimation | 5 | 1 | t3/b1 | done | merged 7f7dc5a1 |
| 3 | T3-B2 Engineering practice | 5 | 1 | t3/b2 | done | merged 8d27daed |
| 3 | T3-B3 Evolving systems | 5 | 1 | t3/b3 | done | merged a09d280b |
| 3 | Kit D | — | 1→2 | kit owner | done | merged 5345728b |
| 3 | T3-B4 Time & consistency | 5 | 2 | t3/b4 | done | merged 95bb457e |
| 3 | T3-B5 Performance & capacity | 5 | 2 | t3/b5 | done | merged abd2620c |
| 3 | T3-B6 Operations | 5 | 2 | t3/b6 | done | merged 228c85e0 |
| 3 | T3-R2 retrofit, part 2 | — | 2 | t3/r2 | done | merged fce6f728; all 12 retrofitted, PENDING_RETROFIT empty |
| 3 | Kit E, F | — | 2→3 | kit owner | done | merged 32093f6f, 24655ed4 |
| 3 | T3-B7 Database internals | 5 | 3 | t3/b7 | done | merged e404a2fa |
| 3 | T3-B8 Computation | 5 | 3 | t3/b8 | done | merged 9b40757b |
| 3 | T3-B9 Graph algorithms | 5 | 3 | t3/b9 | done | merged 5a4b2783 |
| 3 | Kit G | — | 3→4 | kit owner | done | merged f746a393 |
| 3 | T3-B10 Information & linear algebra | 5 | 4 | t3/b10 | done | merged 9d40870b |
| 3 | T3-B11 Streams & search | 5 | 4 | t3/b11 | done | merged a895a8af |
| 3 | T3-B12 Advanced trees | 5 | 4 | t3/b12 | done | merged 138a42f2 |
| 3 | Kit H | — | 4→5 | kit owner | done | merged a54e6878 |
| 3 | T3-B13 Neural networks to transformers | 5 | 5 | t3/b13 | done | merged 9d0932de |
| 3 | T3-B14 Analytics storage | 5 | 5 | t3/b14 | done | merged 93088e89 |
| 3 | T3-B15 Geometry & strings | 5 | 5 | t3/b15 | done | merged 8984da20 |
| 3 | T3-B16 Kernel & I/O | 4 | 5 | t3/b16 | done | merged 603ecd45 |
| 3 | Kit I | — | 5→6 | kit owner | done | merged 634c0197: SeedField resync, convexHull, LogStream onRowClick, bytes IEC, introKey hardening, `smoke --scenes` |
| 3 | T3-B17 Durability & recovery | 5 | 6 | t3/b17 | done | merged f4b74b63 |
| 3 | T3-B18 Applied AI | 5 | 6 | t3/b18 | done | merged 462bc8be |
| 3 | T3-B19 Algorithmic techniques | 5 | 6 | t3/b19 | done | merged 0db49bc5 |
| 3 | T3-B20 Distributed coordination | 5 | 7 | t3/b20 | done | merged 0959a7a1 |
| 3 | T3-B21 Parallelism | 5 | 7 | t3/b21 | done | merged 7d543f60 |
| 3 | Kit J | — | 7 | kit owner | done | merged 0ba039c9: parseKit, longestPrefixMatch, KS test, bootstrap/Gini, bitLength, tfidf, freedTone |
| 3 | T3-B22 Compilers & memory semantics | 4 | 7 | t3/b22 | done | merged 8fcc1a48 |
| 3 | T3-B23 CPU & memory | 5 | 7 | t3/b23 | done | merged fb175ea0 |
| 3 | Kit K | — | 7→8 | kit owner | done | merged ce2dd82c: shared ClassifyBoard |
| 3 | T3-B24 Languages & parsing | 5 | 8 | t3/b24 | done | merged 4a850d00 |
| 3 | T3-B25 Security design | 5 | 8 | t3/b25 | done | merged 42a74e43 |
| 3 | T3-B26 Networking | 5 | 8 | t3/b26 | done | merged 5f2d01fe |
| 3 | Kit L | — | 8→9 | kit owner | done | merged 6d39a833: core/raster3d, raster, raytrace, signal, dct, forbiddenCalls |
| 3 | Kit M | — | 8→9 | kit owner | done | merged 106d263f: core/semver, editDistance, regex, countMin, automata and Turing tables |
| 3 | T3-B27 Graphics & signals | 5 | 9 | t3/b27 | done | merged 321031a6; shared dct quality rule fixed to libjpeg integer division |
| 3 | T3-B28 Security engineering | 5 | 9 | t3/b28 | done | merged fe050a09; payload-free audit passed |
| 3 | T3-B29 Resilience & multi-tenancy | 5 | 10 | t3/b29 | done | merged 1ca08100 |
| 3 | T3-B30 Networking, part 2 | 5 | 10 | t3/b30 | done | merged c571aa22 |
| 3 | T3-B31 Judgement & people | 6 | 10 | t3/b31 | done | merged da4587e3 |
| 3 | Tier 3 close-out kit round (kit N) | — | 10→QA | kit owner | done | merged ea18992e: joinList/dollars, paintPixels, Hint tone bad, boolean Segmented, SequenceDiagram note width, GanttLanes clip, forbidden clock/timer kinds |
| 3 | Tier 3 sign-off fixes A, B, C | — | QA | fixers | done | merged e982789e (A, B) and 261f3114 (C): count-min crash, four crashes found by the sweep, focus drops, Transport aria-disabled, ChipButton softDisabled, caption fixes, sha256 extraction |
| 3 | **Tier 3 sign-off** | 166 | — | | done | Sentry QA: sign-off, conditions closed or recorded (docs/qa-tier3-report.md, 2026-10-22); 409 lessons registered, smoke desktop 409/409, mobile 408/409 (one unreproduced 7.6px label, see report), scene scan 1,328 scenes clean; push after sign-off |
| 4 | Kickoff: validation, final list, batch and wave plan (docs/tier4-plan.md, docs/tier4-technical.md, docs/tier4-specs/part1-3.md, docs/tier4-kickoff-decisions.md) | — | pre | Atlas, Vector | done | 2026-10-22: 41 new + 9 existing = 50; 9 batches + 2 retrofit (R1 5, R2 4); 3 waves of 4, 4, 3 builders, ordered by kit readiness; leases-fencing was the one row moved out (42 to 41); committed 7fee38c6 |
| 4 | Kickoff kit (P0): T4-T1 register the 41, T4-T2 content lint T4, T4-T3, T4-T7, T4-T8, K4-8 theorem label, K4-9 scenario trade-off checks | — | pre | kit A | done | merged ba8b2278 |
| 4 | Kickoff kit (P0): K4-4 core/sat, K4-5 core/tsp, core/vertexCover, K4-10 ClassifyBoard explore | — | pre | kit C | done | merged 63485cf2 |
| 4 | Kickoff kit (P0): T4-T6 parallel-agent robustness, T4-T4 `npm run sweep`, T4-T5 captions skip list | — | pre | kit B | done | merged a822884e; 12-lesson sweep clean (2,821 actions) |
| 4 | K4-1 distSim v2 and K4-2 core/explore + pureProtocol + TracePlayer | — | built during 1 | kit D | done | merged 1ac170d1; Paxos spike 2,905 states in 94 ms at 2 ballots (exhaustive), 119,865 states in 5.3 s at 3 ballots; no scope cut |
| 4 | T4-R1 Retrofit, part 1 (raft, distributed-transactions, crdts, multi-region, backpressure) | 5 | 1 | t4/r1 | in progress | domain review: all 5; two reviewers; merges before wave 2 |
| 4 | T4-B3 Hardness & optimisation | 5 | 1 | t4/b3 | in progress | domain review: 3 of 5; proof-toy pilot (np-reductions first) |
| 4 | T4-B5 Strings, trees & strategy | 5 | 1 | t4/b5 | in progress | domain review: online-algorithms, game-theory; no new kit |
| 4 | T4-B8 Leading change & strategy | 4 | 1 | t4/b8 | in progress | opinion labelled (AC-0/T3 #24); ScenarioStory where the spec branches |
| 4 | P-follow-up after wave 1 (link patch, wave-end gates) | — | 1→2 | kit owner | not started | wave-end gates: whole-app smoke desktop + 390px, sweep of the wave's lessons |
| 4 | T4-B1 Failure & membership | 5 | 2 | t4/b1 | not started | domain review: 4 of 5; two reviewers; metastable-failures links backpressure |
| 4 | T4-B4 Consensus & global time | 6 | 2 | t4/b4 | not started | all domain review; two reviewers (3 lessons each); hardest batch; build flp-impossibility first |
| 4 | T4-R2 Retrofit, part 2 (lsm-trees, probabilistic-structures, slos-error-budgets, zero-trust) | 4 | 2 | t4/r2 | not started | domain review: all 4; one reviewer |
| 4 | T4-B9 People & judgement | 3 | 2 | t4/b9 | not started | domain review: hiring-interviewing |
| 4 | K4-3 memModel, K4-6 field + ecc (interpolate-at-zero), K4-7 crypto additions, K4-11 rocAuc | — | built during 2 | kit agents | not started | block wave 3 |
| 4 | P-follow-up after wave 2 (merge K4-3, K4-6, K4-7, K4-11; link chaos-engineering to slos-error-budgets) | — | 2→3 | kit owner | not started | wave-end gates as above |
| 4 | T4-B2 Concurrency, cores & proofs | 4 | 3 | t4/b2 | not started | all domain review; two reviewers; simulated memory model |
| 4 | T4-B6 Advanced cryptography | 5 | 3 | t4/b6 | not started | all domain review; payload-free review; two reviewers |
| 4 | T4-B7 ML serving & cloud cost | 4 | 3 | t4/b7 | not started | all domain review; two reviewers |
| 4 | Tier 4 close-out kit round | — | 3→QA | kit owner | not started | last kit round of the curriculum |
| 4 | **Tier 4 sign-off** | 50 | — | | not started | 41 new + 9 existing; whole-curriculum DoD (450 lessons); push only when the tier is finished |

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
5. **Throughput is gated on review quality, not the calendar.** This plan states batch counts only: Tier 1 has 10, Tier 2 32 plus 2 retrofit, Tier 3 ~31 and Tier 4 ~8.

**Settled at the Tier 2 kickoff (coordinator, within the owner's decisions):**
6. **Tier 2 is 156 new lessons plus the 16 existing ones (172).** `comparison-sort-lower-bound` is merged into `linear-time-sorting`, and `wifi-shared-medium` moves to Tier 3. Nothing moves down into the signed-off Tier 1.
7. **The 16 existing Tier 2 lessons are retrofitted in waves 1-2** (T2-R1, T2-R2), not at the end of the tier, because Tier 1's older lessons hid the false claims.
8. **AC-0/T2 (§3.1.3) applies on top of AC-0** to every Tier 2 lesson, retrofits included. Its mechanical rules are enforced by tests (K-2, K-3), not only by review.
9. **The payload-free rule for security lessons goes into CLAUDE.md** (K-5), so it binds every future lesson, not just one spec entry.
10. **The kickoff kit is split into P0-a (blocks wave 1) and P0-b (blocks wave 2).** A component whose second user hasn't appeared by wave 4 gets folded back into its lesson.
11. **Ten waves of 3-4 agents**, with a kit round after each, and a second reviewer on every wave from wave 3.
12. **Tier 2 specs live in this file (§3.1.8)**, not in a separate `docs/tier-2-spec.md`.
