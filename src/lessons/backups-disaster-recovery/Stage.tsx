import { useScenePicker } from '../../components/ScenePicker';
import { DrillScene } from './DrillScene';
import { PlanScene } from './PlanScene';
import { TimelineScene } from './TimelineScene';
import './styles.css';

type Scene = 'timeline' | 'plan' | 'drill';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'timeline', label: 'The timeline' },
  { value: 'plan', label: 'The plan builder' },
  { value: 'drill', label: 'The restore drill' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'timeline' });
  if (scene === 'plan') return <PlanScene key={scene} picker={picker} />;
  if (scene === 'drill') return <DrillScene key={scene} picker={picker} />;
  return <TimelineScene key={scene} picker={picker} />;
}
