import { useMemo, useState, type ReactNode } from 'react';
import { Bars, HLine, Plot2D, Points, Polygon, Segments, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { superscript } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { BASE_SIZE, POINT_SPAN, seededPoints } from './closest';
import { caseLabel, critText, levelNote, nCrit, num, pairFrames, thetaText, treeFrames } from './frames';
import { A_VALUES, B_VALUES, classify, DISPLAY_K, F, F_IDS, PRESETS, treeLevels, type FId } from './master';
import './styles.css';

type Scene = 'tree' | 'pair';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'tree', label: 'Recursion tree' },
      { value: 'pair', label: 'Closest pair' },
    ],
    initial: 'tree',
  });
  return scene === 'tree' ? <TreeScene picker={picker} /> : <PairScene picker={picker} />;
}

/* ---------- the recursion tree ---------- */

/** Children drawn per node: all of them up to this many, else the first two, a "⋯", and the last. */
const MAX_DRAWN = 3;
const DRAWN_LEVELS = 3;
const TREE_COL = 46;
const TREE_H = 200;
const GAP = 'gap';

interface Drawn {
  level: number;
  gap: boolean;
  hidden: number;
}

/** The first levels of the tree, with wide fan-outs elided into a "⋯" node. */
function drawnTree(a: number) {
  const nodes = new Map<string, Drawn>();
  const kids = new Map<string, string[]>();
  const build = (id: string, level: number) => {
    nodes.set(id, { level, gap: false, hidden: 0 });
    if (level === DRAWN_LEVELS - 1) {
      kids.set(id, []);
      return;
    }
    const shown = a <= MAX_DRAWN ? Array.from({ length: a }, (_, i) => i) : [0, 1, -1, a - 1];
    const ids = shown.map((i) => (i < 0 ? `${id}.${GAP}` : `${id}.${i}`));
    kids.set(id, ids);
    shown.forEach((i, j) => {
      if (i < 0) {
        nodes.set(ids[j], { level: level + 1, gap: true, hidden: a - MAX_DRAWN });
        kids.set(ids[j], []);
      } else build(ids[j], level + 1);
    });
  };
  build('r', 0);
  return { nodes, kids };
}

const sizeLabel = (b: number, level: number) => (level === 0 ? 'n' : `n/${b ** level}`);

function TreeScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState(2);
  const [b, setB] = useState(2);
  const [f, setF] = useState<FId>('n');
  const K = DISPLAY_K[b];
  const n = b ** K;
  const frames = useMemo(() => treeFrames(a, b, f, K), [a, b, f, K]);
  const player = usePlayer(frames, { interval: 1000 });
  const fr = player.frame;
  const levels = useMemo(() => treeLevels(a, b, f, K), [a, b, f, K]);
  const c = classify(a, b, f);
  const preset = PRESETS.find((p) => p.a === a && p.b === b && p.f === f);
  const drawn = useMemo(() => drawnTree(a), [a]);
  const columns = [...drawn.nodes.keys()].filter((id) => drawn.kids.get(id)!.length === 0).length;
  const width = Math.max(300, columns * TREE_COL);
  const dominantLevel = c.kind === 1 ? K : c.kind === 3 ? 0 : null;

  const load = (id: string) => {
    const pr = PRESETS.find((x) => x.id === id)!;
    setA(pr.a);
    setB(pr.b);
    setF(pr.f);
  };

  const yMax = Math.max(...levels.map((l) => l.total));
  const yMin = Math.max(0.5, Math.min(...levels.map((l) => l.total)) / 2);

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="n" value={`${b}${superscript(K)} = ${num(n)}`} color="var(--muted)" />
          <Stat label={<>log<span className="keep-case">_b</span> a</>} value={critText(a, b)} color="var(--violet)" sub={`leaves: ${nCrit(a, b)}`} />
          <Stat label="Verdict" value={`Θ(${thetaText(c.theta)})`} color="var(--ok)" sub={caseLabel(c)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'level being summed', shape: 'square' },
            { color: 'var(--info)', label: 'work per level', shape: 'square' },
            { color: 'var(--ok)', label: 'dominant end', shape: 'square' },
            { color: 'var(--violet)', label: 'leaves = n^(log_b a)', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <ControlGroup label="Presets">
            {PRESETS.map((pr) => (
              <ChipButton key={pr.id} on={preset?.id === pr.id} onClick={() => load(pr.id)}>
                {pr.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="a (subproblems)" value={a} onChange={(v: number) => setA(v)} options={A_VALUES.map((v) => ({ value: v, label: String(v) }))} />
          <Segmented label="b (shrink by)" value={b} onChange={(v: number) => setB(v)} options={B_VALUES.map((v) => ({ value: v, label: String(v) }))} />
          <ControlGroup label="f(n), work to split and combine">
            {F_IDS.map((id) => (
              <ChipButton key={id} on={f === id} onClick={() => setF(id)}>
                {F[id].label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="mt stage-pad">
        <p className="mt-recurrence">
          <span>
            T(n) = <b>{a}</b>·T(n/<b>{b}</b>) + <b>{F[f].label}</b>
          </span>
          {preset && <span className="mt-what">{preset.label}: {preset.what}</span>}
        </p>
        <div className="mt-row">
          <div className="mt-tree">
            <WideRegion minWidth={Math.min(540, width)} gutter={{ bottom: 4 }} label="Recursion tree: scroll sideways to see all of it">
              <TreeSvg
                shape={{ root: 'r' as string, children: (id: string) => drawn.kids.get(id)! }}
                layout="tidy"
                width={width}
                height={TREE_H}
                levelGap={64}
                top={30}
                radius={20}
                renderNode={(id) => {
                  const d = drawn.nodes.get(id)!;
                  if (d.gap) return <text className="mt-gap" y={5}>⋯{d.hidden > 0 ? ` ${d.hidden}` : ''}</text>;
                  return (
                    <>
                      <circle r={20} />
                      <text y={4} className="mt-size">
                        {sizeLabel(b, d.level)}
                      </text>
                    </>
                  );
                }}
                nodeMark={(id) => {
                  const d = drawn.nodes.get(id)!;
                  if (d.gap) return null;
                  if (fr.level === d.level) return { tone: 'hi', fill: 'solid' };
                  if (fr.summed > d.level) return { tone: dominantLevel === d.level ? 'ok' : 'info', fill: 'tint' };
                  return null;
                }}
                className="mt-svg"
                ariaLabel={`First ${DRAWN_LEVELS} levels of the recursion tree, with ${a} children per node`}
              />
            </WideRegion>
            <p className={`mt-more ${fr.level !== null && fr.level >= DRAWN_LEVELS ? 'is-now' : ''}`}>
              ⋮ {K - DRAWN_LEVELS + 1} more levels, down to {num(a ** K)} leaves of size 1
            </p>
            <p className="mt-note">The drawing shows the first {DRAWN_LEVELS} levels{a > MAX_DRAWN ? `; "⋯ ${a - MAX_DRAWN}" stands for the children not drawn` : ''}. The sums use every level for real.</p>
          </div>
          <div className="mt-bars">
            <Plot2D
              x={{ domain: [-0.5, K + 0.5], label: 'level k', tickValues: Array.from({ length: K + 1 }, (_, k) => k).filter((k) => K <= 8 || k % 2 === 0) }}
              y={{ domain: [yMin, yMax * 2], log: true, label: 'work at level k' }}
              ariaLabel="Work per level of the recursion tree, log scale"
            >
              <Bars
                bars={levels.map((l) => ({
                  x0: l.k - 0.4,
                  x1: l.k + 0.4,
                  y: l.total,
                  tone: fr.level === l.k ? 'hi' : dominantLevel === l.k ? 'ok' : fr.summed > l.k || fr.done ? 'info' : 'dim',
                }))}
              />
              <HLine at={a ** K} label={nCrit(a, b)} tone="violet" />
            </Plot2D>
            <p className="mt-note">
              {levelNote(a, b, f)} Log scale.
            </p>
          </div>
        </div>
        <div className="mt-table" role="table" aria-label="Work per level">
          <div role="row" className="mt-tr mt-th">
            <span role="columnheader">level</span>
            <span role="columnheader">nodes aᵏ</span>
            <span role="columnheader">size n/bᵏ</span>
            <span role="columnheader">level total</span>
          </div>
          {levels.map((l) => (
            <div role="row" key={l.k} className={`mt-tr ${fr.level === l.k ? 'is-now' : ''} ${fr.summed > l.k || fr.done ? '' : 'is-pending'}`}>
              <span role="cell">{l.leaf ? `${l.k} (leaves)` : l.k}</span>
              <span role="cell">{num(l.nodes)}</span>
              <span role="cell">{num(l.size)}</span>
              <span role="cell">{num(l.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </StageFrame>
  );
}

/* ---------- closest pair ---------- */

const PAIR_POINTS = 32;

function PairScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(1);
  const points = useMemo(() => seededPoints(seed, PAIR_POINTS), [seed]);
  const { run, frames } = useMemo(() => pairFrames(points), [points]);
  const player = usePlayer(frames, { interval: 1100 });
  const fr = player.frame;
  const step = fr.step === null ? null : run.steps[fr.step];
  const best = step ? step.best : fr.done ? run.best : null;
  const inStrip = new Set(step?.strip ?? []);
  const doneLevels = fr.done ? run.stripChecks : run.stripChecks.map((_, l) => run.steps.slice(0, (fr.step ?? -1) + 1).filter((s) => s.level === l).reduce((t, s) => t + s.checks, 0));

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Points" value={PAIR_POINTS} color="var(--muted)" />
          <Stat label="Strip checks" value={doneLevels.reduce((s, x) => s + x, 0)} color="var(--hi)" sub={`all pairs would be ${(PAIR_POINTS * (PAIR_POINTS - 1)) / 2}`} />
          <Stat label="Best" value={best ? best.d.toFixed(2) : '—'} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'split line and strip', shape: 'square' },
            { color: 'var(--ok)', label: 'best pair so far', shape: 'line' },
            { color: 'var(--info)', label: 'points, before the first split', shape: 'dot' },
            { color: 'var(--dim)', label: 'outside the strip', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Button onClick={() => setSeed((s) => s + 1)}>New points</Button>
          <Hint>Seeded random points; the counts and the answer are computed, and the answer is checked against trying every pair.</Hint>
        </>,
      ]}
    >
      <div className="mt stage-pad">
        <div className="mt-row">
          <Plot2D x={{ domain: [0, POINT_SPAN] }} y={{ domain: [0, POINT_SPAN] }} width={340} height={340} ariaLabel="Points in the plane" className="mt-plane">
            {step && (
              <Polygon
                points={[
                  [step.midX - step.delta, 0],
                  [step.midX + step.delta, 0],
                  [step.midX + step.delta, POINT_SPAN],
                  [step.midX - step.delta, POINT_SPAN],
                ]}
                tone="hi"
              />
            )}
            {step && <VLine at={step.midX} tone="hi" label="δ" />}
            {best && <Segments segments={[{ from: [points[best.i].x, points[best.i].y], to: [points[best.j].x, points[best.j].y], tone: 'ok' }]} />}
            <Points
              data={points.map((pt, i) => ({
                x: pt.x,
                y: pt.y,
                tone: best && (i === best.i || i === best.j) ? 'ok' : inStrip.has(i) ? 'hi' : step || fr.done ? 'dim' : 'info',
              }))}
              r={4}
            />
          </Plot2D>
          <div className="mt-bars">
            <Plot2D
              x={{ domain: [-0.5, run.levels - 0.5], label: 'recursion level', tickValues: Array.from({ length: run.levels }, (_, l) => l) }}
              y={{ domain: [0, 7 * PAIR_POINTS * 1.1], label: 'strip checks' }}
              ariaLabel="Strip checks per recursion level"
            >
              <Bars bars={doneLevels.map((v, l) => ({ x0: l - 0.35, x1: l + 0.35, y: v, tone: step?.level === l ? 'hi' : 'info' }))} />
              <HLine at={7 * PAIR_POINTS} label="7 per point" tone="dim" />
            </Plot2D>
            <p className="mt-note">
              Every level's strip checks stay under 7 per point: linear per level. This demo re-sorts each strip by y, so its own combine is O(n log n) and the run O(n log² n); merging y-sorted halves gives the textbook T(n) = 2T(n/2) + O(n), the merge-sort case. Subproblems of {BASE_SIZE} or fewer points compare every pair ({run.baseChecks} checks here).
            </p>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
