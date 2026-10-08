import { useScenePicker } from '../../components/ScenePicker';
import { DeserScene } from './DeserScene';
import { PathScene } from './PathScene';
import './styles.css';

type Scene = 'path' | 'deser';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'path', label: '① When input picks the file' },
  { value: 'deser', label: '② When input picks the type' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'path' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  return scene === 'deser' ? <DeserScene picker={picker} /> : <PathScene picker={picker} />;
}
