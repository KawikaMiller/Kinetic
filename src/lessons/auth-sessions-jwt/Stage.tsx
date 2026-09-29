import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { Flow } from './Flow';
import { Scale } from './Scale';
import { Tamper } from './Tamper';
import './styles.css';

type Mode = 'session' | 'jwt' | 'scale' | 'tamper';

const MODES: { value: Mode; label: string }[] = [
  { value: 'session', label: '① Sessions' },
  { value: 'jwt', label: '② JWT' },
  { value: 'scale', label: '③ At scale' },
  { value: 'tamper', label: '④ Forge a token' },
];

export function Stage() {
  const [mode, setMode] = useState<Mode>('session');
  const picker = <Segmented label="Lane" value={mode} onChange={setMode} options={MODES} />;
  if (mode === 'scale') return <Scale modePicker={picker} />;
  if (mode === 'tamper') return <Tamper modePicker={picker} />;
  return <Flow key={mode} kind={mode} modePicker={picker} />;
}
