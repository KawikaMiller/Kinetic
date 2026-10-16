import { useScenePicker } from '../../components/ScenePicker';
import { BacktrackScene } from './BacktrackScene';
import { BuildScene } from './BuildScene';
import { OPENING, type SceneId } from './opening';
import { RunScene } from './RunScene';
import { WhichScene } from './WhichScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'build', label: 'Build the machine' },
  { value: 'run', label: 'Run it' },
  { value: 'which', label: 'Which match?' },
  { value: 'backtrack', label: 'Backtracking' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'run') return <RunScene key="run" picker={picker} />;
  if (scene === 'which') return <WhichScene key="which" picker={picker} />;
  if (scene === 'backtrack') return <BacktrackScene key="backtrack" picker={picker} />;
  return <BuildScene key="build" picker={picker} />;
}
