import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { PathScene } from './PathScene';
import { VersionsScene } from './VersionsScene';
import './styles.css';

type Scene = 'path' | 'broken' | 'cost' | 'versions';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'path', label: 'Path copying' },
  { value: 'broken', label: 'Mutate in place' },
  { value: 'cost', label: 'What it costs' },
  { value: 'versions', label: 'Branches, undo, garbage' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'path' });
  if (scene === 'broken') return <PathScene key="broken" picker={picker} broken />;
  if (scene === 'cost') return <CostScene picker={picker} />;
  if (scene === 'versions') return <VersionsScene picker={picker} />;
  return <PathScene key="path" picker={picker} broken={false} />;
}
