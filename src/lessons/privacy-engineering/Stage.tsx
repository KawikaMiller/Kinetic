import { useScenePicker } from '../../components/ScenePicker';
import { KanonScene } from './KanonScene';
import { LogsScene } from './LogsScene';
import { NoiseScene } from './NoiseScene';
import { OPENING_SCENE, type SceneId } from './opening';
import { RecordsScene } from './RecordsScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'records', label: 'Where a record lives' },
  { value: 'kanon', label: 'k-anonymity' },
  { value: 'noise', label: 'A noisy count' },
  { value: 'logs', label: 'Pseudonymous is not anonymous' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING_SCENE });
  if (scene === 'kanon') return <KanonScene key="kanon" picker={picker} />;
  if (scene === 'noise') return <NoiseScene key="noise" picker={picker} />;
  if (scene === 'logs') return <LogsScene key="logs" picker={picker} />;
  return <RecordsScene key="records" picker={picker} />;
}
