import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { describe } from './describe';
import { ObjectPanel } from './ObjectPanel';
import {
  branch, byId, checkout, commit, FILES, initialRepo, merge, objectCount, rebase, reachable,
  type Commit, type FileName, type Repo, type Result,
} from './repo';
import './styles.css';

const COL = 66;
const ROW = 96;
const PAD_X = 44;
const PAD_Y = 70;
/** Keeps the graph to four lanes so it fits the stage. */
const MAX_BRANCHES = 4;
const COMMIT_SPRING = { type: 'spring', stiffness: 320, damping: 22 } as const;
const TAG_SPRING = { type: 'spring', stiffness: 260, damping: 24 } as const;

const LANE_COLORS = ['var(--info)', 'var(--violet)', 'var(--t1)', 'var(--t4)', 'var(--t3)'];
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

export function Stage() {
  const [repo, setRepo] = useState<Repo>(initialRepo);
  const [file, setFile] = useState<FileName>('src/app.js');
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState<string>('');
  const setCaption = useSetCaption();
  const scroller = useRef<HTMLDivElement>(null);

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
                  transition={COMMIT_SPRING}
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
                  transition={TAG_SPRING}
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
