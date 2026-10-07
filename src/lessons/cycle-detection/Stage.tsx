import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayPointer } from '../../components/ArrayStrip';
import { GraphView, type GraphNode, type Pt } from '../../components/GraphView';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { arrayFrames, listFrames, type FloydFrame } from './frames';
import { NULL_ID, rhoLayout } from './layout';
import { duplicateArray, findDuplicate, floyd, hashSetWalk, LAMBDA_MAX, MU_MAX, proof, rho } from './model';
import './styles.css';

const STEP_MS = 800;
const R = 18;
/** The smallest scene text is 12px (the null box): the graph never shrinks below 8/12 of its width, and only the graph scrolls sideways. */
const SMALLEST_TEXT_PX = 12;

type Scene = 'list' | 'array';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'list', label: 'Linked list' },
      { value: 'array', label: 'Find the duplicate' },
    ],
    initial: 'list',
  });
  return scene === 'list' ? <ListScene picker={picker} /> : <ArrayScene picker={picker} />;
}

const pointerTag = (id: number, f: FloydFrame) => {
  const s = f.slow === id;
  const fa = f.fast === id;
  return s && fa ? 'S F' : s ? 'S' : fa ? 'F' : '';
};

function ListScene({ picker }: { picker: ReactNode }) {
  const [mu, setMu] = useState(4);
  const [lambda, setLambda] = useState(6);
  const [loop, setLoop] = useState(true);
  const frames = useMemo(() => listFrames(mu, lambda, loop), [mu, lambda, loop]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const layout = useMemo(() => rhoLayout(mu, lambda, loop), [mu, lambda, loop]);
  const next = rho(mu, lambda, loop);
  const run = useMemo(() => floyd((i) => rho(mu, lambda, loop)[i]), [mu, lambda, loop]);
  const measured = new Set(f.measured);
  const ids = [...next.keys(), ...(loop ? [] : [NULL_ID])];
  const edges = next.flatMap((to, i) => (to === null ? [{ from: i, to: NULL_ID }] : [{ from: i, to }]));
  const pr = run.meet !== null ? proof(run, mu) : null;
  const showProof = pr && (f.proof || f.phase >= 2);

  const renderNode = (n: GraphNode<number>, p: Pt, base: ReactNode) => {
    if (n.id === NULL_ID) {
      return (
        <>
          <rect className="graph-node-shape" x={p.x - 24} y={p.y - 14} width={48} height={28} rx={7} />
          <text className="graph-node-label cd-null" x={p.x} y={p.y + 4} textAnchor="middle">
            null
          </text>
        </>
      );
    }
    const tag = pointerTag(n.id, f);
    return (
      <>
        {base}
        {tag && (
          <text className={`cd-tag ${tag === 'S' ? 'is-slow' : tag === 'F' ? 'is-fast' : 'is-both'}`} x={p.x} y={p.y - R - 9} textAnchor="middle">
            {tag}
          </text>
        )}
      </>
    );
  };

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Slow steps" value={f.slowSteps} color="var(--info)" />
          <Stat label="Fast steps" value={f.fastSteps} color="var(--violet)" />
          {/* Greek letters stay out of the labels: the uppercase label style turns μ into a Latin-looking M. */}
          <Stat label="Tail length" value={f.start !== null ? f.start : '?'} color="var(--ok)" sub={f.start !== null ? 'μ, found' : 'μ, not found yet'} />
          <Stat
            label="Loop length"
            value={f.phase === 3 && f.measured.length === run.loop.length && f.fast === run.start ? run.loop.length : '?'}
            color="var(--hi)"
            sub="λ"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'slow (S)', shape: 'dot' },
            { color: 'var(--violet)', label: 'fast (F)', shape: 'dot' },
            { color: 'var(--hi)', label: 'meeting point', shape: 'dot' },
            { color: 'var(--ok)', label: 'loop start', shape: 'dot' },
            { color: 'color-mix(in srgb, var(--hi) 35%, transparent)', label: 'loop being measured', shape: 'square' },
            ...(loop ? [] : [{ color: 'var(--dim)', label: 'null: end of list', shape: 'square' as const }]),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Loop" value={loop} onChange={setLoop} off="No cycle" on="Has a cycle" />
        </>,
        <>
          <Slider label="Tail μ" value={mu} min={0} max={MU_MAX} onChange={setMu} />
          <Slider label="Loop λ" value={lambda} min={1} max={LAMBDA_MAX} onChange={setLambda} />
          <Hint>{loop ? "Real lists don't show you μ and λ: Floyd finds both with two pointers." : `No cycle: the list is just μ + λ = ${mu + lambda} nodes ending in null.`}</Hint>
        </>,
      ]}
    >
      <div className="cd stage-pad">
        <div className="cd-main">
          <WideRegion minWidth={minWidthForText(layout.width, SMALLEST_TEXT_PX)} label="Linked list: scroll sideways to see all of it">
          <GraphView
            nodes={ids.map((id) => ({ id, at: layout.at.get(id) }))}
            edges={edges}
            directed
            width={layout.width}
            height={layout.height}
            radius={R}
            arrowSize={5}
            className="cd-graph"
            ariaLabel={loop ? `Linked list with a tail of ${mu} and a loop of ${lambda}` : `Linked list of ${mu + lambda} nodes ending in null`}
            renderNode={renderNode}
            nodeMark={(id) => {
              if (id === NULL_ID) return { tone: 'dim', fill: 'tint' };
              if (id === f.start) return { tone: 'ok', fill: 'solid' };
              if (f.slow === id && f.fast === id) return { tone: 'hi', fill: 'solid' };
              if (f.fast === id) return { tone: 'violet', fill: 'solid' };
              if (f.slow === id) return { tone: 'info', fill: 'solid' };
              if (id === f.meet && f.phase >= 2) return { tone: 'hi', fill: 'tint', tint: 30 };
              if (measured.has(id)) return { tone: 'hi', fill: 'tint', tint: 22 };
              return null;
            }}
            edgeMark={(e) => (f.phase === 3 && measured.has(e.from) && measured.has(e.to) ? { tone: 'hi', width: 3 } : null)}
          />
          </WideRegion>
        </div>
        <div className="cd-side">
          <Tray label="Why phase 2 works" labelWeight="regular" stack ariaLabel="Why phase 2 works">
            {showProof && pr ? (
              <div className="cd-proof">
                <p>slow: k = {pr.k} = μ + a = {mu} + {pr.a}</p>
                <p>fast: 2k = {2 * pr.k}</p>
                <p>extra k = {pr.k} = {pr.laps} × λ ({pr.lambda})</p>
                <p>
                  ⇒ μ ≡ −a (mod λ): {mu} ≡ −{pr.a} (mod {pr.lambda})
                </p>
              </div>
            ) : (
              <Hint>{loop ? 'Appears once slow and fast meet, with the numbers from this run.' : 'No loop, nothing to prove: fast just runs off the end.'}</Hint>
            )}
          </Tray>
          <Tray label="Memory" labelWeight="regular" stack ariaLabel="Memory">
            <p className="cd-line">
              Floyd: <b>2</b> pointers. A hash set of visited nodes would store all <b>{mu + lambda}</b> before {loop ? 'seeing a repeat' : 'reaching null'}.
            </p>
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}

function ArrayScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(8);
  const [arr, setArr] = useState(() => duplicateArray(8, Math.random).values);
  const frames = useMemo(() => arrayFrames(arr), [arr]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const { dup, run } = useMemo(() => findDuplicate(arr), [arr]);
  const hash = useMemo(() => hashSetWalk(arr), [arr]);
  const walk = run.loop.length ? [...run.phase2.map((p) => p.slow).slice(0, -1), ...run.loop, run.loop[0]] : [];

  const remake = (size: number) => {
    setN(size);
    setArr(duplicateArray(size, Math.random).values);
  };
  const pointers: ArrayPointer[] =
    f.slow === f.fast ? [{ i: f.slow, label: 'S F', tone: f.start !== null ? 'ok' : 'hi' }] : [{ i: f.slow, label: 'S', tone: 'info' }, ...(f.fast !== null ? [{ i: f.fast, label: 'F', tone: 'violet' as const }] : [])];

  return (
    <StageFrame
      player={player}
      height={360}
      stats={
        <Stats>
          <Stat label="Slow jumps" value={f.slowSteps} color="var(--info)" />
          <Stat label="Fast jumps" value={f.fastSteps} color="var(--violet)" />
          <Stat label="Duplicate" value={f.start ?? '?'} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'slow (S)', shape: 'dot' },
            { color: 'var(--violet)', label: 'fast (F)', shape: 'dot' },
            { color: 'var(--hi)', label: 'meeting', shape: 'dot' },
            { color: 'var(--ok)', label: 'duplicate found', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Values 1 … n" value={n} min={5} max={12} onChange={remake} format={(v) => `n = ${v}, ${v + 1} slots`} />
          <Button onClick={() => remake(n)}>New array</Button>
        </>,
      ]}
    >
      <div className="cd stage-pad">
        <div className="cd-main">
          <ArrayStrip
            values={arr}
            showIndex
            cellMax={48}
            pointers={pointers}
            cellState={(i) => {
              if (f.start !== null && arr[i] === f.start) return 'done';
              if (i === f.slow && i === f.fast) return 'active';
              return i === f.slow ? 'info' : i === f.fast ? 'violet' : 'idle';
            }}
          />
          <Tray label="The chain i → a[i], from index 0" labelWeight="regular" stack ariaLabel="Chain">
            <p className="cd-chain">
              {walk.map((x, k) => (
                <span key={k} className={f.start !== null && x === dup && k > 0 ? 'cd-dup' : ''}>
                  {k > 0 && ' → '}
                  {x}
                </span>
              ))}
            </p>
            <Hint>{f.start !== null ? `The chain enters its loop at ${dup}: two indices hold the value ${dup}.` : 'Where the chain enters its loop is the answer: play to find it.'}</Hint>
          </Tray>
          <Tray label="Memory" labelWeight="regular" stack ariaLabel="Memory">
            <p className="cd-line">
              Floyd: <b>2</b> numbers, array untouched. Hash set: <b>{hash.stored}</b> stored indices before the repeat.
            </p>
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}
