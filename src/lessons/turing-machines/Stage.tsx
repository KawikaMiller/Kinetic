import { useScenePicker } from '../../components/ScenePicker';
import { DataScene } from './DataScene';
import { StepsScene } from './StepsScene';
import { TaskScene } from './TaskScene';
import { useTaskState } from './useTaskState';
import './styles.css';

const SCENES = [
  { value: 'increment', label: 'Program an increment' },
  { value: 'palindrome', label: 'Program a palindrome check' },
  { value: 'steps', label: 'Steps against size' },
  { value: 'data', label: 'Tables are data' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'increment' });
  const increment = useTaskState('increment');
  const palindrome = useTaskState('palindrome');
  if (scene === 'palindrome') return <TaskScene key="palindrome" state={palindrome} picker={picker} />;
  if (scene === 'steps') return <StepsScene states={{ increment, palindrome }} picker={picker} />;
  if (scene === 'data') return <DataScene picker={picker} />;
  return <TaskScene key="increment" state={increment} picker={picker} />;
}
