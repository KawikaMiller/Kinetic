import { useScenePicker } from '../../components/ScenePicker';
import { FanoutScene } from './FanoutScene';
import { HedgeScene } from './HedgeScene';
import { HurtScene } from './HurtScene';
import './styles.css';

type Scene = 'fanout' | 'hedge' | 'hurt';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'fanout', label: 'Fan-out' },
  { value: 'hedge', label: 'Hedged requests' },
  { value: 'hurt', label: 'When hedging hurts' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'fanout' });
  if (scene === 'hedge') return <HedgeScene picker={picker} />;
  if (scene === 'hurt') return <HurtScene picker={picker} />;
  return <FanoutScene picker={picker} />;
}
