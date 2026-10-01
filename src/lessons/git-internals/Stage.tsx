import { useMemo, useState } from 'react';
import { CommitGraph, type GraphCommit, type GraphRef } from '../../components/CommitGraph';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { describe } from './describe';
import { ObjectPanel } from './ObjectPanel';
import {
  branch, byId, checkout, commit, FILES, initialRepo, merge, objectCount, rebase, reachable,
  type FileName, type Repo, type Result,
} from './repo';
import './styles.css';

/** Keeps the graph to four lanes so it fits the stage. */
const MAX_BRANCHES = 4;
const SHORT_HASH = 4;

export function Stage() {
  const [repo, setRepo] = useState<Repo>(initialRepo);
  const [file, setFile] = useState<FileName>('src/app.js');
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState<string>('');
  const setCaption = useSetCaption();

  useIntroCaption(
    <>
      Every circle is a <b>commit</b>: a snapshot of all your files. Branch labels are just <b>pointers</b> to a commit,
      and <span className="hl">HEAD</span> says which branch you're on. Try Commit, then New branch.
    </>,
  );

  const headTip = repo.branches[repo.head];
  const sel = byId(repo, selected && repo.commits.some((c) => c.id === selected) ? selected : headTip);
  const live = useMemo(() => reachable(repo), [repo]);
  const others = Object.keys(repo.branches).filter((b) => b !== repo.head);
  const target = others.includes(other) ? other : others[0] ?? '';

  const graph: GraphCommit[] = [...repo.commits]
    .sort((a, b) => a.seq - b.seq)
    .map((c) => ({ id: c.id, lane: c.lane, parents: c.parents, short: c.id.slice(0, SHORT_HASH), message: c.msg, dead: !live.has(c.id) }));
  const refs: GraphRef[] = Object.entries(repo.branches).map(([name, at]) => ({ name, at, head: name === repo.head }));

  const apply = (r: Result) => {
    setRepo(r.repo);
    setSelected(r.repo.branches[r.repo.head]);
    setCaption(describe(r, repo));
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="HEAD" value={repo.head} color="var(--hi)" />
          <Stat label="Reachable commits" value={live.size} />
          <Stat label="Objects in .git" value={objectCount(repo)} sub="commits + trees + blobs" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'HEAD / new object' },
            { color: 'var(--info)', label: 'commit (colour = branch lane)', shape: 'dot' },
            { color: 'var(--dim)', label: 'unreachable / reused' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="File to edit"
            value={file}
            onChange={setFile}
            options={FILES.map((f) => ({ value: f, label: f.split('/').pop() }))}
          />
          <Button variant="primary" onClick={() => apply(commit(repo, file))}>
            + Commit
          </Button>
          <Button onClick={() => apply(branch(repo))} disabled={Object.keys(repo.branches).length >= MAX_BRANCHES}>
            New branch
          </Button>
          <Segmented
            label="Checkout"
            value={repo.head}
            onChange={(b) => apply(checkout(repo, b))}
            options={Object.keys(repo.branches).map((b) => ({ value: b, label: b }))}
          />
          {others.length > 0 && (
            <>
              <Segmented label="Other branch" value={target} onChange={setOther} options={others.map((b) => ({ value: b, label: b }))} />
              <Button onClick={() => apply(merge(repo, target))}>Merge it into {repo.head}</Button>
              <Button onClick={() => apply(rebase(repo, target))}>Rebase {repo.head} onto it</Button>
            </>
          )}
          <Button
            onClick={() => {
              setRepo(initialRepo());
              setSelected(null);
              setCaption(<>Fresh repo: two commits on main.</>);
            }}
          >
            Reset
          </Button>
        </Controls>
      }
    >
      <div className="gi">
        <CommitGraph
          commits={graph}
          refs={refs}
          selected={sel.id}
          onSelect={setSelected}
          messageFit="truncate"
          title="commit graph · click a commit to open it"
        />
        <ObjectPanel repo={repo} c={sel} />
      </div>
    </StageFrame>
  );
}
