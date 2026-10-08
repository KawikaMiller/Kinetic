import { useScenePicker } from '../../components/ScenePicker';
import { OrmScene } from './OrmScene';
import type { Scene } from './model';
import './styles.css';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'authors', label: 'Posts and authors' },
  { value: 'nested', label: 'Nested: comments and commenters' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Page', options: SCENES, initial: 'authors' });
  return <OrmScene key={scene} scene={scene} picker={picker} />;
}
