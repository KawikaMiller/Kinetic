import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Flyer } from '../../components/scene';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { TOKENS } from '../../core/palette';
import {
  COLORS, ITEMS, RIDS, add, inc, remove, setReg, setValue,
  type Kind, type Mode, type Rep, type Rid,
} from './crdt';
import { checkLaws, checkSchedules, describeSchedules, runSchedule, SCHEDULE_SEEDS } from './schedule';
import {
  agree, DEFAULT_SEED, freshWorld, landMessage, lostIncrements, partitionAll, setOnline, startSync, syncOrder, valuesOf, localEdit,
  type Msg, type World,
} from './world';
import './styles.css';

const CHECK_PAINT_MS = 40;

/** Horizontal centre of each replica column, as a fraction of the stage width. */
const X: Record<Rid, number> = { A: 1 / 6, B: 3 / 6, C: 5 / 6 };
/** A state message's trip between replicas: seconds, and px of lift at the midpoint. */
const MSG_TRAVEL = 0.9;
const MSG_ARC = 22;
/** The wire runs between the outer replicas' centres. */
const WIRE_STYLE = { '--cr-wire-left': `${X.A * 100}%`, '--cr-wire-right': `${(1 - X.C) * 100}%` } as CSSProperties;
const KIND_NAME: Record<Kind, string> = { counter: 'G-Counter', set: 'OR-Set', register: 'LWW-Register' };

export function Stage() {
  const [kind, setKind] = useState<Kind>('counter');
  const [mode, setMode] = useState<Mode>('crdt');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [w, setW] = useState<World>(freshWorld);
  const [report, setReport] = useState<{ key: string; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const setCaption = useSetCaption();

  const converged = agree(w, kind, mode);

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
    const same = valuesOf(w, kind, mode).every((v, _, all) => v === all[0]);
    if (mode === 'crdt') {
      setCaption(
        <><span className="hl ok">Converged</span>: each replica merged the others' states and landed on the same
          answer, in whatever order the messages arrived.</>,
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
  }, [w, kind, mode, setCaption]);

  const reset = (k = kind, m = mode) => {
    setW(freshWorld());
    reported.current = 0; // the fresh world counts syncs from zero again
    setCaption(
      <>Three replicas of the same {KIND_NAME[k]}, using a {m === 'crdt' ? <b>CRDT merge</b> : <b>naive overwrite</b>}.
        Take a replica offline, edit on both sides, then reconnect.</>,
    );
  };

  const local = (r: Rid, fn: (s: Rep) => Rep, what: string) => setW((prev) => localEdit(prev, r, fn, what));

  const toggleOnline = (r: Rid) => {
    const going = !w.online[r];
    setW((prev) => setOnline(prev, r, going));
    setCaption(
      going ? (
        <>{r} is back online. Hit <b>Reconnect &amp; sync</b> to exchange state.</>
      ) : (
        <>{r} is <span className="hl bad">partitioned</span>. Edits there won't reach the others until it reconnects.</>
      ),
    );
  };

  const sync = (from?: Record<Rid, Rep>) => {
    const order = syncOrder(seed, w.syncCount);
    setW((prev) => startSync(prev, order, from));
    setCaption(<>Everyone exchanges full state, in the <span className="hl">order seed {seed} gives this sync</span>: 6 messages.</>);
  };

  const land = (m: Msg) => setW((prev) => landMessage(prev, m, kind, mode));

  /** Load the end state of this seed's random schedule, so the stage shows what the check counted. */
  const loadSchedule = () => {
    const run = runSchedule(seed, kind, mode);
    setW(run.world);
    reported.current = run.world.syncsDone;
    setCaption(
      <>Seed {seed}: {run.actions.length} random actions (edits, partitions, syncs, late messages), then two full syncs.{' '}
        {run.problem ? <><span className="hl bad">{run.problem}.</span></> : <><span className="hl ok">All three replicas read the expected value.</span></>}</>,
    );
  };

  const reportKey = `${kind}-${mode}`;
  const runCheck = () => {
    setRunning(true);
    setTimeout(() => {
      setReport({ key: reportKey, text: describeSchedules(checkSchedules(kind, mode), checkLaws(kind, mode)) });
      setRunning(false);
    }, CHECK_PAINT_MS);
  };
  const shownReport = report?.key === reportKey ? report.text : null;

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
              value={w.msgs.length ? '…' : lostIncrements(w, mode)}
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
      controls={[
        <>
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
              setW(partitionAll);
              setCaption(<>Full partition: every replica is on its own. Make different edits on each.</>);
            }}
          >
            Partition all
          </Button>
          <Button variant="primary" onClick={() => sync()} softDisabled={w.msgs.length > 0}>
            Reconnect &amp; sync
          </Button>
          <Button onClick={() => w.preSync && sync(w.preSync)} softDisabled={!w.preSync || w.msgs.length > 0}>
            Replay sync, new order
          </Button>
          <Button onClick={() => reset()}>Reset</Button>
          {kind === 'register' && mode === 'crdt' && (
            <Hint tone="muted" block>
              Higher timestamp wins. On a tie, the higher replica id wins (C &gt; B &gt; A), so the replicas pick the same
              value: deterministic, but the other write is lost.
            </Hint>
          )}
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
          <Button onClick={loadSchedule}>Random edits for this seed</Button>
          <Button onClick={runCheck} softDisabled={running}>
            {running ? 'Checking…' : `Check ${SCHEDULE_SEEDS} seeds`}
          </Button>
        </>,
      ]}
    >
      <div className="cr">
        <div className="cr-lane" aria-hidden="true">
          <div className="cr-wire" style={WIRE_STYLE} />
          <AnimatePresence>
            {w.msgs.map((m) => (
              <Flyer
                key={m.id}
                axis="x"
                center
                from={{ x: X[m.from] * 100, y: 0 }}
                to={{ x: X[m.to] * 100, y: 0 }}
                className="cr-msg"
                arc={MSG_ARC}
                fade={[0, 1, 1]}
                startScale={null}
                exitScale={0.4}
                duration={MSG_TRAVEL}
                delay={m.delay}
                onArrive={() => land(m)}
              >
                {m.from}→{m.to}
              </Flyer>
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
              onInc={() => local(r, (s) => inc(s, r), 'adds +1')}
              onAdd={(e) => local(r, (s) => add(s, r, e), `adds ${e}`)}
              onRemove={(e) => local(r, (s) => remove(s, e), `removes ${e}`)}
              onSet={(c) => local(r, (s) => setReg(s, r, c), 'sets the colour')}
            />
          ))}
        </div>
        {shownReport && <p className="cr-report">{shownReport}</p>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>
            three replicas in this page; the order of each sync's six messages comes from the seed (the next sync uses the next order)
          </Provenance>
          <Provenance kind="simulated">
            the check samples {SCHEDULE_SEEDS} seeded random schedules and three merge laws; it is not an exhaustive search
          </Provenance>
          <Provenance kind="from-memory">
            Automerge, Yjs, Riak and Redis Enterprise as CRDT users: verify against each project's docs
          </Provenance>
        </ProvenanceRow>
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