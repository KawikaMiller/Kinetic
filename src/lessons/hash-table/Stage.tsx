import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { shuffle } from '../../core/hooks';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type Table = string[][];
type OpKind = 'insert' | 'lookup' | 'delete';

// Keep hashes to 16 bits so the numbers stay readable on screen.
const MOD = 65536;
const MAX_BUCKETS = 16;
const MAX_KEYS = 16;
const THRESHOLD = 0.75;
const WORDS = [
  'cat', 'horse', 'owl', 'zebra', 'bee', 'panda', 'tiger', 'lion', 'wolf', 'dog',
  'shark', 'moose', 'crab', 'eel', 'koala', 'otter', 'yak', 'lynx', 'bison', 'gecko',
];

/** Running hash after each character (good) or just the length (bad). */
function hashSteps(key: string, bad: boolean): number[] {
  if (bad) return [key.length];
  let h = 0;
  return [...key].map((c) => (h = (h * 31 + c.charCodeAt(0)) % MOD));
}
const hashOf = (key: string, bad: boolean) => hashSteps(key, bad).at(-1)!;

function build(keys: string[], n: number, bad: boolean): Table {
  const t: Table = Array.from({ length: n }, () => []);
  for (const k of keys) t[hashOf(k, bad) % n].push(k);
  return t;
}

interface HashView {
  key: string;
  steps: number[];
  bad: boolean;
  n: number;
  showMod: boolean;
}

interface HtFrame extends Frame {
  table: Table;
  incoming: { key: string; kind: OpKind; fresh: boolean } | null;
  hash: HashView | null;
  bucket: number | null;
  probe: { index: number; hit: boolean } | null;
  collide: boolean;
  warn: boolean;
  probes: number;
}

const blank = (table: Table): HtFrame => ({
  table, incoming: null, hash: null, bucket: null, probe: null, collide: false, warn: false, probes: 0,
});

function opFrames(table: Table, kind: OpKind, key: string, bad: boolean): HtFrame[] {
  const n = table.length;
  const size = table.flat().length;
  const exists = table.flat().includes(key);
  const fresh = kind === 'insert' && !exists;

  if (fresh && size >= MAX_KEYS) {
    return [{ ...blank(table), say: <>This demo table is full ({MAX_KEYS} keys). Delete a few, or reset.</> }];
  }

  const steps = hashSteps(key, bad);
  const h = steps.at(-1)!;
  const idx = h % n;
  const chain = table[idx];
  const incoming = { key, kind, fresh };
  const view: HashView = { key, steps, bad, n, showMod: false };
  const K = <span className="hl">{key}</span>;
  const frames: HtFrame[] = [];

  frames.push({
    ...blank(table), incoming, hash: view,
    say: bad ? (
      <>Bad hash: just use the <b>length</b> of {K} → <span className="hl violet">{h}</span>. What could go wrong?</>
    ) : (
      <>Hash {K}: fold each letter in with <span className="mono">h = h×31 + code</span> → <span className="hl violet">{h}</span></>
    ),
  });
  frames.push({
    ...blank(table), incoming, hash: { ...view, showMod: true }, bucket: idx,
    say: <><span className="hl violet">{h}</span> % {n} buckets = bucket <span className="hl">{idx}</span>. No searching, just arithmetic.</>,
  });

  let probes = 0;
  let hitAt = -1;
  for (let i = 0; i < chain.length; i++) {
    probes++;
    const hit = chain[i] === key;
    const first = i === 0 && kind === 'insert' && !hit;
    frames.push({
      ...blank(table), incoming, hash: { ...view, showMod: true }, bucket: idx, probe: { index: i, hit }, collide: first, probes,
      say: hit ? (
        <><span className="hl ok">{chain[i]}</span> = {key}. Match on probe {probes}.</>
      ) : first ? (
        <>Bucket {idx} is taken: a <span className="hl bad">collision</span>. Walk the chain: {chain[i]} ≠ {key}…</>
      ) : (
        <>Compare with <span className="hl">{chain[i]}</span>. Not it. Next node…</>
      ),
    });
    if (hit) {
      hitAt = i;
      break;
    }
  }

  const done = { bucket: idx, probes, hash: { ...view, showMod: true } };

  if (kind === 'insert') {
    if (!fresh) {
      frames.push({ ...blank(table), ...done, probe: { index: hitAt, hit: true },
        say: <>{K} is already here, so just update its value in place. Hash tables never store duplicates.</> });
      return frames;
    }
    const next = table.map((c, i) => (i === idx ? [...c, key] : c));
    frames.push({
      ...blank(next), ...done, collide: chain.length > 0,
      say: chain.length ? (
        <>Chain {K} onto bucket {idx}. That chain is now <b>{chain.length + 1}</b> long.</>
      ) : (
        <>Bucket {idx} was empty. Drop {K} straight in. <span className="hl ok">O(1)</span>.</>
      ),
    });
    const load = (size + 1) / n;
    if (load > THRESHOLD) {
      if (n < MAX_BUCKETS) {
        frames.push({
          ...blank(next), warn: true, probes,
          say: <>Load factor {(size + 1)}/{n} = <span className="hl bad">{load.toFixed(2)}</span> &gt; {THRESHOLD}. Chains are getting long. Time to grow.</>,
        });
        frames.push({
          ...blank(build(next.flat(), n * 2, bad)), probes, hold: 1.6,
          say: <>Double to <b>{n * 2}</b> buckets. Every index is now <span className="mono">h % {n * 2}</span>, so <b>every key rehashes</b> and moves.</>,
        });
      } else {
        frames.push({
          ...blank(next), warn: true, probes,
          say: <>Load factor <span className="hl bad">{load.toFixed(2)}</span>. A real table would double again here; this demo stops at {MAX_BUCKETS}.</>,
        });
      }
    }
    return frames;
  }

  if (hitAt < 0) {
    frames.push({ ...blank(table), ...done,
      say: chain.length ? (
        <>End of chain: <span className="hl bad">{key}</span> isn't in the table. And we never touched the other {n - 1} buckets.</>
      ) : (
        <>Bucket {idx} is empty, so <span className="hl bad">{key}</span> isn't here. Zero probes needed.</>
      ) });
    return frames;
  }

  if (kind === 'lookup') {
    frames.push({ ...blank(table), ...done, probe: { index: hitAt, hit: true },
      say: <>Found <span className="hl ok">{key}</span> in {probes} {probes === 1 ? 'probe' : 'probes'}, without scanning the whole table.</> });
    return frames;
  }

  const next = table.map((c, i) => (i === idx ? c.filter((k) => k !== key) : c));
  frames.push({ ...blank(next), ...done,
    say: <>Unlink {K} from bucket {idx}'s chain. Its neighbours close the gap.</> });
  return frames;
}

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
    const picks = shuffle(WORDS.filter((w) => !have.has(w))).slice(0, 5);
    doOps(picks.map((k) => ({ kind: 'insert' as const, key: k })));
  };

  const switchHash = (nextBad: boolean) => {
    setBad(nextBad);
    const keys = end.flat();
    setRun([
      { ...blank(end), say: <>Same keys, new hash function. Rehashing everything…</> },
      { ...blank(build(keys, end.length, nextBad)), hold: 1.6,
        say: nextBad ? (
          <>Length hash: every word with the same length collides. <span className="hl bad">Long chains = O(n) lookups.</span></>
        ) : (
          <>A good hash scatters keys evenly. <span className="hl ok">Short chains = O(1) lookups.</span></>
        ) },
    ]);
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
          <form
            className="ht-form"
            onSubmit={(e) => {
              e.preventDefault();
              act('insert');
            }}
          >
            <input
              className="ht-input"
              value={input}
              maxLength={8}
              placeholder="type a key…"
              onChange={(e) => setInput(e.target.value.replace(/[^a-z]/gi, ''))}
              aria-label="Key"
            />
            <Button variant="primary" type="submit" disabled={!key}>
              Insert
            </Button>
            <Button onClick={() => act('lookup')} disabled={!key}>
              Lookup
            </Button>
            <Button onClick={() => act('delete')} disabled={!key}>
              Delete
            </Button>
          </form>
          <Button onClick={insertRandom}>Insert 5 random</Button>
          <Segmented
            label="Hash function"
            value={bad ? 'bad' : 'good'}
            onChange={(v) => switchHash(v === 'bad')}
            options={[
              { value: 'good', label: 'Good (×31)' },
              { value: 'bad', label: 'Bad (length)' },
            ]}
          />
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
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
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

function LoadMeter({ load, warn }: { load: number; warn: boolean }) {
  const max = 1.25;
  const over = load > THRESHOLD;
  return (
    <div className={`stat ht-meter ${warn ? 'warn' : ''}`}>
      <span className="stat-label">Load factor</span>
      <span className="stat-value" style={{ color: over ? 'var(--bad)' : 'var(--ok)' }}>
        {load.toFixed(2)}
      </span>
      <div className="ht-meter-bar">
        <motion.i
          initial={false}
          animate={{ width: `${Math.min(1, load / max) * 100}%` }}
          style={{ background: over ? 'var(--bad)' : 'var(--ok)' }}
        />
        <span className="ht-meter-mark" style={{ left: `${(THRESHOLD / max) * 100}%` }} title="resize threshold 0.75" />
      </div>
    </div>
  );
}
