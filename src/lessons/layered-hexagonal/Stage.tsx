import { motion } from 'motion/react';
import { useState } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import { minWidthForText } from '../../core/scale';
import { toneVar, type Tone } from '../../core/tone';
import { swapCaption, viewCaption } from './captions';
import { BANDS, BAND_H, BOX, HEX, VIEW, drawnEdge, hexPoints, labelOf, positionOf } from './layout';
import {
  ILLUSTRATIVE_MS, changedFiles, coreChanged, domainTestNeedsOrm, filesFor, importEdges, rankIn, violations, type Choices, type Design, type DriverChoice, type RepoChoice,
} from './model';
import './styles.css';

const SMALLEST_TEXT_PX = 12;
const STAGE_PAD_X = 44;
const MIN_WIDTH = minWidthForText(VIEW.w, SMALLEST_TEXT_PX, { padX: STAGE_PAD_X });
const SLIDE = 46;
const DEFAULTS: Choices = { view: 'layered', design: 'clean', repo: 'postgres', driver: 'http' };
const DEFAULT_FILE = { layered: 'layered/OrderService.ts', hexagon: 'domain/placeOrder.ts' } as const;
/** Layered bands take categorical tones: they are layers, not statuses. */
const BAND_TONES: readonly Tone[] = ['amber', 'violet', 'sky', 'muted'];
const PORTS = new Set(['domain/OrderRepository.ts', 'domain/PaymentPort.ts', 'domain/Notifier.ts']);

/** A file's colour: what kind of thing it is, in the current view. */
function toneOf(view: Choices['view'], path: string): Tone {
  if (view === 'layered') return BAND_TONES[3 - rankIn('layered', path)];
  if (PORTS.has(path)) return 'info';
  if (path.startsWith('domain/')) return 'violet';
  if (path === 'adapters/HttpController.ts' || path === 'adapters/CliDriver.ts') return 'amber';
  if (path.startsWith('adapters/')) return 'sky';
  return 'muted';
}

export function Stage() {
  const [c, setC] = useState<Choices>(DEFAULTS);
  const [selected, setSelected] = useState<string>(DEFAULT_FILE.layered);
  const [last, setLast] = useState<{ core: string[]; all: string[]; swapped: string | null; from: 'left' | 'right' } | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(viewCaption(DEFAULTS));

  const files = filesFor(c);
  const edges = importEdges(files);
  const bad = violations(edges, (p) => rankIn(c.view, p));
  const isBad = (e: { from: string; to: string }) => bad.some((b) => b.from === e.from && b.to === e.to);
  const shownFile = files[selected] ? selected : DEFAULT_FILE[c.view];
  const drawn = edges.filter(drawnEdge);
  const paths = Object.keys(files);
  const needsOrm = domainTestNeedsOrm(files);

  const restructure = (next: Choices) => {
    setC(next);
    setLast(null);
    setSelected(DEFAULT_FILE[next.view]);
    setCaption(viewCaption(next));
  };
  const swap = (next: Choices) => {
    const a = filesFor(c);
    const b = filesFor(next);
    const added = Object.keys(b).find((p) => !a[p] && p.startsWith(next.view === 'layered' ? 'layered/' : 'adapters/')) ?? null;
    setLast({ core: coreChanged(a, b), all: changedFiles(a, b), swapped: added, from: next.repo !== c.repo ? 'right' : 'left' });
    setC(next);
    setCaption(swapCaption(c, next));
  };

  const nodeMark = (id: string): GraphNodeMark | null => (id === last?.swapped ? { tone: 'hi', fill: 'solid' } : null);
  const edgeMark = (e: { from: string; to: string }): GraphEdgeMark | null => (isBad(e) ? { tone: 'bad', width: 3.5 } : null);
  const coreLabel = c.view === 'layered' ? 'Business-rule files changed' : 'Domain files changed';
  const shownLines = files[shownFile].replace(/\n$/, '').split('\n');
  const badLines = new Set(bad.filter((e) => e.from === shownFile).map((e) => e.line));

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      height={560}
      stats={
        <Stats>
          <Stat
            label={c.view === 'layered' ? 'Upward imports' : 'Outward imports'}
            value={bad.length}
            color={toneVar(bad.length ? 'bad' : 'ok')}
            sub={bad.length ? bad.map((e) => `${labelOf(e.from)} → ${labelOf(e.to)}`).join(', ') : 'every arrow obeys the rule'}
          />
          <Stat
            label={`${coreLabel} by the last swap`}
            value={last ? last.core.length : '–'}
            color={last ? toneVar(last.core.length ? 'bad' : 'ok') : undefined}
            sub={last ? last.core.map(labelOf).join(', ') || 'none' : 'swap an adapter below'}
          />
          <Stat label="All files changed" value={last ? last.all.length : '–'} sub={last ? last.all.map(labelOf).join(', ') : ''} />
        </Stats>
      }
      legend={
        <Legend
          items={
            c.view === 'layered'
              ? [
                  ...BANDS.map((b, i) => ({ color: toneVar(BAND_TONES[i]), label: b.label, shape: 'square' as const })),
                  { color: 'var(--line-2)', label: 'imports', shape: 'line' },
                  { color: 'var(--hi)', label: 'just swapped in', shape: 'square' },
                  { color: 'var(--bad)', label: 'points the wrong way', shape: 'line' },
                ]
              : [
                  { color: 'var(--violet)', label: 'domain (includes the driving port, PlaceOrder)', shape: 'square' },
                  { color: 'var(--info)', label: 'port', shape: 'square' },
                  { color: 'var(--amber)', label: 'driving adapter', shape: 'square' },
                  { color: 'var(--sky)', label: 'driven adapter', shape: 'square' },
                  { color: 'var(--muted)', label: 'library / composition root', shape: 'square' },
                  { color: 'var(--line-2)', label: 'imports', shape: 'line' },
                  { color: 'var(--hi)', label: 'just swapped in', shape: 'square' },
                  { color: 'var(--bad)', label: 'points outward', shape: 'line' },
                ]
          }
        />
      }
      controls={[
        <>
          <Toggle label="View" value={c.view === 'hexagon'} onChange={(h) => restructure({ ...c, view: h ? 'hexagon' : 'layered' })} off="Layered" on="Hexagon" />
          {c.view === 'hexagon' && (
            <Segmented<Design>
              label="Domain"
              value={c.design}
              onChange={(design) => restructure({ ...c, design })}
              options={[
                { value: 'clean', label: 'Ports & adapters' },
                { value: 'orm', label: 'Domain imports the ORM' },
              ]}
            />
          )}
        </>,
        <>
          <Segmented<RepoChoice>
            label="Database adapter"
            value={c.repo}
            onChange={(repo) => swap({ ...c, repo })}
            options={[
              { value: 'postgres', label: 'Postgres' },
              { value: 'memory', label: 'In-memory' },
            ]}
          />
          <Segmented<DriverChoice>
            label="Driver"
            value={c.driver}
            onChange={(driver) => swap({ ...c, driver })}
            options={[
              { value: 'http', label: 'HTTP controller' },
              { value: 'cli', label: 'CLI' },
            ]}
          />
        </>,
      ]}
    >
      <div className="lh stage-pad">
        <div className="lh-canvas">
          <svg className="lh-backdrop" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
            {c.view === 'hexagon' ? (
              <>
                <polygon points={hexPoints()} className="lh-hex" />
                <text x={HEX.cx} y={HEX.cy - HEX.r + 62} textAnchor="middle" className="lh-ring-label tone-violet">
                  domain
                </text>
                <text x={12} y={22} className="lh-ring-label tone-muted">
                  outside: adapters, libraries, main
                </text>
              </>
            ) : (
              BANDS.map((b, i) => (
                <g key={b.label} className={`tone-${BAND_TONES[i]}`}>
                  <rect x={8} y={b.y - BAND_H / 2 + 4} width={VIEW.w - 16} height={BAND_H - 8} rx={10} className="lh-band" />
                  <text x={22} y={b.y + 5} className="lh-ring-label">
                    {b.label}
                  </text>
                </g>
              ))
            )}
          </svg>
          <GraphView
            nodes={paths.map((p) => ({ id: p, at: positionOf(c.view, p), shape: 'box' as const, label: labelOf(p) }))}
            edges={drawn}
            directed
            width={VIEW.w}
            height={VIEW.h}
            box={BOX}
            arrowSize={6}
            nodeColor={(id) => toneVar(toneOf(c.view, id))}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            nodeClass={(id) => (id === shownFile ? 'lh-shown' : '')}
            onNodeClick={setSelected}
            nodeAriaLabel={(id) => `${id}: show its source`}
            renderNode={(n, _at, base) =>
              n.id === last?.swapped ? (
                <motion.g initial={{ x: last.from === 'right' ? SLIDE : -SLIDE, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={SPRING.soft}>
                  {base}
                </motion.g>
              ) : (
                base
              )
            }
            className="lh-graph"
            ariaLabel={`${c.view} drawing of ${paths.length} files; ${bad.length} imports break the dependency rule`}
          />
        </div>
        <div className="lh-below">
          <CodePanel
            title={`${shownFile}${bad.some((e) => e.from === shownFile) ? ' (breaks the rule)' : ''}`}
            lines={shownLines}
            stateOf={(i) => (badLines.has(i) ? 'bad' : 'idle')}
            className="lh-code"
          />
          <div className="lh-side">
            <SectionTitle weight="regular">Test speed (illustrative)</SectionTitle>
            <div className="lh-speed">
              <span>{needsOrm ? 'Business-rule test: it reaches the ORM, so it needs the database too' : 'Business-rule test: no database needed'}</span>
              <Bar
                value={needsOrm ? ILLUSTRATIVE_MS.integration : ILLUSTRATIVE_MS.domain}
                max={ILLUSTRATIVE_MS.integration}
                tone={needsOrm ? 'bad' : 'ok'}
                height={8}
                trailing={`~${needsOrm ? ILLUSTRATIVE_MS.integration : ILLUSTRATIVE_MS.domain} ms`}
              />
              <span>Integration test through adapters and a real database</span>
              <Bar value={ILLUSTRATIVE_MS.integration} max={ILLUSTRATIVE_MS.integration} tone="bad" height={8} trailing={`~${ILLUSTRATIVE_MS.integration} ms`} />
            </div>
            <Hint block>
              {needsOrm
                ? 'Here the business rule reaches lib/orm.ts, so it cannot be tested without it: there is no database-free test to speed up. '
                : 'The business rule reaches no database, so it can be unit-tested with an in-memory adapter. '}
              Typical orders of magnitude, not measured here, drawn to scale with each other. The ORM in this lesson is simulated: there is no real database anywhere.
            </Hint>
          </div>
        </div>
        <Hint block>
          A small hand-written app. The hexagonal files are real TypeScript in this lesson (its tests run the domain with both repository adapters); the
          layered and "imports the ORM" files are lesson-authored text. The layered files show the naive variant, where the service names a concrete repository; a layered app can invert that dependency and then looks much like the hexagon. Arrows are each file's import lines; main.ts's own arrows (it imports every
          adapter) are left out of the drawing but counted by the checker. Click a box to read its source.
        </Hint>
      </div>
    </StageFrame>
  );
}
