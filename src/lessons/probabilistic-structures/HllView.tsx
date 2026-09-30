import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { bytes, NA } from '../../core/format';
import { randInt } from '../../core/random';
import { bits32, hllAdd, hllBuild, hllEstimate, itemHash } from './sketches';

interface Hll {
  p: number;
  regs: Uint8Array;
  count: number;
  last: { id: number; idx: number; rank: number } | null;
  updated: number | null;
}

/** Register count choices, by precision p (m = 2^p). */
const PRECISIONS = [
  { value: 4, label: '16' },
  { value: 6, label: '64' },
  { value: 8, label: '256' },
];
const CHART_W = 860;
const CHART_H = 150;
const BAR_SPRING = { type: 'spring', stiffness: 200, damping: 24 } as const;
/** HLL registers hold a rank up to ~50, so 6 bits each. */
const BITS_PER_REGISTER = 6;
/** What an exact set pays per 64-bit id, before any hash-table overhead. */
const BYTES_PER_ID = 8;

/** Decimal (SI) byte units, 1 KB = 1,000 B: the numbers this lesson quotes. */
const bytesSI = (b: number) => bytes(b, { base: 1000 });

const empty = (p: number): Hll => ({ p, regs: new Uint8Array(1 << p), count: 0, last: null, updated: null });

export function HllView({ switcher }: { switcher: ReactNode }) {
  const [h, setH] = useState<Hll>(() => empty(6));
  const setCaption = useSetCaption();

  useIntroCaption(
    <>HyperLogLog counts <b>distinct</b> items in a few bytes. Each item is hashed; long runs of leading zeros are rare,
      so the longest run seen hints at how many items there were. Add one to see how.</>,
  );

  const m = h.regs.length;
  const est = h.count ? hllEstimate(h.regs) : 0;
  const err = h.count ? (est - h.count) / h.count : 0;
  const stdErr = 1.04 / Math.sqrt(m);
  const hllBytes = (m * BITS_PER_REGISTER) / 8;
  const exactBytes = h.count * BYTES_PER_ID;

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
        {bytesSI(hllBytes)}.</>,
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
  const bw = CHART_W / m;
  const memMax = Math.log10(Math.max(hllBytes, exactBytes) + 1);
  const memW = (b: number) => `${Math.max(1, (Math.log10(b + 1) / memMax) * 100)}%`;

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="True distinct" value={h.count.toLocaleString()} />
          <Stat label="HLL estimate" value={Math.round(est).toLocaleString()} color="var(--hi)" />
          <Stat label="Error" value={h.count ? `${(err * 100).toFixed(1)}%` : NA} color={Math.abs(err) > 2 * stdErr ? 'var(--bad)' : 'var(--ok)'} sub={`typical ±${(stdErr * 100).toFixed(1)}%`} />
          <Stat label="HLL memory" value={bytesSI(hllBytes)} color="var(--ok)" sub={`${m} registers × ${BITS_PER_REGISTER} bits`} />
          <Stat label="Exact set" value={bytesSI(exactBytes)} color="var(--bad)" sub={`≈ ${BYTES_PER_ID} bytes per id, before overhead`} />
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
          <Segmented label="Registers" value={h.p} onChange={setP} options={PRECISIONS} />
          <Button variant="primary" onClick={addOne}>Add 1 item</Button>
          <Button onClick={() => addMany(100)}>+100</Button>
          <Button onClick={() => addMany(10_000)}>+10,000</Button>
          <Button onClick={() => addMany(1_000_000)}>+1,000,000</Button>
          <Button onClick={addDupes} disabled={!h.count}>Re-add 1,000 duplicates</Button>
          <Button onClick={() => setH(empty(h.p))}>Reset</Button>
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

        <svg className="hll-regs" viewBox={`0 0 ${CHART_W} ${CHART_H + 18}`} preserveAspectRatio="none" role="img" aria-label="HyperLogLog registers">
          {Array.from(h.regs, (r, i) => {
            const bh = (r / maxRank) * CHART_H;
            return (
              <motion.rect
                key={`${h.p}-${i}`}
                x={i * bw + Math.min(1, bw * 0.15)}
                width={Math.max(1, bw - Math.min(2, bw * 0.3))}
                className={`hll-bar ${h.updated === i ? 'up' : h.last?.idx === i ? 'seen' : ''}`}
                initial={{ y: CHART_H, height: 0 }}
                animate={{ y: CHART_H - bh, height: bh }}
                transition={BAR_SPRING}
              />
            );
          })}
          <line x1={0} x2={CHART_W} y1={CHART_H} y2={CHART_H} className="hll-base" />
        </svg>
        <div className="hll-caption-row">
          <span>{m} registers, each holding the longest leading-zero run (+1) seen for its slice of the hash space</span>
        </div>

        <div className="hll-mem">
          <span>Memory</span>
          <div className="hll-mem-bar"><motion.i className="ok" animate={{ width: memW(hllBytes) }} /></div>
          <b className="ok">{bytesSI(hllBytes)}</b>
          <div className="hll-mem-bar"><motion.i className="bad" animate={{ width: h.count ? memW(exactBytes) : '0%' }} /></div>
          <b className="bad">{bytesSI(exactBytes)}</b>
          <em>log scale: HLL stays fixed while an exact set grows with every new item</em>
        </div>
      </div>
    </StageFrame>
  );
}
