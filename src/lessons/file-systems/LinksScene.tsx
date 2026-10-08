import { useState, type ReactNode } from 'react';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { BlockGrid, DirTree } from './common';
import { treeOf } from './tree';
import { dfBlocks, duBlocks, initialFs } from './fs';
import { cmdCaption, COMMANDS, dangling, DOCS, runCmd, type Cmd } from './links';

const MAX_LOG = 8;

export function LinksScene({ picker }: { picker: ReactNode }) {
  const [fs, setFs] = useState(initialFs);
  const [log, setLog] = useState<ConsoleLine[]>([]);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>
      You're in <code>/docs</code>. Make a hard link and a symlink to <code>notes.txt</code>, remove the original, and see which name still works. Then try removing it while fd 3
      holds it open.
    </>,
  );

  const run = (cmd: Cmd, text: string) => {
    const res = runCmd(fs, cmd);
    setFs(res.fs);
    setLog((l) => [...l, `$ ${text}`, ...res.out, ...(res.error ? [{ text: res.error, tone: 'bad' as const }] : [])].slice(-MAX_LOG));
    setCaption(cmdCaption(fs, res.fs, cmd, res));
  };
  const reset = () => {
    setFs(initialFs());
    setLog([]);
    setCaption(<>Back to the starting tree.</>);
  };

  const { nodes } = treeOf(fs);
  const files = [...fs.inodes.values()].filter((n) => n.kind !== 'dir');
  const isDangling = (key: string) => key.startsWith('/docs/') && dangling(fs, nodes.get(key)!.name);
  const df = dfBlocks(fs);
  const du = duBlocks(fs);

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="df: blocks used" value={df} color={df === du ? undefined : 'var(--bad)'} sub="from the bitmap" />
          <Stat label="du: blocks found" value={du} sub="walking the tree" />
          <Stat label="Open fds" value={fs.open.size} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'inode with more than one name' },
            { color: 'var(--bad)', label: 'dangling symlink (dashed)' },
            { color: 'var(--info)', label: 'data block in use' },
            { color: 'var(--muted)', label: 'free block (outline)' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <ControlGroup label="Commands in /docs">
            {COMMANDS.map((c) => (
              <ChipButton key={c.id} tone="info" size="md" onClick={() => run(c.id, c.text)}>
                {c.text}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="fs stage-pad">
        <div className="fs-walk">
          <div className="fs-col fs-grow">
            <SectionTitle>Directory entries (name #inode)</SectionTitle>
            <WideRegion minWidth={360} label="Directory tree: scroll sideways to see all of it">
              <DirTree
                fs={fs}
                width={480}
                dashed={isDangling}
                nodeMark={(k) => {
                  const ino = nodes.get(k)!.ino;
                  return k !== '/' && fs.inodes.get(ino)!.links > 1 && fs.inodes.get(ino)!.kind === 'file' ? { tone: 'violet', fill: 'tint' } : null;
                }}
                edgeMark={(_, child) => (isDangling(child) ? { tone: 'bad', dashed: true } : null)}
              />
            </WideRegion>
          </div>
          <div className="fs-col">
            <SectionTitle>Inodes (not directories)</SectionTitle>
            <ul className="fs-cards">
              {files.map((n) => (
                <li key={n.ino} className={n.links === 0 ? 'is-orphan' : n.links > 1 ? 'is-shared' : ''}>
                  <b>#{n.ino}</b> {n.kind}
                  <span>
                    links {n.links} · open {fs.open.get(n.ino) ?? 0}
                    {n.kind === 'symlink' ? <> · → {n.target}</> : <> · blocks {n.blocks.join(', ')}</>}
                  </span>
                </li>
              ))}
            </ul>
            <BlockGrid fs={fs} />
          </div>
        </div>
        <ConsolePanel lines={log} title={`shell in /docs (inode ${DOCS})`} empty="press a command" />
        <Hint block>A simulated shell on a toy file system: the commands are fixed, and their output follows what Linux prints.</Hint>
      </div>
    </StageFrame>
  );
}
