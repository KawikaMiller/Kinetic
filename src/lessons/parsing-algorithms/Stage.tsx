import { useScenePicker } from '../../components/ScenePicker';
import { BottomUpScene } from './BottomUpScene';
import { LockstepScene } from './LockstepScene';
import { OPENING, type SceneId } from './opening';
import { PrecedenceScene } from './PrecedenceScene';
import { TopDownScene } from './TopDownScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'topdown', label: 'Top-down tables' },
  { value: 'bottomup', label: 'Bottom-up tables' },
  { value: 'lockstep', label: 'Side by side' },
  { value: 'precedence', label: 'Precedence game' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'bottomup') return <BottomUpScene key="bottomup" picker={picker} />;
  if (scene === 'lockstep') return <LockstepScene key="lockstep" picker={picker} />;
  if (scene === 'precedence') return <PrecedenceScene key="precedence" picker={picker} />;
  return <TopDownScene key="topdown" picker={picker} />;
}
