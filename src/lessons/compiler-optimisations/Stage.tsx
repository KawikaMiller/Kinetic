import { useScenePicker } from '../../components/ScenePicker';
import { LoopScene } from './LoopScene';
import { OPENING, type SceneId } from './opening';
import { PassScene } from './PassScene';
import { RefusalScene } from './RefusalScene';
import { SsaScene } from './SsaScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'ssa', label: 'SSA' },
  { value: 'passes', label: 'Passes and their order' },
  { value: 'loop', label: 'A loop, and a benchmark' },
  { value: 'refusals', label: 'When a compiler refuses' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'passes') return <PassScene key="passes" picker={picker} />;
  if (scene === 'loop') return <LoopScene key="loop" picker={picker} />;
  if (scene === 'refusals') return <RefusalScene key="refusals" picker={picker} />;
  return <SsaScene key="ssa" picker={picker} />;
}
