import { useScenePicker } from '../../components/ScenePicker';
import { CalibrationScene } from './CalibrationScene';
import { ConeScene } from './ConeScene';
import { OPENING, type SceneId } from './opening';
import { SumScene } from './SumScene';
import { TalkScene } from './TalkScene';
import { ThreePointScene } from './ThreePointScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'cone', label: 'The cone' },
  { value: 'sum', label: 'Summing estimates' },
  { value: 'three', label: 'Three-point' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'talk', label: 'The conversation' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'sum') return <SumScene key="sum" picker={picker} />;
  if (scene === 'three') return <ThreePointScene key="three" picker={picker} />;
  if (scene === 'calibration') return <CalibrationScene key="calibration" picker={picker} />;
  if (scene === 'talk') return <TalkScene key="talk" picker={picker} />;
  return <ConeScene key="cone" picker={picker} />;
}
