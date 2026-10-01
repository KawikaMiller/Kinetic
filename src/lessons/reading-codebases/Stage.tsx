import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { Explore } from './Explore';
import { TASKS } from './model';
import './styles.css';

const LABELS: Record<string, string> = { discount: 'Discount', declined: '402', tax: 'Tax change', save: 'Saving orders' };

export function Stage() {
  const [taskId, picker] = useScenePicker({ label: 'Task', options: TASKS.map((t) => ({ value: t.id, label: LABELS[t.id] })), initial: TASKS[0].id });
  const [round, setRound] = useState(0);
  // A fresh board per task (and per "start over"): navigation state and replay timers reset with it.
  return <Explore key={`${taskId}-${round}`} task={TASKS.find((t) => t.id === taskId)!} picker={picker} onRestart={() => setRound((r) => r + 1)} />;
}
