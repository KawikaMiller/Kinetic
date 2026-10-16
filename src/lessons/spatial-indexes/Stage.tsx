import { useScenePicker } from '../../components/ScenePicker';
import { ChooseScene } from './ChooseScene';
import { GeohashScene } from './GeohashScene';
import { KdScene } from './KdScene';
import { ProblemScene } from './ProblemScene';
import { QuadScene } from './QuadScene';
import type { SceneId } from './opening';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'problem', label: 'The problem' },
  { value: 'kd', label: 'k-d tree' },
  { value: 'quad', label: 'Quadtree' },
  { value: 'geohash', label: 'Geohash' },
  { value: 'choose', label: 'Which one, and where it stops' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: 'problem' });
  if (scene === 'kd') return <KdScene key="kd" picker={picker} />;
  if (scene === 'quad') return <QuadScene key="quad" picker={picker} />;
  if (scene === 'geohash') return <GeohashScene key="geohash" picker={picker} />;
  if (scene === 'choose') return <ChooseScene key="choose" picker={picker} />;
  return <ProblemScene key="problem" picker={picker} />;
}
