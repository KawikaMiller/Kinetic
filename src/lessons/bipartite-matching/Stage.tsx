import { useScenePicker } from '../../components/ScenePicker';
import { AugmentScene } from './AugmentScene';
import { CostScene } from './CostScene';
import { FlowScene } from './FlowScene';
import { HallScene } from './HallScene';
import { useMatchEditor } from './useMatchEditor';
import './styles.css';

type Scene = 'augment' | 'hall' | 'flow' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'augment', label: 'Greedy vs augmenting' },
  { value: 'hall', label: 'When it cannot be done' },
  { value: 'flow', label: 'As a flow' },
  { value: 'cost', label: 'Costs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'augment' });
  const ed = useMatchEditor(scene);
  if (scene === 'hall') return <HallScene picker={picker} ed={ed} />;
  if (scene === 'flow') return <FlowScene picker={picker} ed={ed} />;
  if (scene === 'cost') return <CostScene picker={picker} />;
  return <AugmentScene picker={picker} ed={ed} />;
}
