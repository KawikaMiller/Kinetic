import { useScenePicker } from '../../components/ScenePicker';
import { BillScene } from './BillScene';
import { BytesScene } from './BytesScene';
import { DayScene } from './DayScene';
import './styles.css';

type Scene = 'day' | 'bytes' | 'bill';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'day', label: 'What a day costs' },
  { value: 'bytes', label: 'Moving bytes' },
  { value: 'bill', label: 'Storage tier and the bill' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'day' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'bytes') return <BytesScene key={scene} picker={picker} />;
  if (scene === 'bill') return <BillScene key={scene} picker={picker} />;
  return <DayScene key={scene} picker={picker} />;
}
