import { useScenePicker } from '../../components/ScenePicker';
import { MesiScene } from './MesiScene';
import { SharingScene } from './SharingScene';
import './styles.css';

type Scene = 'mesi' | 'sharing';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'mesi', label: 'Four cores, one line (MESI)' },
  { value: 'sharing', label: 'False sharing' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'mesi' });
  if (scene === 'sharing') return <SharingScene key={scene} picker={picker} />;
  return <MesiScene key={scene} picker={picker} />;
}
