import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { randInt } from '../../core/random';
import { WORDS, bloomFpMeasured, bloomFpTheory, bloomHas, bloomPositions, buildBloom } from './sketches';

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

const rate = (x: number) => pct(x, 1);

export function BloomView({ switcher }: { switcher: ReactNode }) {
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

  useIntroCaption(
    <>A Bloom filter is just a row of bits. Each word sets <b>k</b> of them; a query checks those same k bits. Try
      inserting and querying.</>,
  );

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
  const boardH = TOP + rows * (CELL + ROW_GAP);

  return (
    <StageFrame minWidth={470}
      height={380}
      stats={
        <Stats>
          <Stat label="Words inserted" value={words.length} />
          <Stat label="Bits set" value={`${setCount}/${m}`} color="var(--violet)" />
          <Stat label="FP rate (theory)" value={rate(theory)} color="var(--hi)" sub="(1 − e^(−kn/m))^k" />
          <Stat label="FP rate (measured)" value={rate(measured)} color="var(--bad)" sub="1,000 unseen probes" />
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
      controls={[
        <>
          {switcher}
          <Slider label="Bits m" value={m} min={16} max={64} step={16} onChange={(v) => rebuild(v, k)} />
          <Slider label="Hashes k" value={k} min={1} max={6} onChange={(v) => rebuild(m, v)} />
        </>,
        <>
          <div className="pb-form">
            <TextField
              value={draft}
              onChange={setDraft}
              onEnter={() => query(draft)}
              placeholder="type a word…"
              maxLength={16}
              width={170}
              ariaLabel="Word"
            />
            <Button onClick={() => insert(draft)} disabled={!draft.trim()}>Insert</Button>
            <Button onClick={() => query(draft)} disabled={!draft.trim()}>Query</Button>
          </div>
          <Button variant="primary" onClick={() => insert(nextWord())}>Insert next word</Button>
          <Button onClick={() => query(words[randInt(0, words.length - 1)])} disabled={!words.length}>Query a stored word</Button>
          <Button onClick={() => query(unseen())}>Query an unseen word</Button>
          <Button onClick={() => { setWords([]); setAct(null); }}>Clear</Button>
        </>,
      ]}
    >
      <div className="pb">
        <div className="pb-board" style={{ width: GRID_W, height: boardH }}>
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
          <svg className="pb-arrows" width={GRID_W} height={boardH} aria-hidden="true">
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
