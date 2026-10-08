import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { layeredLayout, layeredPositions } from '../../core/graphLayout';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { L_CODE, VARIANTS, type Design, type PrincipleId, type Unit } from './code';
import { breaks, buildFrames, impactOf, type UnitMark } from './frames';
import { dependencies, renderListing, touchedCount } from './model';
import { PRINCIPLES, PRINCIPLE_IDS } from './principles';
import { L_CALLS } from './run';
import './styles.css';

const STEP_MS = 1500;
const BOX = { w: 134, h: 34, rx: 8 };
const SPACING = { direction: 'down', layerGap: 78, nodeGap: 152, padMain: 32, padCross: 78 } as const;
const SMALLEST_TEXT_PX = 12;

const OPTIONS = PRINCIPLE_IDS.map((id) => ({ value: id, label: `${id}: ${PRINCIPLES[id].name}` }));

const MARK: Record<UnitMark, GraphNodeMark> = {
  hi: { tone: 'hi', fill: 'solid' },
  bad: { tone: 'bad', fill: 'solid' },
  orange: { tone: 'orange', fill: 'tint', tint: 30 },
  ok: { tone: 'ok', fill: 'tint', tint: 24 },
};

/** Every unit either version of the design has, so a class added by the change has a place waiting for it. */
function allUnits(p: PrincipleId, d: Design): Unit[] {
  if (p === 'L') return L_CODE[d];
  const { before, after } = VARIANTS[p][d];
  return [...after, ...before.filter((u) => !after.some((a) => a.name === u.name))];
}

export function Stage() {
  const [principle, picker] = useScenePicker<PrincipleId>({ label: 'Principle', options: OPTIONS, initial: 'S' });
  const [fixed, setFixed] = useState(false);
  const design: Design = fixed ? 'fixed' : 'violating';
  const pr = PRINCIPLES[principle];

  const frames = useMemo(() => buildFrames(principle, design), [principle, design]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const layout = useMemo(() => {
    const units = allUnits(principle, design);
    const edges = dependencies(units);
    const placed = layeredPositions(layeredLayout(units.map((u) => u.name), edges), SPACING);
    return { units, placed };
  }, [principle, design]);

  const shown = f.variant;
  const edges = dependencies(shown);
  const kind = new Map(layout.units.map((u) => [u.name, u.kind]));
  const listing = renderListing(shown);

  const nodeMark = (id: string): GraphNodeMark | null => (f.marks[id] ? MARK[f.marks[id]] : null);
  const edgeMark = (_e: unknown, i: number): GraphEdgeMark | null => {
    const e = edges[i];
    if (e.kind === 'extends') return { tone: 'info', width: 2.5 };
    if (e.kind === 'implements') return { tone: 'info', width: 2.5, dashed: true };
    return null;
  };

  const im = principle === 'L' ? null : impactOf(principle, design);
  const otherIm = principle === 'L' ? null : impactOf(principle, fixed ? 'violating' : 'fixed');

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          {im && otherIm ? (
            <>
              <Stat label="Edited" value={im.edited.length} color={im.edited.length ? 'var(--bad)' : 'var(--muted)'} sub={im.edited.join(', ') || 'none'} />
              <Stat label="Added" value={im.added.length} color={im.added.length ? 'var(--hi)' : 'var(--muted)'} sub={im.added.join(', ') || 'none'} />
              <Stat label="Re-test" value={im.retest.length} color={im.retest.length ? 'var(--orange)' : 'var(--muted)'} sub={im.retest.join(', ') || 'none'} />
              <Stat
                label="Touched: this design vs the other"
                value={`${touchedCount(im)} vs ${touchedCount(otherIm)}`}
                color={touchedCount(im) <= touchedCount(otherIm) ? 'var(--ok)' : 'var(--bad)'}
                sub={`of ${shown.length} classes and functions; ${im.untouched.length} left alone`}
              />
            </>
          ) : (
            <Stat
              label="Substitutions that break"
              value={`${breaks(design)} of ${L_CALLS[design].length}`}
              color={breaks(design) ? 'var(--bad)' : 'var(--ok)'}
              sub="a subclass handed to code written for its base type"
            />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'interface', shape: 'square' },
            { color: 'var(--info)', label: 'solid: extends, dashed: implements', shape: 'line' },
            { color: 'var(--line-2)', label: 'uses', shape: 'line' },
            { color: 'var(--hi)', label: principle === 'L' ? 'running now' : 'change starts here / added', shape: 'square' },
            { color: 'var(--bad)', label: principle === 'L' ? 'broke the substitution' : 'had to be edited', shape: 'square' },
            ...(principle === 'L' ? [] : [{ color: 'var(--orange)', label: 're-test: depends on edited code', shape: 'square' as const }]),
            { color: 'var(--ok)', label: principle === 'L' ? 'substitution works' : 'left alone', shape: 'square' },
          ]}
        />
      }
      controls={[picker, <Toggle key="d" label="Design" value={fixed} onChange={setFixed} off="Violating" on="Fixed" />]}
    >
      <div className="sp stage-pad">
        <Box className="sp-rule">
          <p className="sp-statement">
            <b>{pr.id}</b> {pr.statement}
          </p>
          <p className="sp-source">{pr.source}</p>
          <p className="sp-design">
            <span className={`sp-design-tag ${fixed ? 'is-fixed' : 'is-violating'}`}>{fixed ? 'fixed' : 'violating'}</span>
            {fixed ? pr.fixed : pr.violating}. {principle === 'L' ? 'The run' : 'Change request'}: <b>{pr.request}</b>.
          </p>
        </Box>
        <WideRegion minWidth={minWidthForText(layout.placed.width, SMALLEST_TEXT_PX)} label="Class diagram: scroll sideways to see all of it">
          <GraphView
            nodes={layout.units
              .filter((u) => shown.some((s) => s.name === u.name))
              .map((u) => ({ id: u.name, at: layout.placed.at.get(u.name), shape: 'box' as const, label: u.kind === 'function' ? `${u.name}()` : u.name }))}
            edges={edges}
            directed
            width={layout.placed.width}
            height={layout.placed.height}
            box={BOX}
            arrowSize={6}
            nodeColor={(id) => (kind.get(id) === 'interface' ? 'var(--violet)' : undefined)}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            className="sp-graph"
            ariaLabel={`Class diagram: ${edges.map((e) => `${e.from} ${e.kind} ${e.to}`).join('; ')}`}
          />
        </WideRegion>
        <div className="sp-code">
          <CodePanel
            title={principle === 'L' ? 'files.js (runs for real)' : `${design} design${player.index >= 2 ? ', after the change' : ''}`}
            lines={listing.map((l) => l.text)}
            stateOf={(i) => (f.changed.has(i) ? 'now' : 'idle')}
            className="sp-panel"
          />
          {principle === 'L' && <ConsolePanel title="output" lines={f.console} empty="press play to run each call" />}
        </div>
        <Box variant="sunken" className="sp-overkill">
          <SectionTitle weight="regular">When it's overkill</SectionTitle>
          <p>{pr.overkill}</p>
        </Box>
        <Hint block>
          Each design is a small hand-written example; the ripple counts are the classes each change touches in it, found by diffing the two versions
          of the code. "Re-test" means a class that names an edited class directly; real build tools and test suites draw that line differently.
        </Hint>
      </div>
    </StageFrame>
  );
}
