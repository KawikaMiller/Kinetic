import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type Mode = 'none' | 'txn';
type Letter = 'A' | 'C' | 'I' | 'D';
type LetterState = 'off' | 'ok' | 'bad' | 'hint';
type Phase = 'run' | 'crash' | 'recover' | 'done';

interface WalRec {
  id: number;
  text: string;
  kind: 'begin' | 'update' | 'commit' | 'undo' | 'redo';
}

interface TxFrame extends Frame {
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

const PROGRAMS: Record<Mode, string[]> = {
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

const LETTER_NAMES: Record<Letter, string> = {
  A: 'Atomicity',
  C: 'Consistency',
  I: 'Isolation',
  D: 'Durability',
};

const OFF: Record<Letter, LetterState> = { A: 'off', C: 'off', I: 'off', D: 'off' };

function buildFrames(mode: Mode, crashAt: number | null): TxFrame[] {
  const program = PROGRAMS[mode];
  let alice = 500;
  let bob = 300;
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
    const letters = { ...OFF };
    if (mode === 'none') {
      if (k === 1) say = <>Read Alice's balance.</>;
      if (k === 2) {
        alice = 400;
        focus = 'alice';
        say = (
          <>
            Alice drops to <span className="hl">$400</span>, straight to disk. The $100 is now in flight: in nobody's
            account.
          </>
        );
      }
      if (k === 3) {
        bob = 400;
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
        alice = 400;
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
        letters.D = 'ok';
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
        letters.D = 'ok';
        say = <>The client is told "done". Notice Bob's page on disk still says $300. That's allowed.</>;
      }
      if (k === 7) {
        bob = 400;
        focus = 'bob';
        letters.D = 'ok';
        say = <>Later, the database writes Bob's page. Pages can lag; the log is the source of truth.</>;
      }
    }
    if (committed) letters.D = 'ok';
    if (k > 1 && k <= program.length) {
      const prevClient = frames[frames.length - 1];
      if (prevClient.clientTone === 'ok') {
        client = prevClient.client;
        clientTone = 'ok';
      }
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
    letters: mode === 'txn' ? { A: 'ok', C: 'ok', I: 'hint', D: 'ok' } : { A: 'off', C: 'ok', I: 'off', D: 'off' },
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

function crashFrames(mode: Mode, at: TxFrame, committed: boolean, firstId: number): TxFrame[] {
  const out: TxFrame[] = [];
  const base = { ...at, focus: null, letters: { ...at.letters } };
  const lostClient = at.clientTone === 'ok' ? at.client : 'connection lost';
  const lostTone = at.clientTone === 'ok' ? 'ok' : 'bad';

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
    const broken = at.alice + at.bob !== 800;
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
    out.push({
      ...base,
      bob: 400,
      wal,
      phase: 'recover',
      focus: 'bob',
      client: lostClient,
      clientTone: lostTone,
      letters: { ...base.letters, D: 'ok' },
      say: (
        <>
          Committed, so every logged change is <b>redone</b>. Bob's missing write is replayed from the log.
        </>
      ),
    });
    out.push({
      ...base,
      bob: 400,
      wal,
      phase: 'done',
      client: lostClient,
      clientTone: lostTone,
      hold: 2.5,
      letters: { A: 'ok', C: 'ok', I: 'hint', D: 'ok' },
      say: (
        <>
          <span className="hl ok">Durability</span>: the client was told "done", and after the crash it still is.
        </>
      ),
    });
  } else {
    const aliceWritten = at.alice !== 500;
    if (aliceWritten) wal = [...wal, { id: id++, text: 'UNDO Alice → 500', kind: 'undo' }];
    out.push({
      ...base,
      alice: 500,
      wal,
      phase: 'recover',
      focus: aliceWritten ? 'alice' : null,
      client: lostClient,
      clientTone: lostTone,
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
      ...base,
      alice: 500,
      wal,
      phase: 'done',
      client: lostClient,
      clientTone: lostTone,
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

export function Stage() {
  const [mode, setMode] = useState<Mode>('txn');
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const frames = useMemo(() => buildFrames(mode, crashAt), [mode, crashAt]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const program = PROGRAMS[mode];
  const total = f.alice + f.bob;
  const canCrash = f.phase === 'run' && f.ran < program.length;

  const crash = () => {
    setCrashAt(f.ran === 0 ? 1 : f.ran);
    player.queueNext({ play: true, from: f.ran === 0 ? 1 : player.index });
  };
  const switchMode = (m: Mode) => {
    player.queueNext({ play: false });
    setMode(m);
    setCrashAt(null);
  };

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Alice" value={`$${f.alice}`} />
          <Stat label="Bob" value={`$${f.bob}`} />
          <Stat
            label="Total"
            value={`$${total}`}
            color={total === 800 ? 'var(--ok)' : 'var(--bad)'}
            sub="must always be $800"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now' },
            { color: 'var(--info)', label: 'log record' },
            { color: 'var(--ok)', label: 'commit / guaranteed' },
            { color: 'var(--bad)', label: 'crash / broken' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Mode"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'none', label: 'No transaction' },
              { value: 'txn', label: 'Transaction + log' },
            ]}
          />
          <Button variant="danger" onClick={crash} disabled={!canCrash}>
            💥 Crash now
          </Button>
          <Button
            onClick={() => {
              player.queueNext({ play: false });
              setCrashAt(null);
            }}
            disabled={crashAt === null}
          >
            Undo crash
          </Button>
          <span className="tx-hint">Pause on any step, then crash there.</span>
        </Controls>
      }
    >
      <div className={`tx ${f.phase === 'crash' ? 'tx-crashed' : ''}`}>
        <AnimatePresence>
          {f.phase === 'crash' && (
            <motion.div
              className="tx-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.55, 0.2] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          )}
        </AnimatePresence>

        <div className="tx-acid">
          {(Object.keys(LETTER_NAMES) as Letter[]).map((l) => (
            <motion.div
              key={l}
              className={`tx-letter ${f.letters[l]}`}
              animate={f.letters[l] === 'off' ? { scale: 1 } : { scale: [1, 1.15, 1] }}
              transition={{ duration: 0.4 }}
            >
              <b>{l}</b>
              <span>{LETTER_NAMES[l]}</span>
            </motion.div>
          ))}
        </div>

        <div className="tx-grid">
          <section className="tx-panel">
            <h4>Program</h4>
            <ol className="tx-code">
              {program.map((line, i) => {
                const state = i < f.ran - 1 ? 'done' : i === f.ran - 1 && f.phase === 'run' ? 'now' : i < f.ran ? 'done' : '';
                const cut = f.phase !== 'run' && crashAt !== null && i === f.ran;
                return (
                  <li key={i} className={`${state} ${cut ? 'cut' : ''}`}>
                    <code>{line}</code>
                    {cut && <em>💥 never ran</em>}
                  </li>
                );
              })}
            </ol>
            <div className={`tx-client ${f.clientTone}`}>
              <span>Client</span>
              {f.client}
            </div>
          </section>

          <section className="tx-panel">
            <h4>Disk: accounts table</h4>
            <div className="tx-accounts">
              {(['alice', 'bob'] as const).map((who) => (
                <motion.div
                  key={who}
                  className={`tx-account ${f.focus === who ? 'focus' : ''}`}
                  animate={f.focus === who ? { y: [0, -6, 0] } : { y: 0 }}
                  transition={{ duration: 0.45 }}
                >
                  <span>{who === 'alice' ? 'Alice' : 'Bob'}</span>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.b
                      key={who === 'alice' ? f.alice : f.bob}
                      initial={{ y: -14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 14, opacity: 0 }}
                    >
                      ${who === 'alice' ? f.alice : f.bob}
                    </motion.b>
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
            <div className="tx-total">
              <div className="tx-total-bar">
                <motion.i
                  className={total === 800 ? 'ok' : 'bad'}
                  initial={false}
                  animate={{ width: `${(total / 800) * 100}%` }}
                />
              </div>
              <span className={total === 800 ? 'ok' : 'bad'}>
                {total === 800 ? 'total $800 ✓' : `total $${total}: $${800 - total} missing`}
              </span>
            </div>
          </section>

          <section className={`tx-panel ${mode === 'none' ? 'tx-nolog' : ''}`}>
            <h4>Disk: write-ahead log</h4>
            {mode === 'none' ? (
              <p className="tx-empty">No log. If it crashes, the database can't tell what was half-done.</p>
            ) : (
              <ul className="tx-wal">
                <AnimatePresence initial={false}>
                  {f.wal.map((r) => (
                    <motion.li
                      key={r.id}
                      className={`tx-rec ${r.kind}`}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <code>{r.text}</code>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {f.wal.length === 0 && <li className="tx-empty">empty</li>}
              </ul>
            )}
          </section>
        </div>
      </div>
    </StageFrame>
  );
}
