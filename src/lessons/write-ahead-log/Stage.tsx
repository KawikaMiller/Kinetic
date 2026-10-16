import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { CrashScene } from './CrashScene';
import { MachineScene } from './MachineScene';
import './styles.css';

type Scene = 'machine' | 'crash' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'machine', label: 'The machine' },
  { value: 'crash', label: 'Crash anywhere, then recover' },
  { value: 'cost', label: 'Cost: group commit and checkpoints' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'machine' });
  if (scene === 'crash') return <CrashScene key={scene} picker={picker} />;
  if (scene === 'cost') return <CostScene key={scene} picker={picker} />;
  return <MachineScene key={scene} picker={picker} />;
}
