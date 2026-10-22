import { useScenePicker } from '../../components/ScenePicker';
import { CanvasScene } from './CanvasScene';
import { OPENING, type SceneId } from './opening';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'canvas', label: 'The canvas' },
  { value: 'story', label: 'Which storage policy?' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'story') return <StoryScene key="story" picker={picker} />;
  return <CanvasScene key="canvas" picker={picker} />;
}
