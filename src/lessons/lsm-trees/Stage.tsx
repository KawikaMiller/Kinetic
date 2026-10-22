import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { NA } from '../../core/format';
import { SPRING } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { blankState, compactFrames, readFrames, writeFrames, type LsmFrame } from './frames';
import {
  BLOOM_BITS, DEFAULT_SEED, L0_TRIGGER, L1_FILE, MEM_CAP, actionKey, actionRnd, lastDeletedKey, lastWrittenKey, liveKeys, seeded, spaceAmp,
  type Action, type Entry, type Lsm, type SST,
} from './lsm';
import './styles.css';

interface Run {
  s: Lsm;
  frames: LsmFrame[];
  /** Actions taken so far: action n draws its key from the seed's n-th stream. */
  step: number;
}


function idle(s: Lsm): LsmFrame[] {
  return [{
    ...blankState(s),
    say: <>Writes go to memory first and are flushed to disk as sorted, immutable files. Try a write, then a read.</>,
  }];
}

export function Stage() {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [run, setRun] = useState<Run>(() => {
    const s = seeded();
    return { s, frames: idle(s), step: 0 };
  });
  const player = usePlayer(run.frames, { interval: 1300 });
  const f = player.frame;
  const s = f.s;
  // Live keys of the tree the next action starts from, and of the frame on screen.
  const runLive = useMemo(() => liveKeys(run.s), [run.s]);
  const runDeleted = useMemo(() => lastDeletedKey(run.s), [run.s]);
  const runLast = useMemo(() => lastWrittenKey(run.s), [run.s]);
  const live = useMemo(() => liveKeys(s).length, [s]);

  const keyFor = (action: Action) => actionKey(action, runLive, actionRnd(seed, run.step));
  const write = (action: 'put' | 'overwrite' | 'delete') => {
    const { frames, next } = writeFrames(run.s, keyFor(action), action === 'delete');
    setRun({ s: next, frames, step: run.step + 1 });
  };
  const read = (action: 'get-existing' | 'get-missing') => {
    setRun({ s: run.s, frames: readFrames(run.s, keyFor(action)), step: run.step + 1 });
  };
  const readDeleted = () => {
    if (runDeleted === undefined) return;
    setRun({ s: run.s, frames: readFrames(run.s, runDeleted), step: run.step + 1 });
  };
  const readLast = () => {
    if (runLast === undefined) return;
    setRun({ s: run.s, frames: readFrames(run.s, runLast), step: run.step + 1 });
  };
  const compact = () => {
    if (!run.s.l0.length) return;
    const { frames, next } = compactFrames(run.s);
    setRun({ s: next, frames, step: run.step });
  };

  // Why a button is greyed out, shown as its tooltip and in the hint under the controls.
  const deletedWhy = runDeleted === undefined ? 'GET deleted key is off: no tombstone is stored (compaction drops tombstones)' : undefined;
  const compactWhy = run.s.l0.length ? undefined : 'Compact now is off: L0 has no files to merge';

  const wa = s.userWrites ? s.diskWrites / s.userWrites : 0;
  const sa = spaceAmp(s);

  return (
    <StageFrame
      player={player}
      height={500}
      stats={
        <Stats>
          <Stat label="User writes" value={s.userWrites} />
          <Stat label="Write amp" value={s.userWrites ? `${wa.toFixed(2)}×` : NA} color="var(--bad)" sub="disk writes ÷ user writes" />
          <Stat label="Space amp" value={live ? `${sa.toFixed(2)}×` : NA} color="var(--hi)" sub="entries stored (RAM + disk) ÷ live keys" />
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
          <Button variant="primary" onClick={() => write('put')}>PUT random key</Button>
          <Button onClick={() => write('overwrite')}>Overwrite a key</Button>
          <Button variant="danger" onClick={() => write('delete')} softDisabled={!runLive.length}>DELETE a key</Button>
          <Button onClick={() => read('get-existing')}>GET existing key</Button>
          <Button onClick={readLast} softDisabled={runLast === undefined}>GET last written key</Button>
          <Button onClick={readDeleted} softDisabled={runDeleted === undefined} title={deletedWhy}>GET deleted key</Button>
          <Button onClick={() => read('get-missing')}>GET missing key</Button>
          <Button onClick={compact} softDisabled={!run.s.l0.length} title={compactWhy}>Compact now</Button>
          <SeedField seed={seed} onSeed={setSeed} />
          <Hint block>
            Buttons act on the tree as it stands when the animation ends.
            {deletedWhy && ` ${deletedWhy}.`}
            {compactWhy && ` ${compactWhy}.`}
          </Hint>
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
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>
            a two-level model: the memtable holds {MEM_CAP} keys, L0 compacts at {L0_TRIGGER} files, an L1 file holds {L1_FILE}, filters are
            {' '}{BLOOM_BITS} bits with 2 hash positions; each button press draws its key from the seed
          </Provenance>
          <Provenance kind="illustrative">write and space amplification count entries, not bytes, so the figures show the shape and not a real engine's numbers</Provenance>
          <Provenance kind="from-memory">
            the engines named in the lesson use LSM storage, and real engines keep a tombstone until it reaches the bottom level: verify against each
            project's documentation
          </Provenance>
        </ProvenanceRow>
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
                transition={SPRING.firm}
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
