import { useScenePicker } from '../../components/ScenePicker';
import { MutationScene } from './MutationScene';
import { PipelineScene } from './PipelineScene';
import { PurityScene } from './PurityScene';
import './styles.css';

type Scene = 'pipeline' | 'purity' | 'mutation';

const SCENES = [
  { value: 'pipeline' as const, label: 'map · filter · reduce' },
  { value: 'purity' as const, label: 'Pure functions' },
  { value: 'mutation' as const, label: 'Mutation' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pipeline' });
  if (scene === 'purity') return <PurityScene picker={picker} />;
  if (scene === 'mutation') return <MutationScene picker={picker} />;
  return <PipelineScene picker={picker} />;
}
