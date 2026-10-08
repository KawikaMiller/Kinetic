import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { BlockGrid, DirTree } from './common';
import { treeOf } from './tree';
import { blockRole, walkFrames } from './frames';
import { initialFs, resolve, ROOT_INO, type WalkStep } from './fs';

const STEP_MS = 1600;
const PATHS = ['/docs/notes.txt', '/etc/hosts', '/docs/draft.txt'] as const;
type WalkPath = (typeof PATHS)[number];

const FS = initialFs();

export function WalkScene({ picker }: { picker: ReactNode }) {
  const [path, setPath] = useState<WalkPath>('/docs/notes.txt');
  const r = useMemo(() => resolve(FS, path, ROOT_INO, { readData: true }), [path]);
  const frames = useMemo(() => walkFrames(FS, path, r), [path, r]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const done = r.steps.slice(0, player.frame.upto);
  const now: WalkStep | undefined = player.frame.upto > 0 && player.index < frames.length - 1 ? done.at(-1) : undefined;
  const nowBlock = now ? (now.kind === 'symlink' ? null : now.block) : null;

  // Tree nodes on the walked path: the inodes read so far.
  const { nodes } = treeOf(FS);
  const readInodes = new Set(done.filter((s) => s.kind === 'inode').map((s) => s.ino));
  const keyOfIno = (ino: number) => [...nodes.values()].find((n) => n.ino === ino)?.key;
  const nowKey = now?.kind === 'inode' ? keyOfIno(now.ino) : now?.kind === 'dir' ? keyOfIno(now.ino) : undefined;
  const lastInode = [...done].reverse().find((s) => s.kind === 'inode');
  const inode = lastInode ? FS.inodes.get(lastInode.ino)! : null;
  const lastDir = now?.kind === 'dir' ? now : null;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Blocks read" value={done.length} />
          <Stat label="Now reading" value={nowBlock == null ? '–' : `block ${nowBlock}`} sub={nowBlock == null ? undefined : blockRole(nowBlock)} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'block / entry being read now' },
            { color: 'var(--violet)', label: 'inode table, inodes on the path' },
            { color: 'var(--info)', label: 'data block in use' },
            { color: 'var(--dim)', label: 'superblock (SB), bitmap (BM)' },
            { color: 'var(--muted)', label: 'free block (outline)' },
          ]}
        />
      }
      controls={[
        picker,
        <Segmented
          key="command"
          label="Command"
          value={path}
          onChange={setPath}
          options={PATHS.map((p) => ({ value: p, label: `cat ${p}` }))}
        />,
      ]}
    >
      <div className="fs stage-pad">
        <div className="fs-walk">
          <div className="fs-col">
            <SectionTitle>Disk blocks</SectionTitle>
            <BlockGrid fs={FS} now={nowBlock} size="md" />
          </div>
          <div className="fs-col fs-grow">
            <SectionTitle>Directory tree</SectionTitle>
            <WideRegion minWidth={330} label="Directory tree: scroll sideways to see all of it">
              <DirTree
                fs={FS}
                nodeMark={(k) => {
                  const n = nodes.get(k)!;
                  if (k === nowKey) return { tone: 'hi', fill: 'solid' };
                  return readInodes.has(n.ino) ? { tone: 'violet', fill: 'tint' } : null;
                }}
                edgeMark={(_, child) => (readInodes.has(nodes.get(child)!.ino) ? { tone: 'violet' } : null)}
              />
            </WideRegion>
          </div>
        </div>
        <div className="fs-walk">
          <div className="fs-col fs-grow">
            <SectionTitle>{inode ? `Inode ${inode.ino}` : 'Inode'}</SectionTitle>
            {inode ? (
              <table className="data-table fs-inode">
                <tbody>
                  <tr><th>type, mode</th><td>{inode.kind} · {inode.mode}</td></tr>
                  <tr><th>links</th><td>{inode.links}</td></tr>
                  <tr><th>size</th><td>{inode.size.toLocaleString('en-US')} bytes</td></tr>
                  <tr><th>modified</th><td>{inode.mtime}</td></tr>
                  <tr><th>block pointers</th><td>{inode.blocks.length ? inode.blocks.join(', ') : '–'}</td></tr>
                  <tr className="fs-noname"><th>name</th><td>not stored in the inode</td></tr>
                </tbody>
              </table>
            ) : (
              <p className="empty-note">nothing read yet</p>
            )}
          </div>
          <div className="fs-col fs-grow">
            <SectionTitle>{lastDir ? `Directory data, block ${lastDir.block}` : 'Directory data'}</SectionTitle>
            {lastDir ? (
              <ul className="fs-entries">
                {FS.dirs.get(lastDir.ino)!.map((e) => (
                  <li key={e.name} className={e.name === lastDir.name ? 'is-now' : ''}>
                    <code>{e.name}</code> → {e.ino}
                  </li>
                ))}
                {lastDir.found === null && <li className="is-missing"><code>{lastDir.name}</code>: not found</li>}
              </ul>
            ) : (
              <p className="empty-note">shown while a directory is read</p>
            )}
          </div>
        </div>
        <Hint block>A simplified ext4-like layout: 24 tiny blocks and 8 inodes per table block. Real block and inode sizes and allocation are more involved.</Hint>
      </div>
    </StageFrame>
  );
}
