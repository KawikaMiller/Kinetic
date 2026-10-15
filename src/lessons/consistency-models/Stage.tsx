import { useScenePicker } from '../../components/ScenePicker';
import { RelationScene } from './RelationScene';
import { ServiceScene } from './ServiceScene';
import { TimelineScene } from './TimelineScene';
import './styles.css';

type Scene = 'timeline' | 'relate' | 'service';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'timeline', label: 'Put operations on a timeline' },
  { value: 'relate', label: 'How the models relate' },
  { value: 'service', label: 'A simulated register service' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'timeline' });
  if (scene === 'relate') return <RelationScene picker={picker} />;
  if (scene === 'service') return <ServiceScene picker={picker} />;
  return <TimelineScene picker={picker} />;
}
