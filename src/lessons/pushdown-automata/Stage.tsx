import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { DuelScene } from './DuelScene';
import { OPENING, type SceneId } from './opening';
import { StepperScene } from './StepperScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'stepper', label: 'Step a machine' },
  { value: 'duel', label: 'DFA duel' },
  { value: 'build', label: 'Build your own' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'duel') return <DuelScene key="duel" picker={picker} />;
  if (scene === 'build') return <BuildScene key="build" picker={picker} />;
  return <StepperScene key="stepper" picker={picker} />;
}
