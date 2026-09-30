import type { Frame } from '../../core/types';

export type Mode = 'none' | 'txn';
export type Letter = 'A' | 'C' | 'I' | 'D';
type LetterState = 'off' | 'ok' | 'bad' | 'hint';
type Phase = 'run' | 'crash' | 'recover' | 'done';

interface WalRec {
  id: number;
  text: string;
  kind: 'begin' | 'update' | 'commit' | 'undo' | 'redo';
}

export interface TxFrame extends Frame {
  alice: number;
  bob: number;
  wal: WalRec[];
  /** How many program lines have run. */
  ran: number;
  phase: Phase;
  focus: 'alice' | 'bob' | null;
  client: string;
  clientTone: 'wait' | 'ok' | 'bad';
  letters: Record<Letter, LetterState>;
}

const ALICE_START = 500;
const BOB_START = 300;
const TRANSFER = 100;
/** The consistency rule: money only moves, so the total never changes. */
export const TOTAL = ALICE_START + BOB_START;

export const PROGRAMS: Record<Mode, string[]> = {
  none: ['read Alice: $500', 'Alice = 400   (write to disk)', 'Bob = 400     (write to disk)', 'reply "done"'],
  txn: [
    'BEGIN',
    'log: Alice 500 → 400',
    'Alice = 400   (write page)',
    'log: Bob 300 → 400',
    'COMMIT        (flush log to disk)',
    'reply "done"',
    'Bob = 400     (page written later)',
  ],
};

export const LETTER_NAMES: Record<Letter, string> = {
  A: 'Atomicity',
  C: 'Consistency',
  I: 'Isolation',
  D: 'Durability',
};

const OFF: Record<Letter, LetterState> = { A: 'off', C: 'off', I: 'off', D: 'off' };
const DONE_TXN: Record<Letter, LetterState> = { A: 'ok', C: 'ok', I: 'hint', D: 'ok' };

/** Frames for running the transfer, optionally crashing right after program line `crashAt`. */
export function buildFrames(mode: Mode, crashAt: number | null): TxFrame[] {
  const program = PROGRAMS[mode];
  let alice = ALICE_START;
  let bob = BOB_START;
  let wal: WalRec[] = [];
  let nextId = 1;
  let committed = false;
  const log = (text: string, kind: WalRec['kind']) => {
    wal = [...wal, { id: nextId++, text, kind }];
  };

  const frames: TxFrame[] = [
    {
      alice, bob, wal, ran: 0, phase: 'run', focus: null, client: 'waiting…', clientTone: 'wait', letters: OFF,
      say:
        mode === 'none' ? (
          <>
            Move <span className="hl">$100</span> from Alice to Bob with two plain writes, no transaction. Press play,
            then hit <b>Crash</b> half-way.
          </>
        ) : (
          <>
            Same transfer, inside a <b>transaction</b>. Every change is written to the <b>log</b> before it touches the
            table.
          </>
        ),
    },
  ];

  for (let k = 1; k <= program.length; k++) {
    let focus: TxFrame['focus'] = null;
    let client = 'waiting…';
    let clientTone: TxFrame['clientTone'] = 'wait';
    let say;
    if (mode === 'none') {
      if (k === 1) say = <>Read Alice's balance.</>;
      if (k === 2) {
        alice -= TRANSFER;
        focus = 'alice';
        say = (
          <>
            Alice drops to <span className="hl">$400</span>, straight to disk. The $100 is now in flight: in nobody's
            account.
          </>
        );
      }
      if (k === 3) {
        bob += TRANSFER;
        focus = 'bob';
        say = <>Bob rises to <span className="hl ok">$400</span>. Total is back to $800.</>;
      }
      if (k === 4) {
        client = '✓ transfer done';
        clientTone = 'ok';
        say = <>Worked this time. Now rewind and crash between the two writes.</>;
      }
    } else {
      if (k === 1) {
        log('BEGIN tx 42', 'begin');
        say = <>BEGIN: start transaction 42. Nothing is visible to anyone else yet.</>;
      }
      if (k === 2) {
        log('tx42 Alice 500→400', 'update');
        say = (
          <>
            <b>Write-ahead:</b> record the change, with the <span className="hl">old value</span>, in the log first.
          </>
        );
      }
      if (k === 3) {
        alice -= TRANSFER;
        focus = 'alice';
        say = <>Now change the table. If we crash from here, the log knows how to undo it.</>;
      }
      if (k === 4) {
        log('tx42 Bob 300→400', 'update');
        say = <>Log Bob's change too.</>;
      }
      if (k === 5) {
        log('COMMIT tx 42', 'commit');
        committed = true;
        say = (
          <>
            <span className="hl ok">COMMIT</span> is flushed to disk. This is the moment of truth: from here, the
            transfer <b>will</b> survive any crash.
          </>
        );
      }
      if (k === 6) {
        client = '✓ transfer done';
        clientTone = 'ok';
        say = <>The client is told "done". Notice Bob's page on disk still says $300. That's allowed.</>;
      }
      if (k === 7) {
        bob += TRANSFER;
        focus = 'bob';
        say = <>Later, the database writes Bob's page. Pages can lag; the log is the source of truth.</>;
      }
    }
    const letters = committed ? { ...OFF, D: 'ok' as const } : OFF;
    // Once the client has been told "done", it stays told.
    if (k > 1 && frames[frames.length - 1].clientTone === 'ok') {
      client = frames[frames.length - 1].client;
      clientTone = 'ok';
    }
    frames.push({ alice, bob, wal, ran: k, phase: 'run', focus, client, clientTone, letters, say });

    if (crashAt === k && k < program.length) {
      return [...frames, ...crashFrames(mode, frames[frames.length - 1], committed, nextId)];
    }
  }

  const last = frames[frames.length - 1];
  frames.push({
    ...last,
    focus: null,
    phase: 'done',
    hold: 2,
    letters: mode === 'txn' ? DONE_TXN : { A: 'off', C: 'ok', I: 'off', D: 'off' },
    say:
      mode === 'txn' ? (
        <>
          Committed and consistent. One letter left: <b>Isolation</b>. What if another transfer touched Alice at the
          same moment? That's the next lesson.
        </>
      ) : (
        <>
          No crash, no problem. But nothing protected it. Rewind to step 2 and press <b>Crash</b>.
        </>
      ),
  });
  return frames;
}

/** What happens after a power cut right after `at`: nothing (no log), or recovery from the log. */
function crashFrames(mode: Mode, at: TxFrame, committed: boolean, firstId: number): TxFrame[] {
  const out: TxFrame[] = [];
  const base = { ...at, focus: null, letters: { ...at.letters } };
  const lostClient = at.clientTone === 'ok' ? at.client : 'connection lost';
  const lostTone: TxFrame['clientTone'] = at.clientTone === 'ok' ? 'ok' : 'bad';

  out.push({
    ...base,
    phase: 'crash',
    client: lostClient,
    clientTone: lostTone,
    hold: 1.4,
    say: (
      <>
        <span className="hl bad">💥 Power cut</span> after step {at.ran}. Memory is gone. Only what reached the disk
        survives.
      </>
    ),
  });

  if (mode === 'none') {
    const broken = at.alice + at.bob !== TOTAL;
    out.push({
      ...base,
      phase: 'done',
      client: lostClient,
      clientTone: lostTone,
      hold: 2.5,
      letters: broken ? { A: 'bad', C: 'bad', I: 'off', D: 'off' } : base.letters,
      say: broken ? (
        <>
          Restarted. Alice has $400, Bob has $300. <span className="hl bad">$100 vanished</span>, and the database has
          no idea anything was half-done.
        </>
      ) : (
        <>Restarted, and nothing was half-done. Lucky timing. Try crashing between the two writes.</>
      ),
    });
    return out;
  }

  let wal = at.wal;
  let id = firstId;
  out.push({
    ...base,
    phase: 'recover',
    client: lostClient,
    clientTone: lostTone,
    say: (
      <>
        Restart. <b>Recovery</b> reads the log from the top: is there a COMMIT for tx 42?{' '}
        {committed ? <span className="hl ok">Yes.</span> : <span className="hl bad">No.</span>}
      </>
    ),
  });

  if (committed) {
    wal = [...wal, { id: id++, text: 'REDO Bob → 400', kind: 'redo' }];
    const redone = { ...base, bob: BOB_START + TRANSFER, wal, client: lostClient, clientTone: lostTone };
    out.push({
      ...redone,
      phase: 'recover',
      focus: 'bob',
      letters: { ...base.letters, D: 'ok' },
      say: (
        <>
          Committed, so every logged change is <b>redone</b>. Bob's missing write is replayed from the log.
        </>
      ),
    });
    out.push({
      ...redone,
      phase: 'done',
      hold: 2.5,
      letters: DONE_TXN,
      say: (
        <>
          <span className="hl ok">Durability</span>: the client was told "done", and after the crash it still is.
        </>
      ),
    });
  } else {
    const aliceWritten = at.alice !== ALICE_START;
    if (aliceWritten) wal = [...wal, { id: id++, text: 'UNDO Alice → 500', kind: 'undo' }];
    const undone = { ...base, alice: ALICE_START, wal, client: lostClient, clientTone: lostTone };
    out.push({
      ...undone,
      phase: 'recover',
      focus: aliceWritten ? 'alice' : null,
      say: aliceWritten ? (
        <>
          No COMMIT, so the transaction <b>rolls back</b>: the log's old value puts Alice back to{' '}
          <span className="hl">$500</span>.
        </>
      ) : (
        <>No COMMIT, and nothing reached the table yet. There's nothing to undo.</>
      ),
    });
    out.push({
      ...undone,
      phase: 'done',
      hold: 2.5,
      letters: { A: 'ok', C: 'ok', I: 'hint', D: 'off' },
      say: (
        <>
          <span className="hl ok">Atomicity</span>: all or nothing. The transfer never happened, the total is still
          $800, and the client never heard "done", so nothing was promised.
        </>
      ),
    });
  }
  return out;
}
