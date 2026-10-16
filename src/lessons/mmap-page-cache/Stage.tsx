import { useScenePicker } from '../../components/ScenePicker';
import { DurabilityScene } from './DurabilityScene';
import { ReadaheadScene } from './ReadaheadScene';
import { ReadScene } from './ReadScene';
import './styles.css';

type Scene = 'read' | 'readahead' | 'durability';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'read', label: 'read() versus mmap' },
  { value: 'readahead', label: 'Readahead' },
  { value: 'durability', label: 'Dirty pages and the power cut' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'read' });
  if (scene === 'readahead') return <ReadaheadScene key={scene} picker={picker} />;
  if (scene === 'durability') return <DurabilityScene key={scene} picker={picker} />;
  return <ReadScene key={scene} picker={picker} />;
}
