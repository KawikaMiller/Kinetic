import { useScenePicker } from '../../components/ScenePicker';
import { AggregateScene } from './AggregateScene';
import { MapScene } from './MapScene';
import { MonolithScene } from './MonolithScene';
import './styles.css';

type SceneId = 'one' | 'map' | 'aggregate';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'one', label: 'One model for everything' },
  { value: 'map', label: 'Draw the boundaries' },
  { value: 'aggregate', label: 'Where consistency stops' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'one' });
  if (scene === 'map') return <MapScene picker={picker} />;
  if (scene === 'aggregate') return <AggregateScene picker={picker} />;
  return <MonolithScene picker={picker} />;
}
