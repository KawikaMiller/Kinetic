import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { CalibrateScene } from './CalibrateScene';
import { LoopScene } from './LoopScene';
import { OPENING, type PanelState, type SceneId } from './opening';
import { PanelScene } from './PanelScene';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'panel', label: 'One panel, one decision' },
  { value: 'loop', label: 'Design the loop' },
  { value: 'calibrate', label: 'Calibrate the interviewers' },
  { value: 'debrief', label: 'The debrief' },
];

/** The seed and the panel controls belong to the learner and survive a scene switch; the other scenes start fresh each time. */
export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  const [seed, setSeed] = useState(OPENING.seed);
  const [panel, setPanel] = useState<PanelState>(OPENING.panel);
  if (scene === 'loop') return <LoopScene key="loop" picker={picker} seed={seed} onSeed={setSeed} />;
  if (scene === 'calibrate') return <CalibrateScene key="calibrate" picker={picker} seed={seed} onSeed={setSeed} />;
  if (scene === 'debrief') return <StoryScene key="debrief" picker={picker} seed={seed} onSeed={setSeed} />;
  return <PanelScene key="panel" picker={picker} seed={seed} onSeed={setSeed} state={panel} onState={setPanel} />;
}
