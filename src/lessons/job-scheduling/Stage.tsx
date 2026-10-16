import { useScenePicker } from '../../components/ScenePicker';
import { CronScene } from './CronScene';
import { ExprScene } from './ExprScene';
import { QueueScene } from './QueueScene';
import { WheelScene } from './WheelScene';
import './styles.css';

type Scene = 'wheel' | 'queue' | 'cron' | 'expr';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'wheel', label: 'Delay queue and timing wheel' },
  { value: 'queue', label: 'At-least-once and retries' },
  { value: 'cron', label: 'Distributed cron' },
  { value: 'expr', label: 'Cron expressions' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'wheel' });
  if (scene === 'queue') return <QueueScene key={scene} picker={picker} />;
  if (scene === 'cron') return <CronScene key={scene} picker={picker} />;
  if (scene === 'expr') return <ExprScene key={scene} picker={picker} />;
  return <WheelScene key={scene} picker={picker} />;
}
