import { useScenePicker } from '../../components/ScenePicker';
import { AnswerScene } from './AnswerScene';
import { ChunkScene } from './ChunkScene';
import { MeasureScene } from './MeasureScene';
import { RetrieveScene } from './RetrieveScene';
import { type SceneId } from './settings';
import './styles.css';

const SCENE_OPTIONS: { value: SceneId; label: string }[] = [
  { value: 'chunk', label: 'Chunk it' },
  { value: 'retrieve', label: 'Retrieve and assemble' },
  { value: 'answer', label: 'The stand-in answerer' },
  { value: 'measure', label: 'Measure it' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENE_OPTIONS, initial: 'chunk' });
  if (scene === 'retrieve') return <RetrieveScene key={scene} picker={picker} />;
  if (scene === 'answer') return <AnswerScene key={scene} picker={picker} />;
  if (scene === 'measure') return <MeasureScene key={scene} picker={picker} />;
  return <ChunkScene key={scene} picker={picker} />;
}
