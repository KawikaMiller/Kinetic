import { useScenePicker } from '../../components/ScenePicker';
import { ClassScene } from './ClassScene';
import { CloudScene } from './CloudScene';
import { ImageScene } from './ImageScene';
import { LinkScene } from './LinkScene';
import { MistakesScene } from './MistakesScene';
import './styles.css';

type Scene = 'image' | 'cloud' | 'mistakes' | 'classes' | 'link';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'image', label: 'An image from its top terms' },
  { value: 'cloud', label: 'PCA on a point cloud' },
  { value: 'mistakes', label: 'Ways to get it wrong' },
  { value: 'classes', label: 'Variance is not the question' },
  { value: 'link', label: 'SVD and PCA agree' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'image' });
  if (scene === 'cloud') return <CloudScene picker={picker} />;
  if (scene === 'mistakes') return <MistakesScene picker={picker} />;
  if (scene === 'classes') return <ClassScene picker={picker} />;
  if (scene === 'link') return <LinkScene picker={picker} />;
  return <ImageScene picker={picker} />;
}
