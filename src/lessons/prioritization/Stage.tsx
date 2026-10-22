import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { LineScene } from './LineScene';
import { OPENING, type SceneId } from './opening';
import { PlaneScene } from './PlaneScene';
import { RangesScene } from './RangesScene';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'plane', label: 'The 2 by 2' },
  { value: 'cost', label: 'Cost of delay' },
  { value: 'ranges', label: 'Ranges' },
  { value: 'line', label: 'The capacity line' },
  { value: 'story', label: 'An urgent request' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'cost') return <CostScene key="cost" picker={picker} />;
  if (scene === 'ranges') return <RangesScene key="ranges" picker={picker} />;
  if (scene === 'line') return <LineScene key="line" picker={picker} />;
  if (scene === 'story') return <StoryScene key="story" picker={picker} />;
  return <PlaneScene key="plane" picker={picker} />;
}
