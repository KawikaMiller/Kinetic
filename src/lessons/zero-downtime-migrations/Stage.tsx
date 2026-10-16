import { useScenePicker } from '../../components/ScenePicker';
import { ClocksScene } from './ClocksScene';
import { LocksScene } from './LocksScene';
import { MigrationScene } from './MigrationScene';
import './styles.css';

type Scene = 'migration' | 'clocks' | 'locks';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'migration', label: 'The six steps' },
  { value: 'clocks', label: 'Two clocks' },
  { value: 'locks', label: 'Locks and batches' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'migration' });
  if (scene === 'clocks') return <ClocksScene key={scene} picker={picker} />;
  if (scene === 'locks') return <LocksScene key={scene} picker={picker} />;
  return <MigrationScene key={scene} picker={picker} />;
}
