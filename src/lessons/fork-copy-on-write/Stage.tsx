import { useScenePicker } from '../../components/ScenePicker';
import { ProcessScene } from './ProcessScene';
import { ShareScene } from './ShareScene';
import { UsesScene } from './UsesScene';
import './styles.css';

type Scene = 'fork' | 'write' | 'uses' | 'share';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'fork', label: 'fork' },
  { value: 'write', label: 'A write' },
  { value: 'uses', label: 'Three real uses' },
  { value: 'share', label: 'What fork does not share' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'fork' });
  if (scene === 'write') return <ProcessScene key="write" picker={picker} scene="write" />;
  if (scene === 'uses') return <UsesScene key="uses" picker={picker} />;
  if (scene === 'share') return <ShareScene key="share" picker={picker} />;
  return <ProcessScene key="fork" picker={picker} scene="fork" />;
}
