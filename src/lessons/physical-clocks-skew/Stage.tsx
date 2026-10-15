import { useScenePicker } from '../../components/ScenePicker';
import { BugsScene } from './BugsScene';
import { DriftScene } from './DriftScene';
import { IntervalScene } from './IntervalScene';
import './styles.css';

type Scene = 'drift' | 'bugs' | 'intervals';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'drift', label: 'Drift and NTP' },
  { value: 'bugs', label: 'Bugs that time causes' },
  { value: 'intervals', label: 'Intervals instead of instants' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'drift' });
  if (scene === 'bugs') return <BugsScene picker={picker} />;
  if (scene === 'intervals') return <IntervalScene picker={picker} />;
  return <DriftScene picker={picker} />;
}
