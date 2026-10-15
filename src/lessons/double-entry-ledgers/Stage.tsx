import { useScenePicker } from '../../components/ScenePicker';
import { AppendScene } from './AppendScene';
import { JournalScene } from './JournalScene';
import { MoneyScene } from './MoneyScene';
import './styles.css';

type SceneId = 'money' | 'journal' | 'append';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'money', label: 'Why not floats' },
  { value: 'journal', label: 'Post journal entries' },
  { value: 'append', label: 'Append-only' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'money' });
  if (scene === 'journal') return <JournalScene picker={picker} />;
  if (scene === 'append') return <AppendScene picker={picker} />;
  return <MoneyScene picker={picker} />;
}
