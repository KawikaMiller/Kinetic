import { useScenePicker } from '../../components/ScenePicker';
import { Isolation } from './Isolation';
import { Layers } from './Layers';
import { Stacks } from './Stacks';
import './styles.css';

const DEMOS = [
  { value: 'stacks', label: 'VMs vs containers' },
  { value: 'layers', label: 'Image layers' },
  { value: 'isolation', label: 'Isolation' },
] as const;

type Demo = (typeof DEMOS)[number]['value'];

export function Stage() {
  const [demo, picker] = useScenePicker<Demo>({ label: 'Demo', options: [...DEMOS], initial: 'stacks' });
  if (demo === 'stacks') return <Stacks picker={picker} />;
  if (demo === 'layers') return <Layers picker={picker} />;
  return <Isolation picker={picker} />;
}
