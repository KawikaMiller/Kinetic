import { useMemo, useState } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { ms, pct } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { byName, profileFrames } from './frames';
import { FlameView } from './FlameView';
import { HOT_LEAF, NO_FIXES, SAMPLE_STEPS, cpuTime, foldStacks, margin95, wallTime, type Fixes, type FlameNode } from './model';
import { laneBars, type Mode } from './view';
import './styles.css';

const STEP_MS = 450;
const WIDE = 480;
const DEFAULT_SELECTED = 'all;handleRequest;renderPage';

export function Stage() {
  const [fixes, setFixes] = useState<Fixes>(NO_FIXES);
  const [stepIndex, setStepIndex] = useState(5);
  const [seed, setSeed] = useState(1);
  const [mode, setMode] = useState<Mode>('graph');
  const [icicle, setIcicle] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(DEFAULT_SELECTED);
  const n = SAMPLE_STEPS[stepIndex];

  const { frames, samples, segs } = useMemo(() => profileFrames(fixes, n, seed), [fixes, n, seed]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const shown = useMemo(() => samples.slice(0, f.shown), [samples, f.shown]);
  const root = useMemo(() => foldStacks(shown), [shown]);

  const names = useMemo(() => [...new Set(segs.flatMap((s) => s.stack))], [segs]);
  const bars = useMemo(() => laneBars(segs, names), [segs, names]);
  const optimised = new Set([fixes.hoist && 'formatPrice', fixes.fastJson && 'parseJson'].filter((x): x is string => !!x));

  const findNode = (id: string): FlameNode | null => {
    const walk = (node: FlameNode): FlameNode | null => (node.id === id ? node : node.children.map(walk).find(Boolean) ?? null);
    return walk(root);
  };
  const sel = findNode(selected);
  const hot = byName(root, HOT_LEAF);
  const hotShare = f.shown ? hot.self / f.shown : 0;

  const select = (node: FlameNode) => {
    setSelected(node.id);
    setZoom(node.id === 'all' ? null : node.id);
  };
  const toggleFix = (k: keyof Fixes) => {
    setFixes({ ...fixes, [k]: !fixes[k] });
    setZoom(null);
  };

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat
            label="Samples"
            value={`${f.shown} of ${n}`}
            color="var(--info)"
            sub={f.shown ? `${HOT_LEAF} ${pct(hotShare)} ±${Math.round(margin95(hotShare, f.shown) * 100)} pts` : 'none yet'}
          />
          <Stat label="On-CPU time" value={ms(cpuTime(segs))} color={fixes.hoist || fixes.fastJson ? 'var(--ok)' : 'var(--muted)'} sub="modelled, per request" />
          <Stat label="Wall time" value={ms(wallTime(segs))} color="var(--muted)" sub="includes the database wait" />
          {sel && sel.id !== 'all' && f.shown > 0 && (
            <Stat label={<span className="keep-case">{sel.name}</span>} value={`${pct(sel.total / f.shown)} total`} color="var(--hi)" sub={`${pct(sel.self / f.shown)} self (its own code)`} />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--pink)', label: 'frames: a colour per function', shape: 'square' },
            { color: 'var(--hi)', label: 'selected / zoomed', shape: 'square' },
            { color: 'var(--info)', label: 'just sampled (outline)', shape: 'square' },
            { color: 'var(--ok)', label: 'optimised', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          <Toggle label="View" value={mode === 'chart'} onChange={(v) => setMode(v ? 'chart' : 'graph')} off="Flame graph" on="Time order" />
          <Toggle label="Orientation" value={icicle} onChange={setIcicle} off="Flame (root at bottom)" on="Icicle (root at top)" />
          {zoom && <Button onClick={() => setZoom(null)}>Zoom out</Button>}
        </>,
        <>
          <Slider label="Samples" value={stepIndex} min={0} max={SAMPLE_STEPS.length - 1} onChange={setStepIndex} format={(i) => String(SAMPLE_STEPS[i])} />
          <ChipButton tone="info" size="md" onClick={() => setSeed(seed + 1)}>
            Seed {seed}: sample again
          </ChipButton>
        </>,
        <ControlGroup key="fix" label="Optimise">
          <ChipButton tone="ok" on={fixes.hoist} onStyle="solid" onClick={() => toggleFix('hoist')}>
            formatPrice: hoist the formatter
          </ChipButton>
          <ChipButton tone="ok" on={fixes.fastJson} onStyle="solid" onClick={() => toggleFix('fastJson')}>
            parseJson: faster parser
          </ChipButton>
        </ControlGroup>,
      ]}
    >
      <div className="pf stage-pad">
        <div>
          <SectionTitle hint={mode === 'graph' ? 'x = share of samples, merged and sorted by name: not time' : 'x = time, one column per sample'}>
            {mode === 'graph' ? 'Flame graph' : 'Flame chart (time order)'}
          </SectionTitle>
          <WideRegion minWidth={WIDE} label="Flame graph: scroll sideways to see all of it">
            <FlameView samples={shown} mode={mode} icicle={icicle} zoom={zoom} selected={selected} latest={f.latest} optimised={optimised} onSelect={select} />
          </WideRegion>
        </div>
        <div>
          <SectionTitle hint="what really ran, in time order (dashed: waiting off the CPU)">One request</SectionTitle>
          <WideRegion minWidth={WIDE} label="Timeline: scroll sideways to see all of it">
            <GanttLanes
              lanes={names.map((name) => ({ id: name, label: name }))}
              bars={bars}
              domain={[0, wallTime(segs)]}
              now={f.latest?.at}
              unit=" ms"
              axis
              size="sm"
              labelWidth={128}
              ariaLabel="When each function was on the stack during one request"
            />
          </WideRegion>
        </div>
        <Hint block>
          A simulated program and profiler: the durations are illustrative, and the samples are seeded, one per equal slice of CPU time with random
          jitter. Real profilers (perf, pprof, Chrome DevTools) sample the same way, across many requests. The ± is a rough 95% margin for the hot leaf's
          share. Click a frame to zoom in.
        </Hint>
      </div>
    </StageFrame>
  );
}
