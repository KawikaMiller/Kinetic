import { useScenePicker } from '../../components/ScenePicker';
import { BugScene } from './BugScene';
import { FifoScene } from './FifoScene';
import { PhotoScene } from './PhotoScene';
import './styles.css';

type Scene = 'photo' | 'fifo' | 'bug';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'photo', label: 'Take the photograph' },
  { value: 'fifo', label: 'Why the channels must be FIFO' },
  { value: 'bug', label: 'What a snapshot is for' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'photo' });
  if (scene === 'fifo') return <FifoScene key="fifo" picker={picker} />;
  if (scene === 'bug') return <BugScene key="bug" picker={picker} />;
  return <PhotoScene key="photo" picker={picker} />;
}
