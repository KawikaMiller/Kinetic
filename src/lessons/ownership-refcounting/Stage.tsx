import { useScenePicker } from '../../components/ScenePicker';
import { CountScene } from './CountScene';
import { OPENING, type SceneId } from './opening';
import { OwnScene } from './OwnScene';
import { SummaryScene } from './SummaryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'counting', label: 'Counting references' },
  { value: 'ownership', label: 'Ownership and borrowing' },
  { value: 'summary', label: 'When memory goes back' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'ownership') return <OwnScene key="ownership" picker={picker} />;
  if (scene === 'summary') return <SummaryScene key="summary" picker={picker} />;
  return <CountScene key="counting" picker={picker} />;
}
