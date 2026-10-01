import { useScenePicker } from '../../components/ScenePicker';
import { Refine } from './Refine';
import { SkipReplay } from './SkipReplay';
import './styles.css';

const SCENES = [
  { value: 'refine', label: 'Refine the story' },
  { value: 'skip', label: 'What if we skip this?' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'refine' });
  return scene === 'refine' ? <Refine picker={picker} /> : <SkipReplay picker={picker} />;
}
