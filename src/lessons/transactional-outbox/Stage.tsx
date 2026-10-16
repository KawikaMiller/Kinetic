import { useScenePicker } from '../../components/ScenePicker';
import { BugScene } from './BugScene';
import { CompareScene } from './CompareScene';
import { OutboxScene } from './OutboxScene';
import { PollScene } from './PollScene';
import './styles.css';

type Scene = 'bug' | 'outbox' | 'poll' | 'compare';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'bug', label: 'The dual-write bug' },
  { value: 'outbox', label: 'The outbox' },
  { value: 'poll', label: 'The polling trap' },
  { value: 'compare', label: 'Compared' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'bug' });
  if (scene === 'outbox') return <OutboxScene key={scene} picker={picker} />;
  if (scene === 'poll') return <PollScene key={scene} picker={picker} />;
  if (scene === 'compare') return <CompareScene key={scene} picker={picker} />;
  return <BugScene key={scene} picker={picker} />;
}
