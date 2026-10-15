import { useScenePicker } from '../../components/ScenePicker';
import { CompareScene } from './CompareScene';
import { DrawScene } from './DrawScene';
import { RegisterScene } from './RegisterScene';
import { useExecution } from './useExecution';
import './styles.css';

type Scene = 'draw' | 'compare' | 'register';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'draw', label: 'Draw an execution' },
  { value: 'compare', label: 'Before, or concurrent?' },
  { value: 'register', label: 'Use it: a replicated register' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'draw' });
  // The drawing lives here so scene 2 compares the events scene 1 drew.
  const exec = useExecution();
  if (scene === 'compare') return <CompareScene picker={picker} exec={exec} />;
  if (scene === 'register') return <RegisterScene picker={picker} />;
  return <DrawScene picker={picker} exec={exec} />;
}
