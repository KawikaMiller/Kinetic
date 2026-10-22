import { useScenePicker } from '../../components/ScenePicker';
import { ClipScene } from './ClipScene';
import { DepthScene } from './DepthScene';
import { FrustumScene } from './FrustumScene';
import { PointScene } from './PointScene';
import './styles.css';

type Scene = 'point' | 'frustum' | 'clip' | 'depth';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'point', label: 'One vertex' },
  { value: 'frustum', label: 'Camera and frustum' },
  { value: 'clip', label: 'Clipping' },
  { value: 'depth', label: 'Depth precision' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'point' });
  if (scene === 'frustum') return <FrustumScene key={scene} picker={picker} />;
  if (scene === 'clip') return <ClipScene key={scene} picker={picker} />;
  if (scene === 'depth') return <DepthScene key={scene} picker={picker} />;
  return <PointScene key={scene} picker={picker} />;
}
