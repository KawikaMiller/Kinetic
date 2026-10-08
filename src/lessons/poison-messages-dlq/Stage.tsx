import { useScenePicker } from '../../components/ScenePicker';
import { QueueScene } from './QueueScene';
import type { SceneId } from './sim';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'poison', label: 'One poison message' },
  { value: 'transient', label: 'Dependency down' },
  { value: 'redrive', label: 'Redrive' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'poison' });
  return <QueueScene key={scene} scene={scene} picker={picker} />;
}
