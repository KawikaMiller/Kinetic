import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { ChipButton, ControlGroup, Hint, Legend, Segmented } from '../../components/ui';
import { useMediaQuery } from '../../components/useMediaQuery';
import { bytes, plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { storeFrames } from './frames';
import { BUCKET, FILE_KEY, FILE_SIZE, httpLines, MIB, OP_LABEL, OPS, outcome, renameSteps, STORE_LABEL, STORES, type ObjectRow, type OpId, type StoreId } from './store';

const NARROW_QUERY = '(max-width: 900px)';
const STEP_MS = 1300;

// The block volume: each cell stands for 1 MiB of 4 KiB blocks.
const VOLUME = { rows: 8, cols: 12 } as const;
const FIRST_FILE_CELL = 14;
const FILE_CELLS = FILE_SIZE / MIB;
const LAST_FILE_CELL = FIRST_FILE_CELL + FILE_CELLS - 1;
const DIR_CELL = 1;
const OTHER_FILES = [2, 3, 4, 5, 6, FIRST_FILE_CELL + FILE_CELLS, FIRST_FILE_CELL + FILE_CELLS + 1, FIRST_FILE_CELL + FILE_CELLS + 2];
const TOUCHED_CELL: Record<OpId, number> = { append: LAST_FILE_CELL, rename: DIR_CELL, range: FIRST_FILE_CELL, list: DIR_CELL };

/** The file system's directory tree, as parent -> children. */
const TREE: Record<string, string[]> = {
  '/': ['/reports', '/logs'],
  '/reports': ['/reports/2025', '/reports/2026'],
  '/reports/2025': ['/reports/2025/q4.csv'],
  '/reports/2026': ['/reports/2026/q2.csv', '/reports/2026/q3.csv'],
  '/logs': ['/logs/app.log'],
};
const TREE_SHAPE: TreeShape<string> = { root: '/', children: (id) => TREE[id] ?? [] };
const TOUCHED_NODE: Record<OpId, string> = { append: '/reports/2026/q3.csv', rename: '/reports', range: '/reports/2026/q3.csv', list: '/reports' };
const TREE_W = 360;
const TREE_H = 230;
const NODE_BOX = { w: 74, h: 24 };

const nodeName = (id: string, renamed: boolean) => (id === '/' ? '/' : id === '/reports' && renamed ? 'archive' : id.split('/').pop());

function BlockColumn({ op, step }: { op: OpId; step: number }) {
  const touched = step > 0 ? TOUCHED_CELL[op] : -1;
  return (
    <>
      <CellGrid
        rows={VOLUME.rows}
        cols={VOLUME.cols}
        size={{ cell: 20, gap: 3 }}
        ariaLabel="Block volume: each cell is 1 MiB of 4 KiB blocks"
        cell={(r, c) => {
          const i = r * VOLUME.cols + c;
          if (i === touched) return { tone: 'hi', fill: 'solid' };
          if (i === DIR_CELL) return { tone: 'violet', fill: 'tint' };
          if (i >= FIRST_FILE_CELL && i <= LAST_FILE_CELL) return { tone: 'info', fill: 'tint' };
          if (OTHER_FILES.includes(i)) return { tone: 'dim', fill: 'tint' };
          return { tone: 'dim', fill: 'outline' };
        }}
        cellTitle={(r, c) => {
          const i = r * VOLUME.cols + c;
          return i === DIR_CELL ? 'directory blocks' : i >= FIRST_FILE_CELL && i <= LAST_FILE_CELL ? `q3.csv, MiB ${i - FIRST_FILE_CELL + 1} of ${FILE_CELLS}` : OTHER_FILES.includes(i) ? 'another file' : 'free';
        }}
      />
      <p className="hint">Each cell is 1 MiB of 4 KiB blocks. Blue is q3.csv, violet the directory blocks the file system keeps, and the yellow cell is the block touched.</p>
    </>
  );
}

function FileColumn({ op, step }: { op: OpId; step: number }) {
  const renamed = op === 'rename' && step > 0;
  const touchedId = step > 0 ? TOUCHED_NODE[op] : null;
  return (
    <TreeSvg
      shape={TREE_SHAPE}
      layout="tidy"
      width={TREE_W}
      height={TREE_H}
      levelGap={56}
      top={30}
      pad={44}
      natural
      ariaLabel="Directory tree of the file system"
      renderNode={(id) => (
        <>
          <rect x={-NODE_BOX.w / 2} y={-NODE_BOX.h / 2} width={NODE_BOX.w} height={NODE_BOX.h} rx={6} />
          <text y={4} textAnchor="middle">
            {nodeName(id, renamed)}
          </text>
        </>
      )}
      nodeMark={(id) => (id === touchedId ? { tone: 'hi', fill: 'solid' } : null)}
      nodeClass={(id) => (id in TREE ? 'os-node os-dir' : 'os-node')}
    />
  );
}

function KeyRow({ row, op, step }: { row: ObjectRow; op: OpId; step: number }) {
  const slash = row.key.lastIndexOf('/');
  const touched =
    row.state === 'new' ||
    (step > 0 && ((op === 'append' || op === 'range') && row.key === FILE_KEY ? true : op === 'list' && row.key.startsWith('reports/')));
  return (
    <tr className={touched ? 'os-touched' : ''}>
      <td>
        {slash >= 0 && <span className="os-prefix">{row.key.slice(0, slash + 1)}</span>}
        {row.key.slice(slash + 1)}
      </td>
      <td>{bytes(row.size)}</td>
    </tr>
  );
}

function ObjectColumn({ op, step }: { op: OpId; step: number }) {
  const rows: ObjectRow[] = useMemo(() => (op === 'rename' ? renameSteps()[step].rows : BUCKET.map((o) => ({ ...o, state: 'normal' as const }))), [op, step]);
  return (
    <>
      <table className="data-table os-keys">
        <thead>
          <tr>
            <th>Key (one flat namespace)</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <KeyRow key={r.key} row={r} op={op} step={step} />
          ))}
        </tbody>
      </table>
      <p className="hint">There are no folders: the violet part is just the start of each key. A "folder" is whatever keys share a prefix.</p>
    </>
  );
}

function CostTable({ op }: { op: OpId }) {
  return (
    <table className="data-table os-cost">
      <caption className="sr-only">Cost of {OP_LABEL[op]} in each store</caption>
      <thead>
        <tr>
          <th>{OP_LABEL[op]}</th>
          <th>What happens</th>
          <th>Bytes moved</th>
          <th>Requests</th>
          <th>Atomic</th>
        </tr>
      </thead>
      <tbody>
        {STORES.map((s) => {
          const o = outcome(op, s);
          return (
            <tr key={s}>
              <th scope="row" className="keep-case">
                {STORE_LABEL[s]}
              </th>
              <td>{o.verdict}</td>
              <td className={`os-${o.tone}`}>{bytes(o.bytes)}</td>
              <td className={`os-${o.tone}`}>{plural(o.requests, o.unit)}</td>
              <td>{o.atomic ? 'yes' : 'no'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function StoresScene({ picker }: { picker: ReactNode }) {
  const [op, setOp] = useState<OpId>('rename');
  const [tab, setTab] = useState<StoreId>('object');
  const narrow = useMediaQuery(NARROW_QUERY);
  const frames = useMemo(() => storeFrames(op), [op]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { step } = player.frame;
  const lines = httpLines(op);
  const active = op === 'rename' ? (step > 0 ? [step - 1] : []) : step > 0 ? lines.map((_, i) => i) : [];

  const columns: Record<StoreId, ReactNode> = {
    block: <BlockColumn op={op} step={step} />,
    file: <FileColumn op={op} step={step} />,
    object: <ObjectColumn op={op} step={step} />,
  };
  const column = (s: StoreId) => (
    <Box key={s} className="os-col">
      <SectionTitle hint={{ block: 'numbered blocks', file: 'a tree of directories', object: 'a flat bucket of keys' }[s]}>{STORE_LABEL[s]}</SectionTitle>
      {columns[s]}
      <p className={`os-verdict os-${outcome(op, s).tone}`}>{step > 0 ? outcome(op, s).verdict : 'Waiting for the operation.'}</p>
    </Box>
  );

  return (
    <StageFrame
      player={player}
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'cheap side' },
            { color: 'var(--bad)', label: 'costly side' },
            { color: 'var(--hi)', label: 'block or key touched' },
            { color: 'var(--info)', label: 'the file (blocks)' },
            { color: 'var(--violet)', label: 'shared prefix, directory' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="ops" label="Operation" inline>
          {OPS.map((o) => (
            <ChipButton key={o} tone="info" on={op === o} onClick={() => setOp(o)}>
              {OP_LABEL[o]}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="os stage-pad">
        {narrow ? (
          <>
            <Segmented ariaLabel="Store" value={tab} onChange={setTab} options={STORES.map((s) => ({ value: s, label: STORE_LABEL[s] }))} />
            {column(tab)}
          </>
        ) : (
          <div className="os-cols">{STORES.map(column)}</div>
        )}
        <CostTable op={op} />
        <CodePanel
          title="HTTP to the object store (fictional bucket, S3-compatible shape)"
          lines={lines}
          gutter="none"
          stateOf={(i) => (active.includes(i) ? 'now' : op === 'rename' && i < step - 1 ? 'done' : 'idle')}
        />
        <Hint block>
          Simulated stores; sizes are illustrative and every cost is counted from the model (bytes moved and requests made). Real file systems also journal and update inodes, and some object stores offer
          an append mode; the classic S3 API does not.
        </Hint>
      </div>
    </StageFrame>
  );
}
