import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { TOKENS } from '../../core/palette';
import { shuffle } from '../../core/random';
import {
  COLORS, ITEMS, RIDS, add, emptyRep, inc, merge, remove, setReg, setValue, valueKey,
  type Kind, type Mode, type Rep, type Rid,
} from './crdt';
import './styles.css';

interface Msg {
  id: number;
  from: Rid;
  to: Rid;
  snap: Rep;
  delay: number;
}

/** A local edit, recorded by the same state update that applied it (so its caption can't go stale). */
interface LocalEdit {
  seq: number;
  r: Rid;
  wasOnline: boolean;
  what: ReactNode;
}

interface World {
  reps: Record<Rid, Rep>;
  online: Record<Rid, boolean>;
  msgs: Msg[];
  nextMsg: number;
  /** total local updates made anywhere (for spotting lost updates) */
  made: number;
  syncing: boolean;
  syncsDone: number;
  preSync: Record<Rid, Rep> | null;
  lastEdit: LocalEdit | null;
}

const fresh = (): World => ({
  reps: { A: emptyRep(), B: emptyRep(), C: emptyRep() },
  online: { A: true, B: true, C: true },
  msgs: [], nextMsg: 1, made: 0, syncing: false, syncsDone: 0, preSync: null, lastEdit: null,
});

/** Horizontal centre of each replica column, as a fraction of the stage width. */
const X: Record<Rid, number> = { A: 1 / 6, B: 3 / 6, C: 5 / 6 };
/** The wire runs between the outer replicas' centres. */
const WIRE_STYLE = { '--cr-wire-left': `${X.A * 100}%`, '--cr-wire-right': `${(1 - X.C) * 100}%` } as CSSProperties;
const KIND_NAME: Record<Kind, string> = { counter: 'G-Counter', set: 'OR-Set', register: 'LWW-Register' };

function allPairs(): [Rid, Rid][] {
  const out: [Rid, Rid][] = [];
  for (const a of RIDS) for (const b of RIDS) if (a !== b) out.push([a, b]);
  return out;
}

export function Stage() {
  const [kind, setKind] = useState<Kind>('counter');
  const [mode, setMode] = useState<Mode>('crdt');
  const [w, setW] = useState<World>(fresh);
  const setCaption = useSetCaption();

  const values = RIDS.map((r) => valueKey(w.reps[r], kind, mode));
  const converged = w.msgs.length === 0 && values.every((v) => v === values[0]);

  useIntroCaption(
    <>Three replicas of the same G-Counter. Take a replica offline, make edits on both sides of the partition, then
      reconnect and watch them merge.</>,
  );

  // Narrate each local edit from the state that applied it, not from this render's closure.
  const edit = w.lastEdit;
  useEffect(() => {
    if (!edit) return;
    setCaption(
      edit.wasOnline ? (
        <>{edit.r} {edit.what} and sends its state to everyone online.</>
      ) : (
        <>{edit.r} is <span className="hl bad">offline</span>: it {edit.what} locally. Nobody else knows yet.</>
      ),
    );
  }, [edit, setCaption]);

  // Report the outcome once a sync's messages have all landed.
  const reported = useRef(0);
  useEffect(() => {
    if (!w.syncsDone || reported.current === w.syncsDone) return;
    reported.current = w.syncsDone;
    const vals = RIDS.map((r) => valueKey(w.reps[r], kind, mode));
    const same = vals.every((v) => v === vals[0]);
    if (mode === 'crdt') {
      setCaption(
        <><span className="hl ok">Converged</span>: every replica merged every other replica's state and landed on the
          same answer, in whatever order the messages arrived.</>,
      );
    } else if (!same) {
      setCaption(
        <><span className="hl bad">Diverged!</span> Each replica kept whichever state happened to arrive last, so they
          now disagree. Another sync might make them agree by luck, but the lost edits never come back.</>,
      );
    } else {
      setCaption(
        <>They agree, but only by luck of arrival order. {kind === 'counter' ? <>Check the counter against the updates made: <span className="hl bad">updates were lost</span>.</> : <>Some edits were silently overwritten.</>}</>,
      );
    }
  }, [w.syncsDone, w.reps, kind, mode, setCaption]);

  const reset = (k = kind, m = mode) => {
    setW(fresh());
    reported.current = 0; // the fresh world counts syncs from zero again
    setCaption(
      <>Three replicas of the same {KIND_NAME[k]}, using a {m === 'crdt' ? <b>CRDT merge</b> : <b>naive overwrite</b>}.
        Take a replica offline, edit on both sides, then reconnect.</>,
    );
  };

  const local = (r: Rid, fn: (s: Rep) => Rep, what: ReactNode, counts = true) => {
    setW((prev) => {
      const rep = fn(prev.reps[r]);
      const reps = { ...prev.reps, [r]: rep };
      const wasOnline = prev.online[r];
      const msgs = wasOnline
        ? RIDS.filter((x) => x !== r && prev.online[x]).map((to, i) => ({ id: prev.nextMsg + i, from: r, to, snap: rep, delay: 0 }))
        : [];
      return {
        ...prev, reps, msgs: [...prev.msgs, ...msgs], nextMsg: prev.nextMsg + msgs.length, made: prev.made + (counts ? 1 : 0),
        lastEdit: { seq: (prev.lastEdit?.seq ?? 0) + 1, r, wasOnline, what },
      };
    });
  };

  const toggleOnline = (r: Rid) => {
    const going = !w.online[r];
    setW((prev) => ({ ...prev, online: { ...prev.online, [r]: going } }));
    setCaption(
      going ? (
        <>{r} is back online. Hit <b>Reconnect &amp; sync</b> to exchange state.</>
      ) : (
        <>{r} is <span className="hl bad">partitioned</span>. Edits there won't reach the others until it reconnects.</>
      ),
    );
  };

  const sync = (from?: Record<Rid, Rep>) => {
    setW((prev) => {
      const reps = from ?? prev.reps;
      const order = shuffle(allPairs());
      const msgs = order.map(([a, b], i) => ({ id: prev.nextMsg + i, from: a, to: b, snap: reps[a], delay: i * 0.3 }));
      return {
        ...prev, reps, online: { A: true, B: true, C: true }, preSync: reps, syncing: true,
        msgs: [...prev.msgs, ...msgs], nextMsg: prev.nextMsg + msgs.length,
      };
    });
    setCaption(<>Everyone exchanges full state, in a <span className="hl">random order</span>: 6 messages.</>);
  };

  const land = (m: Msg) => {
    setW((prev) => {
      if (!prev.msgs.some((x) => x.id === m.id)) return prev;
      const reps = { ...prev.reps, [m.to]: merge(prev.reps[m.to], m.snap, kind, mode) };
      const msgs = prev.msgs.filter((x) => x.id !== m.id);
      const finished = prev.syncing && msgs.length === 0;
      return { ...prev, reps, msgs, syncing: finished ? false : prev.syncing, syncsDone: prev.syncsDone + (finished ? 1 : 0) };
    });
  };

  const counterValue = (s: Rep) => (mode === 'crdt' ? s.vec.A + s.vec.B + s.vec.C : s.n);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat
            label="Replicas agree?"
            value={w.msgs.length ? '…' : converged ? 'yes' : 'no'}
            color={w.msgs.length ? 'var(--muted)' : converged ? 'var(--ok)' : 'var(--bad)'}
          />
          {kind === 'counter' && <Stat label="Increments made" value={w.made} />}
          {kind === 'counter' && (
            <Stat
              label="Lost increments"
              value={w.msgs.length ? '…' : Math.max(0, w.made - Math.min(...RIDS.map((r) => counterValue(w.reps[r]))))}
              color="var(--bad)"
              sub="once synced"
            />
          )}
          <Stat label="In flight" value={w.msgs.length} color="var(--info)" sub="messages" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'state message', shape: 'dot' },
            { color: 'var(--ok)', label: 'online' },
            { color: 'var(--bad)', label: 'offline / partitioned' },
            { color: 'var(--violet)', label: 'unique tag' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Data type"
            value={kind}
            onChange={(k) => {
              setKind(k);
              reset(k, mode);
            }}
            options={[
              { value: 'counter', label: 'G-Counter' },
              { value: 'set', label: 'OR-Set' },
              { value: 'register', label: 'LWW-Register' },
            ]}
          />
          <Segmented
            label="Merge"
            value={mode}
            onChange={(m) => {
              setMode(m);
              reset(kind, m);
            }}
            options={[
              { value: 'crdt', label: 'CRDT merge' },
              { value: 'naive', label: 'Naive overwrite' },
            ]}
          />
          <Button
            onClick={() => {
              setW((p) => ({ ...p, online: { A: false, B: false, C: false } }));
              setCaption(<>Full partition: every replica is on its own. Make different edits on each.</>);
            }}
          >
            Partition all
          </Button>
          <Button variant="primary" onClick={() => sync()} disabled={w.msgs.length > 0}>
            Reconnect &amp; sync
          </Button>
          <Button onClick={() => w.preSync && sync(w.preSync)} disabled={!w.preSync || w.msgs.length > 0}>
            Replay sync, new order
          </Button>
          <Button onClick={() => reset()}>Reset</Button>
          {kind === 'register' && mode === 'crdt' && (
            <p className="cr-tiebreak">
              Higher timestamp wins. On a tie, the higher replica id wins (C &gt; B &gt; A), so every replica picks the same
              value: deterministic, but the other write is silently lost.
            </p>
          )}
        </Controls>
      }
    >
      <div className="cr">
        <div className="cr-lane" aria-hidden="true">
          <div className="cr-wire" style={WIRE_STYLE} />
          <AnimatePresence>
            {w.msgs.map((m) => (
              <motion.span
                key={m.id}
                className="cr-msg"
                style={{ x: '-50%' }}
                initial={{ left: `${X[m.from] * 100}%`, y: 0, opacity: 0 }}
                animate={{ left: `${X[m.to] * 100}%`, y: [0, -22, 0], opacity: [0, 1, 1] }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.9, delay: m.delay, ease: 'easeInOut' }}
                onAnimationComplete={() => land(m)}
              >
                {m.from}→{m.to}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        <div className="cr-reps">
          {RIDS.map((r) => (
            <Replica
              key={r}
              r={r}
              s={w.reps[r]}
              online={w.online[r]}
              kind={kind}
              mode={mode}
              onToggle={() => toggleOnline(r)}
              onInc={() => local(r, (s) => inc(s, r), <>adds +1</>)}
              onAdd={(e) => local(r, (s) => add(s, r, e), <>adds {e}</>)}
              onRemove={(e) => local(r, (s) => remove(s, e), <>removes {e}</>)}
              onSet={(c) => local(r, (s) => setReg(s, r, c), <>sets the colour</>)}
            />
          ))}
        </div>
      </div>
    </StageFrame>
  );
}

function Replica({
  r, s, online, kind, mode, onToggle, onInc, onAdd, onRemove, onSet,
}: {
  r: Rid;
  s: Rep;
  online: boolean;
  kind: Kind;
  mode: Mode;
  onToggle: () => void;
  onInc: () => void;
  onAdd: (e: string) => void;
  onRemove: (e: string) => void;
  onSet: (c: string) => void;
}) {
  return (
    <section className={`cr-rep ${online ? 'on' : 'off'}`}>
      <header>
        <b>Replica {r}</b>
        <button type="button" className={`cr-net ${online ? 'on' : 'off'}`} onClick={onToggle}>
          {online ? '● online' : '✂ offline'}
        </button>
      </header>

      {kind === 'counter' && (
        <>
          <AnimatedValue value={mode === 'crdt' ? s.vec.A + s.vec.B + s.vec.C : s.n} className="cr-big" />
          {mode === 'crdt' ? (
            <div className="cr-vec">
              {(['A', 'B', 'C'] as Rid[]).map((k) => (
                <span key={k} className={k === r ? 'mine' : ''}>
                  <small>{k}</small>
                  {s.vec[k]}
                </span>
              ))}
            </div>
          ) : (
            <div className="cr-note">just one number</div>
          )}
          <Button className="cr-act" onClick={onInc}>+1</Button>
        </>
      )}

      {kind === 'set' && (
        <>
          <div className="cr-set">
            <AnimatePresence initial={false}>
              {setValue(s, mode).map((e) => (
                <motion.button
                  key={e}
                  type="button"
                  layout
                  className="cr-item"
                  title="click to remove"
                  onClick={() => onRemove(e)}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <span>{e}</span>
                  {mode === 'crdt' && (
                    <small>
                      {s.adds.filter((a) => a.e === e && !s.removed.includes(a.tag)).map((a) => a.tag).join(' ')}
                    </small>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>
            {!setValue(s, mode).length && <span className="cr-note">empty set</span>}
          </div>
          {mode === 'crdt' && <div className="cr-note">{plural(s.removed.length, 'tombstoned tag')}</div>}
          <div className="cr-palette">
            {ITEMS.map((e) => (
              <button key={e} type="button" onClick={() => onAdd(e)} title={`add ${e}`}>
                +{e}
              </button>
            ))}
          </div>
        </>
      )}

      {kind === 'register' && (
        <>
          <motion.div
            className="cr-swatch"
            animate={{ backgroundColor: (mode === 'crdt' ? s.reg?.v : s.plain) ?? TOKENS.cell }}
            transition={{ duration: 0.4 }}
          />
          <div className="cr-note">
            {mode === 'crdt'
              ? s.reg
                ? `timestamp ${s.reg.ts} · written by ${s.reg.by}`
                : 'unset'
              : 'no timestamp: arrival order decides'}
          </div>
          <div className="cr-palette">
            {COLORS.map((c) => (
              <button key={c} type="button" className="cr-color" style={{ background: c }} onClick={() => onSet(c)} aria-label={`set colour ${c}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
