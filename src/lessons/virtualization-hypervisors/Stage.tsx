import { useScenePicker } from '../../components/ScenePicker';
import { MemoryScene } from './MemoryScene';
import { OvercommitScene } from './OvercommitScene';
import { StacksScene } from './StacksScene';
import { TrapScene } from './TrapScene';
import './styles.css';

type Scene = 'stacks' | 'trap' | 'memory' | 'overcommit';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'trap', label: 'Trap & emulate' },
      { value: 'stacks', label: 'Stacks' },
      { value: 'memory', label: 'Memory & I/O' },
      { value: 'overcommit', label: 'Overcommit' },
    ],
    initial: 'trap',
  });
  if (scene === 'stacks') return <StacksScene picker={picker} />;
  if (scene === 'memory') return <MemoryScene picker={picker} />;
  if (scene === 'overcommit') return <OvercommitScene picker={picker} />;
  return <TrapScene picker={picker} />;
}
