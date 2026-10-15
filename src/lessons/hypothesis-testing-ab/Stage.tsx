import { useScenePicker } from '../../components/ScenePicker';
import { OwnScene } from './OwnScene';
import { PeekScene } from './PeekScene';
import { RepeatScene } from './RepeatScene';
import { RunScene } from './RunScene';
import { SliceScene } from './SliceScene';
import './styles.css';

type Scene = 'run' | 'repeat' | 'peek' | 'slice' | 'own';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'run', label: 'Run the experiment' },
  { value: 'repeat', label: 'Run it 1,000 times' },
  { value: 'peek', label: 'Peeking' },
  { value: 'slice', label: 'Slice until significant' },
  { value: 'own', label: 'Your own numbers' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'run' });
  if (scene === 'repeat') return <RepeatScene picker={picker} />;
  if (scene === 'peek') return <PeekScene picker={picker} />;
  if (scene === 'slice') return <SliceScene picker={picker} />;
  if (scene === 'own') return <OwnScene picker={picker} />;
  return <RunScene picker={picker} />;
}
