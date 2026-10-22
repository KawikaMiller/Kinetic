import { useScenePicker } from '../../components/ScenePicker';
import { BoundScene } from './BoundScene';
import { BurstScene } from './BurstScene';
import { ExecScene } from './ExecScene';
import './styles.css';

type Scene = 'exec' | 'burst' | 'bound';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'exec', label: 'Edit an execution' },
  { value: 'burst', label: 'Why the counter' },
  { value: 'bound', label: 'How close to real time' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'exec' });
  if (scene === 'burst') return <BurstScene key="burst" picker={picker} />;
  if (scene === 'bound') return <BoundScene key="bound" picker={picker} />;
  return <ExecScene key="exec" picker={picker} />;
}
