import { useScenePicker } from '../../components/ScenePicker';
import { ConstraintsScene } from './ConstraintsScene';
import { LifecycleScene } from './LifecycleScene';
import './styles.css';

type Scene = 'lifecycle' | 'constraints';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'lifecycle', label: 'Lifecycle and the draft' },
  { value: 'constraints', label: 'Phone constraints' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'lifecycle' });
  return scene === 'lifecycle' ? <LifecycleScene picker={picker} /> : <ConstraintsScene picker={picker} />;
}
