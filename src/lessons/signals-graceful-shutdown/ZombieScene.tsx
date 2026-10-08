import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { psLines, zombieFrames } from './frames';
import { isZombie, procTable, type ChildCase } from './model';

const CASES: { value: ChildCase; label: string }[] = [
  { value: 'no-reap', label: 'Child exits, never reaped' },
  { value: 'reap', label: 'SIGCHLD handler reaps' },
  { value: 'orphan', label: 'Parent exits first' },
];

export function ZombieScene({ picker }: { picker: ReactNode }) {
  const [c, setC] = useState<ChildCase>('no-reap');
  const frames = useMemo(() => zombieFrames(c), [c]);
  const player = usePlayer(frames, { interval: 1800 });
  const procs = procTable(c, player.frame.step);

  return (
    <StageFrame
      player={player}
      height={300}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'running process' },
            { color: 'var(--dim)', label: 'zombie (dashed): exited, not reaped' },
          ]}
        />
      }
      controls={[picker, <Segmented key="case" label="Case" value={c} onChange={setC} options={CASES} />]}
    >
      <div className="sg stage-pad">
        <ul className="sg-procs" aria-label="Process tree">
          {procs.map((p) => (
            <li key={p.pid} className={isZombie(p) ? 'is-zombie' : ''} style={{ marginLeft: p.pid === 1 ? 0 : p.ppid === 1 ? 24 : 48 }}>
              <b>PID {p.pid}</b> {p.name} <span>parent {p.ppid}</span>
              {isZombie(p) && <i>zombie</i>}
            </li>
          ))}
        </ul>
        <ConsolePanel lines={psLines(c, player.frame.step).map((l) => (l.includes('<defunct>') ? { text: l, tone: 'dim' as const } : l))} title="ps output" />
        <Hint block>A simulated process table. A zombie uses no memory or CPU, only its PID and exit status, until its parent calls wait().</Hint>
      </div>
    </StageFrame>
  );
}
