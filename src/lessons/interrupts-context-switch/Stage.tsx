import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { GANTT_MIN_W, TimelineLegend } from './common';
import { CostScene } from './CostScene';
import { switchFrames } from './frames';
import { switchScript, type SwitchKind } from './model';
import { RegisterCards } from './RegisterCards';
import { SourcesScene } from './SourcesScene';
import { toBars } from './view';
import './styles.css';

const STEP_MS = 1500;

type Scene = 'switch' | 'sources' | 'cost';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'switch', label: 'Context switch' },
      { value: 'sources', label: 'Interrupt sources' },
      { value: 'cost', label: 'Cost' },
    ],
    initial: 'switch',
  });
  if (scene === 'sources') return <SourcesScene picker={picker} />;
  if (scene === 'cost') return <CostScene picker={picker} />;
  return <SwitchScene picker={picker} />;
}

function SwitchScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<SwitchKind>('involuntary');
  const [sameProcess, setSameProcess] = useState(true);
  const sc = useMemo(() => switchScript(kind, sameProcess), [kind, sameProcess]);
  const frames = useMemo(() => switchFrames(sc, kind), [sc, kind]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const step = sc.steps[player.frame.i];
  const switches = sc.steps.slice(0, player.frame.i + 1).filter((s) => s.phase === 'load').length;

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Clock" value={`${Number(step.t.toFixed(2))} ms`} sub="illustrative" />
          <Stat label="Context switches" value={switches} color="var(--violet)" />
        </Stats>
      }
      legend={<TimelineLegend />}
      controls={[
        picker,
        <>
          <Toggle label="Why A or B stops" value={kind === 'voluntary'} onChange={(v) => setKind(v ? 'voluntary' : 'involuntary')} off="Timer tick" on="Blocks on I/O" />
          <Toggle label="B is" value={!sameProcess} onChange={(v) => setSameProcess(!v)} off="A thread of editor" on="Another process" />
        </>,
      ]}
    >
      <div className="ics stage-pad">
        <WideRegion minWidth={GANTT_MIN_W} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={[
              { id: 'A', label: `A · ${sc.threads.A.process}` },
              { id: 'B', label: `B · ${sc.threads.B.process}` },
              { id: 'kernel', label: 'kernel' },
            ]}
            bars={toBars(sc.segments, step.t)}
            domain={[0, sc.end]}
            now={step.t}
            axis
            unit=" ms"
            size="md"
            labelWidth={96}
            ariaLabel={`Timeline up to ${Number(step.t.toFixed(2))} ms`}
          />
        </WideRegion>
        <Hint block>
          Illustrative 4 ms tick (HZ = 250). Kernel work is drawn far wider than to scale: real handlers and switches take microseconds. A real kernel also saves more state (FPU and vector
          registers) and may skip ticks when idle.
        </Hint>
        <RegisterCards step={step} sc={sc} />
      </div>
    </StageFrame>
  );
}
