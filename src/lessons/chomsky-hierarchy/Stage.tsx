import { useScenePicker } from '../../components/ScenePicker';
import { MinimiseScene } from './MinimiseScene';
import { OPENING, type SceneId } from './opening';
import { PumpingScene } from './PumpingScene';
import { RingsScene } from './RingsScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'rings', label: 'The rings' },
  { value: 'pumping', label: 'Pumping game' },
  { value: 'minimise', label: 'Minimise a DFA' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'pumping') return <PumpingScene key="pumping" picker={picker} />;
  if (scene === 'minimise') return <MinimiseScene key="minimise" picker={picker} />;
  return <RingsScene key="rings" picker={picker} />;
}
