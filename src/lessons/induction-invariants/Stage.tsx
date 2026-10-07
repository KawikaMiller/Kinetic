import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { SPRING } from '../../core/motion';
import { parseBoundedInt } from '../../core/parse';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { DOMINOES, horseOverlap, layerOf, type DominoClaim } from './dominoes';
import { FACTOR_MAX, FACTOR_MIN, FACTOR_PRESETS, factorTree } from './factorTree';
import { dominoFrames, factorFrames, searchFrames } from './frames';
import { ABSENT_TARGETS, BUG_LABELS, SEARCH_ARRAY } from './presets';
import { BUG_LINE, BUGS, invariantHolds, ITERATION_CAP, sourceFor, type Bug } from './search';
import './styles.css';

type Scene = 'dominoes' | 'loop' | 'strong';
const SCENES = [
  { value: 'dominoes' as const, label: 'Dominoes' },
  { value: 'loop' as const, label: 'Loop invariant' },
  { value: 'strong' as const, label: 'Strong induction' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'dominoes' });
  if (scene === 'loop') return <LoopScene picker={picker} />;
  if (scene === 'strong') return <StrongScene picker={picker} />;
  return <DominoScene picker={picker} />;
}

/* ---------- scene 1 ---------- */

const DOMINO = { w: 20, h: 64, gap: 40, x0: 36, base: 112 } as const;
const DOMINO_W = DOMINO.x0 * 2 + DOMINO.gap * (DOMINOES - 1);
const FALL_DEG = 64;
const SQUARE_CELL = { cell: 16, gap: 1 };

function DominoScene({ picker }: { picker: ReactNode }) {
  const [claim, setClaim] = useState<DominoClaim>('odd');
  const [base, setBase] = useState(true);
  const [step, setStep] = useState(true);
  const frames = useMemo(() => dominoFrames(claim, base, step), [claim, base, step]);
  const player = usePlayer(frames, { interval: 700, autoplayOnChange: false });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={360}
      stats={
        <Stats>
          <Stat label="Fallen" value={`${f.fallen} of ${DOMINOES}`} color="var(--ok)" />
          <Stat label="Claim" value={claim === 'odd' ? 'odd sums' : 'horses'} color="var(--muted)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being checked', shape: 'square' },
            { color: 'var(--ok)', label: 'fallen (proven)', shape: 'square' },
            { color: 'var(--bad)', label: 'broken step', shape: 'square' },
            { color: 'var(--dim)', label: 'still standing', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Claim" value={claim} onChange={setClaim} options={[{ value: 'odd', label: '1 + 3 + … = n²' }, { value: 'horses', label: 'All horses are the same colour' }]} />
          <Toggle label="Base case" value={base} onChange={setBase} off="not proven" on="proven" />
          <Toggle label="Step" value={step} onChange={setStep} off="not proven" on="proven" />
          <Button variant="primary" onClick={player.restart}>
            Push the first domino
          </Button>
        </>,
      ]}
    >
      <div className="ii stage-pad">
        <WideRegion minWidth={520} label="Dominoes: scroll sideways to see all of them">
          <svg viewBox={`0 0 ${DOMINO_W} 150`} className="ii-dominoes" role="img" aria-label={`${f.fallen} of ${DOMINOES} dominoes fallen`}>
            <line x1={10} x2={DOMINO_W - 10} y1={DOMINO.base} y2={DOMINO.base} className="ii-floor" />
            {Array.from({ length: DOMINOES }, (_, i) => {
              const k = i + 1;
              const x = DOMINO.x0 + i * DOMINO.gap;
              const fallen = k <= f.fallen;
              const tone = k === f.current && f.gapAt !== null ? 'bad' : k === f.current ? 'hi' : fallen ? 'ok' : 'dim';
              return (
                <g key={k}>
                  <motion.rect
                    x={x - DOMINO.w / 2}
                    y={DOMINO.base - DOMINO.h}
                    width={DOMINO.w}
                    height={DOMINO.h}
                    rx={3}
                    className={`ii-domino tone-${tone}`}
                    style={{ transformBox: 'fill-box', transformOrigin: '100% 100%' }}
                    initial={false}
                    animate={{ rotate: fallen ? FALL_DEG : 0 }}
                    transition={SPRING.soft}
                  />
                  <text x={x} y={DOMINO.base + 18} className="ii-domino-label" textAnchor="middle">
                    P({k})
                  </text>
                </g>
              );
            })}
            {f.gapAt !== null && (
              <text x={DOMINO.x0 + (f.gapAt - 0.5) * DOMINO.gap} y={DOMINO.base - DOMINO.h - 12} className="ii-gap" textAnchor="middle">
                ✗ {f.gapAt} → {f.gapAt + 1}
              </text>
            )}
          </svg>
        </WideRegion>
        {claim === 'odd' ? (
          <div className="ii-square">
            <CellGrid
              rows={DOMINOES}
              cols={DOMINOES}
              size={SQUARE_CELL}
              cell={(r, c) => {
                const layer = layerOf(r, c);
                if (layer > f.fallen) return { fill: 'none' };
                return layer === f.fallen ? { tone: 'hi', fill: 'solid' } : { tone: 'info', fill: 'tint', intensity: 0.4 };
              }}
              ariaLabel={`A ${f.fallen} by ${f.fallen} square built from L-shaped layers`}
            />
            <p className="ii-note">
              Layer k is an L of 2k − 1 cells. Adding it to a (k − 1)² square makes a k² square: that's the inductive step, drawn.
            </p>
          </div>
        ) : (
          <HorseGroups />
        )}
      </div>
    </StageFrame>
  );
}

/** The horses step for 2 and 3 horses: the two groups of n, and what they share. */
function HorseGroups() {
  return (
    <div className="ii-horses">
      {[1, 2].map((k) => {
        const shared = horseOverlap(k);
        const total = k + 1;
        return (
          <Box key={k} className={`ii-horse-box tone-${shared ? 'ok' : 'bad'}`}>
            <SectionTitle>
              Step {k} → {total}: {total} horses
            </SectionTitle>
            <div className="ii-horse-row" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={`ii-horse ${i < total - 1 && i > 0 ? 'is-shared' : ''}`}>
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="ii-note">
              "All but the last" is horses 1–{total - 1}, "all but the first" is horses 2–{total}. They share {shared} horse{shared === 1 ? '' : 's'}:{' '}
              {shared ? 'the shared horse ties both colours together.' : 'nothing ties the colours together, so the step fails.'}
            </p>
          </Box>
        );
      })}
    </div>
  );
}

/* ---------- scene 2 ---------- */

function LoopScene({ picker }: { picker: ReactNode }) {
  const [bug, setBug] = useState<Bug>('none');
  const [target, setTarget] = useState(91);
  const frames = useMemo(() => searchFrames(SEARCH_ARRAY, target, bug), [target, bug]);
  const player = usePlayer(frames, { interval: 1100 });
  const f = player.frame;
  const n = SEARCH_ARRAY.length;
  const values: (number | string)[] = bug === 'hi-n' ? [...SEARCH_ARRAY, '?'] : [...SEARCH_ARRAY];
  const src = sourceFor(bug);
  const bugLine = bug === 'none' ? -1 : BUG_LINE[bug].line;
  const ok = f.allHeld ?? (f.check ? invariantHolds(f.check) : null);
  const okText = f.allHeld === null ? (ok ? '✓ true now' : '✗ false now') : ok ? '✓ held at every check' : '✗ broken during the run';
  const inRange = (i: number) => i >= f.lo && i <= f.hi;

  const stateOf = (i: number): LineState => (i === f.line ? 'now' : i === bugLine ? 'bad' : 'idle');

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Iteration" value={f.iteration} color="var(--hi)" sub={`stopped at ${ITERATION_CAP}`} />
          <Stat label="Invariant" value={ok === null ? '—' : ok ? '✓ holds' : '✗ broken'} color={ok === false ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Range size" value={Math.max(0, f.size)} color="var(--violet)" sub="hi − lo + 1">
            <Bar value={Math.max(0, f.size)} max={n + 1} tone="violet" />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'search range [lo, hi]', shape: 'square' },
            { color: 'var(--hi)', label: 'mid, being checked', shape: 'square' },
            { color: 'var(--ok)', label: 'found / invariant ✓', shape: 'square' },
            { color: 'var(--bad)', label: 'injected bug / invariant ✗', shape: 'square' },
            { color: 'var(--dim)', label: 'ruled out', shape: 'square' },
            { color: 'var(--violet)', label: 'variant', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <ControlGroup label="Inject a bug">
            {BUGS.map((b) => (
              <ChipButton key={b} tone={b === 'none' ? 'ok' : 'bad'} on={bug === b} onClick={() => setBug(b)}>
                {BUG_LABELS[b]}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Target not in the array">
            {ABSENT_TARGETS.map((t) => (
              <ChipButton key={t} on={target === t} onClick={() => setTarget(t)}>
                {t}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint>Or click a number in the array to search for it.</Hint>
        </>,
      ]}
    >
      <div className="ii stage-pad">
        <p className={`ii-invariant tone-${ok === false ? 'bad' : 'ok'}`}>
          <b>Invariant:</b> 0 ≤ lo ≤ hi + 1 ≤ n, and if {target} is in a, its index is in [lo, hi].{' '}
          <span>{ok === null ? '' : okText}</span>
        </p>
        <ArrayStrip
          values={values}
          showIndex
          cellMax={56}
          className="ii-strip"
          ranges={f.lo <= f.hi ? [{ from: Math.max(0, f.lo), to: Math.min(values.length - 1, f.hi), tone: 'info', labels: ['lo', 'hi'] }] : []}
          pointers={f.mid !== null ? [{ i: f.mid, label: 'mid', tone: 'hi' }] : []}
          cellState={(i) => {
            if (i >= n) return f.mid === i ? 'bad' : 'dim';
            if (f.phase === 'found' && i === f.mid) return 'done';
            if (i === f.mid) return 'active';
            return inRange(i) ? 'idle' : 'dim';
          }}
          onCellClick={(i) => i < n && setTarget(SEARCH_ARRAY[i])}
          cellTitle={(i) => (i < n ? `Search for ${SEARCH_ARRAY[i]}` : 'Past the end of the array')}
        />
        {bug === 'hi-n' && <p className="ii-note">The "?" cell is index {n}: past the end of the array, which has indexes 0 to {n - 1}.</p>}
        <CodePanel
          title="Binary search"
          lines={src}
          stateOf={stateOf}
          trailing={(i) => (i === bugLine ? '← injected bug' : null)}
          className="ii-code"
        />
        <Hint tone="muted" block>
          The code runs for real on this array, and the invariant is checked on its actual lo and hi at the top of every iteration. The infinite loop is stopped after {ITERATION_CAP} iterations so you can see it.
        </Hint>
      </div>
    </StageFrame>
  );
}

/* ---------- scene 3 ---------- */

const TREE_COL_W = 64;
const TREE_LABEL_PX = 13;

function StrongScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(360);
  const [typed, setTyped] = useState('360');
  const [error, setError] = useState<string | null>(null);
  const nodes = useMemo(() => factorTree(n), [n]);
  const frames = useMemo(() => factorFrames(nodes), [nodes]);
  const player = usePlayer(frames, { interval: 1000 });
  const f = player.frame;
  const leaves = [...nodes.values()].filter((x) => !x.children.length).length;
  const width = Math.max(360, leaves * TREE_COL_W);
  const proven = new Set(f.proven);

  const apply = (text: string) => {
    const r = parseBoundedInt(text, {
      min: FACTOR_MIN,
      max: FACTOR_MAX,
      thousands: true,
      messages: { tooSmall: () => 'The claim here starts at n = 2.', tooBig: () => `Keep it at ${FACTOR_MAX.toLocaleString('en')} or less, so the tree fits.` },
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setN(r.value);
    setTyped(String(r.value));
  };

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="n" value={n.toLocaleString('en')} color="var(--muted)" />
          <Stat label="Proven" value={`${f.proven.length} of ${nodes.size}`} color="var(--ok)" sub="nodes" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being proven now', shape: 'dot' },
            { color: 'var(--ok)', label: 'proven', shape: 'dot' },
            { color: 'var(--dim)', label: 'not yet', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <ControlGroup label="Presets">
            {FACTOR_PRESETS.map((p) => (
              <ChipButton key={p} on={n === p} onClick={() => apply(String(p))}>
                {p}
              </ChipButton>
            ))}
          </ControlGroup>
          <TextField label="Your number" value={typed} onChange={setTyped} onEnter={() => apply(typed)} onBlur={() => apply(typed)} width={110} />
          {error ? <Hint tone="muted">{error} Still showing {n}.</Hint> : <Hint>2 to {FACTOR_MAX.toLocaleString('en')}; press Enter.</Hint>}
        </>,
      ]}
    >
      <div className="ii stage-pad">
        <p className="ii-note">Claim: every integer n ≥ 2 is a product of primes. Each node splits into two smaller factors; the proof runs bottom-up, children first.</p>
        <WideRegion minWidth={minWidthForText(width, TREE_LABEL_PX, 320)} label="Factor tree: scroll sideways to see all of it">
          <TreeSvg
            shape={{ root: 'r' as string, children: (id: string) => nodes.get(id)!.children }}
            layout="tidy"
            width={width}
            height={330}
            radius={22}
            label={(id) => nodes.get(id)!.value}
            nodeMark={(id) => (id === f.current ? { tone: 'hi', fill: 'solid' } : proven.has(id) ? { tone: 'ok', fill: 'tint', tint: 22 } : { tone: 'dim', fill: 'tint' })}
            edgeMark={(_, child) => (proven.has(child) ? { tone: 'ok' } : null)}
            className="ii-tree"
            ariaLabel={`Factor tree of ${n}`}
          />
        </WideRegion>
      </div>
    </StageFrame>
  );
}
