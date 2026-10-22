import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import type { ClassifyState } from '../../core/classify';
import { CostScene } from './CostScene';
import type { Assumptions, ComponentId } from './model';
import { OPENING, type SceneId } from './opening';
import { PlaceScene } from './PlaceScene';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'place', label: 'Place the components' },
  { value: 'cost', label: 'Three-year cost' },
  { value: 'story', label: 'The vendor raises the price' },
];

/** The placements, the chosen component and the assumptions belong to the learner: scenes 1 and 2 read the same ones. */
export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  const [board, setBoard] = useState<ClassifyState>(OPENING.board);
  const [component, setComponent] = useState<ComponentId>(OPENING.component);
  const [assumptions, setAssumptions] = useState<Assumptions>(OPENING.assumptions);
  if (scene === 'cost') return <CostScene key="cost" picker={picker} board={board} onBoard={setBoard} component={component} onComponent={setComponent} assumptions={assumptions} onAssumptions={setAssumptions} />;
  if (scene === 'story') return <StoryScene key="story" picker={picker} />;
  return <PlaceScene key="place" picker={picker} board={board} onBoard={setBoard} component={component} onComponent={setComponent} assumptions={assumptions} onAssumptions={setAssumptions} />;
}
