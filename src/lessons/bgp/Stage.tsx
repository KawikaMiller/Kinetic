import { useScenePicker } from '../../components/ScenePicker';
import { AnnounceScene } from './AnnounceScene';
import { HijackScene } from './HijackScene';
import { LeakScene } from './LeakScene';
import { PolicyScene } from './PolicyScene';
import './styles.css';

type Scene = 'announce' | 'policy' | 'leak' | 'hijack';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'announce', label: 'Announcements' },
  { value: 'policy', label: 'Choosing a path' },
  { value: 'leak', label: 'Who may tell whom' },
  { value: 'hijack', label: 'Hijack and anycast' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'announce' });
  if (scene === 'policy') return <PolicyScene key={scene} picker={picker} />;
  if (scene === 'leak') return <LeakScene key={scene} picker={picker} />;
  if (scene === 'hijack') return <HijackScene key={scene} picker={picker} />;
  return <AnnounceScene key={scene} picker={picker} />;
}
