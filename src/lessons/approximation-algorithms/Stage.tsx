import { useScenePicker } from '../../components/ScenePicker';
import { StarScene } from './StarScene';
import { TourScene } from './TourScene';
import { VcScene } from './VcScene';
import './styles.css';

type Scene = 'cover' | 'tour' | 'star';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'cover', label: 'Vertex cover' },
  { value: 'tour', label: 'Metric tour' },
  { value: 'star', label: 'Break the metric' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'cover' });
  if (scene === 'tour') return <TourScene key="tour" picker={picker} />;
  if (scene === 'star') return <StarScene key="star" picker={picker} />;
  return <VcScene key="cover" picker={picker} />;
}
