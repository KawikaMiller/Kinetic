import { useScenePicker } from '../../components/ScenePicker';
import { ChooseScene } from './ChooseScene';
import { OPENING, type SceneId } from './opening';
import { OptionsScene } from './OptionsScene';
import { SourcesScene } from './SourcesScene';
import { ThresholdScene } from './ThresholdScene';
import { TradeoffScene } from './TradeoffScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'threshold', label: 'One threshold, two groups' },
  { value: 'tradeoff', label: 'You cannot have all of them' },
  { value: 'options', label: 'Options and trade-offs' },
  { value: 'sources', label: 'Where bias comes from' },
  { value: 'choose', label: 'Choosing a metric' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'tradeoff') return <TradeoffScene key="tradeoff" picker={picker} />;
  if (scene === 'options') return <OptionsScene key="options" picker={picker} />;
  if (scene === 'sources') return <SourcesScene key="sources" picker={picker} />;
  if (scene === 'choose') return <ChooseScene key="choose" picker={picker} />;
  return <ThresholdScene key="threshold" picker={picker} />;
}
