import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { SPRING } from '../../core/motion';
import { shuffle } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import { blank, build, opFrames, switchHashFrames, THRESHOLD, type HashView, type HtFrame, type OpKind } from './frames';
import './styles.css';

const WORDS = [
  'cat', 'horse', 'owl', 'zebra', 'bee', 'panda', 'tiger', 'lion', 'wolf', 'dog',
  'shark', 'moose', 'crab', 'eel', 'koala', 'otter', 'yak', 'lynx', 'bison', 'gecko',
];
const RANDOM_BATCH = 5;
const MAX_KEY_LENGTH = 8;
/** The load-factor meter's full width, so the 0.75 threshold sits well inside it. */
const METER_MAX = 1.25;

const INITIAL_TABLE = build(['cat', 'owl'], 4, false);

export function Stage() {
  const [bad, setBad] = useState(false);
  const [input, setInput] = useState('');
  const [run, setRun] = useState<HtFrame[]>(() => [
    { ...blank(INITIAL_TABLE),
      say: <>A hash table with <b>4 buckets</b>. Type a key and hit <b>Insert</b>, or throw in 5 random words.</> },
  ]);
  const player = usePlayer(run, { interval: 950 });
  const f = player.frame;
  const end = run[run.length - 1].table;

  const doOps = (ops: { kind: OpKind; key: string }[]) => {
    let table = end;
    const frames: HtFrame[] = [];
    for (const op of ops) {
      const fr = opFrames(table, op.kind, op.key, bad);
      frames.push(...fr);
      table = fr[fr.length - 1].table;
    }
    if (frames.length) setRun(frames);
  };

  const key = input.trim().toLowerCase();
  const act = (kind: OpKind) => {
    if (!key) return;
    doOps([{ kind, key }]);
    if (kind !== 'lookup') setInput('');
  };

  const insertRandom = () => {
    const have = new Set(end.flat());
    const picks = shuffle(WORDS.filter((w) => !have.has(w))).slice(0, RANDOM_BATCH);
    doOps(picks.map((k) => ({ kind: 'insert' as const, key: k })));
  };

  const switchHash = (nextBad: boolean) => {
    setBad(nextBad);
    setRun(switchHashFrames(end, nextBad));
  };

  const reset = () => {
    setBad(false);
    setRun([{ ...blank(INITIAL_TABLE), say: <>Fresh table: 4 buckets, 2 keys.</> }]);
  };

  const table = f.table;
  const n = table.length;
  const size = table.flat().length;
  const load = size / n;
  const longest = Math.max(0, ...table.map((c) => c.length));

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Keys" value={size} />
          <Stat label="Buckets" value={n} color="var(--info)" />
          <Stat label="Longest chain" value={longest} color={longest > 2 ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Probes" value={f.probes} color="var(--hi)" sub="this operation" />
          <LoadMeter load={load} warn={f.warn} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparing' },
            { color: 'var(--ok)', label: 'match' },
            { color: 'var(--bad)', label: 'collision' },
          ]}
        />
      }
      controls={
        <Controls>
          <div className="ht-form">
            <TextField
              ariaLabel="Key"
              value={input}
              maxLength={MAX_KEY_LENGTH}
              width={140}
              placeholder="type a key…"
              sanitize={(raw) => raw.replace(/[^a-z]/gi, '')}
              onChange={setInput}
              onEnter={() => act('insert')}
            />
            <Button variant="primary" onClick={() => act('insert')} disabled={!key}>
              Insert
            </Button>
            <Button onClick={() => act('lookup')} disabled={!key}>
              Lookup
            </Button>
            <Button onClick={() => act('delete')} disabled={!key}>
              Delete
            </Button>
          </div>
          <Button onClick={insertRandom}>Insert {RANDOM_BATCH} random</Button>
          <Toggle label="Hash function" value={bad} onChange={switchHash} off="Good (×31)" on="Bad (length)" />
          <Button onClick={reset}>Reset</Button>
        </Controls>
      }
    >
      <LayoutGroup>
        <div className="ht">
          <div className="ht-top">
            <div className="ht-incoming">
              {f.incoming && (
                <motion.div
                  key={`${f.incoming.kind}-${f.incoming.key}`}
                  layoutId={f.incoming.fresh ? `k-${f.incoming.key}` : undefined}
                  className={`ht-node ht-node-in ${f.incoming.kind}`}
                  initial={{ opacity: 0, scale: 0.6, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                >
                  {f.incoming.key}
                  <span className="ht-op">{f.incoming.kind}</span>
                </motion.div>
              )}
            </div>
            <div className="ht-hash">{f.hash ? <HashPanel view={f.hash} /> : <span className="ht-hash-empty">hash(key) % buckets → index</span>}</div>
          </div>

          <div className="ht-buckets" style={{ '--n': n } as CSSProperties}>
            {table.map((chain, b) => (
              <div key={b} className="ht-col">
                <motion.div
                  layout
                  className={`ht-slot ${f.bucket === b ? 'target' : ''} ${f.bucket === b && f.collide ? 'collide' : ''}`}
                >
                  {b}
                </motion.div>
                <AnimatePresence mode="popLayout">
                  {chain.map((k, i) => {
                    const probe = f.bucket === b && f.probe?.index === i ? (f.probe.hit ? 'hit' : 'probe') : '';
                    return (
                      <motion.div
                        key={k}
                        layoutId={`k-${k}`}
                        layout
                        className={`ht-node ${probe}`}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.4 }}
                        transition={SPRING.snappy}
                        title={k}
                      >
                        {k}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </LayoutGroup>
    </StageFrame>
  );
}

function HashPanel({ view }: { view: HashView }): ReactNode {
  const { key, steps, bad, n, showMod } = view;
  const h = steps.at(-1)!;
  return (
    <div className="ht-calc">
      <div className="ht-chips">
        {bad ? (
          <motion.div className="ht-chip bad" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <b>“{key}”</b>
            <span>length</span>
            <em>{h}</em>
          </motion.div>
        ) : (
          [...key].map((c, i) => (
            <motion.div
              key={i}
              className="ht-chip"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.09 }}
            >
              <b>{c}</b>
              <span>{c.charCodeAt(0)}</span>
              <motion.em initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.09 }}>
                {steps[i]}
              </motion.em>
            </motion.div>
          ))
        )}
      </div>
      <div className="ht-result">
        <span className="ht-h">h = {h}</span>
        <AnimatePresence>
          {showMod && (
            <motion.span
              className="ht-mod"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
            >
              {h} % {n} = <b>{h % n}</b>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** motion's default tween for the load bar (Bar's own default is slower). */
const LOAD_TRANSITION = {};

function LoadMeter({ load, warn }: { load: number; warn: boolean }) {
  const color = load > THRESHOLD ? 'var(--bad)' : 'var(--ok)';
  return (
    <Stat className={`ht-meter ${warn ? 'warn' : ''}`} label="Load factor" value={load.toFixed(2)} color={color}>
      <Bar
        className="ht-meter-bar"
        value={load}
        max={METER_MAX}
        color={color}
        track="var(--line-2)"
        height={6}
        transition={LOAD_TRANSITION}
        marker={THRESHOLD}
        markOpacity={0.7}
        markLabel={`resize threshold ${THRESHOLD}`}
      />
    </Stat>
  );
}
