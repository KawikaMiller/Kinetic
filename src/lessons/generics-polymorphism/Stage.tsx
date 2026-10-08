import { useScenePicker } from '../../components/ScenePicker';
import { BoxScene } from './BoxScene';
import { StampScene } from './StampScene';
import { VarianceScene } from './VarianceScene';
import './styles.css';

const SCENES = [
  { value: 'box', label: 'Why generics' },
  { value: 'stamp', label: 'Erasure vs copies' },
  { value: 'variance', label: 'Variance' },
] as const;

type Scene = (typeof SCENES)[number]['value'];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: [...SCENES], initial: 'box' });
  if (scene === 'stamp') return <StampScene picker={picker} />;
  if (scene === 'variance') return <VarianceScene picker={picker} />;
  return <BoxScene picker={picker} />;
}
