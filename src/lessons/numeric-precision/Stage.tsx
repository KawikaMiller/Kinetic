import { useScenePicker } from '../../components/ScenePicker';
import { CancelScene } from './CancelScene';
import { CartScene } from './CartScene';
import { OPENING, type SceneId } from './opening';
import { SumScene } from './SumScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'summation', label: 'Summation' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'cents', label: 'Where the cents go' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'cancellation') return <CancelScene key="cancellation" picker={picker} />;
  if (scene === 'cents') return <CartScene key="cents" picker={picker} />;
  return <SumScene key="summation" picker={picker} />;
}
