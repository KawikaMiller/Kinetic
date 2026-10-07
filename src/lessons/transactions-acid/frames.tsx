import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  ALICE_START, BOB_START, PROGRAMS, TOTAL, TRANSFER, TXN_ID, consistent, recover, run, total,
  type Account, type Disk, type Letter, type Mode, type WalRec,
} from './model';

type LetterState = 'off' | 'ok' | 'bad' | 'hint';
type Phase = 'run' | 'crash' | 'recover' | 'done';

export interface TxFrame extends Frame {
  alice: number;
  bob: number;
  wal: WalRec[];
  /** How many program lines have run. */
  ran: number;
  phase: Phase;
  focus: Account | null;
  client: string;
  clientTone: 'wait' | 'ok' | 'bad';
  letters: Record<Letter, LetterState>;
}

const OFF: Record<Letter, LetterState> = { A: 'off', C: 'off', I: 'off', D: 'off' };
const DONE_TXN: Record<Letter, LetterState> = { A: 'ok', C: 'ok', I: 'hint', D: 'ok' };
const TOLD = '✓ transfer done';

/** What each program line says as it runs, and which account it changes. */
const NARRATION: Record<Mode, { focus?: Account; say: ReactNode }[]> = {
  none: [
    { say: <>Read Alice's balance.</> },
    {
      focus: 'alice',
      say: (
        <>
          Alice drops to <span className="hl">${ALICE_START - TRANSFER}</span>, straight to disk. The ${TRANSFER} is now in
          flight: in nobody's account.
        </>
      ),
    },
    { focus: 'bob', say: <>Bob rises to <span className="hl ok">${BOB_START + TRANSFER}</span>. Total is back to ${TOTAL}.</> },
    { say: <>Worked this time. Now rewind and crash between the two writes.</> },
  ],
  txn: [
    { say: <>BEGIN: start transaction {TXN_ID}. Nothing is visible to anyone else yet.</> },
    { say: <><b>Write-ahead:</b> record the change, with the <span className="hl">old value</span>, in the log first.</> },
    { focus: 'alice', say: <>Now change the table. If we crash from here, the log knows how to undo it.</> },
    { say: <>Log Bob's change too.</> },
    {
      say: (
        <>
          <span className="hl ok">COMMIT</span> is flushed to disk. This is the moment of truth: from here, the transfer{' '}
          <b>will</b> survive any crash.
        </>
      ),
    },
    { say: <>The client is told "done". Notice Bob's page on disk still says ${BOB_START}. That's allowed.</> },
    { focus: 'bob', say: <>Later, the database writes Bob's page. Pages can lag; the log is the source of truth.</> },
  ],
};

const clientOf = (d: Disk) =>
  d.told ? { client: TOLD, clientTone: 'ok' as const } : { client: 'waiting…', clientTone: 'wait' as const };

/** Frames for running the transfer, optionally crashing right after program line `crashAt`. */
export function buildFrames(mode: Mode, crashAt: number | null): TxFrame[] {
  const disks = run(mode);
  const frame = (k: number, extra: Partial<TxFrame>): TxFrame => {
    const d = disks[k];
    return {
      alice: d.alice, bob: d.bob, wal: d.wal, ran: k, phase: 'run', focus: null, ...clientOf(d),
      letters: d.committed ? { ...OFF, D: 'ok' } : OFF,
      ...extra,
    };
  };

  const frames: TxFrame[] = [
    frame(0, {
      say:
        mode === 'none' ? (
          <>
            Move <span className="hl">${TRANSFER}</span> from Alice to Bob with two plain writes, no transaction. Press play,
            then hit <b>Crash</b> half-way.
          </>
        ) : (
          <>
            Same transfer, inside a <b>transaction</b>. Every change is written to the <b>log</b> before it touches the
            table.
          </>
        ),
    }),
  ];

  const program = PROGRAMS[mode];
  for (let k = 1; k <= program.length; k++) {
    const { focus, say } = NARRATION[mode][k - 1];
    frames.push(frame(k, { focus: focus ?? null, say }));
    if (crashAt === k && k < program.length) return [...frames, ...crashFrames(mode, frames[frames.length - 1], disks[k])];
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
          same moment? The isolation-levels lesson picks that up.
        </>
      ) : (
        <>
          No crash, no problem. But nothing protected it. Rewind to step 2 and press <b>Crash</b>.
        </>
      ),
  });
  return frames;
}

const NAME: Record<Account, string> = { alice: 'Alice', bob: 'Bob' };

/** What happens after a power cut right after `at`: nothing (no log), or recovery from the log. */
function crashFrames(mode: Mode, at: TxFrame, disk: Disk): TxFrame[] {
  const out: TxFrame[] = [];
  const base = { ...at, focus: null, letters: { ...at.letters } };
  const lost = disk.told
    ? { client: TOLD, clientTone: 'ok' as const }
    : { client: 'connection lost', clientTone: 'bad' as const };

  out.push({
    ...base,
    ...lost,
    phase: 'crash',
    hold: 1.4,
    say: (
      <>
        <span className="hl bad">💥 Power cut</span> after step {at.ran}. Memory is gone. Only what reached the disk
        survives.
      </>
    ),
  });

  const rec = recover(mode, disk);
  if (rec.action === 'no-log') {
    const broken = !consistent(disk);
    out.push({
      ...base,
      ...lost,
      phase: 'done',
      hold: 2.5,
      letters: broken ? { A: 'bad', C: 'bad', I: 'off', D: 'off' } : base.letters,
      say: broken ? (
        <>
          Restarted. Alice has ${disk.alice}, Bob has ${disk.bob}.{' '}
          <span className="hl bad">${TOTAL - total(disk)} vanished</span>, and the database has no idea anything was
          half-done.
        </>
      ) : (
        <>Restarted, and nothing was half-done. Lucky timing. Try crashing between the two writes.</>
      ),
    });
    return out;
  }

  out.push({
    ...base,
    ...lost,
    phase: 'recover',
    say: (
      <>
        Restart. <b>Recovery</b> reads the log from the top: is there a COMMIT for tx {TXN_ID}?{' '}
        {disk.committed ? <span className="hl ok">Yes.</span> : <span className="hl bad">No.</span>}
      </>
    ),
  });

  const after = { ...base, ...lost, alice: rec.disk.alice, bob: rec.disk.bob, wal: rec.disk.wal };
  const names = rec.touched.map((a) => NAME[a]).join(' and ');
  if (disk.committed) {
    out.push({
      ...after,
      phase: 'recover',
      focus: rec.touched[0] ?? null,
      letters: { ...base.letters, D: 'ok' },
      say: (
        <>
          Committed, so every logged change is <b>redone</b> wherever its page is behind: {names}'s missing write is
          replayed from the log.
        </>
      ),
    });
    out.push({
      ...after,
      phase: 'done',
      hold: 2.5,
      letters: DONE_TXN,
      say: disk.told ? (
        <>
          <span className="hl ok">Durability</span>: the client was told "done", and after the crash it still is.
        </>
      ) : (
        <>
          <span className="hl ok">Durability</span>: the crash came before the client heard "done", but COMMIT was on
          disk, so the transfer stands. The client has to check before retrying, or it pays twice.
        </>
      ),
    });
  } else {
    out.push({
      ...after,
      phase: 'recover',
      focus: rec.touched[0] ?? null,
      say:
        rec.action === 'undo' ? (
          <>
            No COMMIT, so the transaction <b>rolls back</b>: the log's old value puts {names} back to{' '}
            <span className="hl">${rec.disk[rec.touched[0]]}</span>.
          </>
        ) : (
          <>No COMMIT, and nothing reached the table yet. There's nothing to undo.</>
        ),
    });
    out.push({
      ...after,
      phase: 'done',
      hold: 2.5,
      letters: { A: 'ok', C: 'ok', I: 'hint', D: 'off' },
      say: (
        <>
          <span className="hl ok">Atomicity</span>: all or nothing. The transfer never happened, the total is still $
          {total(rec.disk)}, and the client never heard "done", so nothing was promised.
        </>
      ),
    });
  }
  return out;
}
