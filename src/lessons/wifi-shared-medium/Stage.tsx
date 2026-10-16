import { useScenePicker } from '../../components/ScenePicker';
import { BackoffScene } from './BackoffScene';
import { ContentionScene } from './ContentionScene';
import { HiddenScene } from './HiddenScene';
import { RateScene } from './RateScene';
import './styles.css';

type Scene = 'backoff' | 'contention' | 'hidden' | 'rates';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'backoff', label: 'Avoid, not detect' },
  { value: 'contention', label: 'Many stations' },
  { value: 'hidden', label: 'Hidden node' },
  { value: 'rates', label: 'One slow station' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'backoff' });
  if (scene === 'contention') return <ContentionScene key={scene} picker={picker} />;
  if (scene === 'hidden') return <HiddenScene key={scene} picker={picker} />;
  if (scene === 'rates') return <RateScene key={scene} picker={picker} />;
  return <BackoffScene key={scene} picker={picker} />;
}
