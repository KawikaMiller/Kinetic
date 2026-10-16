import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { ApproxScene } from './ApproxScene';
import { ExactScene } from './ExactScene';
import { ExploreScene } from './ExploreScene';
import { LearnScene } from './LearnScene';
import { type SceneId } from './settings';
import { WorldScene } from './WorldScene';
import { DEFAULT_WORLD, type World } from './world';
import './styles.css';

const SCENE_OPTIONS: { value: SceneId; label: string }[] = [
  { value: 'world', label: 'The world' },
  { value: 'learn', label: 'Learn' },
  { value: 'exact', label: 'The exact answer' },
  { value: 'explore', label: 'Exploration and discounting' },
  { value: 'approx', label: 'When a table cannot scale' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENE_OPTIONS, initial: 'world' });
  // The world the learner designed is one document: the learning scenes train in it, the approximation scene brings its own.
  const [world, setWorld] = useState<World>(DEFAULT_WORLD);
  if (scene === 'learn') return <LearnScene key={scene} picker={picker} world={world} setWorld={setWorld} />;
  if (scene === 'exact') return <ExactScene key={scene} picker={picker} world={world} setWorld={setWorld} />;
  if (scene === 'explore') return <ExploreScene key={scene} picker={picker} world={world} setWorld={setWorld} />;
  if (scene === 'approx') return <ApproxScene key={scene} picker={picker} />;
  return <WorldScene key={scene} picker={picker} world={world} setWorld={setWorld} />;
}
