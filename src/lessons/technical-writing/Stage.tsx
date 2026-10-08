import { useScenePicker } from '../../components/ScenePicker';
import { ReadersScene } from './ReadersScene';
import { TightenScene } from './TightenScene';
import { TradeoffScene } from './TradeoffScene';
import './styles.css';

const SCENES = [
  { value: 'tighten' as const, label: 'Tighten an update' },
  { value: 'tradeoff' as const, label: 'Write the trade-off' },
  { value: 'readers' as const, label: 'Three readers' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'tighten' });
  if (scene === 'tradeoff') return <TradeoffScene picker={picker} />;
  if (scene === 'readers') return <ReadersScene picker={picker} />;
  return <TightenScene picker={picker} />;
}
