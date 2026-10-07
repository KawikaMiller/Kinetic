import { useMemo, useState } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { freeFrames, scriptedFrames, type Mode } from './frames';
import { CHAIN, COMBOS, MAX_OPS, N, rootOf, SCRIPT, setsOf, totals, type Op, type Opts } from './model';
import './styles.css';

const STEP_MS = 900;
const SCRIPT_STEP_MS = 650;
const FOREST_W = 440;
/** Vertical room per tree level, and above / below the trees. */
const LEVEL_GAP = 38;
const FOREST_TOP = 24;
const FOREST_BOTTOM = 26;
/** Union by rank keeps every tree at most ⌊log₂ n⌋ tall. */
const LOG_BOUND = Math.floor(Math.log2(N));

type Click = 'union' | 'find';

export function Stage() {
  const [mode, setMode] = useState<Mode>('free');
  const [opts, setOpts] = useState<Opts>({ byRank: false, compress: false });
  const [ops, setOps] = useState<Op[]>([]);
  const [click, setClick] = useState<Click>('union');
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const frames = useMemo(() => (mode === 'free' ? freeFrames(ops, opts) : scriptedFrames(mode, opts)), [mode, ops, opts]);
  const player = usePlayer(frames, { interval: mode === 'script' ? SCRIPT_STEP_MS : STEP_MS });
  const f = player.frame;
  // Tall enough for the tallest tree anywhere in this run, so the drawing doesn't jump while it plays.
  const forestH = useMemo(() => FOREST_TOP + FOREST_BOTTOM + LEVEL_GAP * Math.max(1, ...frames.map((x) => x.height)), [frames]);
  const shownOps = mode === 'free' ? ops : mode === 'chain' ? CHAIN : SCRIPT;
  const compare = useMemo(() => COMBOS.map((c) => ({ ...c, t: totals(N, shownOps, c.opts) })), [shownOps]);

  const roots = f.parents.flatMap((p, i) => (p === i ? [i] : []));
  const shape: TreeShape<number> = { root: null, roots, children: (id) => f.parents.flatMap((p, i) => (p === id && i !== id ? [i] : [])) };
  const onPath = new Set(f.path);
  const moved = new Set(f.reparented);
  const linked = new Set(f.linked);
  const sets = setsOf(f.parents);

  const press = (i: number) => {
    if (mode !== 'free') return;
    if (ops.length >= MAX_OPS) {
      setNote(`That's ${MAX_OPS} operations: reset to start again.`);
      return;
    }
    if (click === 'find') {
      setOps([...ops, { kind: 'find', a: i }]);
      setNote(`find(${i})`);
      return;
    }
    if (picked === null) {
      setPicked(i);
      setNote(`Picked ${i}: now pick the node to union it with (pick ${i} again to cancel).`);
    } else if (picked === i) {
      setPicked(null);
      setNote('Pick cancelled.');
    } else {
      setOps([...ops, { kind: 'union', a: picked, b: i }]);
      setPicked(null);
      setNote(`union(${picked}, ${i})`);
    }
  };
  const chooseMode = (m: Mode) => {
    setMode(m);
    setPicked(null);
    setNote('');
  };
  const reset = () => {
    player.queueNext({ play: false });
    setOps([]);
    setPicked(null);
    setNote('Back to ten singletons.');
  };

  const nodeName = (i: number) => {
    const p = f.parents[i];
    const role = p === i ? 'a root' : `parent ${p}, root ${rootOf(f.parents, i)}`;
    const action = mode !== 'free' ? '' : click === 'find' ? ', press to find' : picked === null ? ', press to pick for union' : picked === i ? ', picked, press to cancel' : `, press to union with ${picked}`;
    return `Element ${i}, ${role}${action}`;
  };

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Pointer hops" value={f.hops} color="var(--hi)" sub="so far" />
          <Stat label="Tallest tree" value={f.height} color="var(--info)" sub={opts.byRank ? `rank caps it at ${LOG_BOUND}` : `could reach ${N - 1}`} />
          <Stat label="Sets" value={sets.length} color="var(--muted)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'find path', shape: 'dot' },
            { color: 'var(--ok)', label: 'root found', shape: 'dot' },
            { color: 'var(--info)', label: 're-pointed by compression', shape: 'dot' },
            { color: 'var(--violet)', label: 'roots just linked', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented
            label="Operations"
            value={mode}
            onChange={chooseMode}
            options={[
              { value: 'free', label: 'Your own' },
              { value: 'chain', label: 'Chain' },
              { value: 'script', label: '30-op script' },
            ]}
          />
          <Toggle label="Union by rank" value={opts.byRank} onChange={(byRank) => setOpts({ ...opts, byRank })} off="Off" on="On" />
          <Toggle label="Path compression" value={opts.compress} onChange={(compress) => setOpts({ ...opts, compress })} off="Off" on="On" />
        </>,
        mode === 'free' ? (
          <>
            <Segmented
              label="Click a node to"
              value={click}
              onChange={(c) => {
                setClick(c);
                setPicked(null);
              }}
              options={[
                { value: 'union', label: 'Union (pick two)' },
                { value: 'find', label: 'Find' },
              ]}
            />
            <Button onClick={reset} disabled={ops.length === 0}>
              Reset to singletons
            </Button>
            <Hint>Click nodes in the forest or cells in parent[]. Toggles replay your operations.</Hint>
          </>
        ) : (
          <Hint key="scripted">Change the toggles to replay the same operations with other settings.</Hint>
        ),
      ]}
    >
      <div className="uf stage-pad">
        <div className="uf-main">
          <p className="uf-note" role="status">
            {note}
          </p>
          <WideRegion minWidth={FOREST_W} label="Forest: scroll sideways to see all of it">
            <TreeSvg
              shape={shape}
              layout="tidy"
              forestGap={0.6}
              width={FOREST_W}
              height={forestH}
              radius={14}
              levelGap={LEVEL_GAP}
              top={FOREST_TOP}
              label={(i) => i}
              className="uf-forest"
              ariaLabel={`Union-find forest, ${sets.length} sets`}
              onNodeClick={mode === 'free' ? press : undefined}
              nodeAriaLabel={nodeName}
              nodeMark={(i) => {
                if (linked.has(i)) return { tone: 'violet', fill: 'solid' };
                if (i === f.root) return { tone: 'ok', fill: 'solid' };
                if (onPath.has(i)) return { tone: 'hi', fill: 'tint', tint: 30 };
                if (moved.has(i)) return { tone: 'info', fill: 'tint', tint: 30 };
                return null;
              }}
              nodeClass={(i) => (i === picked ? 'uf-picked' : '')}
              edgeMark={(p, c) => {
                if (moved.has(c)) return { tone: 'info' };
                if (linked.has(p) && linked.has(c)) return { tone: 'violet' };
                if (onPath.has(p) && onPath.has(c)) return { tone: 'hi' };
                return null;
              }}
            />
          </WideRegion>
          <div className="uf-strip">
            <span className="uf-strip-label">parent[]</span>
            <ArrayStrip
              values={f.parents}
              showIndex
              cellMax={44}
              pointers={[]}
              cellState={(i) => (i === f.root ? 'done' : onPath.has(i) ? 'active' : 'idle')}
              renderValue={(v, i) => <span className={moved.has(i) ? 'uf-moved' : linked.has(i) && f.parents[i] !== i ? 'uf-linked' : ''}>{v}</span>}
              onCellClick={mode === 'free' ? press : undefined}
              cellTitle={(i) => nodeName(i)}
            />
          </div>
          {opts.byRank && (
            <div className="uf-strip">
              <span className="uf-strip-label">rank[]</span>
              <ArrayStrip values={f.ranks} cellMax={44} pointers={[]} cellState={(i) => (f.parents[i] === i ? 'idle' : 'dim')} />
            </div>
          )}
        </div>
        <div className="uf-side">
          <Tray label="Height meter" labelWeight="regular" stack ariaLabel="Height meter">
            <Bar value={f.height} max={N - 1} tone="info" height={10} marker={LOG_BOUND} markLabel={`⌊log₂ ${N}⌋ = ${LOG_BOUND}`} trailing={`${f.height} / ${N - 1}`} />
            <Hint>The tick is ⌊log₂ {N}⌋ = {LOG_BOUND}: union by rank never lets a tree grow past it.</Hint>
          </Tray>
          <Tray label={`Connected sets (${sets.length})`} labelWeight="regular" ariaLabel="Connected sets">
            {sets.map((s) => (
              <span key={s[0]} className="chip uf-set">
                {'{'}
                {s.map((x, j) => (
                  <span key={x}>
                    {j > 0 && ', '}
                    {f.parents[x] === x ? <b>{x}</b> : x}
                  </span>
                ))}
                {'}'}
              </span>
            ))}
          </Tray>
          <Tray label={`All four settings, ${shownOps.length} operations`} labelWeight="regular" stack ariaLabel="Settings compared">
            <table className="uf-table">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Hops</th>
                  <th scope="col">Peak height</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((c) => {
                  const on = c.opts.byRank === opts.byRank && c.opts.compress === opts.compress;
                  return (
                    <tr key={c.label} className={on ? 'is-on' : ''}>
                      <th scope="row">{c.label}</th>
                      <td>{c.t.hops}</td>
                      <td>{c.t.maxHeight}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Hint>Computed live by replaying the same operations four times. Bold in a set is its root.</Hint>
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}

