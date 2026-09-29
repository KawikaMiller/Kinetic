import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import {
  HIT_MS, KEYS, MISS_MS, POLICIES, POLICY_NAMES, VICTIM, emojiOf, hitRatio, makeTraffic, simulate,
  type Phase, type Policy, type Step,
} from './sim';
import './styles.css';

type LFrame = Frame & Step;

const TRAFFIC = 24;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Em({ k }: { k: string }) {
  return <span className="lru-em">{emojiOf(k)}</span>;
}

function caption(s: Step, policy: Policy, cap: number, verbose: boolean): ReactNode {
  const k = s.key!;
  switch (s.phase) {
    case 'lookup':
      return verbose ? (
        <>
          Request for <Em k={k} />. First stop: the cache. A <span className="hl info">hash map</span> lookup, O(1).
        </>
      ) : (
        <>
          <Em k={k} /> requested…
        </>
      );
    case 'hit':
      return verbose ? (
        <>
          <span className="hl ok">Hit!</span> <Em k={k} /> served in ~{HIT_MS}ms.{' '}
          {policy === 'lru' && 'LRU moves it to the front: most recently used.'}
          {policy === 'fifo' && "FIFO doesn't reorder: arrival order is all it cares about."}
          {policy === 'lfu' && 'LFU bumps its use count, so it climbs toward the front.'}
        </>
      ) : (
        <>
          <span className="hl ok">Hit</span> <Em k={k} /> ~{HIT_MS}ms
        </>
      );
    case 'fetch':
      return (
        <>
          <span className="hl bad">Miss</span>. <Em k={k} /> isn't cached, so it's a slow trip to the database (~
          {MISS_MS - HIT_MS}ms).
          {s.victim && verbose && <> Cache is full ({cap}/{cap}). Something has to go.</>}
        </>
      );
    case 'insert': {
      const where =
        policy === 'lfu' ? (
          <>
            with a use count of 1, which puts it <b>last in line</b>. LFU is harsh on newcomers.
          </>
        ) : (
          <>at the front.</>
        );
      return s.evicted ? (
        <>
          Evict <Em k={s.evicted} /> ({VICTIM[policy]}), then store <Em k={k} /> {where}
        </>
      ) : (
        <>
          Store <Em k={k} /> {where}
        </>
      );
    }
    default:
      return null;
  }
}

function buildFrames(seq: string[], cap: number, policy: Policy): LFrame[] {
  const steps = simulate(seq, cap, policy);
  const frames: LFrame[] = steps.map((s) => ({
    ...s,
    say: s.phase === 'idle' ? undefined : caption(s, policy, cap, s.n < 3 || (s.phase === 'fetch' && !!s.victim && s.n < 8)),
    hold: s.phase === 'fetch' ? 1.3 : s.n >= 3 ? 0.75 : 1,
  }));
  frames[0].say = (
    <>
      A client asks for items. The <span className="hl info">cache</span> holds {cap} of them; everything else lives in a
      slow <span className="hl bad">database</span>. Press play.
    </>
  );
  const last = steps[steps.length - 1];
  const ratio = hitRatio(last.hits, last.misses);
  const avg = last.hits * HIT_MS + last.misses * MISS_MS;
  frames.push({
    ...last,
    phase: 'idle',
    key: null,
    hold: 3,
    say: (
      <>
        {POLICY_NAMES[policy]} with room for {cap}: hit ratio <span className="hl ok">{pct(ratio)}</span>, average{' '}
        <span className="hl">{Math.round(avg / Math.max(1, seq.length))}ms</span> vs. {MISS_MS}ms with no cache at all.
      </>
    ),
  });
  return frames;
}

// Vertical wire positions (px from top of the stage).
const Y = { client: 52, cache: 206, db: 362 };
const TOKEN_Y: Record<Phase, number> = { idle: Y.client, lookup: Y.cache, hit: Y.client, fetch: Y.db, insert: Y.cache };

export function Stage() {
  const [policy, setPolicy] = useState<Policy>('lru');
  const [cap, setCap] = useState(4);
  const [skew, setSkew] = useState(0.6);
  const [seq, setSeq] = useState(() => makeTraffic(TRAFFIC, 0.6));

  const frames = useMemo(() => buildFrames(seq, cap, policy), [seq, cap, policy]);
  const player = usePlayer(frames, { interval: 750 });
  const f = player.frame;

  // Manual requests append to the traffic and jump straight to them.
  const pendingSeek = useRef<number | null>(null);
  const { seek, play } = player;
  useEffect(() => {
    const n = pendingSeek.current;
    if (n === null) return;
    pendingSeek.current = null;
    const at = frames.findIndex((fr) => fr.n === n);
    if (at >= 0) {
      seek(at);
      play();
    }
  }, [frames, seek, play]);

  const request = (key: string) => {
    pendingSeek.current = seq.length;
    setSeq([...seq, key]);
  };

  const compare = useMemo(
    () =>
      POLICIES.map((p) => {
        const s = simulate(seq, cap, p);
        const end = s[s.length - 1];
        return { p, ratio: hitRatio(end.hits, end.misses) };
      }),
    [seq, cap],
  );

  const resolved = f.hits + f.misses;
  const ratio = hitRatio(f.hits, f.misses);
  const avg = resolved ? Math.round((f.hits * HIT_MS + f.misses * MISS_MS) / resolved) : 0;
  const empty = Math.max(0, cap - f.cache.length);
  const tokenColor = f.phase === 'hit' ? 'ok' : f.phase === 'fetch' ? 'bad' : f.phase === 'insert' ? 'info' : 'hi';
  const ends = policy === 'lfu' ? ['most used', 'least used · evict next'] : policy === 'fifo' ? ['newest', 'oldest · evict next'] : ['most recent', 'least recent · evict next'];

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Hits" value={f.hits} color="var(--ok)" />
          <Stat label="Misses" value={f.misses} color="var(--bad)" />
          <Stat label="Hit ratio" value={pct(ratio)} color="var(--info)" sub={<Sparkline log={f.log} />} />
          <Stat label="Avg latency" value={`${avg}ms`} color="var(--hi)" sub={`hit ${HIT_MS}ms · miss ${MISS_MS}ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'request', shape: 'dot' },
            { color: 'var(--ok)', label: 'hit', shape: 'dot' },
            { color: 'var(--bad)', label: 'miss / evicted', shape: 'dot' },
            { color: 'var(--info)', label: 'fresh from DB', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Eviction policy"
            value={policy}
            onChange={setPolicy}
            options={POLICIES.map((p) => ({ value: p, label: POLICY_NAMES[p] }))}
          />
          <Slider label="Capacity" value={cap} min={2} max={8} onChange={setCap} />
          <Slider
            label="Traffic"
            value={Math.round(skew * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) => (v < 20 ? 'uniform' : v < 60 ? 'some hot keys' : 'very hot keys')}
            onChange={(v) => {
              setSkew(v / 100);
              setSeq(makeTraffic(TRAFFIC, v / 100));
            }}
          />
          <Button onClick={() => setSeq(makeTraffic(TRAFFIC, skew))}>New traffic</Button>
          <div className="lru-palette">
            <span className="lru-palette-label">Request one yourself</span>
            <div>
              {KEYS.map((k) => (
                <button key={k.id} type="button" onClick={() => request(k.id)} title={`Request ${k.id}`}>
                  {k.emoji}
                </button>
              ))}
            </div>
          </div>
        </Controls>
      }
    >
      <div className="lru">
        <div className="lru-wire" style={{ top: Y.client, height: Y.db - Y.client }} />

        <div className="lru-node lru-client" style={{ top: Y.client - 32 }}>
          <span className="lru-node-icon">💻</span>
          <span>Client</span>
        </div>

        <Tape seq={seq} f={f} />

        <div className="lru-cache" style={{ top: Y.cache - 62 }}>
          <div className="lru-gate">
            <b>Cache</b>
            <span>
              {f.cache.length}/{cap} used
            </span>
          </div>
          <div className="lru-slots-wrap">
            <div className="lru-ends">
              <span>← {ends[0]}</span>
              <span>{ends[1]} →</span>
            </div>
            <div className="lru-slots">
              <AnimatePresence mode="popLayout" initial={false}>
                {f.cache.map((e, i) => {
                  const cls = [
                    'lru-slot',
                    f.phase === 'hit' && e.key === f.key ? 'hit' : '',
                    f.phase === 'insert' && e.key === f.key ? 'fresh' : '',
                    e.key === f.victim ? 'victim' : '',
                    f.phase === 'lookup' && e.key === f.key ? 'probe' : '',
                  ].join(' ');
                  return (
                    <motion.div
                      key={e.key}
                      layout
                      className={cls}
                      initial={{ opacity: 0, scale: 0.4, x: -40 }}
                      animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
                      exit={{ opacity: 0, y: 90, rotate: 18, scale: 0.7, transition: { duration: 0.5 } }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    >
                      <span className="lru-slot-em">{emojiOf(e.key)}</span>
                      <span className="lru-slot-key">{e.key}</span>
                      {policy === 'lfu' && <span className="lru-slot-freq">×{e.freq}</span>}
                      {i < f.cache.length - 1 + empty && <span className="lru-link" aria-hidden="true">⇄</span>}
                    </motion.div>
                  );
                })}
                {Array.from({ length: empty }, (_, i) => (
                  <motion.div key={`empty-${i}`} layout className="lru-slot empty">
                    <span className="lru-slot-key">empty</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className={`lru-node lru-db ${f.phase === 'fetch' ? 'busy' : ''}`} style={{ top: Y.db - 32 }}>
          <span className="lru-node-icon">🗄️</span>
          <span>Database</span>
          <span className="lru-db-lat">~{MISS_MS - HIT_MS}ms</span>
        </div>

        <CodePanel policy={policy} phase={f.phase} evicting={!!f.evicted || !!f.victim} />

        <div className="lru-compare">
          <b>Same traffic, each policy</b>
          {compare.map(({ p, ratio: r }) => (
            <button key={p} type="button" className={p === policy ? 'on' : ''} onClick={() => setPolicy(p)}>
              <span>{POLICY_NAMES[p]}</span>
              <span className="lru-compare-bar">
                <motion.i initial={false} animate={{ width: pct(r) }} />
              </span>
              <span className="mono">{pct(r)}</span>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {f.key && (
            <motion.div
              key={f.n}
              className={`lru-token ${tokenColor}`}
              initial={{ top: Y.client - 20, opacity: 0, scale: 0.5 }}
              animate={{ top: TOKEN_Y[f.phase] - 20, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.25 } }}
              transition={{ type: 'spring', stiffness: 170, damping: 22 }}
            >
              {emojiOf(f.key)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StageFrame>
  );
}

function Tape({ seq, f }: { seq: string[]; f: LFrame }) {
  // Show a window of the traffic around the current request.
  const cur = Math.max(0, f.n);
  const from = Math.max(0, Math.min(cur - 6, seq.length - 16));
  const shown = seq.slice(from, from + 16);
  return (
    <div className="lru-tape" style={{ top: Y.client - 22 }}>
      <span className="lru-tape-label">Incoming traffic</span>
      <div className="lru-tape-row">
        {shown.map((k, j) => {
          const n = from + j;
          const res = f.log[n];
          const state = n === f.n && f.phase !== 'idle' ? (res ?? 'now') : n < f.log.length ? res : 'todo';
          return (
            <span key={n} className={`lru-tape-chip ${state} ${n === f.n ? 'cur' : ''}`}>
              {emojiOf(k)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ log }: { log: ('hit' | 'miss')[] }) {
  if (log.length < 2) return <span className="lru-spark-empty">—</span>;
  let hits = 0;
  const pts = log.map((r, i) => {
    if (r === 'hit') hits++;
    const x = (i / (log.length - 1)) * 80;
    const y = 20 - (hits / (i + 1)) * 18;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="lru-spark" viewBox="0 0 80 22" width="80" height="22" aria-hidden="true">
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

function CodePanel({ policy, phase, evicting }: { policy: Policy; phase: Phase; evicting: boolean }) {
  const hitLine = {
    lru: 'if (node) return moveToHead(node)',
    fifo: 'if (node) return node        // no reorder',
    lfu: 'if (node) return bumpFreq(node)',
  }[policy];
  const lines: { code: string; on: boolean }[] = [
    { code: 'node = map.get(key)          // O(1)', on: phase === 'lookup' },
    { code: hitLine, on: phase === 'hit' },
    { code: 'value = db.fetch(key)        // slow', on: phase === 'fetch' },
    { code: 'if (full) map.delete(removeTail())', on: phase === 'insert' && evicting },
    { code: 'map.set(key, addToHead(value))', on: phase === 'insert' },
  ];
  return (
    <div className="lru-code">
      <div className="lru-code-head">
        Under the hood: <b>hash map</b> + <b>doubly linked list</b> → get & put are both O(1)
      </div>
      <pre>
        {lines.map((l, i) => (
          <div key={i} className={l.on ? 'on' : ''}>
            {l.code}
          </div>
        ))}
      </pre>
    </div>
  );
}
