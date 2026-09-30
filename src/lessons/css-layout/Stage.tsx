import { useScenePicker } from '../../components/ScenePicker';
import { BoxModel } from './BoxModel';
import { Flexbox } from './Flexbox';
import { Grid } from './Grid';
import './styles.css';

const TABS = [
  { value: 'box' as const, label: 'Box model' },
  { value: 'flex' as const, label: 'Flexbox' },
  { value: 'grid' as const, label: 'Grid' },
];

export function Stage() {
  const [tab, picker] = useScenePicker({ label: 'Tab', options: TABS, initial: 'box' });
  if (tab === 'flex') return <Flexbox picker={picker} />;
  if (tab === 'grid') return <Grid picker={picker} />;
  return <BoxModel picker={picker} />;
}
