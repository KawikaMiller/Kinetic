import { useScenePicker } from '../../components/ScenePicker';
import { SchedScene } from './SchedScene';
import './styles.css';

type Scene = 'scheduler' | 'pathfinder';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'scheduler', label: 'The scheduler' },
  { value: 'pathfinder', label: 'Mars Pathfinder, simplified' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'scheduler' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'pathfinder') return <SchedScene key={scene} variant="pathfinder" picker={picker} />;
  return <SchedScene key={scene} variant="generic" picker={picker} />;
}
