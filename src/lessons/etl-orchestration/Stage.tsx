import { useScenePicker } from '../../components/ScenePicker';
import { FailureScene } from './FailureScene';
import { LoadScene } from './LoadScene';
import { ScheduleScene } from './ScheduleScene';
import { ShapeScene } from './ShapeScene';
import { WeekScene } from './WeekScene';
import './styles.css';

type Scene = 'week' | 'failure' | 'loads' | 'shape' | 'schedule';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'week', label: 'A DAG on a calendar' },
  { value: 'failure', label: 'Failure and retry' },
  { value: 'loads', label: 'Idempotent loads' },
  { value: 'shape', label: 'ETL vs ELT as a pipeline' },
  { value: 'schedule', label: 'Schedule semantics' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'week' });
  if (scene === 'failure') return <FailureScene key="failure" picker={picker} />;
  if (scene === 'loads') return <LoadScene key="loads" picker={picker} />;
  if (scene === 'shape') return <ShapeScene key="shape" picker={picker} />;
  if (scene === 'schedule') return <ScheduleScene key="schedule" picker={picker} />;
  return <WeekScene key="week" picker={picker} />;
}
