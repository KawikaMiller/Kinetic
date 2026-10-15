import { useScenePicker } from '../../components/ScenePicker';
import { LogScene } from './LogScene';
import { PipelineScene } from './PipelineScene';
import './styles.css';

type Scene = 'pipeline' | 'log';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pipeline', label: 'A simulated pipeline' },
  { value: 'log', label: 'Measure it from data' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pipeline' });
  return scene === 'log' ? <LogScene picker={picker} /> : <PipelineScene picker={picker} />;
}
