import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { HashLab } from './HashLab';
import { Asymmetric, Symmetric } from './Keys';
import { Passwords } from './Passwords';
import { Picker } from './Picker';
import './styles.css';

type Mode = 'hash' | 'passwords' | 'symmetric' | 'asymmetric' | 'picker';

const MODES: { value: Mode; label: string }[] = [
  { value: 'hash', label: '① Hashing' },
  { value: 'passwords', label: '② Passwords' },
  { value: 'symmetric', label: '③ Symmetric' },
  { value: 'asymmetric', label: '④ Asymmetric' },
  { value: 'picker', label: '⑤ Which one?' },
];

export function Stage() {
  const [mode, setMode] = useState<Mode>('hash');
  const picker = <Segmented label="Lane" value={mode} onChange={setMode} options={MODES} />;

  // Each lane owns its own StageFrame (and player), so switching remounts cleanly.
  if (mode === 'passwords') return <Passwords modePicker={picker} />;
  if (mode === 'symmetric') return <Symmetric modePicker={picker} />;
  if (mode === 'asymmetric') return <Asymmetric modePicker={picker} />;
  if (mode === 'picker') return <Picker modePicker={picker} />;
  return <HashLab modePicker={picker} />;
}
