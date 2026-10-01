import { motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { humanDuration, pct } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { SPRING } from '../../core/motion';
import { useSimulation } from '../../core/useSimulation';
import { drawRun, laneHeight } from './draw';
import { BUGS, catches, LAYERS, pGreen, PRESETS, shapeOf, SPEC, suiteSeconds, type Bug, type Counts, type Layer } from './model';
import { emptySuiteCaption, finishedCaption, layerName, resultColor, resultLabel } from './captions';
import { Scenarios } from './Scenarios';
import { advance, createWorld, snapshot, startRun, type RunStats, type World } from './sim';
import './styles.css';

const SHAPE_W = 220;
const SHAPE_BAR_H = 26;
const SHAPE_LABEL_W = 140;
const CANVAS_REF_W = 640;
const BUG_OPTIONS: { value: Bug | 'none'; label: string }[] = [{ value: 'none', label: 'None' }, ...BUGS.map((b) => ({ value: b.id, label: b.label }))];
/** Layers are plain categories, so they take categorical hues: green stays free to mean "caught" and "right". */
const LAYER_VAR: Record<Layer, string> = { unit: 'var(--sky)', integration: 'var(--info)', e2e: 'var(--violet)' };

export function Stage() {
  const [counts, setCounts] = useState<Counts>(PRESETS[0].counts);
  const [bug, setBug] = useState<Bug | 'none'>('none');
  const setCaption = useSetCaption();
  const green = pGreen(counts);
  const seconds = suiteSeconds(counts);

  useIntroCaption(
    <>
      Three layers of tests. <b>Unit</b> tests are fast and never flaky; <b>E2E</b> tests drive a real browser: slow, and they
      sometimes fail for no reason. Press <b>Run the suite</b>, then try the Ice-cream cone.
    </>,
  );

  /** The run whose end we've already narrated, so each run gets one closing caption. */
  const narrated = useRef<World['runs'] | null>(null);
  const narrateEnd = (w: World, s: RunStats) => {
    if (s.running || s.total === 0 || s.done !== s.total || w.runs === narrated.current) return;
    narrated.current = w.runs;
    setCaption(finishedCaption(s));
  };
  const { world, snap, refresh } = useSimulation({
    create: createWorld,
    step: advance,
    snapshot,
    snapshotEvery: 0.15,
    onSnapshot: narrateEnd,
  });
  const { wrapRef, canvasRef, redraw, size } = useCanvas((ctx, w) => drawRun(ctx, w, world(), counts));
  useLoop(redraw, !!snap?.running);

  // New counts or a new bug make the last run meaningless: clear it.
  useEffect(() => {
    const w = world();
    w.runs = [];
    w.running = false;
    refresh();
    redraw();
  }, [counts, bug, world, refresh, redraw]);

  const setLayer = (l: Layer, v: number) => setCounts((c) => ({ ...c, [l]: v }));
  const run = () => {
    const planted = bug === 'none' ? null : bug;
    startRun(world(), counts, planted);
    refresh();
    if (!world().runs.length) {
      setCaption(emptySuiteCaption(planted));
      return;
    }
    setCaption(
      <>
        Running {counts.unit + counts.integration + counts.e2e} tests: unit first, then integration, then E2E. The suite would
        take <span className="hl">{humanDuration(seconds)}</span> on one runner.
      </>,
    );
  };

  const canvasH = laneHeight(counts, size.width || CANVAS_REF_W);

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="Suite time" value={humanDuration(seconds)} color="var(--hi)" sub="illustrative, one runner" />
          <Stat label="P(green)" value={pct(green)} color={green > 0.9 ? 'var(--ok)' : green > 0.6 ? 'var(--hi)' : 'var(--bad)'} sub="when nothing is broken" />
          <Stat label="Last run" value={resultLabel(snap)} color={resultColor(snap)} sub={snap?.runCount ? `run #${snap.runCount}` : 'not run yet'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'unit passed' },
            { color: 'var(--info)', label: 'integration passed' },
            { color: 'var(--violet)', label: 'E2E passed' },
            { color: 'var(--hi)', label: 'flaky failure' },
            { color: 'var(--bad)', label: 'real failure' },
          ]}
        />
      }
      controls={[
        <>
          {LAYERS.map((l) => (
            <Slider key={l} label={`${SPEC[l].label} tests`} value={counts[l]} min={0} max={SPEC[l].max} step={l === 'unit' ? 10 : 1} onChange={(v) => setLayer(l, v)} />
          ))}
        </>,
        <>
          <ControlGroup label="Shapes">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} size="md" on={sameCounts(p.counts, counts)} onClick={() => setCounts(p.counts)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Plant a bug" value={bug} onChange={setBug} options={BUG_OPTIONS} />
          <Button variant="primary" onClick={run} disabled={snap?.running}>
            {snap?.running ? 'Running…' : 'Run the suite'}
          </Button>
        </>,
        <Hint key="note">Illustrative timings and flake rates: unit 0.01 s and never flaky, integration 0.5 s at 0.2%, E2E 20 s at 1.5%.</Hint>,
      ]}
    >
      <div className="tpy stage-pad">
        <div className="tpy-top">
          <ShapePreview counts={counts} />
          <BugsPanel counts={counts} />
        </div>
        <div ref={wrapRef} className="canvas-wrap tpy-run" style={{ '--h': `${canvasH}px` } as CSSProperties}>
          <canvas ref={canvasRef} />
        </div>
        <Scenarios />
      </div>
    </StageFrame>
  );
}

function sameCounts(a: Counts, b: Counts) {
  return LAYERS.every((l) => a[l] === b[l]);
}

function ShapePreview({ counts }: { counts: Counts }) {
  const shape = shapeOf(counts);
  const width = (l: Layer) => Math.max(10, Math.sqrt(counts[l] / SPEC[l].max) * SHAPE_W);
  const rows: Layer[] = ['e2e', 'integration', 'unit'];
  return (
    <Box variant="sunken" className="tpy-shape">
      <SectionTitle hint="E2E on top, unit at the base">Shape: {shape}</SectionTitle>
      <svg viewBox={`0 0 ${SHAPE_W + SHAPE_LABEL_W} ${rows.length * (SHAPE_BAR_H + 6)}`} className="tpy-shape-svg" role="img" aria-label={`Test suite shape: ${shape}`}>
        {rows.map((l, i) => (
          <g key={l}>
            <motion.rect
              y={i * (SHAPE_BAR_H + 6)}
              height={SHAPE_BAR_H}
              rx={5}
              fill={LAYER_VAR[l]}
              initial={false}
              animate={{ width: width(l), x: (SHAPE_W - width(l)) / 2 }}
              transition={SPRING.soft}
            />
            <text x={SHAPE_W + 8} y={i * (SHAPE_BAR_H + 6) + SHAPE_BAR_H / 2 + 4} className="tpy-shape-label">
              {counts[l]} {SPEC[l].label.toLowerCase()}
            </text>
          </g>
        ))}
      </svg>
    </Box>
  );
}

function BugsPanel({ counts }: { counts: Counts }) {
  return (
    <Box variant="sunken" className="tpy-bugs">
      <SectionTitle hint="the cheapest layer that can see it">Planted bugs</SectionTitle>
      <ul>
        {BUGS.map((b) => {
          const ok = catches(counts, b.id);
          return (
            <li key={b.id} className={ok ? 'is-caught' : 'is-missed'}>
              <b>{b.label}</b> <span>({b.example})</span>
              <em>{ok ? `caught by ${layerName(b.layer)} tests` : `slips through: no ${layerName(b.layer)} tests`}</em>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}
