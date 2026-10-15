import { useScenePicker } from '../../components/ScenePicker';
import { AvailabilityScene } from './AvailabilityScene';
import { SetsScene } from './SetsScene';
import { StoreScene } from './StoreScene';
import './styles.css';

type Scene = 'sets' | 'availability' | 'store';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sets', label: 'Make the sets overlap' },
  { value: 'availability', label: 'Failures and latency' },
  { value: 'store', label: 'Not the same as linearizable' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'sets' });
  if (scene === 'availability') return <AvailabilityScene picker={picker} />;
  if (scene === 'store') return <StoreScene picker={picker} />;
  return <SetsScene picker={picker} />;
}
