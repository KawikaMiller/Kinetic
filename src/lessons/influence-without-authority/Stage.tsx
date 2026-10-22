import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { LeavesScene } from './LeavesScene';
import { MapScene } from './MapScene';
import { OPENING, type PlanState, type SceneId } from './opening';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'map', label: 'Pre-wire the meeting' },
  { value: 'meeting', label: 'Dana objects live' },
  { value: 'leaves', label: 'What the toy leaves out' },
];

/** The three conversation slots belong to the learner and survive a scene switch; the story starts fresh each time. */
export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  const [plan, setPlan] = useState<PlanState>(OPENING.plan);
  if (scene === 'meeting') return <StoryScene key="meeting" picker={picker} />;
  if (scene === 'leaves') return <LeavesScene key="leaves" picker={picker} />;
  return <MapScene key="map" picker={picker} state={plan} onState={setPlan} />;
}
