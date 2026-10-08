import type { ReactNode } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { SIGNALS } from './model';
import { ShutdownScene } from './ShutdownScene';
import { ZombieScene } from './ZombieScene';
import './styles.css';

type Scene = 'shutdown' | 'zombies' | 'table';

function SignalTable({ picker }: { picker: ReactNode }) {
  useIntroCaption(<>The signals you meet when running services. SIGKILL and SIGSTOP are the two a process can never catch, block or ignore.</>);
  return (
    <StageFrame
      height={300}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'can be caught' },
            { color: 'var(--bad)', label: 'cannot be caught or ignored' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="sg stage-pad">
        <WideRegion minWidth={520} label="Signal table: scroll sideways to see all of it">
          <table className="data-table sg-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>No.</th>
                <th>Default</th>
                <th>Catchable</th>
                <th>Typical use</th>
              </tr>
            </thead>
            <tbody>
              {SIGNALS.map((s) => (
                <tr key={s.name}>
                  <td>
                    <code>{s.name}</code>
                  </td>
                  <td>{s.number}</td>
                  <td>{s.action}</td>
                  <td className={s.catchable ? 'is-yes' : 'is-no'}>{s.catchable ? 'yes' : 'no'}</td>
                  <td>{s.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>
          Numbers are for x86 and ARM Linux, from <code>signal(7)</code>; Alpha, SPARC and MIPS number SIGCHLD and SIGSTOP differently. In a C handler, only call
          async-signal-safe functions: the usual pattern is to set a flag and let the main loop do the shutdown.
        </Hint>
      </div>
    </StageFrame>
  );
}

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'shutdown', label: 'Deploy shutdown' },
      { value: 'zombies', label: 'Children & zombies' },
      { value: 'table', label: 'Signal table' },
    ],
    initial: 'shutdown',
  });
  if (scene === 'zombies') return <ZombieScene picker={picker} />;
  if (scene === 'table') return <SignalTable picker={picker} />;
  return <ShutdownScene picker={picker} />;
}
