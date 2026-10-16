import { useScenePicker } from '../../components/ScenePicker';
import { ClassifyScene } from './ClassifyScene';
import { DefenceScene } from './DefenceScene';
import { NullScene } from './NullScene';
import { OPENING, type SceneId } from './opening';
import { OverflowScene } from './OverflowScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'overflow', label: 'A check that vanishes' },
  { value: 'null', label: 'Null check after the load' },
  { value: 'classify', label: 'Sort the snippets' },
  { value: 'defences', label: 'Defences' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'null') return <NullScene key="null" picker={picker} />;
  if (scene === 'classify') return <ClassifyScene key="classify" picker={picker} />;
  if (scene === 'defences') return <DefenceScene key="defences" picker={picker} />;
  return <OverflowScene key="overflow" picker={picker} />;
}
