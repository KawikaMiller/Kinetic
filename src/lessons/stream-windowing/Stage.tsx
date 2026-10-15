import { useScenePicker } from '../../components/ScenePicker';
import { EventTimeScene } from './EventTimeScene';
import { ProcessingScene } from './ProcessingScene';
import { WatermarkScene } from './WatermarkScene';
import { WindowsScene } from './WindowsScene';
import './styles.css';

type Scene = 'time' | 'windows' | 'watermarks' | 'processing';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'time', label: 'Event time and arrival' },
  { value: 'windows', label: 'Windows' },
  { value: 'watermarks', label: 'Watermarks and lateness' },
  { value: 'processing', label: 'The broken way' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'time' });
  if (scene === 'windows') return <WindowsScene picker={picker} />;
  if (scene === 'watermarks') return <WatermarkScene picker={picker} />;
  if (scene === 'processing') return <ProcessingScene picker={picker} />;
  return <EventTimeScene picker={picker} />;
}
