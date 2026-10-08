import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { TreeSvg } from '../../components/TreeSvg';
import type { TreeEdgeMark, TreeNodeMark } from '../../components/TreeSvg';
import { BITMAP_BLOCK, BLOCK_COUNT, INODE_TABLE, SUPERBLOCK, type Fs } from './fs';
import { treeOf } from './tree';

const GRID_COLS = 8;
const GRID_ROWS = BLOCK_COUNT / GRID_COLS;

const LABEL: Record<number, string> = { [SUPERBLOCK]: 'SB', [BITMAP_BLOCK]: 'BM', [INODE_TABLE[0]]: 'IT', [INODE_TABLE[1]]: 'IT' };

/**
 * The disk as blocks: superblock and bitmap dim (structural), the inode table violet,
 * data blocks in use blue, free ones an outline. `now` rings the block being read.
 */
export function BlockGrid({ fs, now, size = 'sm' }: { fs: Fs; now?: number | null; size?: 'sm' | 'md' }) {
  const cell = (r: number, c: number): GridCellSpec => {
    const b = r * GRID_COLS + c;
    if (b === SUPERBLOCK || b === BITMAP_BLOCK) return { tone: 'dim', fill: 'solid', text: LABEL[b] };
    if ((INODE_TABLE as readonly number[]).includes(b)) return { tone: 'violet', fill: b === now ? 'solid' : 'tint', text: LABEL[b] };
    if (!fs.used.has(b)) return { tone: 'muted', fill: 'outline', text: b };
    return { tone: 'info', fill: b === now ? 'solid' : 'tint', text: b };
  };
  const highlight: GridHighlight[] = now == null ? [] : [{ r: Math.floor(now / GRID_COLS), c: now % GRID_COLS, tone: 'hi' }];
  return <CellGrid rows={GRID_ROWS} cols={GRID_COLS} size={size} cell={cell} highlight={highlight} ariaLabel="Disk blocks: superblock, bitmap, inode table, then data" />;
}

export function DirTree({
  fs, nodeMark, edgeMark, width = 420, height = 210, dashed,
}: {
  fs: Fs;
  nodeMark?: (key: string) => TreeNodeMark | null;
  edgeMark?: (parent: string, child: string) => TreeEdgeMark | null;
  width?: number;
  height?: number;
  /** Entries drawn with a dashed red outline (a dangling symlink). */
  dashed?: (key: string) => boolean;
}) {
  const { nodes, shape } = treeOf(fs);
  return (
    <TreeSvg
      shape={shape}
      layout="tidy"
      width={width}
      height={height}
      top={22}
      levelGap={64}
      pad={76}
      className="fs-tree"
      nodeMark={nodeMark}
      edgeMark={edgeMark}
      ariaLabel="Directory tree"
      renderNode={(k) => {
        const n = nodes.get(k)!;
        const label = n.key === '/' ? '/ #2' : `${n.name} #${n.ino}`;
        const w = Math.max(44, label.length * 7 + 14);
        return (
          <>
            <rect x={-w / 2} y={-13} width={w} height={26} rx={7} className={`fs-node ${dashed?.(k) ? 'is-dangling' : ''}`} />
            <text y={4} className="fs-node-text">
              {label}
            </text>
          </>
        );
      }}
    />
  );
}
