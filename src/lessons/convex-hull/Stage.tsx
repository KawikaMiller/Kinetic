import { useScenePicker } from '../../components/ScenePicker';
import { RobustScene } from './RobustScene';
import { StepScene } from './StepScene';
import { TurnScene } from './TurnScene';
import './styles.css';

type Scene = 'turn' | 'graham' | 'chain' | 'float';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'turn', label: 'The turn test' },
  { value: 'graham', label: 'Graham scan' },
  { value: 'chain', label: 'Chain and march' },
  { value: 'float', label: 'When floats lie' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'turn' });
  if (scene === 'graham') return <StepScene key="graham" picker={picker} algos={['graham']} withCounts={false} />;
  if (scene === 'chain') return <StepScene key="chain" picker={picker} algos={['andrew', 'jarvis']} withCounts />;
  if (scene === 'float') return <RobustScene key="float" picker={picker} />;
  return <TurnScene key="turn" picker={picker} />;
}
