import { useScenePicker } from '../../components/ScenePicker';
import { BisectScene } from './BisectScene';
import { PipelineScene } from './PipelineScene';
import './styles.css';

type Scene = 'pipeline' | 'bisect';

const SCENES = [
  { value: 'pipeline' as const, label: 'Probe the pipeline' },
  { value: 'bisect' as const, label: 'git bisect' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pipeline' });
  return scene === 'bisect' ? <BisectScene picker={picker} /> : <PipelineScene picker={picker} />;
}
