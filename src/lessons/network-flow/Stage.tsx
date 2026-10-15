import { useScenePicker } from '../../components/ScenePicker';
import { AugmentScene } from './AugmentScene';
import { CutScene } from './CutScene';
import { ModelsScene } from './ModelsScene';
import { UnluckyScene } from './UnluckyScene';
import { useFlowEditor } from './useFlowEditor';
import './styles.css';

type Scene = 'augment' | 'unlucky' | 'cut' | 'models';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'augment', label: 'Augment' },
  { value: 'unlucky', label: 'The unlucky order' },
  { value: 'cut', label: 'Drag the cut' },
  { value: 'models', label: 'What it models' },
];

export function Stage() {
  const [scene, picker, setScene] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'augment' });
  const ed = useFlowEditor(scene);
  if (scene === 'unlucky') return <UnluckyScene picker={picker} />;
  if (scene === 'cut') return <CutScene picker={picker} ed={ed} />;
  if (scene === 'models') return <ModelsScene picker={picker} ed={ed} onShow={() => setScene('augment')} />;
  return <AugmentScene picker={picker} ed={ed} />;
}
