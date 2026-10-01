import { useScenePicker } from '../../components/ScenePicker';
import { OriginScene } from './OriginScene';
import { RequestScene } from './RequestScene';
import './styles.css';

type Scene = 'origin' | 'requests';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'origin', label: '① What is an origin?' },
  { value: 'requests', label: '② Cross-origin requests' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'origin' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  return scene === 'requests' ? <RequestScene picker={picker} /> : <OriginScene picker={picker} />;
}
