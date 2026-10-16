import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { FactoriseScene } from './FactoriseScene';
import { FunnelScene } from './FunnelScene';
import { LoopScene } from './LoopScene';
import { MatrixScene } from './MatrixScene';
import { NeighbourScene } from './NeighbourScene';
import { EMPTY_EDITS, type Edits } from './problem';
import { type SceneId } from './settings';
import './styles.css';

const SCENE_OPTIONS: { value: SceneId; label: string }[] = [
  { value: 'matrix', label: 'The matrix' },
  { value: 'factorise', label: 'Factorise it' },
  { value: 'neighbours', label: 'Neighbours instead' },
  { value: 'funnel', label: 'The funnel' },
  { value: 'loop', label: 'The feedback loop' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENE_OPTIONS, initial: 'matrix' });
  // The learner's edits to the matrix (hidden ratings, a new user's ratings) are one document that three scenes read.
  const [edits, setEdits] = useState<Edits>(EMPTY_EDITS);
  if (scene === 'factorise') return <FactoriseScene key={scene} picker={picker} edits={edits} />;
  if (scene === 'neighbours') return <NeighbourScene key={scene} picker={picker} edits={edits} />;
  if (scene === 'funnel') return <FunnelScene key={scene} picker={picker} edits={edits} />;
  if (scene === 'loop') return <LoopScene key={scene} picker={picker} />;
  return <MatrixScene key={scene} picker={picker} edits={edits} setEdits={setEdits} />;
}
