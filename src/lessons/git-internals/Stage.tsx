import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import {
  blobId, branch, byId, checkout, commit, FILES, initialRepo, merge, objectCount, rebase, reachable, rootTreeId, srcTreeId,
  type Commit, type FileName, type Repo, type Result,
} from './repo';
import './styles.css';

const COL = 66;
const ROW = 96;
const PAD_X = 44;
const PAD_Y = 70;

const LANE_COLORS = ['var(--info)', 'var(--violet)', 'var(--t1)', 'var(--t4)', 'var(--t3)'];
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

export function Stage() {
  const [repo, setRepo] = useState<Repo>(initialRepo);
  const [file, setFile] = useState<FileName>('src/app.js');
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState<string>('');
  const setCaption = useSetCaption();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCaption(
      <>
        Every circle is a <b>commit</b>: a snapshot of all your files. Branch labels are just <b>pointers</b> to a commit,
        and <span className="hl">HEAD</span> says which branch you're on. Try Commit, then New branch.
      </>,
    );
  }, [setCaption]);

  const headTip = repo.branches[repo.head];
  const sel = byId(repo, selected && repo.commits.some((c) => c.id === selected) ? selected : headTip);
  const live = useMemo(() => reachable(repo), [repo]);
  const others = Object.keys(repo.branches).filter((b) => b !== repo.head);
  const target = others.includes(other) ? other : others[0] ?? '';

  const ordered = [...repo.commits].sort((a, b) => a.seq - b.seq);
  const col = new Map(ordered.map((c, i) => [c.id, i]));
  const pos = (c: Commit) => ({ x: PAD_X + col.get(c.id)! * COL, y: PAD_Y + c.lane * ROW });
  const maxLane = Math.max(...repo.commits.map((c) => c.lane));
  const width = Math.max(420, PAD_X * 2 + (ordered.length - 1) * COL);
  const height = PAD_Y + maxLane * ROW + 40;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [repo.commits.length]);

  const apply = (r: Result) => {
    setRepo(r.repo);
    setSelected(r.repo.branches[r.repo.head]);
    setCaption(describe(r, repo));
  };

  // tags grouped by commit so several branches on one commit stack up
  const tagsAt = new Map<string, string[]>();
  for (const [name, id] of Object.entries(repo.branches)) tagsAt.set(id, [...(tagsAt.get(id) ?? []), name]);

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
          <Button onClick={() => apply(branch(repo))} disabled={Object.keys(repo.branches).length >= 4}>
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
        <div className="gi-graph" ref={scroller}>
          <span className="gi-label">commit graph · click a commit to open it</span>
          <svg width={width} height={height} className="gi-svg">
            {ordered.flatMap((c) =>
              c.parents.map((pid) => {
                const p = byId(repo, pid);
                const a = pos(p);
                const b = pos(c);
                const d = a.y === b.y ? `M${a.x},${a.y} L${b.x},${b.y}` : `M${a.x},${a.y} C${a.x + COL * 0.6},${a.y} ${b.x - COL * 0.6},${b.y} ${b.x},${b.y}`;
                const dead = !live.has(c.id);
                return (
                  <motion.path
                    key={`${pid}-${c.id}`}
                    d={d}
                    className={`gi-edge ${dead ? 'dead' : ''}`}
                    stroke={laneColor(c.lane)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: dead ? 0.25 : 0.8 }}
                  />
                );
              }),
            )}

            {ordered.map((c) => {
              const { x, y } = pos(c);
              const dead = !live.has(c.id);
              const isSel = c.id === sel.id;
              return (
                <motion.g
                  key={c.id}
                  className={`gi-commit ${dead ? 'dead' : ''} ${isSel ? 'sel' : ''}`}
                  initial={{ x, y, scale: 0, opacity: 0 }}
                  animate={{ x, y, scale: 1, opacity: dead ? 0.35 : 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  onClick={() => setSelected(c.id)}
                >
                  <circle r={isSel ? 17 : 14} fill="var(--panel)" stroke={laneColor(c.lane)} strokeWidth={c.parents.length > 1 ? 4 : 2.5} strokeDasharray={dead ? '4 3' : undefined} />
                  <text y={4} textAnchor="middle" className="gi-hash">
                    {c.id.slice(0, 4)}
                  </text>
                  <text y={32} textAnchor="middle" className="gi-msg">
                    {c.msg.length > 12 ? `${c.msg.slice(0, 11)}…` : c.msg}
                  </text>
                </motion.g>
              );
            })}

            {Object.entries(repo.branches).map(([name, id]) => {
              const c = byId(repo, id);
              const { x, y } = pos(c);
              const k = tagsAt.get(id)!.indexOf(name);
              const isHead = name === repo.head;
              const label = isHead ? `HEAD → ${name}` : name;
              const w = label.length * 6.6 + 14;
              return (
                <motion.g
                  key={name}
                  initial={false}
                  animate={{ x: x - w / 2, y: y - 42 - k * 22 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                >
                  <rect width={w} height={18} rx={5} className={`gi-tag ${isHead ? 'head' : ''}`} />
                  <text x={w / 2} y={12.5} textAnchor="middle" className={`gi-tag-text ${isHead ? 'head' : ''}`}>
                    {label}
                  </text>
                </motion.g>
              );
            })}
          </svg>
        </div>

        <ObjectPanel repo={repo} c={sel} />
      </div>
    </StageFrame>
  );
}

function ObjectPanel({ repo, c }: { repo: Repo; c: Commit }) {
  const parent = c.parents.length ? byId(repo, c.parents[0]) : null;
  const status = (have: string, had: string | null) => (had === null ? 'new' : have === had ? 'reused' : 'new');
  const root = rootTreeId(c.files);
  const src = srcTreeId(c.files);
  const pRoot = parent ? rootTreeId(parent.files) : null;
  const pSrc = parent ? srcTreeId(parent.files) : null;
  const blob = (f: FileName) => blobId(c.files[f]);
  const pBlob = (f: FileName) => (parent ? blobId(parent.files[f]) : null);

  return (
    <div className="gi-objects">
      <span className="gi-label">inside commit {c.id} · vs its parent</span>
      <Obj kind="commit" id={c.id} st="new" note={c.msg}>
        <div className="gi-meta">parents: {c.parents.length ? c.parents.map((p) => p).join(', ') : 'none (root commit)'}</div>
        <Obj kind="tree" id={root} st={status(root, pRoot)} note="/">
          <Obj kind="blob" id={blob('README.md')} st={status(blob('README.md'), pBlob('README.md'))} note="README.md" />
          <Obj kind="tree" id={src} st={status(src, pSrc)} note="src/">
            <Obj kind="blob" id={blob('src/app.js')} st={status(blob('src/app.js'), pBlob('src/app.js'))} note="app.js" />
            <Obj kind="blob" id={blob('src/util.js')} st={status(blob('src/util.js'), pBlob('src/util.js'))} note="util.js" />
          </Obj>
        </Obj>
      </Obj>
      <p className="gi-foot">
        Each object's name <b>is</b> the hash of its content. Unchanged files keep the same hash, so git reuses them
        instead of storing copies.
      </p>
    </div>
  );
}

function Obj({ kind, id, st, note, children }: { kind: 'commit' | 'tree' | 'blob'; id: string; st: 'new' | 'reused'; note: string; children?: ReactNode }) {
  return (
    <div className={`gi-obj ${kind}`}>
      <motion.div key={id} className={`gi-obj-row ${st}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <span className="gi-kind">{kind}</span>
        <code>{id}</code>
        <span className="gi-note">{note}</span>
        {kind !== 'commit' && <span className="gi-st">{st === 'new' ? 'NEW' : 'reused'}</span>}
      </motion.div>
      {children && <div className="gi-children">{children}</div>}
    </div>
  );
}

function describe(r: Result, before: Repo): ReactNode {
  const repo = r.repo;
  const tip = byId(repo, repo.branches[repo.head]);
  const name = <span className="hl">{repo.head}</span>;
  switch (r.kind) {
    case 'commit': {
      const p = byId(repo, tip.parents[0]);
      const newTrees = (rootTreeId(tip.files) !== rootTreeId(p.files) ? 1 : 0) + (srcTreeId(tip.files) !== srcTreeId(p.files) ? 1 : 0);
      return (
        <>
          Commit <span className="hl">{tip.id}</span>: only {r.info.split('/').pop()} changed, so git stored{' '}
          <b>1 new blob</b>, <b>{newTrees} new tree{newTrees === 1 ? '' : 's'}</b> and 1 commit. Everything else is reused by
          hash. {name} moves forward.
        </>
      );
    }
    case 'branch':
      return (
        <>
          A branch is just a tiny file holding one commit hash. <span className="hl violet">{r.info}</span> points at the
          same commit as before, and HEAD now points at {r.info}. No files were copied.
        </>
      );
    case 'checkout':
      return <>HEAD now points at {name}. Your working files switch to that commit's snapshot.</>;
    case 'ff':
      return (
        <>
          <span className="hl ok">Fast-forward</span>: {repo.head} was simply behind {r.info}, so git slid the pointer
          forward. No new commit needed.
        </>
      );
    case 'uptodate':
      return <>Already up to date: {r.info} is already part of {before.head}'s history.</>;
    case 'merge':
      return (
        <>
          Merge commit <span className="hl">{tip.id}</span> has <b>two parents</b>: history is kept exactly as it happened.
          {r.info ? <> Both sides changed <span className="hl bad">{r.info}</span>: a conflict you'd resolve by hand.</> : null}
        </>
      );
    case 'rebase':
      return (
        <>
          Rebase replayed <b>{r.info}</b> commit{r.info === '1' ? '' : 's'} on top of the other branch. Same changes, but new
          parents mean <b>new hashes</b> (marked ′). The originals are now unreachable (faded) until garbage collection.
        </>
      );
    case 'noop':
      return <>Nothing to rebase: {repo.head} has no commits of its own.</>;
  }
}
