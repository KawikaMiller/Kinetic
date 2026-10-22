import { useScenePicker } from '../../components/ScenePicker';
import { ExperimentScene } from './ExperimentScene';
import { GameDayScene } from './GameDayScene';
import { MapScene } from './MapScene';
import './styles.css';

type Scene = 'map' | 'experiment' | 'gameday';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'map', label: 'Read the map' },
  { value: 'experiment', label: 'Design the experiment' },
  { value: 'gameday', label: 'A game day, seeded' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'map' });
  if (scene === 'experiment') return <ExperimentScene key={scene} picker={picker} />;
  if (scene === 'gameday') return <GameDayScene key={scene} picker={picker} />;
  return <MapScene key={scene} picker={picker} />;
}
