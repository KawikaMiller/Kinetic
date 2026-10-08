import { useScenePicker } from '../../components/ScenePicker';
import { AnatomyScene } from './AnatomyScene';
import { IndexScene } from './IndexScene';
import { LimitsScene } from './LimitsScene';
import { OddsScene } from './OddsScene';
import { TradeoffScene } from './TradeoffScene';
import './styles.css';

type SceneId = 'anatomy' | 'index' | 'limits' | 'odds' | 'tradeoffs';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'anatomy', label: 'ID anatomy' },
  { value: 'index', label: 'Index locality' },
  { value: 'limits', label: 'Snowflake limits' },
  { value: 'odds', label: 'Collision odds' },
  { value: 'tradeoffs', label: 'Trade-offs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'anatomy' });
  switch (scene) {
    case 'index': return <IndexScene picker={picker} />;
    case 'limits': return <LimitsScene picker={picker} />;
    case 'odds': return <OddsScene picker={picker} />;
    case 'tradeoffs': return <TradeoffScene picker={picker} />;
    default: return <AnatomyScene picker={picker} />;
  }
}
