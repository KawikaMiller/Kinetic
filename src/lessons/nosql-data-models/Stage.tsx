import { useScenePicker } from '../../components/ScenePicker';
import { DesignScene } from './DesignScene';
import { ModelsScene } from './ModelsScene';
import './styles.css';

type SceneId = 'models' | 'design';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'models', label: 'Five models, one shop' },
  { value: 'design', label: 'Design from the queries' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'models' });
  return scene === 'design' ? <DesignScene picker={picker} /> : <ModelsScene picker={picker} />;
}
