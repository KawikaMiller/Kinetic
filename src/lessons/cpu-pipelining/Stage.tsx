import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { AnimatedValue } from '../../components/AnimatedValue';
import { minWidthForText } from '../../core/scale';
import { toneVar } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { Chart } from './Chart';
import { chartWidth, rowLabel, STAGE_TONE } from './chartLayout';
import { pipeFrames } from './frames';
import { cpi, firstCycle, formatInstr, HONESTY, parseProgram, PRESETS, presetById, reads, STAGES, swapBlocker, swapped, writes, type Instr, type PipelineOptions, type PresetId } from './model';
import './styles.css';

const STEP_MS = 1100;
/** Smallest chart text: the 10px row and cycle labels. */
const CHART_TEXT_PX = 10;
/** The spec's floor for the chart's scroller on a phone. */
const CHART_MIN_WIDTH = 560;
/** Hazards only bite within this many instructions in a 5-stage pipe. */
const HAZARD_WINDOW = 2;

/** Source registers that read a result from one of the previous two instructions. */
function dependentRegs(program: readonly Instr[], i: number): number[] {
  const near = program.slice(Math.max(0, i - HAZARD_WINDOW), i).flatMap(writes);
  return reads(program[i]).filter((r) => near.includes(r));
}

function renderWithDeps(program: readonly Instr[], line: string, i: number): ReactNode {
  const deps = dependentRegs(program, i);
  if (!deps.length) return line;
  // the first register of an ALU op or load is its destination, not a dependency
  let seenDest = !writes(program[i]).length;
  return (
    <>
      {line.split(/\b(r[0-7])\b/).map((p, k) => {
        const m = /^r([0-7])$/.exec(p);
        if (!m) return <span key={k}>{p}</span>;
        if (!seenDest) {
          seenDest = true;
          return <span key={k}>{p}</span>;
        }
        return deps.includes(Number(m[1])) ? <span key={k} className="pl-dep">{p}</span> : <span key={k}>{p}</span>;
      })}
    </>
  );
}

export function Stage() {
  const [presetId, setPresetId] = useState<PresetId>('raw');
  const preset = presetById(presetId);
  const [opts, setOpts] = useState<PipelineOptions>(preset.opts);
  const [pipelined, setPipelined] = useState(true);
  const [program, setProgram] = useState<Instr[]>(() => parseProgram(preset.lines));
  const [selected, setSelected] = useState<number | null>(null);

  const load = (id: PresetId) => {
    const p = presetById(id);
    setPresetId(id);
    setOpts(p.opts);
    setProgram(parseProgram(p.lines));
    setSelected(null);
  };

  const { run, frames } = useMemo(() => {
    const mode = pipelined ? (
      <>
        Forwarding {opts.forwarding ? 'on' : 'off'}, {opts.memPorts === 1 ? 'one memory port shared by IF and MEM' : 'separate instruction and data memories'}.
      </>
    ) : (
      <>Not pipelined: one instruction at a time.</>
    );
    return pipeFrames(program, preset.start, opts, pipelined, <>{preset.intro} {mode} Press play to step through the cycles.</>);
  }, [program, preset, opts, pipelined]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const cycle = player.frame.cycle;

  const lineState = (i: number): LineState => {
    const row = run.rows.findLast((r) => r.pc === i);
    if (!row || cycle === 0) return 'idle';
    if (row.flushedAt !== null && row.flushedAt <= cycle) return 'cut';
    if (row.cells[cycle]?.kind === 'stage') return 'now';
    const wb = firstCycle(row, 'WB');
    return wb !== null && wb < cycle ? 'done' : 'idle';
  };

  const move = (dir: -1 | 1) => {
    if (selected === null) return;
    const at = dir === -1 ? selected - 1 : selected;
    const next = swapped(program, at);
    if (!next) return;
    setProgram(next);
    setSelected(selected + dir);
  };
  const blocker = (dir: -1 | 1): string | null => {
    if (selected === null) return 'pick an instruction first';
    const a = dir === -1 ? selected - 1 : selected;
    if (a < 0 || a + 1 >= program.length) return dir === -1 ? 'already at the top' : 'already at the bottom';
    return swapBlocker(program[a], program[a + 1]);
  };
  const up = blocker(-1);
  const down = blocker(1);
  const reorder = presetId === 'reorder';
  const original = parseProgram(preset.lines);
  const reordered = program.some((p, i) => p.text !== original[i].text);
  const stalls = run.result ? run.result.stalls.data + run.result.stalls.port : 0;
  const labels = run.rows.map((r) => rowLabel(program, r));

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Total cycles" value={<AnimatedValue value={run.totalCycles} />} sub={pipelined ? `not pipelined: ${run.unpipelinedCycles}` : 'not pipelined'} />
          <Stat label="CPI" value={cpi(run.totalCycles, run.committed).toFixed(2)} sub={`${run.committed} instructions`} />
          <Stat label="Stall cycles" value={stalls} />
          <Stat label="Flush cycles" value={run.result?.flushes ?? 0} color={run.result?.flushes ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...STAGES.map((s) => ({ color: toneVar(STAGE_TONE[s]), label: s, shape: 'square' as const })),
            { color: 'var(--dim)', label: 'stall (hatched)', shape: 'square' },
            { color: 'var(--bad)', label: 'flushed', shape: 'square' },
            { color: 'var(--info)', label: 'forwarded value', shape: 'line' },
            { color: 'var(--hi)', label: 'this cycle', shape: 'square' },
          ]}
        />
      }
      controls={[
        <Segmented key="p" label="Program" value={presetId} onChange={load} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />,
        <>
          <Toggle label="Pipelining" value={pipelined} onChange={setPipelined} off="One at a time" on="Pipelined" />
          <Toggle label="Forwarding" value={opts.forwarding} onChange={(v) => setOpts({ ...opts, forwarding: v })} off="Off" on="On" />
          <Toggle label="Memory" value={opts.memPorts === 1} onChange={(v) => setOpts({ ...opts, memPorts: v ? 1 : 2 })} off="Split I/D" on="One shared port" />
        </>,
        ...(reorder
          ? [
              <ControlGroup key="r" label="Reorder" inline className="pl-reorder">
                <Button onClick={() => move(-1)} disabled={!!up} title={up ?? undefined}>
                  Move up
                </Button>
                <Button onClick={() => move(1)} disabled={!!down} title={down ?? undefined}>
                  Move down
                </Button>
                <Button onClick={() => load('reorder')} disabled={!reordered}>
                  Reset order
                </Button>
                <span className="pl-why" role="status" aria-live="polite">
                  {selected === null ? 'Click a line of the program to pick it.' : up && down ? `Can't move this one: ${up === 'already at the top' ? down : up}.` : `Picked: ${formatInstr(program[selected])}`}
                </span>
              </ControlGroup>,
            ]
          : []),
      ]}
    >
      <div className="pl stage-pad">
        <CodePanel
          title={reorder ? 'program · click a line to pick it, then move it' : 'program (MIPS-style)'}
          lines={program.map(formatInstr)}
          stateOf={(i) => (reorder && i === selected ? 'next' : lineState(i))}
          renderLine={(line, i) => renderWithDeps(program, line, i)}
          {...(reorder && {
            onLineClick: (i: number) => setSelected(i),
            pressed: (i: number) => i === selected,
            lineLabel: (i: number) => `Pick ${formatInstr(program[i])}`,
          })}
        />
        <WideRegion minWidth={Math.max(CHART_MIN_WIDTH, minWidthForText(chartWidth(labels, run.totalCycles), CHART_TEXT_PX))} label="Pipeline chart: scroll sideways to see every cycle">
          <Chart run={run} program={program} cycle={cycle} />
        </WideRegion>
        <Hint block>{HONESTY}</Hint>
      </div>
    </StageFrame>
  );
}
