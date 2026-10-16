import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { DiagramScene } from './DiagramScene';
import { MitigateScene } from './MitigateScene';
import { OPENING, type SceneId } from './opening';
import { SprintScene } from './SprintScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'diagram', label: 'Draw it, find the threats' },
  { value: 'mitigate', label: 'Answer a threat' },
  { value: 'sprint', label: 'One sprint' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  // The first two scenes work on one model, so what you looked at in the diagram is what you can answer.
  const [state, setState] = useState(OPENING.state);
  if (scene === 'mitigate') return <MitigateScene key="mitigate" picker={picker} state={state} setState={setState} />;
  if (scene === 'sprint') return <SprintScene key="sprint" picker={picker} />;
  return <DiagramScene key="diagram" picker={picker} state={state} setState={setState} />;
}
