import { useScenePicker } from '../../components/ScenePicker';
import { ContrastScene } from './ContrastScene';
import { FormScene } from './FormScene';
import './styles.css';

const SCENES = [
  { value: 'form' as const, label: 'Form & screen reader' },
  { value: 'contrast' as const, label: 'Contrast & colour' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'form' });
  return scene === 'form' ? <FormScene picker={picker} /> : <ContrastScene picker={picker} />;
}
