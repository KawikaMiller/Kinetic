import { useScenePicker } from '../../components/ScenePicker';
import { ContainerScene } from './ContainerScene';
import { RootScene } from './RootScene';
import { TestScene } from './TestScene';
import './styles.css';

type Scene = 'test' | 'root' | 'container';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'test', label: '1. Write a unit test' },
  { value: 'root', label: '2. Composition root' },
  { value: 'container', label: '3. A tiny container' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'test' });
  if (scene === 'root') return <RootScene picker={picker} />;
  if (scene === 'container') return <ContainerScene picker={picker} />;
  return <TestScene picker={picker} />;
}
