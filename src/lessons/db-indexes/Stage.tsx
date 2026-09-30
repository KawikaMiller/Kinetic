import { motion } from 'motion/react';
import { useState } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { bytes } from '../../core/format';
import { useElementSize } from '../../core/hooks';
import { pick, randInt } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import {
  MAX_INSERTS, allKeys, freshKey, indexFrames, insertFrames, internalSeps, makeDb, rangeFrames, rootSeps, scanFrames,
  starts, type Db, type IxFrame, type Mode,
} from './btree';
import './styles.css';

const MODES: { value: Mode; label: string }[] = [
  { value: 'scan', label: 'Full table scan' },
  { value: 'index', label: 'Index lookup' },
  { value: 'range', label: 'Range query' },
  { value: 'insert', label: 'Insert a row' },
];

const H = 330;
const Y = { root: 18, internal: 92, leaf: 166, page: 262 };
const NODE_H = 30;
const PAGE_H = 50;

interface Run {
  db: Db;
  frames: IxFrame[];
}

function pickRange(db: Db) {
  const keys = allKeys(db);
  const i = randInt(0, keys.length - 9);
  return [keys[i], keys[i + 7]] as const;
}

function framesFor(mode: Mode, db: Db, target: number): Run {
  if (mode === 'scan') return { db, frames: scanFrames(db, target) };
  if (mode === 'index') return { db, frames: indexFrames(db, target) };
  if (mode === 'range') {
    const [lo, hi] = pickRange(db);
    return { db, frames: rangeFrames(db, lo, hi) };
  }
  const { frames, next } = insertFrames(db, freshKey(db));
  return { db: next, frames };
}

export function Stage() {
  const [mode, setMode] = useState<Mode>('index');
  const [run, setRun] = useState<Run>(() => {
    const db = makeDb();
    return { db, frames: indexFrames(db, pick(allKeys(db))) };
  });
  const player = usePlayer(run.frames, { interval: 1100 });
  const f = player.frame;
  const [wrapRef, { width }] = useElementSize<HTMLDivElement>();

  const go = (m: Mode, target?: number) => {
    setMode(m);
    setRun(framesFor(m, run.db, target ?? pick(allKeys(run.db))));
  };
  const reset = () => {
    const db = makeDb();
    player.queueNext({ play: false });
    setRun({ db, frames: indexFrames(db, pick(allKeys(db))) });
    setMode('index');
  };

  const canInsert = run.db.inserts < MAX_INSERTS;

  return (
    <StageFrame
      player={player}
      height={H + 150}
      stats={
        <Stats>
          <Stat label="Page reads" value={f.reads} color="var(--info)" />
          <Stat label="Page writes" value={f.writes} color={f.writes ? 'var(--bad)' : undefined} />
          <Stat label="Heap pages" value={f.db.pages.length} sub={`${allKeys(f.db).length} rows`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'reading now' },
            { color: 'var(--info)', label: 'already read' },
            { color: 'var(--ok)', label: 'match' },
            { color: 'var(--violet)', label: 'new row' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Operation" value={mode} onChange={(m) => go(m)} options={MODES} />
          <Button onClick={() => go(mode)} disabled={mode === 'insert' && !canInsert}>
            {mode === 'insert' ? (canInsert ? 'Insert another' : 'Insert limit reached') : mode === 'range' ? 'New range' : 'New target id'}
          </Button>
          <Button onClick={reset}>New table</Button>
          <Hint>…or click any row in a heap page to look it up</Hint>
        </Controls>
      }
    >
      <div className="ix">
        <div ref={wrapRef} className="ix-canvas">
          {width > 0 && <TreeView f={f} width={width} onPick={(k) => go(mode === 'scan' ? 'scan' : 'index', k)} />}
        </div>
        <AtScale />
      </div>
    </StageFrame>
  );
}

function TreeView({ f, width, onPick }: { f: IxFrame; width: number; onPick: (k: number) => void }) {
  const { tree, pages } = f.db;
  const pad = 14;
  const gap = 6;
  const nL = tree.leaves.length;
  const lw = (width - pad * 2 - gap * (nL - 1)) / nL;
  const leafX = (i: number) => pad + i * (lw + gap);
  const st = starts(tree.fan);
  const internals = tree.fan.map((n, j) => {
    const a = leafX(st[j]);
    const b = leafX(st[j] + n - 1) + lw;
    const seps = internalSeps(tree, j);
    const w = Math.min(b - a, Math.max(44, seps.length * 24 + 16));
    return { cx: (a + b) / 2, w, seps };
  });
  const rs = rootSeps(tree);
  const rootW = Math.max(60, rs.length * 26 + 18);
  const rootCx = (internals[0].cx + internals[internals.length - 1].cx) / 2;
  const pw = (width - pad * 2 - gap * (pages.length - 1)) / pages.length;
  const pageX = (p: number) => pad + p * (pw + gap);

  const nodeCls = (id: string) => (f.hotNode === id ? 'hot' : f.walked.includes(id) ? 'walked' : '');
  const keyCls = (k: number) =>
    k === f.newKey ? 'new' : k === f.found || f.rangeKeys.includes(k) ? 'ok' : k === f.hotKey ? 'hot' : '';

  return (
    <svg className="ix-svg" width={width} height={H} role="img" aria-label="B+tree index above heap pages">
      {/* edges */}
      {internals.map((n, j) => (
        <line key={`re${j}`} x1={rootCx} y1={Y.root + NODE_H} x2={n.cx} y2={Y.internal} className={`ix-edge ${f.walked.includes(`i${j}`) ? 'on' : ''}`} />
      ))}
      {tree.fan.map((cnt, j) =>
        Array.from({ length: cnt }, (_, c) => {
          const l = st[j] + c;
          return (
            <line key={`ie${l}`} x1={internals[j].cx} y1={Y.internal + NODE_H} x2={leafX(l) + lw / 2} y2={Y.leaf}
              className={`ix-edge ${f.walked.includes(`l${l}`) && f.walked.includes(`i${j}`) ? 'on' : ''}`} />
          );
        }),
      )}
      {/* sibling links between leaves */}
      {tree.leaves.slice(0, -1).map((_, i) => (
        <line key={`sl${i}`} x1={leafX(i) + lw} y1={Y.leaf + NODE_H / 2} x2={leafX(i + 1)} y2={Y.leaf + NODE_H / 2}
          className={`ix-sib ${f.walked.includes(`l${i}`) && f.walked.includes(`l${i + 1}`) ? 'on' : ''}`} />
      ))}

      {/* pointer from leaf to heap page */}
      {f.pointer && (
        <motion.line
          key={`p${f.pointer.leaf}-${f.pointer.page}`}
          x1={leafX(f.pointer.leaf) + lw / 2} y1={Y.leaf + NODE_H}
          x2={pageX(f.pointer.page) + pw / 2} y2={Y.page}
          className="ix-pointer"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* root */}
      <g className={`ix-node ${nodeCls('r')}`}>
        <rect x={rootCx - rootW / 2} y={Y.root} width={rootW} height={NODE_H} rx={7} />
        <text x={rootCx} y={Y.root + 19} textAnchor="middle">{rs.join(' · ')}</text>
        <text x={rootCx + rootW / 2 + 8} y={Y.root + 19} className="ix-level">root</text>
      </g>
      {internals.map((n, j) => (
        <g key={`i${j}`} className={`ix-node ${nodeCls(`i${j}`)}`}>
          <rect x={n.cx - n.w / 2} y={Y.internal} width={n.w} height={NODE_H} rx={7} />
          <text x={n.cx} y={Y.internal + 19} textAnchor="middle">{n.seps.join(' · ') || '·'}</text>
        </g>
      ))}
      <text x={pad} y={Y.internal - 8} className="ix-level">internal</text>
      <text x={pad} y={Y.leaf - 8} className="ix-level">leaves (sorted, linked →)</text>

      {tree.leaves.map((keys, i) => (
        <g key={`l${i}`} className={`ix-node leaf ${nodeCls(`l${i}`)}`}>
          <rect x={leafX(i)} y={Y.leaf} width={lw} height={NODE_H} rx={6} />
          {keys.map((k, c) => (
            <text key={k} x={leafX(i) + ((c + 0.5) * lw) / keys.length} y={Y.leaf + 19} textAnchor="middle" className={`ix-key ${keyCls(k)}`}
              style={{ fontSize: Math.min(11, lw / (keys.length * 1.75)) }}>
              {k}
            </text>
          ))}
        </g>
      ))}

      <text x={pad} y={Y.page - 8} className="ix-level">heap pages on disk (unsorted)</text>
      {pages.map((rows, p) => {
        const cls = f.hotPage === p ? 'hot' : f.readPages.includes(p) ? 'walked' : '';
        return (
          <g key={`pg${p}`} className={`ix-page ${cls}`}>
            <rect x={pageX(p)} y={Y.page} width={pw} height={PAGE_H} rx={7} />
            <text x={pageX(p) + 6} y={Y.page + 13} className="ix-page-no">p{p + 1}</text>
            {rows.map((k, c) => (
              <text
                key={k}
                x={pageX(p) + ((c + 0.5) * pw) / 4}
                y={Y.page + 36}
                textAnchor="middle"
                className={`ix-key ix-row ${keyCls(k)}`}
                onClick={() => onPick(k)}
              >
                {k}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const FANOUT = 200;
const ROWS_PER_PAGE = 100;
const PAGE_BYTES = 8192;
const BAR_H = 10;
const fmt = (n: number) => (n >= 1e9 ? `${n / 1e9} billion` : n >= 1e6 ? `${n / 1e6} million` : n.toLocaleString());
/** Bytes read for `pages` pages, in whole decimal units (the lesson rounds for readability). */
const pageBytes = (pages: number) => bytes(pages * PAGE_BYTES, { base: 1000, dp: 0 });

function AtScale() {
  const [exp, setExp] = useState(6);
  const n = 10 ** exp;
  const scan = Math.ceil(n / ROWS_PER_PAGE);
  // index depth = ceil(log_fanout(n)); +1 for fetching the row's heap page
  const index = Math.max(1, Math.ceil(Math.log(n) / Math.log(FANOUT))) + 1;
  const maxLog = Math.log10(1e9 / ROWS_PER_PAGE);
  /** Log-scale bar length in percent, never thinner than 2%. */
  const barPct = (v: number) => Math.max(2, (Math.log10(v) / maxLog) * 100);
  return (
    <div className="ix-scale">
      <Slider label="At scale: rows in table" value={exp} min={3} max={9} onChange={setExp} format={(e) => fmt(10 ** e)} />
      <div className="ix-bars">
        <div className="ix-bar-row">
          <span>Full scan</span>
          <Bar value={barPct(scan)} max={100} tone="bad" height={BAR_H} />
          <b className="bad">{scan.toLocaleString()} pages</b>
          <em>≈ {pageBytes(scan)} read</em>
        </div>
        <div className="ix-bar-row">
          <span>Index</span>
          <Bar value={barPct(index)} max={100} tone="ok" height={BAR_H} />
          <b className="ok">{index} pages</b>
          <em>≈ {pageBytes(index)} read</em>
        </div>
      </div>
      <p className="ix-scale-note">8 KB pages, ~{ROWS_PER_PAGE} rows per page, ~{FANOUT} keys per index page (log scale bars).</p>
    </div>
  );
}
