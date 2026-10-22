import { useScenePicker } from '../../components/ScenePicker';
import { BandwidthScene } from './BandwidthScene';
import { PinScene } from './PinScene';
import { TouchScene } from './TouchScene';
import './styles.css';

type Scene = 'pin' | 'touch' | 'bandwidth';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pin', label: 'Pin threads and pages' },
  { value: 'touch', label: 'First touch' },
  { value: 'bandwidth', label: 'Streaming bandwidth' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pin' });
  if (scene === 'touch') return <TouchScene key="touch" picker={picker} />;
  if (scene === 'bandwidth') return <BandwidthScene key="bandwidth" picker={picker} />;
  return <PinScene key="pin" picker={picker} />;
}
