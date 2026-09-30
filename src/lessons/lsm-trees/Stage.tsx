import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Stat, Stats } from '../../components/ui';
import { NA } from '../../core/format';
import { pick } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import {
  BLOOM_BITS, KEYS, MEM_CAP, MISSING, blankState, compactFrames, diskEntries, liveKeys, readFrames, seeded, writeFrames,
  type Entry, type LsmFrame, type SST, type Lsm,
} from './lsm';
import './styles.css';

interface Run {
  s: Lsm;
  frames: LsmFrame[];
}

const FILE_SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const;

function idle(s: Lsm): LsmFrame[] {
  return [{
    ...blankState(s),
    say: <>Writes go to memory first and are flushed to disk as sorted, immutable files. Try a write, then a read.</>,
  }];
}

export function Stage() {
  const [run, setRun] = useState<Run>(() => {
    const s = seeded();
    return { s, frames: idle(s) };
  });
  const player = usePlayer(run.frames, { interval: 1300 });
  const f = player.frame;
  const s = f.s;
  // Live keys of the tree the next action starts from, and of the frame on screen.
  const runLive = useMemo(() => liveKeys(run.s), [run.s]);
  const live = useMemo(() => liveKeys(s).length, [s]);

  const write = (del: boolean, overwrite = false) => {
    const k = del || overwrite ? pick(runLive.length ? runLive : KEYS) : pick(KEYS);
    const { frames, next } = writeFrames(run.s, k, del);
    setRun({ s: next, frames });
  };
  const read = (missing: boolean) => {
    const k = missing ? pick(MISSING) : pick(runLive.length ? runLive : KEYS);
    setRun({ s: run.s, frames: readFrames(run.s, k) });
  };
  const compact = () => {
    const { frames, next } = compactFrames(run.s);
    setRun({ s: next, frames });
  };

  const wa = s.userWrites ? s.diskWrites / s.userWrites : 0;
  const sa = live ? diskEntries(s) / live : 0;

  return (
    <StageFrame
      player={player}
      height={500}
      stats={
        <Stats>
          <Stat label="User writes" value={s.userWrites} />
          <Stat label="Write amp" value={`${wa.toFixed(2)}×`} color="var(--bad)" sub="disk writes ÷ user writes" />
          <Stat label="Space amp" value={`${sa.toFixed(2)}×`} color="var(--hi)" sub="entries on disk ÷ live keys" />
          <Stat
            label="Last read"
            value={f.lastRead ? `${f.lastRead.read} read` : NA}
            color="var(--info)"
            sub={f.lastRead ? `${f.lastRead.skipped} skipped by bloom` : 'files touched'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'active' },
            { color: 'var(--info)', label: 'bloom: skip' },
            { color: 'var(--ok)', label: 'found' },
            { color: 'var(--bad)', label: 'tombstone / dropped / false +' },
            { color: 'var(--violet)', label: 'compacting' },
          ]}
        />
      }
      controls={
        <Controls>
          <Button variant="primary" onClick={() => write(false)}>PUT random key</Button>
          <Button onClick={() => write(false, true)}>Overwrite a key</Button>
          <Button variant="danger" onClick={() => write(true)} disabled={!runLive.length}>DELETE a key</Button>
          <Button onClick={() => read(false)}>GET existing key</Button>
          <Button onClick={() => read(true)}>GET missing key</Button>
          <Button onClick={compact} disabled={!run.s.l0.length}>Compact now</Button>
        </Controls>
      }
    >
      <div className="lsm">
        <div className="lsm-top">
          <section className={`lsm-box lsm-mem ${f.hot === 'mem' ? 'hot' : ''} ${f.memProbe ?? ''}`}>
            <header>
              <span className="lsm-tag ram">RAM</span> Memtable <em>sorted · {s.mem.length}/{MEM_CAP}</em>
            </header>
            <div className="lsm-slots">
              {Array.from({ length: MEM_CAP }, (_, i) => {
                const e = s.mem[i];
                return e ? <Chip key={e.k} e={e} f={f} /> : <span key={`empty${i}`} className="lsm-slot" />;
              })}
            </div>
          </section>
          <section className={`lsm-box lsm-wal ${f.hot === 'wal' ? 'hot' : ''}`}>
            <header>
              <span className="lsm-tag disk">DISK</span> Write-ahead log <em>append-only</em>
            </header>
            <div className="lsm-wal-row">
              <AnimatePresence initial={false}>
                {s.wal.map((e) => (
                  <motion.span key={e.seq} className={`lsm-chip ${e.v === null ? 'tomb' : ''}`}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.6 }}>
                    {e.k}={e.v ?? '✝'}
                  </motion.span>
                ))}
              </AnimatePresence>
              {!s.wal.length && <span className="lsm-empty">empty: truncated after the last flush</span>}
            </div>
          </section>
        </div>

        <Level name="L0" note="newest first · files may overlap" tables={s.l0} f={f} />
        <Level name="L1" note="one sorted run · files never overlap" tables={s.l1} f={f} />

        <div className="lsm-bottom">
          <AnimatePresence>
            {f.dropped.length > 0 && (
              <motion.div className="lsm-dropped" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <b>Dropped by compaction:</b>
                {f.dropped.map((d, i) => (
                  <span key={i} className="lsm-chip gone" title={d.why}>
                    {d.e.k}={d.e.v ?? '✝'} <small>{d.why === 'tombstone' ? 'tombstone' : 'old'}</small>
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="lsm-vs">
            <b>vs a B-tree:</b> a B-tree updates pages <em>in place</em> (random writes, one version per key). An LSM tree
            only ever <em>appends</em> and rewrites in big sequential batches: much faster writes, but reads may check several
            files and compaction rewrites data again and again.
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function Chip({ e, f }: { e: Entry; f: LsmFrame }) {
  const cls = e.v === null ? 'tomb' : '';
  const hot = f.hotKey === e.k ? 'hot' : '';
  return (
    <motion.span layout className={`lsm-chip ${cls} ${hot}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
      {e.k}={e.v ?? '✝'}
    </motion.span>
  );
}

function Level({ name, note, tables, f }: { name: string; note: string; tables: SST[]; f: LsmFrame }) {
  return (
    <section className="lsm-level">
      <header>
        <span className="lsm-tag disk">DISK</span> <b>{name}</b> <em>{note}</em>
      </header>
      <div className="lsm-files">
        <AnimatePresence mode="popLayout">
          {tables.map((t) => {
            const probe = f.probes[t.id];
            const cls = [
              f.hot === t.id ? 'hot' : '',
              f.compacting.includes(t.id) ? 'compacting' : '',
              probe ?? '',
            ].join(' ');
            return (
              <motion.div
                key={t.id}
                layout
                className={`lsm-file ${cls}`}
                initial={{ opacity: 0, y: -16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.35 } }}
                transition={FILE_SPRING}
              >
                <div className="lsm-file-head">
                  SST {t.id}
                  {probe === 'skip' && <span className="lsm-verdict info">skip</span>}
                  {probe === 'fp' && <span className="lsm-verdict bad">false +</span>}
                  {probe === 'hit' && <span className="lsm-verdict ok">hit</span>}
                  {probe === 'range' && <span className="lsm-verdict dim">out of range</span>}
                </div>
                <div className="lsm-entries">
                  {t.entries.map((e) => (
                    <span key={e.k} className={`lsm-chip ${e.v === null ? 'tomb' : ''} ${f.hotKey === e.k ? 'hot' : ''}`}>
                      {e.k}={e.v ?? '✝'}
                    </span>
                  ))}
                </div>
                <div className="lsm-bloom" title="bloom filter bits">
                  {Array.from({ length: BLOOM_BITS }, (_, b) => {
                    const on = (t.bloom >> b) & 1;
                    const checked = f.bloomCheck?.id === t.id && f.bloomCheck.bits.includes(b);
                    return <i key={b} className={`${on ? 'on' : ''} ${checked ? (on ? 'chk-on' : 'chk-off') : ''}`} />;
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!tables.length && <span className="lsm-empty">no files</span>}
      </div>
    </section>
  );
}
