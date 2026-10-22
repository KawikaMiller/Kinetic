import { useScenePicker } from '../../components/ScenePicker';
import { JoinScene } from './JoinScene';
import { PipelineScene } from './PipelineScene';
import './styles.css';

type Scene = 'pipelines' | 'join';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pipelines', label: 'Two pipelines, one number' },
  { value: 'join', label: 'Point-in-time join' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pipelines' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'join') return <JoinScene key={scene} picker={picker} />;
  return <PipelineScene key={scene} picker={picker} />;
}
