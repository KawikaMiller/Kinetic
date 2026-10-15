import { useScenePicker } from '../../components/ScenePicker';
import { BillScene } from './BillScene';
import { LedgerScene } from './LedgerScene';
import { OwnersScene } from './OwnersScene';
import { ReleaseScene } from './ReleaseScene';
import './styles.css';

const SCENES = [
  { value: 'release', label: 'Change a shared library' },
  { value: 'bill', label: 'The bill' },
  { value: 'owners', label: 'Who owns what' },
  { value: 'ledger', label: 'It depends' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'release' });
  if (scene === 'bill') return <BillScene picker={picker} />;
  if (scene === 'owners') return <OwnersScene picker={picker} />;
  if (scene === 'ledger') return <LedgerScene picker={picker} />;
  return <ReleaseScene picker={picker} />;
}
