import { useScenePicker } from '../../components/ScenePicker';
import { LayersScene } from './LayersScene';
import { PrivilegeScene } from './PrivilegeScene';
import './styles.css';

type Scene = 'layers' | 'privilege';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'layers', label: '① Defense in depth' },
  { value: 'privilege', label: '② Least privilege' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'layers' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  return scene === 'privilege' ? <PrivilegeScene picker={picker} /> : <LayersScene picker={picker} />;
}
