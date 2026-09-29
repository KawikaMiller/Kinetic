import { motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { randInt } from '../../core/hooks';
import {
  WORDS, bits32, bloomFpMeasured, bloomFpTheory, bloomHas, bloomPositions, buildBloom, hllAdd, hllBuild, hllEstimate,
  itemHash,
} from './sketches';
import './styles.css';

type View = 'bloom' | 'hll';

export function Stage() {
  const [view, setView] = useState<View>('bloom');
  const switcher = (
    <Segmented
      label="Structure"
      value={view}
      onChange={setView}
      options={[
        { value: 'bloom', label: 'Bloom filter' },
        { value: 'hll', label: 'HyperLogLog' },
      ]}
    />
  );
  return view === 'bloom' ? <BloomView switcher={switcher} /> : <HllView switcher={switcher} />;
}

// ── Bloom filter ────────────────────────────────────────────────────

const COLS = 16;
const CELL = 30;
const GAP = 6;
const ROW_GAP = 20;
const TOP = 78;
const GRID_W = COLS * (CELL + GAP) - GAP;
const cellXY = (i: number) => ({ x: (i % COLS) * (CELL + GAP) + CELL / 2, y: TOP + Math.floor(i / COLS) * (CELL + ROW_GAP) + CELL / 2 });

interface BloomAction {
  word: string;
  kind: 'insert' | 'query';
  positions: number[];
  verdict?: 'no' | 'maybe' | 'fp';
  id: number;
}

const pct = (x: number) => (x < 0.001 && x > 0 ? '<0.1%' : `${(x * 100).toFixed(1)}%`);

function BloomView({ switcher }: { switcher: ReactNode }) {
  const [m, setM] = useState(32);
  const [k, setK] = useState(3);
  const [words, setWords] = useState<string[]>(['apple', 'banana', 'cherry']);
  const [act, setAct] = useState<BloomAction | null>(null);
  const [draft, setDraft] = useState('');
  const setCaption = useSetCaption();

  const bits = useMemo(() => buildBloom(words, k, m), [words, k, m]);
  const setCount = bits.reduce((a, b) => a + b, 0);
  const theory = bloomFpTheory(words.length, k, m);
  const measured = useMemo(() => bloomFpMeasured(bits, k), [bits, k]);
  const bestK = words.length ? Math.max(1, Math.round((m / words.length) * Math.LN2)) : null;

  useEffect(() => {
    setCaption(
      <>A Bloom filter is just a row of bits. Each word sets <b>k</b> of them; a query checks those same k bits. Try
        inserting and querying.</>,
    );
  }, [setCaption]);

  const insert = (w: string) => {
    const word = w.trim().toLowerCase();
    if (!word) return;
    const positions = bloomPositions(word, k, m);
    setWords((ws) => (ws.includes(word) ? ws : [...ws, word]));
    setAct({ word, kind: 'insert', positions, id: Date.now() });
    setCaption(
      <>Insert <span className="hl">{word}</span>: hash it {k} ways → bits {positions.join(', ')}. Set them all to 1. The
        word itself is <b>not stored</b> anywhere.</>,
    );
  };

  const query = (w: string) => {
    const word = w.trim().toLowerCase();
    if (!word) return;
    const positions = bloomPositions(word, k, m);
    const maybe = bloomHas(bits, word, k);
    const verdict = !maybe ? 'no' : words.includes(word) ? 'maybe' : 'fp';
    setAct({ word, kind: 'query', positions, verdict, id: Date.now() });
    setCaption(
      verdict === 'no' ? (
        <>Query <span className="hl">{word}</span>: bit {positions.find((p) => !bits[p])} is 0, so it is{' '}
          <span className="hl info">definitely not</span> in the set. No false negatives, ever.</>
      ) : verdict === 'maybe' ? (
        <>Query <span className="hl">{word}</span>: all {k} bits are 1 → <span className="hl ok">probably in the set</span>{' '}
          (and it really is).</>
      ) : (
        <>Query <span className="hl">{word}</span>: all {k} bits are 1, but it was never inserted. A{' '}
          <span className="hl bad">false positive</span>: other words happened to set those bits.</>
      ),
    );
  };

  const unseen = () => {
    const pool = WORDS.filter((w) => !words.includes(w));
    return pool.length ? pool[randInt(0, pool.length - 1)] : `word${randInt(100, 999)}`;
  };
  const nextWord = () => WORDS.find((w) => !words.includes(w)) ?? `word${words.length}`;

  const rebuild = (nm: number, nk: number) => {
    setM(nm);
    setK(nk);
    setAct(null);
  };

  const rows = m / COLS;
  const hot = new Set(act?.positions ?? []);

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Words inserted" value={words.length} />
          <Stat label="Bits set" value={`${setCount}/${m}`} color="var(--violet)" />
          <Stat label="FP rate (theory)" value={pct(theory)} color="var(--hi)" sub="(1 − e^(−kn/m))^k" />
          <Stat label="FP rate (measured)" value={pct(measured)} color="var(--bad)" sub="1,000 unseen probes" />
          {bestK && <Stat label="Best k here" value={bestK} sub="(m/n)·ln 2" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'bit = 1' },
            { color: 'var(--hi)', label: 'just set' },
            { color: 'var(--ok)', label: 'checked: 1' },
            { color: 'var(--bad)', label: 'checked: 0' },
          ]}
        />
      }
      controls={
        <>
          <Controls>
            {switcher}
            <Slider label="Bits m" value={m} min={16} max={64} step={16} onChange={(v) => rebuild(v, k)} />
            <Slider label="Hashes k" value={k} min={1} max={6} onChange={(v) => rebuild(m, v)} />
          </Controls>
          <Controls>
            <form
              className="pb-form"
              onSubmit={(e) => {
                e.preventDefault();
                query(draft);
              }}
            >
              <input className="pb-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="type a word…" maxLength={16} />
              <Button onClick={() => insert(draft)} disabled={!draft.trim()}>Insert</Button>
              <Button onClick={() => query(draft)} disabled={!draft.trim()}>Query</Button>
            </form>
            <Button variant="primary" onClick={() => insert(nextWord())}>Insert next word</Button>
            <Button onClick={() => query(words[randInt(0, words.length - 1)])} disabled={!words.length}>Query a stored word</Button>
            <Button onClick={() => query(unseen())}>Query an unseen word</Button>
            <Button onClick={() => { setWords([]); setAct(null); }}>Clear</Button>
          </Controls>
        </>
      }
    >
      <div className="pb">
        <div className="pb-board" style={{ width: GRID_W, height: TOP + rows * (CELL + ROW_GAP) }}>
          <div className="pb-word-row">
            {act ? (
              <motion.span key={act.id} className={`pb-word ${act.kind}`} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                {act.kind === 'insert' ? 'insert' : 'query'} “{act.word}”
              </motion.span>
            ) : (
              <span className="pb-word idle">insert or query a word</span>
            )}
            {act?.verdict && (
              <motion.span key={`v${act.id}`} className={`pb-verdict ${act.verdict}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}>
                {act.verdict === 'no' ? 'definitely NOT in set' : act.verdict === 'maybe' ? 'probably in set ✓' : 'FALSE POSITIVE ✗'}
              </motion.span>
            )}
          </div>
          <svg className="pb-arrows" width={GRID_W} height={TOP + rows * (CELL + ROW_GAP)} aria-hidden="true">
            {act?.positions.map((p, i) => {
              const { x, y } = cellXY(p);
              const on = bits[p] === 1;
              const cls = act.kind === 'insert' ? 'set' : on ? 'on' : 'off';
              return (
                <motion.path
                  key={`${act.id}-${i}`}
                  d={`M ${GRID_W / 2} 34 C ${GRID_W / 2} ${TOP - 10}, ${x} ${TOP - 30}, ${x} ${y - CELL / 2 - 2}`}
                  className={`pb-arrow ${cls}`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.45, delay: i * 0.12 }}
                />
              );
            })}
          </svg>
          {Array.from({ length: m }, (_, i) => {
            const { x, y } = cellXY(i);
            const checked = hot.has(i);
            const state = !checked ? '' : act?.kind === 'insert' ? 'just' : bits[i] ? 'chk-on' : 'chk-off';
            return (
              <motion.div
                key={i}
                className={`pb-bit ${bits[i] ? 'on' : ''} ${state}`}
                style={{ left: x - CELL / 2, top: y - CELL / 2, width: CELL, height: CELL }}
                animate={checked ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                transition={{ duration: 0.4, delay: 0.35 }}
              >
                {bits[i]}
                <small>{i}</small>
              </motion.div>
            );
          })}
        </div>
        <div className="pb-words">
          <span>stored words (the filter itself never keeps these):</span>
          {words.map((w) => (
            <span key={w} className="pb-chip">{w}</span>
          ))}
        </div>
      </div>
    </StageFrame>
  );
}

// ── HyperLogLog ─────────────────────────────────────────────────────

interface Hll {
  p: number;
  regs: Uint8Array;
  count: number;
  last: { id: number; idx: number; rank: number } | null;
  updated: number | null;
}

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${Math.ceil(b)} B`);

function HllView({ switcher }: { switcher: ReactNode }) {
  const [h, setH] = useState<Hll>(() => ({ p: 6, regs: new Uint8Array(64), count: 0, last: null, updated: null }));
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(
      <>HyperLogLog counts <b>distinct</b> items in a few bytes. Each item is hashed; long runs of leading zeros are rare,
        so the longest run seen hints at how many items there were. Add one to see how.</>,
    );
  }, [setCaption]);

  const m = h.regs.length;
  const est = h.count ? hllEstimate(h.regs) : 0;
  const err = h.count ? (est - h.count) / h.count : 0;
  const stdErr = 1.04 / Math.sqrt(m);
  const hllBytes = (m * 6) / 8;
  const exactBytes = h.count * 8;

  const addOne = () => {
    const regs = h.regs.slice();
    const before = regs.slice();
    const { idx, rank } = hllAdd(regs, h.count, h.p);
    const grew = regs[idx] !== before[idx];
    setH({ ...h, regs, count: h.count + 1, last: { id: h.count, idx, rank }, updated: grew ? idx : null });
    setCaption(
      <>Item #{h.count}: first {h.p} hash bits pick register <span className="hl violet">{idx}</span>; the rest start with{' '}
        {rank - 1} zero{rank === 2 ? '' : 's'} → rank <span className="hl">{rank}</span>.{' '}
        {grew ? <>That beats the register's old max, so it grows.</> : <>Not bigger than what's there, so nothing changes.</>}</>,
    );
  };

  const addMany = (n: number) => {
    const regs = h.regs.slice();
    for (let i = h.count; i < h.count + n; i++) hllAdd(regs, i, h.p);
    const count = h.count + n;
    setH({ ...h, regs, count, last: null, updated: null });
    const e = hllEstimate(regs);
    setCaption(
      <>Added {n.toLocaleString()} new items. True distinct count <b>{count.toLocaleString()}</b>, estimate{' '}
        <span className="hl">{Math.round(e).toLocaleString()}</span> ({((e / count - 1) * 100).toFixed(1)}% off), using just{' '}
        {fmtBytes(hllBytes)}.</>,
    );
  };

  const addDupes = () => {
    if (!h.count) return;
    const regs = h.regs.slice();
    for (let i = 0; i < 1000; i++) hllAdd(regs, randInt(0, h.count - 1), h.p);
    const same = regs.every((r, i) => r === h.regs[i]);
    setH({ ...h, regs, last: null, updated: null });
    setCaption(
      <>Re-added 1,000 items we'd already seen. Same hash → same register, same rank, so{' '}
        <span className="hl ok">{same ? 'nothing changed' : 'nothing should change'}</span>. Duplicates can't inflate the count.</>,
    );
  };

  const setP = (p: number) => {
    setH({ p, regs: hllBuild(h.count, p), count: h.count, last: null, updated: null });
    setCaption(
      <>{1 << p} registers: expected error ≈ 1.04/√m = <span className="hl">{((1.04 / Math.sqrt(1 << p)) * 100).toFixed(1)}%</span>.
        Four times the registers halves the error. Redis uses 16,384 (0.81%, 12 KB).</>,
    );
  };

  const bitsStr = h.last ? bits32(itemHash(h.last.id)) : null;
  const maxRank = Math.max(8, ...h.regs);
  const W = 860;
  const BH = 150;
  const bw = W / m;
  const memMax = Math.log10(Math.max(hllBytes, exactBytes) + 1);
  const memW = (b: number) => `${Math.max(1, (Math.log10(b + 1) / memMax) * 100)}%`;

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="True distinct" value={h.count.toLocaleString()} />
          <Stat label="HLL estimate" value={Math.round(est).toLocaleString()} color="var(--hi)" />
          <Stat label="Error" value={h.count ? `${(err * 100).toFixed(1)}%` : '–'} color={Math.abs(err) > 2 * stdErr ? 'var(--bad)' : 'var(--ok)'} sub={`typical ±${(stdErr * 100).toFixed(1)}%`} />
          <Stat label="HLL memory" value={fmtBytes(hllBytes)} color="var(--ok)" sub={`${m} registers × 6 bits`} />
          <Stat label="Exact set" value={fmtBytes(exactBytes)} color="var(--bad)" sub="≈ 8 bytes per id, before overhead" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'register index bits' },
            { color: 'var(--hi)', label: 'leading zeros' },
            { color: 'var(--ok)', label: 'first 1' },
            { color: 'var(--info)', label: 'register max rank' },
          ]}
        />
      }
      controls={
        <Controls>
          {switcher}
          <Segmented
            label="Registers"
            value={String(h.p)}
            onChange={(v) => setP(Number(v))}
            options={[
              { value: '4', label: '16' },
              { value: '6', label: '64' },
              { value: '8', label: '256' },
            ]}
          />
          <Button variant="primary" onClick={addOne}>Add 1 item</Button>
          <Button onClick={() => addMany(100)}>+100</Button>
          <Button onClick={() => addMany(10_000)}>+10,000</Button>
          <Button onClick={() => addMany(1_000_000)}>+1,000,000</Button>
          <Button onClick={addDupes} disabled={!h.count}>Re-add 1,000 duplicates</Button>
          <Button onClick={() => setH({ p: h.p, regs: new Uint8Array(1 << h.p), count: 0, last: null, updated: null })}>Reset</Button>
        </Controls>
      }
    >
      <div className="hll-view">
        <div className="hll-hash">
          {bitsStr && h.last ? (
            <>
              <span className="hll-label">item #{h.last.id} → hash</span>
              <span className="hll-bits">
                {bitsStr.split('').map((b, i) => {
                  const firstOne = bitsStr.indexOf('1', h.p);
                  const cls = i < h.p ? 'idx' : i < (firstOne < 0 ? 32 : firstOne) ? 'zero' : i === firstOne ? 'one' : '';
                  return (
                    <motion.i key={`${bitsStr}-${i}`} className={cls} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.012 }}>
                      {b}
                    </motion.i>
                  );
                })}
              </span>
              <span className="hll-label">
                register <b className="v">{h.last.idx}</b>, rank <b className="y">{h.last.rank}</b>
              </span>
            </>
          ) : (
            <span className="hll-label">Add a single item to see its hash split into register index + leading-zero run.</span>
          )}
        </div>

        <svg className="hll-regs" viewBox={`0 0 ${W} ${BH + 18}`} preserveAspectRatio="none" role="img" aria-label="HyperLogLog registers">
          {Array.from(h.regs, (r, i) => {
            const bh = (r / maxRank) * BH;
            return (
              <motion.rect
                key={`${h.p}-${i}`}
                x={i * bw + Math.min(1, bw * 0.15)}
                width={Math.max(1, bw - Math.min(2, bw * 0.3))}
                className={`hll-bar ${h.updated === i ? 'up' : h.last?.idx === i ? 'seen' : ''}`}
                initial={{ y: BH, height: 0 }}
                animate={{ y: BH - bh, height: bh }}
                transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              />
            );
          })}
          <line x1={0} x2={W} y1={BH} y2={BH} className="hll-base" />
        </svg>
        <div className="hll-caption-row">
          <span>{m} registers, each holding the longest leading-zero run (+1) seen for its slice of the hash space</span>
        </div>

        <div className="hll-mem">
          <span>Memory</span>
          <div className="hll-mem-bar"><motion.i className="ok" animate={{ width: memW(hllBytes) }} /></div>
          <b className="ok">{fmtBytes(hllBytes)}</b>
          <div className="hll-mem-bar"><motion.i className="bad" animate={{ width: h.count ? memW(exactBytes) : '0%' }} /></div>
          <b className="bad">{fmtBytes(exactBytes)}</b>
          <em>log scale: HLL stays fixed while an exact set grows with every new item</em>
        </div>
      </div>
    </StageFrame>
  );
}

