import { useScenePicker } from '../../components/ScenePicker';
import { ArenaScene } from './ArenaScene';
import { ClassesScene } from './ClassesScene';
import { PagesScene } from './PagesScene';
import './styles.css';

type Scene = 'arena' | 'classes' | 'pages';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'arena', label: 'The arena and its holes' },
  { value: 'classes', label: 'Size classes' },
  { value: 'pages', label: 'Why memory stays high' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'arena' });
  if (scene === 'classes') return <ClassesScene key={scene} picker={picker} />;
  if (scene === 'pages') return <PagesScene key={scene} picker={picker} />;
  return <ArenaScene key={scene} picker={picker} />;
}
