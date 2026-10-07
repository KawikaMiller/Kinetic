import { useMemo, useState, type CSSProperties } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { GraphView, type GraphEdge, type Pt } from '../../components/GraphView';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { cssVar, type TokenName } from '../../core/palette';
import { layeredLayout, layeredPositions } from '../../core/graphLayout';
import { usePlayer } from '../../core/usePlayer';
import { counterText, PROPERTY_NAMES, relFrames } from './frames';
import {
  classes, closureWaves, counterexample, hasse, holds, incomparable, isEquivalence, isPartialOrder, linearExtension, pairs, PROPERTIES, respects, toggle,
  type Closure, type Pair, type Property, type Rel,
} from './model';
import { CUSTOM_SIZES, customPreset, PRESETS, type Preset } from './presets';
import './styles.css';

const STEP_MS = 1100;
const GRAPH_W = 340;
const GRAPH_H = 300;
/** Class colours: categorical, never the ok/bad meanings. */
const CLASS_TONES: readonly TokenName[] = ['amber', 'pink', 'sky', 'orange', 'violet', 'info'];
const HASSE_SPACING = { direction: 'down', layerGap: 70, nodeGap: 64, padMain: 34, padCross: 40 } as const;

type View = 'props' | 'classes' | 'order';

/** The properties each view is about: the default counterexample only comes from these. */
const NEEDS: Record<View, readonly Property[]> = {
  props: PROPERTIES,
  classes: ['reflexive', 'symmetric', 'transitive'],
  order: ['reflexive', 'antisymmetric', 'transitive'],
};
const NEEDS_NAME: Record<View, string> = { props: '', classes: 'an equivalence relation', order: 'a partial order' };

const has = (ps: readonly Pair[], a: number, b: number) => ps.some(([p, q]) => p === a && q === b);

export function Stage() {
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [rel, setRel] = useState<Rel>(PRESETS[0].rel);
  const [anim, setAnim] = useState<{ from: Rel; kind: Closure } | null>(null);
  const [view, setView] = useState<View>('props');
  const [picked, setPicked] = useState<Property | null>(null);
  const [incPick, setIncPick] = useState<number>(0);
  const [showExt, setShowExt] = useState(false);
  const L = preset.labels;
  const n = L.length;

  const frames = useMemo(() => relFrames(rel, preset.labels, anim), [rel, preset, anim]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const r = f.rel;

  const failing = NEEDS[view].find((p) => !holds(r, p)) ?? null;
  const focus = picked ?? failing;
  const cx = focus ? counterexample(r, focus) : null;
  const eq = isEquivalence(r);
  const po = isPartialOrder(r);
  const cls = eq ? classes(r) : [];
  const classOf = (x: number) => cls.findIndex((c) => c.includes(x));
  const inc = po ? incomparable(r) : [];
  const incPair = inc[Math.min(incPick, inc.length - 1)];
  const ext = po ? linearExtension(r) : [];

  const load = (p: Preset) => {
    setPreset(p);
    setRel(p.rel);
    setAnim(null);
    setPicked(null);
    setIncPick(0);
    setShowExt(false);
  };
  const flip = (a: number, b: number) => {
    player.queueNext({ play: false });
    setAnim(null);
    setRel(toggle(rel, a, b));
    setShowExt(false);
  };
  const close = (kind: Closure) => {
    setAnim({ from: rel, kind });
    setRel(closureWaves(rel, kind).result);
  };

  const cell = (a: number, b: number): GridCellSpec => {
    if (has(f.added, a, b)) return { tone: 'hi', fill: 'solid', text: '1' };
    if (cx && has(cx.present, a, b)) return { tone: 'bad', fill: 'solid', text: '1' };
    if (cx && has(cx.missing, a, b)) return { tone: 'bad', fill: 'outline', text: '?' };
    return r[a][b] ? { tone: 'info', fill: 'tint', text: '1' } : { fill: 'none', text: '' };
  };

  // ---- the right-hand drawing ----
  const relationEdges: GraphEdge<number>[] = pairs(r).map(([a, b]) => ({ from: a, to: b }));
  const ghost: GraphEdge<number>[] = view === 'props' && cx ? cx.missing.map(([a, b]) => ({ from: a, to: b })) : [];
  // Hasse diagram: covering pairs drawn from the bigger element down, so maximal elements sit on top.
  const { hasseEdges, hassePlace } = useMemo(() => {
    const edges = isPartialOrder(r) ? hasse(r).map(([a, b]) => ({ from: b, to: a })) : [];
    return { hasseEdges: edges, hassePlace: layeredPositions(layeredLayout(Array.from({ length: r.length }, (_, i) => i), edges), HASSE_SPACING) };
  }, [r]);
  const groupAt = (x: number): Pt => {
    const c = classOf(x);
    const row = cls[c].indexOf(x);
    const cols = cls.length;
    return { x: 40 + ((GRAPH_W - 80) * (c + 0.5)) / cols, y: 50 + row * 56 };
  };

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Elements" value={n} color="var(--muted)" />
          <Stat label="Pairs" value={pairs(r).length} color="var(--info)" sub={`of ${n * n} possible`} />
          {view === 'classes' && <Stat label="Classes" value={eq ? cls.length : '—'} color="var(--amber)" sub={eq ? 'a partition' : 'not an equivalence'} />}
          {view === 'order' && <Stat label="Incomparable pairs" value={po ? inc.length : '—'} color="var(--violet)" sub={po ? (inc.length ? 'not a line' : 'a total order') : 'not a partial order'} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'pair in the relation', shape: 'square' },
            { color: 'var(--hi)', label: 'just added by a closure', shape: 'square' },
            { color: 'var(--bad)', label: 'counterexample (outline = missing pair)', shape: 'square' },
            ...(view === 'classes' ? [{ color: 'var(--amber)', label: 'equivalence classes (one colour each)', shape: 'dot' as const }] : []),
            ...(view === 'order' ? [{ color: 'var(--violet)', label: 'an incomparable pair', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          <ControlGroup label="Relation">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={preset.id === p.id} onClick={() => load(p)}>
                {p.label}
              </ChipButton>
            ))}
            <ChipButton on={preset.id === 'custom'} onClick={() => load(customPreset(preset.id === 'custom' ? n : 5))}>
              Your own
            </ChipButton>
          </ControlGroup>
          {preset.id === 'custom' && (
            <Segmented label="Elements" value={n} onChange={(k: number) => load(customPreset(k))} options={CUSTOM_SIZES.map((k) => ({ value: k, label: String(k) }))} />
          )}
        </>,
        <>
          <Segmented
            label="View"
            value={view}
            onChange={(v) => {
              setView(v);
              setPicked(null);
            }}
            options={[
              { value: 'props', label: 'Properties' },
              { value: 'classes', label: 'Equivalence classes' },
              { value: 'order', label: 'Partial order' },
            ]}
          />
          <ControlGroup label="Closures">
            <Button onClick={() => close('reflexive')}>Reflexive</Button>
            <Button onClick={() => close('symmetric')}>Symmetric</Button>
            <Button onClick={() => close('transitive')}>Transitive</Button>
          </ControlGroup>
          <Hint>Click a matrix cell to add or remove that pair.</Hint>
        </>,
      ]}
    >
      <div className="ro stage-pad">
        <div className="ro-left">
          <p className="ro-reads">
            Row a, column b is <b>1</b> when {preset.reads}.
          </p>
          <CellGrid
            rows={n}
            cols={n}
            size={n <= 6 ? 'md' : 'sm'}
            cell={cell}
            rowLabels={L}
            colLabels={L}
            onCellClick={flip}
            cellAriaLabel={(a, b) => `${L[a]} R ${L[b]}: ${r[a][b] ? 'yes' : 'no'}. Press to ${r[a][b] ? 'remove' : 'add'}`}
            ariaLabel="Relation matrix"
            className="ro-grid"
          />
          <div className="ro-badges" role="group" aria-label="Properties">
            {PROPERTIES.map((p) => {
              const ok = holds(r, p);
              return (
                <ChipButton key={p} tone={ok ? 'ok' : 'bad'} on={focus === p} onClick={() => setPicked(p)}>
                  {PROPERTY_NAMES[p]} {ok ? '✓' : '✗'}
                </ChipButton>
              );
            })}
          </div>
          <p className="ro-cx" role="status">
            {focus && cx ? (
              <>
                <b>{PROPERTY_NAMES[focus]} fails:</b> {counterText(focus, cx, L)}.
              </>
            ) : focus ? (
              <>
                <b>{PROPERTY_NAMES[focus]} holds</b> for every element.
              </>
            ) : view === 'props' ? (
              'All four properties hold: this is equality.'
            ) : (
              `Everything ${NEEDS_NAME[view]} needs holds.`
            )}
          </p>
        </div>
        <div className="ro-right">
          <WideRegion minWidth={300} gutter={{ top: 26 }} label="Relation drawing: scroll sideways to see all of it">
            {view === 'props' && (
              <GraphView
                nodes={L.map((label, i) => ({ id: i, label }))}
                edges={[...relationEdges, ...ghost]}
                directed
                layout="circle"
                width={GRAPH_W}
                height={GRAPH_H}
                radius={L.some((x) => x.length > 2) ? 22 : 18}
                arrowSize={5}
                className="ro-graph"
                ariaLabel={`Relation as a directed graph: ${pairs(r).length} arrows`}
                edgeMark={(e, i) => {
                  if (i >= relationEdges.length) return { tone: 'bad', dashed: true, width: 2.5 };
                  if (has(f.added, e.from, e.to)) return { tone: 'hi', width: 3.5 };
                  if (cx && has(cx.present, e.from, e.to)) return { tone: 'bad', width: 3.5 };
                  return { tone: 'info', width: 2 };
                }}
                nodeMark={(i) => (cx?.elements.includes(i) ? { tone: 'bad', fill: 'tint' } : null)}
              />
            )}
            {view === 'classes' &&
              (eq ? (
                <GraphView
                  nodes={L.map((label, i) => ({ id: i, label, at: groupAt(i) }))}
                  edges={[]}
                  width={GRAPH_W}
                  height={Math.max(160, 80 + Math.max(...cls.map((c) => c.length)) * 56)}
                  radius={L.some((x) => x.length > 2) ? 22 : 18}
                  className="ro-graph"
                  ariaLabel={`${cls.length} equivalence classes`}
                  nodeColor={(i) => cssVar(CLASS_TONES[classOf(i) % CLASS_TONES.length])}
                />
              ) : (
                <p className="ro-why">
                  Not an equivalence relation, so there are no classes:{' '}
                  {(['reflexive', 'symmetric', 'transitive'] as const)
                    .filter((p) => !holds(r, p))
                    .map((p) => `${PROPERTY_NAMES[p].toLowerCase()} fails (${counterText(p, counterexample(r, p)!, L)})`)
                    .join('; ')}
                  . Try the closure buttons.
                </p>
              ))}
            {view === 'order' &&
              (po ? (
                <GraphView
                  nodes={L.map((label, i) => ({ id: i, label, at: hassePlace.at.get(i) }))}
                  edges={hasseEdges}
                  width={Math.max(GRAPH_W, hassePlace.width)}
                  height={hassePlace.height}
                  radius={L.some((x) => x.length > 2) ? 22 : 18}
                  className="ro-graph"
                  ariaLabel={`Hasse diagram, ${hasseEdges.length} covering pairs; bigger elements at the top`}
                  nodeMark={(i) => (incPair && (incPair[0] === i || incPair[1] === i) ? { tone: 'violet', fill: 'solid' } : null)}
                />
              ) : (
                <p className="ro-why">
                  Not a partial order, so there's no Hasse diagram:{' '}
                  {(['reflexive', 'antisymmetric', 'transitive'] as const)
                    .filter((p) => !holds(r, p))
                    .map((p) => `${PROPERTY_NAMES[p].toLowerCase()} fails (${counterText(p, counterexample(r, p)!, L)})`)
                    .join('; ')}
                  .
                </p>
              ))}
          </WideRegion>
          {view === 'classes' && eq && (
            <Tray label="Classes" labelWeight="regular" ariaLabel="Equivalence classes">
              {cls.map((c, k) => (
                <span key={k} className="chip ro-class" style={{ '--c': cssVar(CLASS_TONES[k % CLASS_TONES.length]) } as CSSProperties}>
                  {'{'}
                  {c.map((x) => L[x]).join(', ')}
                  {'}'}
                </span>
              ))}
            </Tray>
          )}
          {view === 'order' && po && (
            <>
              <Tray label={`Incomparable pairs (${inc.length})`} labelWeight="regular" empty="none: every pair is comparable" ariaLabel="Incomparable pairs">
                {inc.length > 0 &&
                  inc.map(([a, b], k) => (
                    <ChipButton key={`${a}-${b}`} tone="violet" on={k === Math.min(incPick, inc.length - 1)} onClick={() => setIncPick(k)}>
                      {L[a]} ∥ {L[b]}
                    </ChipButton>
                  ))}
              </Tray>
              <Tray label="One line anyway?" labelWeight="regular" stack ariaLabel="Linear extension">
                {showExt ? (
                  <p className="ro-ext">
                    {ext.map((x) => L[x]).join(' < ')}{' '}
                    {respects(r, ext) ? <span className="hl ok">respects every pair</span> : <span className="hl bad">breaks a pair</span>}
                  </p>
                ) : (
                  <Button onClick={() => setShowExt(true)}>Show a linear extension</Button>
                )}
                <Hint>A linear extension ranks everything without breaking any pair, but it has to make up an order for incomparable elements: it's one of possibly many.</Hint>
              </Tray>
            </>
          )}
        </div>
      </div>
    </StageFrame>
  );
}
