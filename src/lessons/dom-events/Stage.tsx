import { useScenePicker } from '../../components/ScenePicker';
import { Delegation } from './Delegation';
import { Propagation } from './Propagation';
import './styles.css';

const SCENES = [
  { value: 'propagation' as const, label: 'Capture & bubble' },
  { value: 'delegation' as const, label: 'Delegation' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'propagation' });
  return scene === 'propagation' ? <Propagation picker={picker} /> : <Delegation picker={picker} />;
}
