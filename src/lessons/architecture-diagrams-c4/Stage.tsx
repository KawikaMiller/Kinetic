import { useScenePicker } from '../../components/ScenePicker';
import { FixScene } from './FixScene';
import { ZoomScene } from './ZoomScene';
import './styles.css';

type Scene = 'zoom' | 'fix';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'zoom', label: 'Zoom into the system' },
  { value: 'fix', label: 'Fix a bad diagram' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'zoom' });
  return scene === 'fix' ? <FixScene picker={picker} /> : <ZoomScene picker={picker} />;
}
