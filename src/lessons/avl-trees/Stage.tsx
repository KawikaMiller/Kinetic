import { useScenePicker } from '../../components/ScenePicker';
import { CompareScene } from './CompareScene';
import { DeleteScene } from './DeleteScene';
import { PickScene } from './PickScene';
import { RepairScene } from './RepairScene';
import { WorstScene } from './WorstScene';
import './styles.css';

type Scene = 'compare' | 'repair' | 'pick' | 'delete' | 'worst';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'compare', label: 'Plain vs AVL' },
  { value: 'repair', label: 'Step the repair' },
  { value: 'pick', label: 'You pick the rotation' },
  { value: 'delete', label: 'Delete and the cost' },
  { value: 'worst', label: 'The worst case' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'compare' });
  if (scene === 'repair') return <RepairScene picker={picker} />;
  if (scene === 'pick') return <PickScene picker={picker} />;
  if (scene === 'delete') return <DeleteScene picker={picker} />;
  if (scene === 'worst') return <WorstScene picker={picker} />;
  return <CompareScene picker={picker} />;
}
