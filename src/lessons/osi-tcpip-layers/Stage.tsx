import { useScenePicker } from '../../components/ScenePicker';
import { Diagnose } from './Diagnose';
import { Journey } from './Journey';
import './styles.css';

const SCENES = [
  { value: 'journey', label: 'Follow a request' },
  { value: 'diagnose', label: 'Which layer is broken?' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'journey' });
  return scene === 'journey' ? <Journey picker={picker} /> : <Diagnose picker={picker} />;
}
