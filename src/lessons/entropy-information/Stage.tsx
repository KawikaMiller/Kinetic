import { useScenePicker } from '../../components/ScenePicker';
import { BeliefScene } from './BeliefScene';
import { CoinScene } from './CoinScene';
import { PasswordScene } from './PasswordScene';
import { QuestionsScene } from './QuestionsScene';
import { TextScene } from './TextScene';
import './styles.css';

type Scene = 'coin' | 'text' | 'password' | 'questions' | 'belief';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'coin', label: 'The biased coin' },
  { value: 'text', label: 'Typed text' },
  { value: 'password', label: 'Is it a password strength?' },
  { value: 'questions', label: 'Twenty questions' },
  { value: 'belief', label: 'A wrong belief' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'coin' });
  if (scene === 'text') return <TextScene picker={picker} />;
  if (scene === 'password') return <PasswordScene picker={picker} />;
  if (scene === 'questions') return <QuestionsScene picker={picker} />;
  if (scene === 'belief') return <BeliefScene picker={picker} />;
  return <CoinScene picker={picker} />;
}
