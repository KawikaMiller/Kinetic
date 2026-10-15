import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Money is counted in whole cents, and each change to the books is an entry whose debits equal its credits, so a ledger can prove itself balanced and a mistake gets found instead of hidden.',
    what: 'A JavaScript number adds up ten cents imprecisely, so money is held as integer cents and shared out by largest remainder so the parts add up. Double-entry bookkeeping records each transaction as at least two lines, debits and credits of equal total, and refuses an entry that does not balance; a trial balance then adds the whole ledger. The ledger only grows: a correction is a reversing entry followed by the right one, so history is kept.',
    analogy: 'A two-column notebook where each line in one column needs a matching total in the other: a page that tips tells you something is missing, and bisecting the pages tells you where.',
    useCases: [
      'Payment and wallet systems, where a balance is the sum of ledger lines',
      'Marketplaces that hold a buyer\'s money and pay sellers out later',
      'Billing and invoicing, where receivables are tracked against payments',
      'Reconciling an internal ledger against a bank or processor statement',
    ],
    why: 'Bugs in money code are rarely loud: a rounding cent or a double-posted payment passes tests and shows up in an audit. Integer cents, entries that must balance, an append-only history and a reconciliation make those bugs visible. It builds on `floating-point`, borrows the idea of an event log from `event-sourcing` and the duplicate check from `idempotency-keys`.',
    watch: 'On the entry lines and the T-accounts, a debit is blue and a credit violet: two plain roles, not good and bad. A green chip is a sum or a trial balance that agrees, a red one a drift, a difference or a refusal, and the yellow rows in the ledger are the range still being searched while the bad entry is red. A reversing entry is orange. In the first scene the share chips are blue, turning red when the shares do not add up to the bill.',
  },
  tryThis: [
    'In Why not floats, the default sums 10,000 payments of $0.10 as a JavaScript number and the balance check fails; switch to Integer cents and it is exactly $1,000.00.',
    'Still in Why not floats, the bill of $100.00 split 3 ways adds up to $99.99 when each share is rounded alone, and to $100.00 by largest remainder.',
    'In Post journal entries, change the second line\'s amount to 99.00 and press Post entry: nothing is posted, and the message says debits are higher by $1.00.',
    'Switch Validation to bypassed and post that unbalanced entry: the trial balance is out by $1.00, and Find the bad entry needs 2 checks to name it among 4 entries.',
    'In Append-only, press Correct the selected entry (T-1004, to $90.00): a reversing entry and a corrected one are added, while Edit entry is refused.',
  ],
  keyIdeas: [
    'Money is counted in whole cents: a JavaScript number does not sum 10,000 payments of $0.10 to 1000, while integer cents give exactly 100,000.',
    'An entry posts when its debits equal its credits and is refused when they do not, so the trial balance of the ledger agrees after each post.',
    'A debit raises an asset or an expense and lowers a liability, equity or revenue, so what it does depends on the type of account.',
    'A ledger is a log you add to: a mistake is corrected by a reversing entry and then the right one, and a transaction id posted once is refused a second time.',
  ],
  quiz: [
    {
      q: 'What does "double-entry" bookkeeping mean?',
      options: [
        'Debits and credits of equal total in each entry',
        'Each transaction is stored twice, as a backup copy',
        'Two people have to type in each transaction',
        'Each amount is kept in two currencies at once',
      ],
      answer: 0,
      why: 'The two sides are two lines of one entry, and the rule that they add up equally is what lets the books check themselves. It is not a backup, and a copy would not tell you anything was missing.',
    },
    {
      q: 'A customer pays a $100 invoice that was sold on credit. Which entry records it?',
      options: [
        'Debit Cash 100, credit Accounts Receivable 100',
        'Credit Cash 100, debit Accounts Receivable 100',
        'Debit Revenue 100, credit Cash 100',
        'Debit Accounts Receivable 100, credit Revenue 100',
      ],
      answer: 0,
      why: 'Cash is an asset and grows with a debit, while the receivable is an asset that shrinks with a credit as the customer settles it. The revenue was already recorded when the sale was made on credit.',
    },
    {
      q: 'What does a debit do to a liability account such as Accounts Payable?',
      options: [
        'It reduces it, as when a supplier is paid',
        'It increases it, as when more is owed',
        'Nothing: liabilities are changed by credits alone',
        'It moves the balance across to the asset side',
      ],
      answer: 0,
      why: 'A debit is a left-hand entry, and whether it raises or lowers a balance depends on the account type. Liabilities grow with credits, so a debit, such as paying the supplier, brings the balance down.',
    },
    {
      q: 'Why does a payments system hold amounts as integer cents?',
      options: [
        'Integers add exactly, so totals agree to the cent',
        'Integers take less memory than floating point numbers',
        'Floating point numbers cannot hold a decimal point',
        'Integer arithmetic runs faster than floating point',
      ],
      answer: 0,
      why: 'A double stores many decimal fractions as the nearest binary one, so 0.1 added 10,000 times drifts away from 1000. Speed and memory are not the reason, and doubles do hold fractions, just not exactly.',
    },
    {
      q: 'A posted entry has the wrong amount. What does an append-only ledger do?',
      options: [
        'Posts a reversing entry, then the correct entry',
        'Edits the amount in place and logs a note',
        'Deletes the entry and posts a new one',
        'Leaves it and adjusts the next report',
      ],
      answer: 0,
      why: 'Editing or deleting would rewrite history, so the ledger adds a reversing entry that cancels the wrong one and then posts the right one. Balances come out as if it had been right, and both the mistake and the fix stay visible.',
    },
  ],
};

export default lesson;
