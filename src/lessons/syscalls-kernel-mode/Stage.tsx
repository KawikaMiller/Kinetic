import { useMemo, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Stat, Stats } from '../../components/ui';
import { latency } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { BatchScene } from './BatchScene';
import { privFrames, readFrames } from './frames';
import { crossings, HONESTY, KERNEL_PATH, PRIV_STEPS, READ_STEPS, totalNs, WRAPPER } from './model';
import { SorterScene } from './SorterScene';
import { Wall, WALL_W } from './Wall';
import './styles.css';

const STEP_MS = 1700;
/** Smallest wall text: the 10px node subtitles. */
const WALL_TEXT_PX = 10;

type Scene = 'read' | 'priv' | 'batch' | 'sort';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'read', label: 'read() step by step' },
      { value: 'priv', label: 'Privileged instruction' },
      { value: 'batch', label: 'Batching' },
      { value: 'sort', label: 'What traps?' },
    ],
    initial: 'read',
  });
  if (scene === 'batch') return <BatchScene picker={picker} />;
  if (scene === 'sort') return <SorterScene picker={picker} />;
  return <CallScene key={scene} picker={picker} privileged={scene === 'priv'} />;
}

function CallScene({ picker, privileged }: { picker: ReactNode; privileged: boolean }) {
  const steps = privileged ? PRIV_STEPS : READ_STEPS;
  const frames = useMemo(() => (privileged ? privFrames() : readFrames()), [privileged]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const i = player.frame.i;
  const step = steps[i];
  const spent = totalNs(steps, i);
  const max = totalNs(steps);
  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Mode" value={`ring ${step.ring}`} color={step.ring === 0 ? 'var(--violet)' : 'var(--info)'} sub={step.ring === 0 ? 'kernel' : 'user'} />
          <Stat label="Crossings" value={crossings(steps, i)} />
          <Stat label="Cost so far" value={latency(spent)} sub="illustrative">
            <Bar value={spent} max={max} tone="hi" height={6} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now', shape: 'square' },
            { color: 'var(--info)', label: 'user band / crossing call', shape: 'square' },
            { color: 'var(--violet)', label: 'kernel band', shape: 'square' },
            ...(privileged ? [{ color: 'var(--bad)', label: 'fault', shape: 'square' as const }] : []),
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="sk stage-pad">
        <WideRegion minWidth={minWidthForText(WALL_W, WALL_TEXT_PX)} label="User/kernel wall: scroll sideways to see all of it">
          <Wall step={step} index={i} privileged={privileged} />
        </WideRegion>
        <Hint block>{HONESTY}</Hint>
        {privileged ? (
          <ConsolePanel title="terminal" lines={step.killed ? ['$ ./app', { text: 'Segmentation fault (core dumped)', tone: 'bad' }] : ['$ ./app']} />
        ) : (
          <div className="sk-code">
            <CodePanel title="libc wrapper (x86-64)" lines={WRAPPER} active={step.wrapperLine ?? undefined} />
            <CodePanel title="kernel path (simplified)" lines={KERNEL_PATH} active={step.kernelLines.length ? step.kernelLines : undefined} />
            <Box className="sk-regs" role="group" aria-label="Registers">
              <SectionTitle>Registers</SectionTitle>
              {(['rax', 'rdi', 'rsi', 'rdx'] as const).map((r) => (
                <div key={r} className="sk-reg">
                  <span className="sk-reg-name">{r}</span>
                  <span className="sk-reg-value">{step.regs[r]}</span>
                </div>
              ))}
              <p className="sk-reg-note">rax: syscall number in, result out</p>
            </Box>
          </div>
        )}
      </div>
    </StageFrame>
  );
}
