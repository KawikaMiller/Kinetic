// The four navigation tools (search, go to definition, find references, blame) over
// the fictional repo, and a pure navigator the UI and the tests both drive.
import { FILES, HISTORY, INITIAL_COMMIT, type Commit } from './repo';

/** A position in the repo: file path and 1-based line (0 = file open, no line picked). */
export interface Loc {
  file: string;
  line: number;
}

export interface Hit extends Loc {
  text: string;
}

export const fileOf = (path: string) => FILES.find((f) => f.path === path)!;
export const lineText = (l: Loc) => fileOf(l.file).lines[l.line - 1];

/** Case-insensitive substring search over every line: what grep -rin would find. */
export function search(query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FILES.flatMap((f) =>
    f.lines.flatMap((text, i) => (text.toLowerCase().includes(q) ? [{ file: f.path, line: i + 1, text: text.trim() }] : [])),
  );
}

const DEFINITION = /\bexport\s+(?:async\s+)?(?:function|const|class|interface)\s+([A-Za-z_]\w*)/;

/** Every symbol the repo itself defines (exported), and where. */
export const DEFINITIONS: Record<string, Loc> = Object.fromEntries(
  FILES.flatMap((f) =>
    f.lines.flatMap((text, i) => {
      const m = DEFINITION.exec(text);
      return m ? [[m[1], { file: f.path, line: i + 1 }]] : [];
    }),
  ),
);

export const definitionOf = (symbol: string): Loc | null => DEFINITIONS[symbol] ?? null;

const word = (symbol: string) => new RegExp(`\\b${symbol}\\b`);

/** A line with its string literals blanked: references are code, not text (unlike search). */
const codeOnly = (text: string) => text.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");

/** Every other line whose code mentions the symbol (imports, calls, uses). */
export function referencesOf(symbol: string): Hit[] {
  const def = definitionOf(symbol);
  const re = word(symbol);
  return FILES.flatMap((f) =>
    f.lines.flatMap((text, i) =>
      re.test(codeOnly(text)) && !(def && def.file === f.path && def.line === i + 1) ? [{ file: f.path, line: i + 1, text: text.trim() }] : [],
    ),
  );
}

/** Repo-defined symbols mentioned on a line (what definition/references can act on). */
export function symbolsOn(l: Loc): string[] {
  const text = lineText(l);
  return Object.keys(DEFINITIONS).filter((s) => word(s).test(text));
}

/** The commit that last touched a line. */
export function blame(l: Loc): Commit {
  return HISTORY.find((h) => h.file === l.file && l.line >= h.from && l.line <= h.to)?.commit ?? INITIAL_COMMIT;
}

// ── The navigator ──────────────────────────────────────────────────────

export type Step =
  | { tool: 'open'; at: Loc }
  | { tool: 'search'; query: string }
  | { tool: 'definition'; symbol: string }
  | { tool: 'references'; symbol: string }
  | { tool: 'blame' };

export interface NavState {
  at: Loc | null;
  search: { query: string; hits: Hit[] } | null;
  refs: { symbol: string; hits: Hit[] } | null;
  blamed: { at: Loc; commit: Commit } | null;
  /** Files visited, in order (the breadcrumbs). */
  trail: string[];
  steps: number;
}

export const START: NavState = { at: null, search: null, refs: null, blamed: null, trail: [], steps: 0 };

const visit = (trail: string[], file: string) => (trail.at(-1) === file ? trail : [...trail, file]);

/** Apply one tool use. Steps that can't apply (no line selected, unknown symbol) leave the state as it was. */
export function apply(s: NavState, step: Step): NavState {
  const counted = { ...s, steps: s.steps + 1 };
  switch (step.tool) {
    case 'open':
      return { ...counted, at: step.at, blamed: null, trail: visit(s.trail, step.at.file) };
    case 'search':
      return { ...counted, search: { query: step.query, hits: search(step.query) } };
    case 'definition': {
      const def = definitionOf(step.symbol);
      return def ? { ...counted, at: def, blamed: null, trail: visit(s.trail, def.file) } : s;
    }
    case 'references':
      return definitionOf(step.symbol) ? { ...counted, refs: { symbol: step.symbol, hits: referencesOf(step.symbol) } } : s;
    case 'blame':
      return s.at && s.at.line > 0 ? { ...counted, blamed: { at: s.at, commit: blame(s.at) } } : s;
  }
}

export const run = (steps: Step[], from: NavState = START) => steps.reduce(apply, from);

// ── Tasks ──────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  question: string;
  /** Where the answer is. */
  answer: Loc;
  /** 'line': select the answer line. 'blame': blame the answer line. */
  needs: 'line' | 'blame';
  /** The efficient path: what an experienced engineer would do. */
  solution: Step[];
  /** What the answer means, shown when found. */
  explain: string;
  /** Lines that are close but not the answer, with a nudge. */
  near?: { at: Loc; nudge: string }[];
}

export const TASKS: Task[] = [
  {
    id: 'discount',
    question: 'Where is the 10% discount applied?',
    answer: { file: 'src/services/pricing.ts', line: 5 },
    needs: 'line',
    solution: [
      { tool: 'search', query: 'WELCOME10' },
      { tool: 'open', at: { file: 'src/services/pricing.ts', line: 5 } },
    ],
    explain: 'applyDiscount takes 10% off when the coupon is WELCOME10. The test file said the same thing first: tests are documentation.',
    near: [{ at: { file: 'tests/pricing.test.ts', line: 4 }, nudge: 'That\'s the test describing it. Where is the code it tests?' }],
  },
  {
    id: 'declined',
    question: 'Why does POST /checkout return 402?',
    answer: { file: 'src/services/payments.ts', line: 9 },
    needs: 'line',
    solution: [
      { tool: 'open', at: { file: 'src/routes/checkout.ts', line: 7 } },
      { tool: 'definition', symbol: 'createCheckout' },
      { tool: 'open', at: { file: 'src/controllers/checkoutController.ts', line: 10 } },
      { tool: 'references', symbol: 'PaymentDeclined' },
      { tool: 'open', at: { file: 'src/services/payments.ts', line: 9 } },
    ],
    explain: 'chargeCard throws PaymentDeclined when the bank declines the card, and the checkout controller turns that error into a 402.',
    near: [{ at: { file: 'src/controllers/checkoutController.ts', line: 11 }, nudge: 'That\'s where the 402 is sent. But what throws PaymentDeclined in the first place?' }],
  },
  {
    id: 'tax',
    question: 'Who last changed the tax rate, and why?',
    answer: { file: 'src/config/tax.ts', line: 2 },
    needs: 'blame',
    solution: [
      { tool: 'search', query: 'TAX_RATE' },
      { tool: 'open', at: { file: 'src/config/tax.ts', line: 2 } },
      { tool: 'blame' },
    ],
    explain: 'Blame shows the last commit to touch the line, and its message says why. That beats guessing from the code.',
  },
  {
    id: 'save',
    question: 'Where does a new order get written to the database?',
    answer: { file: 'src/repositories/orderRepository.ts', line: 18 },
    needs: 'line',
    solution: [
      { tool: 'open', at: { file: 'src/routes/checkout.ts', line: 7 } },
      { tool: 'definition', symbol: 'createCheckout' },
      { tool: 'open', at: { file: 'src/controllers/checkoutController.ts', line: 7 } },
      { tool: 'definition', symbol: 'placeOrder' },
      { tool: 'open', at: { file: 'src/services/orderService.ts', line: 9 } },
      { tool: 'definition', symbol: 'saveOrder' },
      { tool: 'open', at: { file: 'src/repositories/orderRepository.ts', line: 18 } },
    ],
    explain: 'Route → controller → service → repository → database: following definitions from the entry point leads straight to the INSERT.',
  },
];

/** Has the learner found the task's answer? */
export function solved(task: Task, s: NavState): boolean {
  const atAnswer = (l: Loc | null) => l !== null && l.file === task.answer.file && l.line === task.answer.line;
  return task.needs === 'blame' ? s.blamed !== null && atAnswer(s.blamed.at) : atAnswer(s.at);
}
